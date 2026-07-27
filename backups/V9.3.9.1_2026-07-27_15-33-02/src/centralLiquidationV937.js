export const CXC_FINAL_RESULTS = Object.freeze([
  'Cobrado',
  'Entregado a crédito',
  'No entregado',
  'Devuelto parcial'
]);


export function cashValueAfterCxcResultChange(totalValue, resultValue, currentCashValue=0){
  const total = Number(totalValue || 0);
  const currentCash = Number(currentCashValue || 0);
  const result = String(resultValue || '').trim();
  if(result === 'Cobrado') return Number.isFinite(total) ? Math.max(total,0) : 0;
  if(result === 'Entregado a crédito' || result === 'No entregado') return 0;
  return Number.isFinite(currentCash) ? Math.max(currentCash,0) : 0;
}

export function calculateCentralReceipt(totalValue, resultValue, cashValue){
  const total = Number(totalValue || 0);
  const result = String(resultValue || '').trim();
  const cash = Number(cashValue || 0);

  if(!Number.isFinite(total) || total <= 0) throw new Error('La factura debe ser mayor que cero.');
  if(!CXC_FINAL_RESULTS.includes(result)) throw new Error('Resultado de recepción inválido.');
  if(!Number.isFinite(cash) || cash < 0) throw new Error('El monto recibido no puede ser negativo.');
  if(cash > total + 0.01) throw new Error('El monto recibido no puede superar la factura.');
  if(result === 'Cobrado' && Math.abs(cash - total) > 0.01) throw new Error('Para marcar Cobrado debe recibirse el total de la factura.');
  if(result === 'Entregado a crédito' && cash >= total - 0.01) throw new Error('Si recibió el total, seleccione Cobrado.');
  if(result === 'No entregado' && cash > 0.01) throw new Error('Una orden no entregada no puede registrar efectivo.');

  const pending = result === 'No entregado'
    ? 0
    : (result === 'Entregado a crédito' || result === 'Devuelto parcial')
      ? Math.max(total - cash, 0)
      : 0;

  return { total, result, cash, pending };
}

function normalizedLiquidationKey(row,index=0){
  const loteId = row?.lote_id;
  if(loteId !== null && loteId !== undefined && loteId !== '') return `LOTE:${loteId}`;
  const code = String(row?.codigo_lote || '').trim().toUpperCase();
  if(code && code !== 'SIN-LOTE') return `COD:${code}`;
  return `LIQ:${row?.id ?? row?.history_key ?? `ROW-${index}`}`;
}

export function consolidateFormalLiquidations(rows = []){
  const groups = new Map();
  rows.forEach((row,index) => {
    const key = normalizedLiquidationKey(row,index);
    if(!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  });

  return [...groups.values()].map(group => {
    const sorted = [...group].sort((a,b)=>Number(a?.id||0)-Number(b?.id||0));
    const canonical = {...sorted[0]};
    canonical.liquidation_ids = sorted.map(x=>x.id).filter(x=>x!==undefined && x!==null);
    canonical.duplicate_count = sorted.length;
    canonical.history_key = `LIQ-GROUP-${normalizedLiquidationKey(canonical)}`;
    if(sorted.length > 1){
      canonical.total_facturado = Math.max(...sorted.map(x=>Number(x.total_facturado||0)));
      canonical.efectivo_reportado = Math.max(...sorted.map(x=>Number(x.efectivo_reportado||0)));
      canonical.efectivo_recibido = Math.max(...sorted.map(x=>Number(x.efectivo_recibido||0)));
      canonical.credito_pendiente = Math.max(...sorted.map(x=>Number(x.credito_pendiente||0)));
      canonical.no_entregado = Math.max(...sorted.map(x=>Number(x.no_entregado||0)));
      canonical.diferencia = sorted.reduce((best,x)=>Math.abs(Number(x.diferencia||0))<Math.abs(Number(best||0))?Number(x.diferencia||0):best, Number(sorted[0]?.diferencia||0));
      canonical.fecha_liquidacion = sorted.map(x=>x.fecha_liquidacion||x.creado_en||'').filter(Boolean).sort().at(-1) || canonical.fecha_liquidacion;
    }
    return canonical;
  });
}

export function buildPendingDeliveryPanel(lots = [], details = [], orders = [], now = new Date()){
  const ordersById = new Map(orders.map(o=>[String(o.id),o]));
  const rows = [];

  lots.filter(l=>!['cerrado','revertido'].includes(String(l?.estado||'').toLowerCase())).forEach(lot=>{
    const lotDetails = details.filter(d=>String(d.lote_id)===String(lot.id));
    const lotOrders = lotDetails.map(d=>ordersById.get(String(d.orden_id))).filter(Boolean);
    const pending = lotOrders.filter(o=>!o.recibido_en);
    if(!pending.length) return;
    const openedAt = lot.fecha_entrega || lot.creado_en || pending[0]?.asignado_delivery_en || '';
    const openedMs = openedAt ? new Date(openedAt).getTime() : NaN;
    const ageMinutes = Number.isFinite(openedMs) ? Math.max(0, Math.round((now.getTime()-openedMs)/60000)) : 0;
    rows.push({
      lotId: lot.id,
      code: lot.codigo_lote || 'SIN-LOTE',
      delivery: lot.responsable_nombre || lot.delivery_nombre || pending[0]?.delivery_nombre || 'Sin responsable',
      pendingClients: pending.length,
      totalClients: lotOrders.length || Number(lot.cantidad_ordenes||pending.length),
      pendingAmount: pending.reduce((sum,o)=>sum+Number(o.total_factura||o.total_estimado||0),0),
      openedAt,
      ageMinutes,
      partial: pending.length < (lotOrders.length || pending.length),
      state: lot.estado || 'Abierto'
    });
  });

  const byDelivery = new Map();
  rows.forEach(row=>{
    const deliveryKey=String(row.delivery||'Sin responsable').trim().toLocaleLowerCase('es');
    if(!byDelivery.has(deliveryKey)) byDelivery.set(deliveryKey,{delivery:row.delivery,lots:0,pendingClients:0,pendingAmount:0,oldestMinutes:0,oldestAt:'',partialLots:0,lotRows:[]});
    const item=byDelivery.get(deliveryKey);
    item.lots += 1;
    item.pendingClients += row.pendingClients;
    item.pendingAmount += row.pendingAmount;
    item.partialLots += row.partial ? 1 : 0;
    item.lotRows.push(row);
    if(row.ageMinutes >= item.oldestMinutes){ item.oldestMinutes=row.ageMinutes; item.oldestAt=row.openedAt; }
  });

  return [...byDelivery.values()].sort((a,b)=>b.oldestMinutes-a.oldestMinutes || a.delivery.localeCompare(b.delivery));
}

export function deliveryReadOnlyMetrics(groups = [], orders = [], now = new Date()){
  const timestamps = orders.map(o=>o.asignado_delivery_en||o.validado_en||'').filter(Boolean).map(v=>new Date(v).getTime()).filter(Number.isFinite);
  const oldestMs = timestamps.length ? Math.min(...timestamps) : NaN;
  return {
    openTrips: groups.length,
    clients: orders.length,
    total: orders.reduce((sum,o)=>sum+Number(o.total_factura||o.total_estimado||0),0),
    oldestMinutes: Number.isFinite(oldestMs)?Math.max(0,Math.round((now.getTime()-oldestMs)/60000)):0
  };
}

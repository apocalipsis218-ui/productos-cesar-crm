const OPERATIONAL_PAGES = new Set([
  'inicio','ordenes','carniceria','facturacion','validacion',
  'delivery','liquidacion','alertas','kanban'
]);

const PAGE_AUX_TABLES = Object.freeze({
  inicio:['orden_detalle','orden_pesos','orden_entregas','orden_pagos','orden_estados_historial'],
  ordenes:['orden_detalle','orden_pesos','orden_entregas','orden_pagos','orden_estados_historial'],
  carniceria:['orden_detalle','orden_pesos','orden_estados_historial'],
  facturacion:['orden_detalle','orden_pesos','orden_estados_historial'],
  validacion:['orden_detalle','orden_pesos','orden_entregas','orden_estados_historial'],
  delivery:['orden_entregas','orden_pagos','orden_estados_historial'],
  liquidacion:['orden_entregas','orden_pagos','orden_estados_historial'],
  alertas:['orden_detalle','orden_pesos','orden_entregas','orden_pagos','orden_estados_historial'],
  kanban:['orden_detalle','orden_pesos','orden_entregas','orden_pagos','orden_estados_historial'],
  productividad:['orden_pesos','orden_entregas','orden_pagos','orden_estados_historial'],
  reportes:['orden_pesos','orden_entregas','orden_pagos','orden_estados_historial'],
  auditoria:['orden_detalle','orden_pesos','orden_entregas','orden_pagos','orden_estados_historial']
});

export function isOperationalPageV942(page=''){
  return OPERATIONAL_PAGES.has(String(page||''));
}

export function auxTablesForPageV942(page=''){
  return [...(PAGE_AUX_TABLES[String(page||'')]||[])];
}

export function realtimeTablesForPageV942(page='',liquidacionTab=''){
  const tables=['sistema_configuracion'];
  if(isOperationalPageV942(page)) tables.unshift('ordenes',...auxTablesForPageV942(page));
  if(page==='liquidacion' && ['cxc','cxc_historial'].includes(liquidacionTab)){
    tables.push('cxc_cobros','cxc_cobro_aplicaciones');
  }
  return [...new Set(tables)];
}

export function upsertRowByIdV942(rows=[],row={}){
  if(row?.id===undefined || row?.id===null) return [...(rows||[])];
  const key=String(row.id);
  const next=[...(rows||[])];
  const index=next.findIndex(item=>String(item?.id)===key);
  if(index>=0) next[index]={...next[index],...row}; else next.unshift(row);
  return next;
}

export function removeRowByIdV942(rows=[],id=null){
  if(id===undefined || id===null) return [...(rows||[])];
  const key=String(id);
  return (rows||[]).filter(item=>String(item?.id)!==key);
}

export function changedOrderIdV942(table,payload={},orders=[]){
  const row=payload.new||payload.old||{};
  if(table==='ordenes') return row.id??null;
  if(row.orden_id!==undefined && row.orden_id!==null) return row.orden_id;
  if(table==='orden_detalle' && row.id!==undefined){
    const detailId=String(row.id);
    const owner=(orders||[]).find(order=>(order?.items||[]).some(item=>String(item?.id)===detailId));
    return owner?.id??null;
  }
  return null;
}

export function boundedOrderIdsV942(values=[],maximum=100){
  return [...new Set((values||[]).map(Number).filter(Number.isSafeInteger).filter(id=>id>0))].slice(0,maximum);
}

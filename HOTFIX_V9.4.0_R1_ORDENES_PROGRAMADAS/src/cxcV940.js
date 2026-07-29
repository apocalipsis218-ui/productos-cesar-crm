function moneyValue(value){
  const n=Number(value||0);
  return Number.isFinite(n) ? Math.round(n*100)/100 : 0;
}

function dueSortValue(row={}){
  const raw=row.cxc_vencimiento || row.vencimiento || row.recibido_en || row.fecha || '';
  const value=raw ? new Date(String(raw).slice(0,10)+'T12:00:00').getTime() : Number.MAX_SAFE_INTEGER;
  return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
}

export function allocateCxcOldest(amountValue, rows=[]){
  let remaining=moneyValue(amountValue);
  if(remaining<=0) return [];
  const ordered=[...(rows||[])]
    .filter(row=>moneyValue(row.saldo_pendiente ?? row.monto_pendiente)>0)
    .sort((a,b)=>dueSortValue(a)-dueSortValue(b) || Number(a.orden_id||a.id||0)-Number(b.orden_id||b.id||0));
  const applications=[];
  for(const row of ordered){
    if(remaining<=0.009) break;
    const balance=moneyValue(row.saldo_pendiente ?? row.monto_pendiente);
    const applied=moneyValue(Math.min(balance,remaining));
    if(applied<=0) continue;
    applications.push({
      orden_id:Number(row.orden_id||row.id),
      monto:applied,
      saldo_antes:balance,
      saldo_despues:moneyValue(balance-applied)
    });
    remaining=moneyValue(remaining-applied);
  }
  if(remaining>0.009) throw new Error('El cobro supera el saldo pendiente del cliente.');
  return applications;
}

export function normalizeManualCxcApplications(rows=[]){
  const seen=new Set();
  return (rows||[]).map(row=>{
    const orderId=Number(row.orden_id||row.id);
    const amount=moneyValue(row.monto);
    const balance=moneyValue(row.saldo_pendiente ?? row.monto_pendiente);
    if(!Number.isInteger(orderId)||orderId<=0) throw new Error('Hay una factura sin orden válida.');
    if(seen.has(orderId)) throw new Error('Una factura no puede aparecer dos veces en el mismo cobro.');
    seen.add(orderId);
    if(amount<=0) return null;
    if(amount>balance+0.009) throw new Error('Un abono no puede superar el saldo de la factura.');
    return {orden_id:orderId,monto:amount,saldo_antes:balance,saldo_despues:moneyValue(balance-amount)};
  }).filter(Boolean);
}

export function cxcApplicationsTotal(rows=[]){
  return moneyValue((rows||[]).reduce((sum,row)=>sum+moneyValue(row.monto),0));
}

export function groupCxcAccounts(rows=[]){
  const groups=new Map();
  for(const row of rows||[]){
    const key=String(row.cliente_clave||'ORD:'+String(row.orden_id||row.id||''));
    if(!groups.has(key)){
      groups.set(key,{
        key,
        cliente_id:row.cliente_id??null,
        cliente_nombre:row.cliente_nombre||'Cliente',
        cliente_telefono:row.cliente_telefono||'',
        cliente_codigo:row.cliente_codigo||'',
        rows:[],
        saldo:0,
        vencido:0,
        abonado:0
      });
    }
    const group=groups.get(key);
    const balance=moneyValue(row.saldo_pendiente ?? row.monto_pendiente);
    group.rows.push(row);
    group.saldo=moneyValue(group.saldo+balance);
    group.abonado=moneyValue(group.abonado+moneyValue(row.abonado_cxc));
    if(Number(row.dias_atraso||0)>0 && balance>0) group.vencido=moneyValue(group.vencido+balance);
  }
  return [...groups.values()].sort((a,b)=>{
    const aDue=Math.min(...a.rows.map(dueSortValue));
    const bDue=Math.min(...b.rows.map(dueSortValue));
    return aDue-bDue || String(a.cliente_nombre).localeCompare(String(b.cliente_nombre),'es');
  });
}

export function cxcPortfolioSummary(rows=[]){
  const open=(rows||[]).filter(row=>moneyValue(row.saldo_pendiente ?? row.monto_pendiente)>0);
  const clientKeys=new Set(open.map(row=>String(row.cliente_clave||row.cliente_id||row.orden_id)));
  return open.reduce((summary,row)=>{
    const balance=moneyValue(row.saldo_pendiente ?? row.monto_pendiente);
    summary.saldo=moneyValue(summary.saldo+balance);
    if(Number(row.dias_atraso||0)>0) summary.vencido=moneyValue(summary.vencido+balance);
    summary.facturas+=1;
    summary.maxAtraso=Math.max(summary.maxAtraso,Number(row.dias_atraso||0));
    return summary;
  },{clientes:clientKeys.size,facturas:0,saldo:0,vencido:0,maxAtraso:0});
}

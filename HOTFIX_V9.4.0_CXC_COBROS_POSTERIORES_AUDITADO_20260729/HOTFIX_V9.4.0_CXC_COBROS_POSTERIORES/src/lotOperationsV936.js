export const LOT_BLOCKED_STATES = Object.freeze(['En ruta','Cobrado','Entregado a crédito','No entregado','Devuelto parcial','Cerrado','Liquidado']);

export function lotUiKey(prefix, code, identity=''){
  return `${String(prefix||'lot')}:${String(code||'SIN-LOTE')}:${String(identity||'')}`;
}

export function buildOperationalLotGroups(orders=[], getCode=()=>'', getAmount=()=>0, isFinal=()=>false){
  const map=new Map();
  for(const order of orders||[]){
    const code=String(getCode(order)||'').trim().toUpperCase();
    const key=code || `SIN-LOTE-${String(order?.id??order?.codigo??map.size)}`;
    if(!map.has(key)) map.set(key,{key,displayCode:code||'SIN-LOTE',items:[]});
    map.get(key).items.push(order);
  }
  return [...map.values()].map(group=>{
    const total=group.items.reduce((sum,o)=>sum+Number(getAmount(o)||0),0);
    const reported=group.items.filter(isFinal).length;
    return {...group,total,reported,pending:group.items.length-reported};
  }).sort((a,b)=>{
    if(a.displayCode==='SIN-LOTE'&&b.displayCode!=='SIN-LOTE') return 1;
    if(b.displayCode==='SIN-LOTE'&&a.displayCode!=='SIN-LOTE') return -1;
    return String(b.displayCode).localeCompare(String(a.displayCode));
  });
}

export function evaluateLotCorrection({lot,orders=[],hasLiquidation=false,canEdit=false}={}){
  if(!canEdit) return {allowed:false,orders,reason:'No tienes permiso para corregir lotes.'};
  if(!lot?.id) return {allowed:false,orders,reason:'El lote no tiene un registro formal y no puede corregirse de forma segura.'};
  if(String(lot.estado||'Abierto').toLowerCase()!=='abierto') return {allowed:false,orders,reason:`El lote está ${lot.estado||'cerrado'} y ya no admite correcciones operativas.`};
  if(hasLiquidation) return {allowed:false,orders,reason:'El lote ya tiene una liquidación registrada.'};
  if(!orders.length) return {allowed:false,orders,reason:'No se encontraron órdenes vinculadas al lote.'};
  const blocked=orders.filter(o=>o?.recibido_en || o?.resultado_entrega || LOT_BLOCKED_STATES.includes(o?.estado));
  if(blocked.length) return {allowed:false,orders,blocked,reason:'El lote ya tiene ruta, resultado, cobro o recepción posterior.'};
  return {allowed:true,orders,blocked:[],reason:''};
}

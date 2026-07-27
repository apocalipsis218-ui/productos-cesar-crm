export const RESPONSIBLE_TYPES = Object.freeze({
  DELIVERY: 'delivery_registrado',
  EMPLOYEE: 'otro_empleado',
  MANUAL: 'manual_externo'
});

export function normalizeResponsibleName(value=''){
  return String(value||'').trim().replace(/\s+/g,' ');
}

export function responsibleTypeLabel(type=''){
  if(type===RESPONSIBLE_TYPES.DELIVERY) return 'Delivery registrado';
  if(type===RESPONSIBLE_TYPES.EMPLOYEE) return 'Otro empleado';
  if(type===RESPONSIBLE_TYPES.MANUAL) return 'Manual / externo';
  return 'Responsable del viaje';
}

export function inferResponsibleType(name, employees=[], deliveryNames=[]){
  const key=normalizeResponsibleName(name).toLocaleLowerCase('es');
  if(!key) return RESPONSIBLE_TYPES.MANUAL;
  const deliverySet=new Set((deliveryNames||[]).map(x=>normalizeResponsibleName(x).toLocaleLowerCase('es')));
  if(deliverySet.has(key)) return RESPONSIBLE_TYPES.DELIVERY;
  const employeeSet=new Set((employees||[]).filter(x=>x?.activo!==false).map(x=>normalizeResponsibleName(x?.nombre).toLocaleLowerCase('es')));
  if(employeeSet.has(key)) return RESPONSIBLE_TYPES.EMPLOYEE;
  return RESPONSIBLE_TYPES.MANUAL;
}

export function mergeResponsibleNames({deliveryNames=[],employees=[],lots=[],orders=[],includeClosed=true}={}){
  const map=new Map();
  const push=(name)=>{
    const clean=normalizeResponsibleName(name);
    if(!clean) return;
    const key=clean.toLocaleLowerCase('es');
    if(!map.has(key)) map.set(key,clean);
  };
  (deliveryNames||[]).forEach(push);
  (lots||[]).forEach(l=>{
    const state=String(l?.estado||'').toLocaleLowerCase('es');
    if(!includeClosed && ['cerrado','revertido','transferido totalmente'].includes(state)) return;
    push(l?.responsable_nombre||l?.delivery_nombre);
  });
  (orders||[]).forEach(o=>push(o?.delivery_nombre));
  return [...map.values()].sort((a,b)=>a.localeCompare(b,'es',{sensitivity:'base'}));
}

export function transferCodePreview(orderId,now=new Date()){
  const pad=n=>String(n).padStart(2,'0');
  return `TRF-${String(now.getFullYear()).slice(2)}${pad(now.getMonth()+1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}-${String(orderId||'')}`;
}

export function canTransferOrder({lot,order,hasLiquidation=false,canEdit=false}={}){
  if(!canEdit) return {allowed:false,reason:'No tienes permiso para transferir pedidos.'};
  if(!lot?.id) return {allowed:false,reason:'El lote no tiene registro formal.'};
  if(!order?.id) return {allowed:false,reason:'No se encontró la orden.'};
  const lotState=String(lot.estado||'Abierto').toLocaleLowerCase('es');
  if(['cerrado','revertido','transferido totalmente'].includes(lotState)) return {allowed:false,reason:`El lote está ${lot.estado||'cerrado'}.`};
  if(hasLiquidation) return {allowed:false,reason:'El lote ya tiene una liquidación formal.'};
  if(order.recibido_en) return {allowed:false,reason:'La orden ya fue recibida por CXC.'};
  const finalStates=['Cobrado','Entregado a crédito','No entregado','Devuelto parcial','Cerrado','Liquidado'];
  if(finalStates.includes(order.estado)||finalStates.includes(order.resultado_entrega)) return {allowed:false,reason:'La orden ya tiene un resultado final.'};
  return {allowed:true,reason:''};
}

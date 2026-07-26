function normalize(value){
  return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
}

export function orderCompositionKey(item){
  return [
    item?.producto_id||'manual',
    normalize(item?.producto_nombre||''),
    Number(item?.cantidad_pedida||0).toFixed(3),
    normalize(item?.unidad||'lb')
  ].join('|');
}

export function orderCompositionChange(previous=[],next=[]){
  const count=list=>list.reduce((map,item)=>{
    const key=orderCompositionKey(item);
    map.set(key,(map.get(key)||0)+1);
    return map;
  },new Map());
  const before=count(previous), after=count(next), removed=[], added=[];
  before.forEach((amount,key)=>{
    const difference=amount-(after.get(key)||0);
    for(let index=0;index<difference;index++) removed.push(previous.find(item=>orderCompositionKey(item)===key));
  });
  after.forEach((amount,key)=>{
    const difference=amount-(before.get(key)||0);
    for(let index=0;index<difference;index++) added.push(next.find(item=>orderCompositionKey(item)===key));
  });
  return {changed:removed.length>0||added.length>0,removalOnly:removed.length>0&&added.length===0,removed,added};
}

export function preparedEquivalentOfItem(item){
  const prepared=Number(item?.peso_equivalente_preparado||0);
  if(prepared>0) return prepared;
  const requested=Number(item?.peso_equivalente_solicitado||0);
  if(requested>0) return requested;
  if(String(item?.unidad||'').toLowerCase()==='lb') return Number(item?.cantidad_preparada ?? item?.cantidad_pedida ?? 0)||0;
  return 0;
}

export function recalculatedPreparedWeightAfterRemoval(order,removed=[],retained=[]){
  const previous=Number(order?.peso_preparado||0);
  const removedWeight=removed.reduce((sum,item)=>sum+preparedEquivalentOfItem(item),0);
  const retainedWeight=retained.reduce((sum,item)=>sum+preparedEquivalentOfItem(item),0);
  const adjusted=previous>0&&removedWeight>0?previous-removedWeight:retainedWeight;
  return Number(Math.max(0,adjusted).toFixed(3));
}

export function orderEditPreparationPatch(order,change,clean){
  if(!order||!change.changed) return {};
  const common={peso_facturado:null,peso_validado:null,validado_por:null,validado_en:null};
  if(change.removalOnly){
    const recalculated=recalculatedPreparedWeightAfterRemoval(order,change.removed,clean);
    return {...common,peso_preparado:recalculated||null,peso_calculado_preparado:recalculated||null};
  }
  return {
    ...common,
    estado:'Pedido recibido',
    tomado_por:null,
    tomado_por_empleado_id:null,
    tomado_en:null,
    tomado_por_user:null,
    preparado_por:null,
    preparado_en:null,
    peso_preparado:null,
    peso_calculado_preparado:null,
    paquetes_preparados:null,
    facturado_por:null,
    facturado_en:null,
    factura_no:null
  };
}

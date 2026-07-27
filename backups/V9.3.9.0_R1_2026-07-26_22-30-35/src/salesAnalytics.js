function num(value){
  const n=Number(value);
  return Number.isFinite(n)?n:0;
}
function dateOnly(value){
  if(!value) return '';
  const raw=String(value).slice(0,10);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw)?raw:'';
}
function addDays(key,days){
  const d=new Date(String(key).slice(0,10)+'T12:00:00');
  d.setDate(d.getDate()+Number(days||0));
  const local=new Date(d.getTime()-d.getTimezoneOffset()*60000);
  return local.toISOString().slice(0,10);
}
function daysBetween(a,b){
  if(!a||!b) return null;
  const x=new Date(a+'T12:00:00'), y=new Date(b+'T12:00:00');
  return Math.round((y-x)/86400000);
}
function orderClientKey(order){
  return String(order?.cliente_id ?? order?.cliente?.id ?? order?.cliente?.codigo ?? order?.cliente?.negocio ?? 'sin-cliente');
}
function orderClientName(order){ return order?.cliente?.negocio || order?.cliente_nombre || 'Cliente'; }
function orderClientCode(order){ return order?.cliente?.codigo || ''; }
function productKey(item){ return String(item?.producto_nombre||'Producto').trim().toLowerCase()+'|'+String(item?.unidad||'—').trim().toLowerCase(); }

export function percentageChange(current,previous){
  const c=num(current),p=num(previous);
  if(!p) return c?null:0;
  return ((c-p)/Math.abs(p))*100;
}

export function buildDailySeries(rows,from,to,dateFn,valueFn){
  const totals=new Map();
  (rows||[]).forEach(row=>{
    const key=dateOnly(dateFn(row));
    if(!key||key<from||key>to) return;
    totals.set(key,(totals.get(key)||0)+num(valueFn(row)));
  });
  const out=[];
  for(let key=from;key<=to;key=addDays(key,1)){
    out.push({date:key,value:totals.get(key)||0});
    if(out.length>370) break;
  }
  return out;
}

export function aggregateProducts(currentOrders,previousOrders){
  const aggregate=orders=>{
    const map=new Map();
    (orders||[]).forEach(order=>{
      (order.items||[]).forEach(item=>{
        const key=productKey(item);
        if(!map.has(key)) map.set(key,{key,producto:item.producto_nombre||'Producto',unidad:item.unidad||'—',cantidad:0,monto:0,ordenes:new Set(),clientes:new Set(),precioPonderado:0,devoluciones:0});
        const row=map.get(key), qty=num(item.cantidad_despachada ?? item.cantidad_pedida), price=num(item.precio), subtotal=num(item.subtotal)||qty*price;
        row.cantidad+=qty;
        row.monto+=subtotal;
        row.precioPonderado+=qty*price;
        row.ordenes.add(String(order.id));
        row.clientes.add(orderClientKey(order));
        const state=String(order.estado||order.estado_efectivo||'').toLowerCase();
        if(state.includes('devuelto')) row.devoluciones+=1;
      });
    });
    return map;
  };
  const current=aggregate(currentOrders), previous=aggregate(previousOrders), keys=new Set([...current.keys(),...previous.keys()]);
  return Array.from(keys).map(key=>{
    const c=current.get(key)||{key,producto:previous.get(key)?.producto||'Producto',unidad:previous.get(key)?.unidad||'—',cantidad:0,monto:0,ordenes:new Set(),clientes:new Set(),precioPonderado:0,devoluciones:0};
    const p=previous.get(key)||{cantidad:0,monto:0,ordenes:new Set(),clientes:new Set(),precioPonderado:0,devoluciones:0};
    return {
      key,producto:c.producto,unidad:c.unidad,cantidad:c.cantidad,monto:c.monto,
      ordenes:c.ordenes.size,clientes:c.clientes.size,precioPromedio:c.cantidad?c.precioPonderado/c.cantidad:0,
      devoluciones:c.devoluciones,anteriorMonto:p.monto,variacion:percentageChange(c.monto,p.monto)
    };
  }).sort((a,b)=>b.monto-a.monto);
}

export function aggregateClients({currentOrders=[],previousOrders=[],allOrders=[],clients=[],from='',to='',amountFn=()=>0,dateFn=()=>''}){
  const currentMap=new Map(), previousMap=new Map(), historyMap=new Map();
  const ensure=(map,key,order)=>{
    if(!map.has(key)) map.set(key,{key,clienteId:order?.cliente_id ?? order?.cliente?.id ?? null,nombre:orderClientName(order),codigo:orderClientCode(order),monto:0,ordenes:0,dates:[]});
    return map.get(key);
  };
  currentOrders.forEach(order=>{const key=orderClientKey(order),r=ensure(currentMap,key,order);r.monto+=num(amountFn(order));r.ordenes++;const d=dateOnly(dateFn(order));if(d)r.dates.push(d);});
  previousOrders.forEach(order=>{const key=orderClientKey(order),r=ensure(previousMap,key,order);r.monto+=num(amountFn(order));r.ordenes++;const d=dateOnly(dateFn(order));if(d)r.dates.push(d);});
  allOrders.forEach(order=>{const key=orderClientKey(order);if(!historyMap.has(key))historyMap.set(key,[]);const d=dateOnly(dateFn(order));if(d)historyMap.get(key).push(d);});
  const clientMap=new Map((clients||[]).map(c=>[String(c.id),c]));
  const keys=new Set([...currentMap.keys(),...previousMap.keys(),...historyMap.keys(),...clientMap.keys()]);
  return Array.from(keys).map(key=>{
    const c=currentMap.get(key)||{},p=previousMap.get(key)||{},client=clientMap.get(key)||{};
    const dates=(historyMap.get(key)||[]).sort(), firstDate=dates[0]||'', lastDate=dates.at(-1)||'';
    const currentDates=(c.dates||[]).sort(), firstCurrent=currentDates[0]||'';
    const priorDates=dates.filter(d=>d<from), priorLast=priorDates.at(-1)||'';
    const currentAmount=num(c.monto), previousAmount=num(p.monto), variation=percentageChange(currentAmount,previousAmount);
    const inactiveDays=lastDate?daysBetween(lastDate,to):null;
    const isNew=!!firstDate && firstDate>=from && firstDate<=to;
    const recovered=currentAmount>0 && !isNew && !!priorLast && !!firstCurrent && (daysBetween(priorLast,firstCurrent)||0)>=30;
    let segment='Estable';
    if(isNew) segment='Nuevo';
    else if(recovered) segment='Recuperado';
    else if(currentAmount===0 && client.estado==='Activo' && (inactiveDays===null||inactiveDays>=30)) segment='En riesgo';
    else if(previousAmount>0 && variation!==null && variation>=20) segment='En crecimiento';
    else if(previousAmount>0 && variation!==null && variation<=-20) segment='En reducción';
    else if(currentAmount>0 && previousAmount===0) segment='Activo';
    return {
      key,clienteId:c.clienteId??p.clienteId??client.id??null,nombre:c.nombre||p.nombre||client.negocio||'Cliente',codigo:c.codigo||p.codigo||client.codigo||'',
      sector:client.sector||'',vendedor:client.vendedor||'',estado:client.estado||'',monto:currentAmount,anteriorMonto:previousAmount,
      variacion:variation,ordenes:num(c.ordenes),ticket:num(c.ordenes)?currentAmount/num(c.ordenes):0,firstDate,lastDate,inactiveDays,segment
    };
  }).sort((a,b)=>b.monto-a.monto||a.nombre.localeCompare(b.nombre));
}

export function aggregateCrm({calls=[],previousCalls=[],orders=[],amountFn=()=>0}){
  const callIds=new Set(calls.map(c=>String(c.id)));
  const linkedOrders=(orders||[]).filter(o=>o.llamada_id!=null && callIds.has(String(o.llamada_id)));
  const managed=new Set(calls.map(c=>String(c.cliente_id)).filter(Boolean));
  const requestedCalls=calls.filter(c=>String(c.resultado||'').toLowerCase().includes('pidió'));
  const requestedClients=new Set(requestedCalls.map(c=>String(c.cliente_id)).filter(Boolean));
  const previousManaged=new Set(previousCalls.map(c=>String(c.cliente_id)).filter(Boolean));
  const previousRequested=new Set(previousCalls.filter(c=>String(c.resultado||'').toLowerCase().includes('pidió')).map(c=>String(c.cliente_id)).filter(Boolean));
  const byResult={};
  calls.forEach(c=>{const k=c.resultado||'Sin resultado';byResult[k]=(byResult[k]||0)+1;});
  const bySeller=new Map();
  calls.forEach(c=>{
    const seller=c.vendedor||c.usuario||'Sin responsable';
    if(!bySeller.has(seller)) bySeller.set(seller,{vendedor:seller,llamadas:0,clientes:new Set(),pidieron:new Set(),ordenes:0,monto:0});
    const row=bySeller.get(seller);row.llamadas++;if(c.cliente_id!=null)row.clientes.add(String(c.cliente_id));if(String(c.resultado||'').toLowerCase().includes('pidió')&&c.cliente_id!=null)row.pidieron.add(String(c.cliente_id));
  });
  linkedOrders.forEach(o=>{
    const call=calls.find(c=>String(c.id)===String(o.llamada_id));
    const seller=call?.vendedor||o.vendedor||'Sin responsable';
    if(!bySeller.has(seller)) bySeller.set(seller,{vendedor:seller,llamadas:0,clientes:new Set(),pidieron:new Set(),ordenes:0,monto:0});
    const row=bySeller.get(seller);row.ordenes++;row.monto+=num(amountFn(o));
  });
  return {
    calls:calls.length,previousCalls:previousCalls.length,managedClients:managed.size,previousManagedClients:previousManaged.size,
    requestedClients:requestedClients.size,previousRequestedClients:previousRequested.size,conversion:managed.size?(requestedClients.size/managed.size)*100:0,previousConversion:previousManaged.size?(previousRequested.size/previousManaged.size)*100:0,
    linkedOrders,linkedAmount:linkedOrders.reduce((s,o)=>s+num(amountFn(o)),0),byResult,
    sellers:Array.from(bySeller.values()).map(r=>({...r,clientes:r.clientes.size,pidieron:r.pidieron.size,conversion:r.clientes.size?(r.pidieron.size/r.clientes.size)*100:0})).sort((a,b)=>b.monto-a.monto||b.llamadas-a.llamadas)
  };
}

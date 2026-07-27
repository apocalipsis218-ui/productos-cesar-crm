export function mergeRecentAndPendingOrders(recent=[], pending=[]){
  const byId=new Map();
  [...recent,...pending].forEach(order=>{
    if(order?.id!==undefined && order?.id!==null) byId.set(String(order.id),order);
  });
  return [...byId.values()].sort((a,b)=>Number(b.id||0)-Number(a.id||0));
}

export function shouldRunFallbackPolling({hasUser=false,liveStatus='inactivo'}={}){
  return Boolean(hasUser) && liveStatus!=='en vivo';
}

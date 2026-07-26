export const DEFAULT_WEEKDAY_SCHEDULE = {
  0: [['07:00','12:00']],
  1: [['07:00','12:00'],['14:00','17:00']],
  2: [['07:00','12:00'],['14:00','17:00']],
  3: [['07:00','12:00'],['14:00','17:00']],
  4: [['07:00','12:00'],['14:00','17:00']],
  5: [['07:00','12:00'],['14:00','17:00']],
  6: [['07:00','12:00'],['14:00','17:00']],
};

export function parseDateTimeValue(value){
  if(!value) return null;
  try{
    const text=String(value);
    const d=text.includes('T') ? new Date(text) : new Date(text.slice(0,10)+'T00:00:00');
    return Number.isNaN(d.getTime()) ? null : d;
  }catch{
    return null;
  }
}

export function calendarMinutesBetween(startValue,endValue){
  const start=parseDateTimeValue(startValue), end=parseDateTimeValue(endValue);
  if(!start||!end||end<=start) return 0;
  return Math.max(0,Math.floor((end.getTime()-start.getTime())/60000));
}

function dateKeyLocal(date){
  const y=date.getFullYear(), m=String(date.getMonth()+1).padStart(2,'0'), d=String(date.getDate()).padStart(2,'0');
  return `${y}-${m}-${d}`;
}

function timeOnDate(date,hhmm){
  const [h,m]=String(hhmm||'00:00').split(':').map(Number);
  return new Date(date.getFullYear(),date.getMonth(),date.getDate(),Number.isFinite(h)?h:0,Number.isFinite(m)?m:0,0,0);
}

export function normalizeWorkingConfig(config={}){
  const source=config.weekdaySchedule||DEFAULT_WEEKDAY_SCHEDULE;
  const weekdaySchedule={};
  for(let day=0;day<7;day++){
    const rows=Array.isArray(source[day])?source[day]:DEFAULT_WEEKDAY_SCHEDULE[day];
    weekdaySchedule[day]=(rows||[]).filter(x=>Array.isArray(x)&&x.length>=2&&String(x[0])<String(x[1])).map(x=>[String(x[0]),String(x[1])]);
  }
  const holidays=new Set((config.holidays||[]).map(x=>String(x||'').slice(0,10)).filter(Boolean));
  return {enabled:config.enabled!==false,weekdaySchedule,holidays};
}

export function workingMinutesBetween(startValue,endValue,config={}){
  const start=parseDateTimeValue(startValue), end=parseDateTimeValue(endValue);
  if(!start||!end||end<=start) return 0;
  const cfg=normalizeWorkingConfig(config);
  if(!cfg.enabled) return calendarMinutesBetween(start,end);

  let total=0;
  const cursor=new Date(start.getFullYear(),start.getMonth(),start.getDate(),0,0,0,0);
  const finalDay=new Date(end.getFullYear(),end.getMonth(),end.getDate(),0,0,0,0);
  let guard=0;
  while(cursor<=finalDay && guard<3700){
    guard++;
    const key=dateKeyLocal(cursor);
    if(!cfg.holidays.has(key)){
      const segments=cfg.weekdaySchedule[cursor.getDay()]||[];
      for(const [from,to] of segments){
        const segStart=timeOnDate(cursor,from), segEnd=timeOnDate(cursor,to);
        const overlapStart=new Date(Math.max(start.getTime(),segStart.getTime()));
        const overlapEnd=new Date(Math.min(end.getTime(),segEnd.getTime()));
        if(overlapEnd>overlapStart) total+=(overlapEnd.getTime()-overlapStart.getTime())/60000;
      }
    }
    cursor.setDate(cursor.getDate()+1);
  }
  return Math.max(0,Math.floor(total));
}

export function median(values=[]){
  const rows=values.map(Number).filter(Number.isFinite).sort((a,b)=>a-b);
  if(!rows.length) return 0;
  const middle=Math.floor(rows.length/2);
  return rows.length%2?rows[middle]:(rows[middle-1]+rows[middle])/2;
}

export function quantile(values=[],q=.5){
  const rows=values.map(Number).filter(Number.isFinite).sort((a,b)=>a-b);
  if(!rows.length) return 0;
  const pos=(rows.length-1)*Math.max(0,Math.min(1,Number(q)||0));
  const base=Math.floor(pos), rest=pos-base;
  return rows[base+1]!==undefined ? rows[base]+rest*(rows[base+1]-rows[base]) : rows[base];
}

export function durationOutlierThreshold(values=[],slaMinutes=0,factor=3){
  const rows=values.map(Number).filter(Number.isFinite);
  if(!rows.length) return Math.max(0,Number(slaMinutes)||0)*Math.max(1,Number(factor)||3);
  const q1=quantile(rows,.25), q3=quantile(rows,.75), iqr=Math.max(0,q3-q1);
  const statistical=q3+(1.5*iqr);
  const operational=Math.max(0,Number(slaMinutes)||0)*Math.max(1,Number(factor)||3);
  return Math.max(statistical,operational);
}

const STATE_RANK = {
  'programada':0,
  'pedido recibido':1,
  'en preparacion':2,
  'lista para facturar':3,
  'impresa para facturar':3,
  'facturada':4,
  'validada para delivery':5,
  'asignada a delivery':6,
  'en ruta':7,
  'entregado':8,
  'no entregado':8,
  'devuelto parcial':8,
  'entregado a credito':9,
  'cobrado':9,
  'cerrado':10,
  'anulado':10,
};

function normalizeState(value){
  return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
}

export function stateRank(value){
  const key=normalizeState(value);
  return Object.prototype.hasOwnProperty.call(STATE_RANK,key)?STATE_RANK[key]:null;
}

export function isReopeningTransition(previousState,newState,comment=''){
  if(/reabr|reapert|volver a/i.test(String(comment||''))) return true;
  const previous=stateRank(previousState), next=stateRank(newState);
  return previous!==null && next!==null && next<previous;
}

import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const main=fs.readFileSync(path.join(root,'src','main.js'),'utf8');
const css=fs.readFileSync(path.join(root,'src','styles.css'),'utf8');

function ok(name,cond){
  if(!cond){ console.error(`ERROR - ${name}`); process.exitCode=1; }
  else console.log(`OK - ${name}`);
}
function bodyOf(name){
  const start=main.indexOf(`function ${name}`);
  if(start<0) return '';
  const next=main.indexOf('\nfunction ',start+10);
  return main.slice(start,next<0?main.length:next);
}

ok('marcador V9.3.0 R6',main.includes('V9.3.0 R6 - agenda comercial unificada'));
ok('función central de clientes gestionados',main.includes('function commercialManagedClientIdsForDate(f)'));
ok('llamadas y órdenes normales cuentan como gestión',bodyOf('commercialManagedClientIdsForDate').includes('commercialCallsForDate(f)') && bodyOf('commercialManagedClientIdsForDate').includes('commercialOrdersForDate(f)'));
ok('casos especiales no cumplen agenda',bodyOf('isCommercialNormalOrder').includes("orderType(o)==='Pedido normal'") && bodyOf('isCommercialNormalOrder').includes("norm(o.canal)!=='caso especial'"));
ok('gestiones usa cronología unificada',bodyOf('renderControlGestiones').includes('commercialActivitiesForDate(f)') && bodyOf('renderControlGestiones').includes('Pedidos directos'));
ok('pendientes usa clientes unificados',bodyOf('renderControlGestiones').includes('commercialManagedClientIdsForDate(f)') && bodyOf('renderControlGestiones').includes('!managedIds.has'));
ok('agenda usa pedidos directos',bodyOf('renderControlAgenda').includes('commercialOrdersForDate(f)') && bodyOf('renderControlAgenda').includes('Ver pedido'));
ok('inicio usa gestión comercial unificada',bodyOf('renderInicio').includes('commercialManagedClientIdsForDate(hoy)') && bodyOf('renderInicio').includes('Clientes gestionados'));
ok('alertas usa gestión comercial unificada',bodyOf('operationalAlerts').includes('commercialManagedClientIdsForDate(f)'));
ok('pedido directo no crea llamada artificial',!bodyOf('directOrderActivityMini').includes("sb.from('llamadas')"));
ok('pedido directo permite ver y editar orden',bodyOf('directOrderActivityMini').includes('data-oper-order') && bodyOf('directOrderActivityMini').includes('data-edit-order'));
ok('pedido vinculado no se duplica en el mismo día',bodyOf('commercialDirectOrdersForDate').includes('callsToday.has'));
ok('diseño móvil R6',css.includes('V9.3.0 R6 - Agenda comercial unificada') && css.includes('.commercial-order-activity'));



// Prueba funcional de la lógica real extraída de src/main.js.
const helperStart=main.indexOf('function commercialCallCreatedAt');
const helperEnd=main.indexOf('\nfunction renderInicio',helperStart);
const helperCode=main.slice(helperStart,helperEnd);
const mockState={
  llamadas:[
    {id:10,cliente_id:1,fecha:'2026-07-20',hora:'08:30',resultado:'Pidió'},
    {id:11,cliente_id:4,fecha:'2026-07-19',hora:'09:00',resultado:'Contactado'}
  ],
  ordenes:[
    {id:100,cliente_id:1,llamada_id:10,tipo_orden:'Pedido normal',canal:'Llamada',creado_en:'2026-07-20T08:31:00',fecha_despacho:'2026-07-20',estado:'Pedido recibido'},
    {id:101,cliente_id:2,tipo_orden:'Pedido normal',canal:'Manual',creado_en:'2026-07-20T10:00:00',fecha_despacho:'2026-07-22',estado:'Programada'},
    {id:102,cliente_id:3,tipo_orden:'Devolución',canal:'Caso especial',creado_en:'2026-07-20T11:00:00',fecha_despacho:'2026-07-20',estado:'Pedido recibido'},
    {id:103,cliente_id:4,llamada_id:11,tipo_orden:'Pedido normal',canal:'Manual',creado_en:'2026-07-20T12:00:00',fecha_despacho:'2026-07-20',estado:'Pedido recibido'}
  ],
  clientes:[]
};
const factory=new Function('state','orderType','norm','rowDateKey','createdAtOf','safeDateObj','today','parseDateTime',`${helperCode}; return {commercialManagedClientIdsForDate,commercialActivitiesForDate,commercialDirectOrdersForDate,commercialOrdersForDate};`);
const api=factory(
  mockState,
  o=>o?.tipo_orden||'Pedido normal',
  v=>String(v||'').toLowerCase().trim(),
  v=>String(v||'').slice(0,10),
  o=>o?.creado_en||o?.fecha,
  v=>new Date(v||0),
  ()=>'2026-07-20',
  v=>v?new Date(v):null
);
const ids=api.commercialManagedClientIdsForDate('2026-07-20');
ok('prueba funcional: llamada cumple agenda',ids.has(1));
ok('prueba funcional: pedido directo cumple agenda',ids.has(2));
ok('prueba funcional: pedido programado usa fecha de creación',ids.has(2));
ok('prueba funcional: caso especial no cumple agenda',!ids.has(3));
ok('prueba funcional: orden ligada a llamada anterior cuenta hoy',ids.has(4));
const acts=api.commercialActivitiesForDate('2026-07-20');
ok('prueba funcional: pedido vinculado no duplica llamada del día',acts.filter(a=>a.cliente_id===1).length===1 && acts.find(a=>a.cliente_id===1)?.orders?.[0]?.id===100);
ok('prueba funcional: pedido directo aparece como actividad',acts.some(a=>a.kind==='order' && a.order?.id===101));
ok('prueba funcional: pedido ligado a gestión anterior aparece el día de creación',acts.some(a=>a.kind==='order' && a.order?.id===103));

if(process.exitCode) process.exit(process.exitCode);
console.log('\nAuditoría Agenda + Órdenes V9.3.0 R6 aprobada.');

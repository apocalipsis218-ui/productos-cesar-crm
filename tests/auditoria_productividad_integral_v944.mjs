import fs from 'node:fs';
import assert from 'node:assert/strict';

const main=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const sqlR1=fs.readFileSync(
  new URL('../supabase/migrations/20260817014500_productividad_integral_v944.sql',import.meta.url),
  'utf8'
);
const sql=fs.readFileSync(
  new URL('../supabase/migrations/20260817021459_productividad_despachos_repetidos_v944_r2.sql',import.meta.url),
  'utf8'
);
const sqlAll=sqlR1+'\n'+sql;
const map=fs.readFileSync(new URL('../MAPEO_PRODUCTIVIDAD_V944.md',import.meta.url),'utf8');
const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));
const productivityFunction=main.slice(
  main.indexOf('function productivityRows('),
  main.indexOf('function renderProductividad(')
);
const moduleLoader=main.slice(
  main.indexOf('async function loadModuleDataV942('),
  main.indexOf('async function refreshVisibleModuleV9384(')
);

function simulateProductivity(events,{month='2026-08'}={}){
  const rows=new Map();
  const teamClients=new Set();
  for(const event of events){
    if(!String(event.date||'').startsWith(month) || event.reversed) continue;
    const key=`${event.employeeId}:${event.role}`;
    if(!rows.has(key)) rows.set(key,{
      employeeId:event.employeeId,
      active:event.active!==false,
      role:event.role,
      clients:new Set(),
      orders:new Set(),
      incentiveUnits:new Set(),
      factured:0,
      paid:0
    });
    const row=rows.get(key);
    row.active=row.active&&event.active!==false;
    if(event.clientKey && (event.role!=='Delivery'||event.eligible!==false)){
      row.clients.add(event.clientKey);
      teamClients.add(event.clientKey);
    }
    if(event.orderId) row.orders.add(event.orderId);
    if(event.orderId && ['Despachador','Delivery'].includes(event.role) && event.eligible!==false){
      row.incentiveUnits.add(event.orderId);
    }
    if(event.kind==='invoice') row.factured+=Number(event.amount||0);
    if(event.kind==='payment') row.paid+=Number(event.amount||0);
  }
  return {
    rows:[...rows.values()].map(row=>({
      ...row,
      clients:row.clients.size,
      orders:row.orders.size,
      incentiveUnits:row.incentiveUnits.size
    })),
    teamClients:teamClients.size
  };
}

const virtual=simulateProductivity([
  {employeeId:1,role:'Despachador',orderId:101,clientKey:'cliente:10',date:'2026-08-03'},
  {employeeId:1,role:'Despachador',orderId:102,clientKey:'cliente:10',date:'2026-08-03'},
  {employeeId:1,role:'Despachador',orderId:103,clientKey:'cliente:10',date:'2026-08-19'},
  {employeeId:1,role:'Delivery',orderId:101,clientKey:'cliente:10',date:'2026-08-04'},
  {employeeId:1,role:'Delivery',orderId:102,clientKey:'cliente:10',date:'2026-08-04'},
  {employeeId:1,role:'Delivery',orderId:105,clientKey:'cliente:10',date:'2026-08-05',eligible:false},
  {employeeId:2,role:'Despachador',orderId:104,clientKey:'cliente:10',date:'2026-08-20'},
  {employeeId:3,role:'Vendedor',orderId:201,clientKey:'telefono:8090000001',kind:'invoice',amount:1000,date:'2026-08-05'},
  {employeeId:3,role:'Vendedor',orderId:201,clientKey:'telefono:8090000001',kind:'payment',amount:400,date:'2026-08-07'},
  {employeeId:3,role:'Vendedor',orderId:201,clientKey:'telefono:8090000001',kind:'payment',amount:600,date:'2026-09-02'},
  {employeeId:3,role:'Vendedor',orderId:202,clientKey:'cliente:12',kind:'payment',amount:500,date:'2026-08-09',reversed:true},
  {employeeId:4,role:'Validación',orderId:301,clientKey:'cliente:13',date:'2026-08-14',active:false},
  {employeeId:5,role:'Control',orderId:401,clientKey:'cliente:14',date:'2026-07-31'}
]);
const prep1=virtual.rows.find(r=>r.employeeId===1&&r.role==='Despachador');
const delivery1=virtual.rows.find(r=>r.employeeId===1&&r.role==='Delivery');
const prep2=virtual.rows.find(r=>r.employeeId===2&&r.role==='Despachador');
const seller=virtual.rows.find(r=>r.employeeId===3&&r.role==='Vendedor');
const historical=virtual.rows.find(r=>r.employeeId===4&&r.role==='Validación');

const checks=[
  ['SQL del ranking cierra el agregado JSON antes de FROM',/jsonb_agg\(jsonb_build_object\([\s\S]*?\) order by r\.incentivo desc, r\.empleado_nombre, r\.rol\)\s+from final_rows r/.test(sql)],
  ['versión V9.4.4 R2 o superior sincronizada',/^9\.4\.(?:[4-9]|\d{2,})$/.test(pkg.version)&&/V9\.4\.4 PWA · R2/.test(main)&&/'version', 'V9\.4\.4 R2'/.test(sql)],
  ['RPC mensual protegida y cerrada a anónimo',
    /function public\.resumen_productividad_mensual_v944/.test(sql) &&
    /security definer/.test(sql) && /set search_path = ''/.test(sql) &&
    /Sesión requerida/.test(sql) && /Perfil activo requerido/.test(sql) &&
    /tiene_modulo\('productividad', 'ver'\)/.test(sql) &&
    /revoke all on function public\.resumen_productividad_mensual_v944\(date\) from anon/.test(sql) &&
    /grant execute on function public\.resumen_productividad_mensual_v944\(date\) to authenticated/.test(sql) &&
    /notify pgrst, 'reload schema'/.test(sql)],
  ['período usa Santo Domingo y límites semiabiertos',
    /America\/Santo_Domingo/.test(sql)&&/>= v_inicio/.test(sql)&&/< v_fin/.test(sql)],
  ['módulos operativos requeridos están conectados',
    ['preparadas','delivery_details','seller_activity','invoiced','validated','liquidated_lots','calls']
      .every(name=>new RegExp(`\\b${name}\\b`).test(sql))],
  ['identidad formal se prioriza en Carnicería y Delivery',
    /e_id\.id = o\.tomado_por_empleado_id/.test(sql)&&
    /e_id\.id = l\.responsable_empleado_id/.test(sql)],
  ['clientes registrados y ocasionales tienen clave estable',
    /'cliente:' \|\| o\.cliente_id/.test(sql)&&
    /'telefono:' \|\| regexp_replace/.test(sql)&&
    /'orden:' \|\| o\.id/.test(sql)],
  ['empleado y rol permanecen separados',
    /union all select \* from delivery_role/.test(sql)&&
    /join employees e on e\.id = r\.empleado_id/.test(sql)&&
    /'rol', r\.rol/.test(sql)],
  ['facturado y cobrado usan eventos mensuales independientes',
    /seller_invoiced_orders/.test(sql)&&/o\.facturado_en >= v_inicio/.test(sql)&&
    /payment_orders/.test(sql)&&/p\.creado_en >= v_inicio/.test(sql)&&
    /coalesce\(p\.reversado, false\) = false/.test(sql)],
  ['reglas de crédito y devolución parcial son configurables',
    /delivery,cuentaCredito/.test(sql)&&/delivery,cuentaDevueltoParcial/.test(sql)],
  ['incentivo R2 usa cada despacho y no clientes únicos',
    /count\(\*\)::bigint as operaciones_validas/.test(sql)&&
    /count\(distinct d\.orden_id\) filter \(where d\.valida\)::bigint as operaciones_validas/.test(sql)&&
    (sql.match(/when r\.rol = '(Delivery|Despachador)' then r\.operaciones_validas::numeric/g)||[]).length===2&&
    !/when r\.rol = '(Delivery|Despachador)' then r\.clientes_validos::numeric/.test(sql)],
  ['duraciones atípicas no contaminan los promedios',
    (sql.match(/between 0 and 480/g)||[]).length>=2&&
    (sql.match(/duracion_minutos < 0 or .*duracion_minutos > 480/g)||[]).length>=2],
  ['calidad informa identidades no vinculadas y pagos reversados',
    /preparaciones_sin_empleado/.test(sql)&&/ventas_facturadas_sin_empleado/.test(sql)&&
    /liquidaciones_sin_empleado/.test(sql)&&/pagos_reversados/.test(sql)],
  ['empleados históricos inactivos se conservan',
    /e\.activo as empleado_activo/.test(sql)&&/'empleado_activo', r\.empleado_activo/.test(sql)],
  ['frontend consulta únicamente la RPC para Productividad',
    /sb\.rpc\('resumen_productividad_mensual_v944'/.test(main)&&
    !/state\.(ordenes|entregaLotes|pagos|liquidacionesLotes)/.test(productivityFunction)&&
    /if\(page==='productividad'\) await loadProductivityV944\(force\)/.test(moduleLoader)],
  ['Productividad no activa la carga operativa parcial',
    !/needsOperation[^;]*productividad/.test(moduleLoader)&&
    !/needsReferences[^;]*productividad/.test(moduleLoader)],
  ['panel presenta siete roles, clientes únicos y estado degradado',
    ['Despachador','Delivery','Vendedor','Facturación','Validación','Liquidación','Control']
      .every(role=>main.includes(`'${role}'`))&&
    /Clientes únicos/.test(main)&&/Indicadores temporalmente no disponibles/.test(main)],
  ['índices corresponden a fechas de los reportes',
    ['preparado','facturado','validado','pagos','lotes','liquidaciones','llamadas']
      .every(name=>sqlAll.includes(`productividad_${name}_v944`)||sqlAll.includes(`${name}_productividad_v944`))],
  ['migraciones no eliminan datos operativos',!/\b(delete from|truncate|drop table)\b/i.test(sqlAll)],
  ['mapeo técnico documenta fuentes, reglas y staging',
    /Fuentes y atribución/.test(map)&&/clientes únicos/.test(map)&&/tres unidades de incentivo/.test(map)&&/staging/.test(map)],
  ['simulación: tres pedidos del mismo cliente generan tres unidades',
    prep1?.clients===1&&prep1?.orders===3&&prep1?.incentiveUnits===3],
  ['simulación: Delivery cuenta entregas repetidas y excluye la fallida',
    delivery1?.clients===1&&delivery1?.orders===3&&delivery1?.incentiveUnits===2],
  ['simulación: un mismo empleado conserva filas separadas por rol',
    Boolean(prep1)&&Boolean(delivery1)&&prep1.role!==delivery1.role],
  ['simulación: el mismo cliente atendido por dos empleados cuenta una vez para cada uno',
    prep1?.clients===1&&prep2?.clients===1],
  ['simulación: el equipo deduplica el cliente entre empleados y módulos',virtual.teamClients===3],
  ['simulación: factura y pago parcial del mes no duplican la orden',
    seller?.orders===1&&seller?.factured===1000&&seller?.paid===400],
  ['simulación: pago del mes siguiente y reverso no contaminan agosto',
    seller?.paid===400&&!virtual.rows.some(r=>r.employeeId===3&&r.orders>1)],
  ['simulación: actividad histórica de empleado inactivo se conserva',
    historical?.orders===1&&historical?.active===false],
  ['auditoría V9.4.4 integrada en npm test',pkg.scripts.pretest.includes('auditoria_productividad_integral_v944.mjs')]
];

for(const [name,ok] of checks){
  assert.equal(Boolean(ok),true,`FALLO: ${name}`);
  console.log(`OK - ${name}`);
}

console.log('Auditoría Productividad Integral V9.4.4 aprobada con escenarios virtuales.');

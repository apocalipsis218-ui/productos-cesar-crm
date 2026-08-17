import fs from 'node:fs';

const main=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../src/styles.css',import.meta.url),'utf8');
const sqlR1=fs.readFileSync(new URL('../supabase/migrations/20260816214411_progreso_mensual_carniceria_v943.sql',import.meta.url),'utf8');
const sqlR2=fs.readFileSync(new URL('../supabase/migrations/20260816233308_filtrar_duraciones_atipicas_carniceria_v943_r2.sql',import.meta.url),'utf8');
const sql=`${sqlR1}\n${sqlR2}`;
const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));
const progressResolver=main.slice(
  main.indexOf('function carniceriaProgressDefaultEmployeeIdV943(){'),
  main.indexOf('async function loadCarniceriaProgressV943')
);
function simulateProgressEmployee({admin=false,station=false,selected=null,linkedId=null,employeeIds=[1,3,5]}){
  const simulatedState={profile:{empleado_id:linkedId},carniceriaProgressEmployeeId:selected};
  const resolver=Function(
    'state','isAdminRole','isStationAccount','activeEmployees','linkedEmployeeForUser','employeeHasArea',
    `${progressResolver}; return carniceriaProgressDefaultEmployeeIdV943;`
  )(
    simulatedState,
    ()=>admin,
    ()=>station,
    ()=>employeeIds.map(id=>({id,nombre:`Empleado ${id}`})),
    ()=>linkedId===null?null:{id:linkedId},
    ()=>true
  );
  return resolver();
}

const checks=[
  ['versión V9.4.3 o superior sincronizada',
    pkg.version.localeCompare('9.4.3',undefined,{numeric:true,sensitivity:'base'})>=0 &&
    main.includes(`V${pkg.version} PWA`) &&
    fs.readFileSync(new URL('../src/pwa.js',import.meta.url),'utf8').includes(`V${pkg.version} PWA`)],
  ['RPC mensual calculada en servidor',/resumen_carniceria_mensual_v943/.test(sql)&&/sb\.rpc\('resumen_carniceria_mensual_v943'/.test(main)],
  ['mes usa zona horaria dominicana',/America\/Santo_Domingo/.test(sql)],
  ['cliente registrado se deduplica por id',/'cliente:' \|\| o\.cliente_id/.test(sql)&&/count\(distinct cliente_clave\)/.test(sql)],
  ['cliente ocasional se deduplica por teléfono normalizado',/'telefono:' \|\| regexp_replace/.test(sql)],
  ['orden sin identidad no colapsa clientes diferentes',/'orden:' \|\| o\.id/.test(sql)],
  ['anuladas, incompletas y otros meses quedan fuera',/o\.preparado_en >= v_inicio/.test(sql)&&/o\.preparado_en < v_fin/.test(sql)&&/o\.estado <> 'Anulado'/.test(sql)],
  ['duraciones negativas o mayores a ocho horas no contaminan promedio',/duracion_minutos between 0 and 480/.test(sqlR2)&&/duracion_minutos < 0 or duracion_minutos > 480/.test(sqlR2)],
  ['pedidos atípicos conservan sus métricas operativas',/clientes_unicos', count\(distinct cliente_clave\)[\s\S]*pedidos_preparados', count\(\*\)[\s\S]*libras_preparadas'/.test(sqlR2)],
  ['RPC informa muestras válidas y duraciones atípicas',/muestras_tiempo_validas/.test(sqlR2)&&/duraciones_atipicas/.test(sqlR2)],
  ['compatibilidad con responsable histórico por nombre',/o\.tomado_por_empleado_id is null[\s\S]*o\.preparado_por/.test(sql)],
  ['usuario personal solo consulta su empleado',/Solo puedes consultar tu propio progreso/.test(sql)],
  ['estación selecciona despachador y gerencia puede ver equipo',/cuenta de estación debe seleccionar un despachador/i.test(sql)&&/Equipo de Carnicería/.test(sql)],
  ['RPC usa RLS del invocador',/security invoker/.test(sql)&&!/security definer/.test(sql)],
  ['RPC cerrada a público y anónimo',/revoke all on function[\s\S]*from public/.test(sql)&&/revoke all on function[\s\S]*from anon/.test(sql)],
  ['índice parcial cubre empleado y fecha de preparación',/idx_ordenes_carniceria_progreso_v943[\s\S]*tomado_por_empleado_id, preparado_en/.test(sql)],
  ['panel tiene cinco indicadores y estado degradado',/Clientes despachados/.test(main)&&/Pedidos preparados/.test(main)&&/Libras preparadas/.test(main)&&/Tiempo promedio/.test(main)&&/Preparados hoy/.test(main)&&/cola de Carnicería continúa funcionando/.test(main)],
  ['panel explica cuántas duraciones atípicas fueron excluidas',/duraciones_atipicas/.test(main)&&/duración atípica excluida/.test(main)&&/duraciones atípicas excluidas/.test(main)],
  ['actualización de módulo refresca el resumen',/if\(page==='carniceria'\) await loadCarniceriaProgressV943\(force\)/.test(main)],
  ['selector respeta cuenta de estación y roles administrativos',/isAdminRole\(\)\|\|isStationAccount\(\)/.test(main)&&/carnProgressEmployee/.test(main)],
  ['gerencia respeta equipo completo y empleado seleccionado',
    /if\(isAdminRole\(\)\)/.test(progressResolver) &&
    /carniceriaProgressEmployeeId===null[\s\S]*\? null[\s\S]*Number\(state\.carniceriaProgressEmployeeId\)/.test(progressResolver) &&
    progressResolver.indexOf('if(isAdminRole())') < progressResolver.indexOf('linkedEmployeeForUser')
  ],
  ['cuenta de estación respeta su selector antes del empleado vinculado',
    /if\(isStationAccount\(\)\)[\s\S]*employees\.find\(e=>Number\(e\.id\)===Number\(state\.carniceriaProgressEmployeeId\)\)/.test(progressResolver) &&
    progressResolver.indexOf('if(isStationAccount())') < progressResolver.indexOf('linkedEmployeeForUser')
  ],
  ['empleado personal conserva únicamente su vínculo operativo',
    /const linked=linkedEmployeeForUser\(state\.profile\);[\s\S]*return Number\(linked\.id\);[\s\S]*return null;/.test(progressResolver)
  ],
  ['simulación: gerente puede consultar equipo completo',simulateProgressEmployee({admin:true,selected:null,linkedId:1})===null],
  ['simulación: gerente puede cambiar de Cesar a Dariel',simulateProgressEmployee({admin:true,selected:5,linkedId:1})===5],
  ['simulación: estación conserva el despachador seleccionado',simulateProgressEmployee({station:true,selected:5,linkedId:1})===5],
  ['simulación: estación sin selección inicia con el primer despachador',simulateProgressEmployee({station:true,selected:null,employeeIds:[3,5]})===3],
  ['simulación: usuario personal ignora selecciones ajenas',simulateProgressEmployee({selected:5,linkedId:3})===3],
  ['cola de estación usa empleado seleccionado y no la cuenta compartida',/queueEmployeeId=isStationAccount\(\)\?carniceriaProgressDefaultEmployeeIdV943\(\)/.test(main)&&/o\.tomado_por_empleado_id/.test(main)],
  ['panel responsive integrado',/carn-progress-kpis/.test(css)&&/@media\(max-width:720px\)/.test(css)],
  ['auditoría V9.4.3 integrada en npm test',pkg.scripts.pretest.includes('auditoria_carniceria_progreso_v943.mjs')]
];

let failed=0;
for(const [label,ok] of checks){
  if(ok) console.log(`OK - ${label}`);
  else { failed+=1; console.error(`ERROR - ${label}`); }
}
if(failed) process.exit(1);
console.log('Auditoría Progreso Mensual de Carnicería V9.4.3 aprobada.');

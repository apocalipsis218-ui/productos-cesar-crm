import fs from 'node:fs';

const main=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../src/styles.css',import.meta.url),'utf8');
const sql=fs.readFileSync(new URL('../supabase/migrations/20260816214411_progreso_mensual_carniceria_v943.sql',import.meta.url),'utf8');
const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));

const checks=[
  ['versión V9.4.3 sincronizada',pkg.version==='9.4.3'&&/V9\.4\.3 PWA/.test(main)&&/V9\.4\.3 PWA/.test(fs.readFileSync(new URL('../src/pwa.js',import.meta.url),'utf8'))],
  ['RPC mensual calculada en servidor',/resumen_carniceria_mensual_v943/.test(sql)&&/sb\.rpc\('resumen_carniceria_mensual_v943'/.test(main)],
  ['mes usa zona horaria dominicana',/America\/Santo_Domingo/.test(sql)],
  ['cliente registrado se deduplica por id',/'cliente:' \|\| o\.cliente_id/.test(sql)&&/count\(distinct cliente_clave\)/.test(sql)],
  ['cliente ocasional se deduplica por teléfono normalizado',/'telefono:' \|\| regexp_replace/.test(sql)],
  ['orden sin identidad no colapsa clientes diferentes',/'orden:' \|\| o\.id/.test(sql)],
  ['anuladas, incompletas y otros meses quedan fuera',/o\.preparado_en >= v_inicio/.test(sql)&&/o\.preparado_en < v_fin/.test(sql)&&/o\.estado <> 'Anulado'/.test(sql)],
  ['duraciones negativas no contaminan promedio',/preparado_en >= tomado_en/.test(sql)],
  ['compatibilidad con responsable histórico por nombre',/o\.tomado_por_empleado_id is null[\s\S]*o\.preparado_por/.test(sql)],
  ['usuario personal solo consulta su empleado',/Solo puedes consultar tu propio progreso/.test(sql)],
  ['estación selecciona despachador y gerencia puede ver equipo',/cuenta de estación debe seleccionar un despachador/i.test(sql)&&/Equipo de Carnicería/.test(sql)],
  ['RPC usa RLS del invocador',/security invoker/.test(sql)&&!/security definer/.test(sql)],
  ['RPC cerrada a público y anónimo',/revoke all on function[\s\S]*from public/.test(sql)&&/revoke all on function[\s\S]*from anon/.test(sql)],
  ['índice parcial cubre empleado y fecha de preparación',/idx_ordenes_carniceria_progreso_v943[\s\S]*tomado_por_empleado_id, preparado_en/.test(sql)],
  ['panel tiene cinco indicadores y estado degradado',/Clientes despachados/.test(main)&&/Pedidos preparados/.test(main)&&/Libras preparadas/.test(main)&&/Tiempo promedio/.test(main)&&/Preparados hoy/.test(main)&&/cola de Carnicería continúa funcionando/.test(main)],
  ['actualización de módulo refresca el resumen',/if\(page==='carniceria'\) await loadCarniceriaProgressV943\(force\)/.test(main)],
  ['selector respeta cuenta de estación y roles administrativos',/isAdminRole\(\)\|\|isStationAccount\(\)/.test(main)&&/carnProgressEmployee/.test(main)],
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

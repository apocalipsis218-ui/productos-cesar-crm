import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
const main=fs.readFileSync(path.join(root,'src','main.js'),'utf8');
const sql=fs.readFileSync(path.join(root,'supabase','26_actualizacion_v930r9_vincular_usuarios_empleados.sql'),'utf8');
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));

const checks=[
  ['versión R9 o superior visible',/V9\.3\.0 R(?:9|10)/.test(main)],
  ['perfil usa empleado_id',/empleado_id/.test(main)&&/empleado_id bigint/.test(sql)],
  ['distingue empleado y estación',/tipo_cuenta/.test(main)&&/empleado.*estacion/s.test(sql)],
  ['selector de empleado en Usuarios',/id="usrEmployee"/.test(main)&&/Empleado vinculado/.test(main)],
  ['nombre sincronizado desde Empleados',/Sincronizado desde Empleados/.test(main)&&/sincronizar_perfil_empleado_v930r9/.test(sql)],
  ['evita empleado duplicado',/perfiles_empleado_id_unique/.test(sql)&&/ya está vinculado a otro usuario/.test(sql)],
  ['RPC transaccional R9',/actualizar_usuario_permisos_v930r9/.test(main)&&/create or replace function public\.actualizar_usuario_permisos_v930r9/.test(sql)],
  ['cuentas de estación visibles',/Cuentas de estación/.test(main)&&/Cuenta compartida de estación/.test(main)],
  ['Empleados muestra acceso CRM',/Acceso CRM vinculado/.test(main)&&/Vincular usuario/.test(main)],
  ['desactivar empleado protege acceso',/Empleado y acceso desactivados/.test(main)&&/new\.activo=false then false/.test(sql)],
  ['prueba R9 integrada en npm test',String(pkg.scripts?.test||'').includes('auditoria_usuarios_empleados_v930r9.mjs')],
];

let failed=false;
for(const [label,ok] of checks){
  if(ok) console.log('OK - '+label);
  else { console.error('FALLO - '+label); failed=true; }
}
if(failed) process.exit(1);
console.log('Auditoría Usuarios + Empleados V9.3.0 R9 aprobada.');

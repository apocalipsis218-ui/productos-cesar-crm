import fs from 'node:fs';
import assert from 'node:assert/strict';

const main=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const sql=fs.readFileSync(new URL('../supabase/sql/39_actualizacion_v9381_guardado_transaccional.sql',import.meta.url),'utf8');
const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));

const checks=[
  ['versión V9.3.8.2 sincronizada',pkg.version==='9.3.8.2'&&main.includes('V9.3.8.2 PWA')],
  ['RPC transaccional de órdenes',/function public\.guardar_orden_v9381/.test(sql)&&main.includes("sb.rpc('guardar_orden_v9381'")],
  ['RPC transaccional de preparación',/function public\.guardar_preparacion_v9381/.test(sql)&&main.includes("sb.rpc('guardar_preparacion_v9381'")],
  ['orden guarda encabezado y detalle juntos',/delete from public\.orden_detalle where orden_id=v_id;/.test(sql)&&/jsonb_array_elements\(p_items\)/.test(sql)],
  ['preparación bloquea la orden',/for update;/.test(sql)&&/La orden cambió de etapa/.test(sql)],
  ['preparación verifica todas las líneas',/v_total<>jsonb_array_length\(p_lineas\)/.test(sql)&&/v_actualizadas<>v_total/.test(sql)],
  ['peso e historial en la misma operación',/insert into public\.orden_pesos/.test(sql)&&/insert into public\.orden_estados_historial/.test(sql)],
  ['RPC protegidas',/revoke all on function public\.guardar_orden_v9381/.test(sql)&&/grant execute on function public\.guardar_preparacion_v9381/.test(sql)],
  ['frontend ya no borra detalle antes de guardar',!main.includes("sb.from('orden_detalle').delete().eq('orden_id',o.id)")],
  ['frontend ya no guarda preparación línea por línea',!main.includes("sb.from('orden_detalle').update(payload).eq('id',id)")],
  ['errores exigen SQL 39',main.includes('SQL 39 de la actualización anterior')]
];

for(const [name,ok] of checks){
  assert.equal(Boolean(ok),true,`FALLO: ${name}`);
  console.log(`OK - ${name}`);
}
console.log('Auditoría Guardado Transaccional V9.3.8.2 aprobada.');

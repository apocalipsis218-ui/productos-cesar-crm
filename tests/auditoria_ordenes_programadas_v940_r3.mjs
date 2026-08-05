import assert from 'node:assert/strict';
import fs from 'node:fs';

const main=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const sql=fs.readFileSync(
  new URL('../supabase/sql/54_actualizacion_v940_r3_guardado_atomico_programacion.sql',import.meta.url),
  'utf8'
);
const installer=fs.readFileSync(new URL('../APLICAR_V940_R3.ps1',import.meta.url),'utf8');
const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));

const checks=[
  ['R3 identificada',main.includes('V9.4.0 R3 · Guardado atómico desde llamadas y programación protegida')],
  ['sin llamada preliminar',!main.includes("sb.from('llamadas').insert(row).select('id').single()")&&main.includes('fromCallDraft')],
  ['RPC atómica en interfaz',main.includes("sb.rpc('guardar_orden_desde_llamada_v940r3'")&&main.includes("sb.rpc('guardar_orden_v9381'")],
  ['transacción completa',/function public\.guardar_orden_desde_llamada_v940r3/.test(sql)&&/insert into public\.llamadas/.test(sql)&&/from public\.guardar_orden_v9381/.test(sql)],
  ['trigger preliminar retirado',/drop trigger if exists zz_trg_orden_desde_llamada on public\.llamadas/.test(sql)],
  ['idempotencia activa',/idempotencia_orden_v940r3 uuid/.test(sql)&&/on conflict\(idempotencia_orden_v940r3\)/.test(sql)&&/if v_orden_id is not null then/.test(sql)],
  ['programación controlada',/'Pedido recibido',\s*'Programada',\s*'ordenes',\s*true/.test(sql)&&/v_preoperativa:=old\.estado in\('Programada','Pedido recibido'\)/.test(sql)],
  ['procesadas protegidas',/La fecha de una orden procesada está protegida/.test(sql)&&/Una orden procesada no puede reprogramarse a una fecha futura/.test(sql)],
  ['historial de reprogramación',/fn_registrar_reprogramacion_v940r3/.test(sql)&&/trg_pc_historial_reprogramacion_v940r3/.test(sql)],
  ['detalle diferido obligatorio',/create constraint trigger trg_pc_orden_con_detalle_v940r3/.test(sql)&&/deferrable initially deferred/.test(sql)],
  ['doble clic bloqueado',/saveOrderBtn\.dataset\.busy==='1'/.test(main)&&/saveOrderBtn\.disabled=true/.test(main)],
  ['mensaje vigente',!main.includes('SQL 39 de la actualización anterior')&&main.includes('SQL 54 de la V9.4.0 R3')],
  ['órdenes históricas intactas',!/\b(update|delete from|truncate table)\s+public\.ordenes\b/i.test(sql)&&!/\bdrop table\b/i.test(sql)],
  ['RPC solo autenticada',/revoke all on function public\.guardar_orden_desde_llamada_v940r3[\s\S]*from public,anon,authenticated/.test(sql)&&/grant execute on function public\.guardar_orden_desde_llamada_v940r3[\s\S]*to authenticated/.test(sql)],
  ['instalador R3',/54_actualizacion_v940_r3_guardado_atomico_programacion\.sql/.test(installer)&&/auditoria_ordenes_programadas_v940_r3\.mjs/.test(installer)],
  ['pretest R3',pkg.scripts.pretest.includes('auditoria_ordenes_programadas_v940_r3.mjs')]
];

for(const [name,ok] of checks){
  assert.equal(Boolean(ok),true,'FALLO: '+name);
  console.log('OK - '+name);
}

console.log('Auditoría de guardado atómico y programación V9.4.0 R3 aprobada.');

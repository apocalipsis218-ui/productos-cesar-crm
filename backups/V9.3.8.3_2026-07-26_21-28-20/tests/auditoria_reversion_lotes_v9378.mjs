import fs from 'node:fs';

const sql = fs.readFileSync('supabase/sql/37_actualizacion_v9378_reversion_lotes_segura.sql','utf8');
const base = fs.readFileSync('supabase/sql/01_migracion_ordenes_crm.sql','utf8');
const packageJson = JSON.parse(fs.readFileSync('package.json','utf8'));

const checks = [
  ['RPC reemplazada', /create or replace function public\.corregir_lote_entrega_v936/.test(sql)],
  ['monto_pendiente conserva NOT NULL', /monto_pendiente numeric\(14,2\) not null default 0/.test(base)],
  ['reversión restablece monto pendiente a cero', /monto_pendiente=0/.test(sql)],
  ['reversión no asigna monto pendiente nulo', !/monto_pendiente\s*=\s*null/.test(sql)],
  ['mantiene el monto facturado', !/total_factura\s*=/.test(sql)],
  ['mantiene pesajes registrados', !/peso_(preparado|final|validado)\s*=/.test(sql)],
  ['devuelve las órdenes a Facturada', /set estado='Facturada'/.test(sql)],
  ['marca el lote Revertido', /set estado='Revertido'/.test(sql)],
  ['conserva historial de estados', /insert into public\.orden_estados_historial/.test(sql)],
  ['conserva historial de correcciones', /insert into public\.entrega_lote_correcciones/.test(sql)],
  ['registra auditoría privada crítica', /insert into public\.auditoria_excepciones/.test(sql) && /'Reversión de lote de entrega','Crítica'/.test(sql)],
  ['auditoría y reversión son transaccionales', /^begin;[\s\S]*commit;\s*$/m.test(sql)],
  ['prueba integrada en npm test', /auditoria_reversion_lotes_v9378\.mjs/.test(packageJson.scripts.pretest)]
];

let failed = 0;
for (const [name,ok] of checks) {
  console.log(`${ok?'OK':'ERROR'} - ${name}`);
  if (!ok) failed++;
}
if (failed) process.exit(1);
console.log('Auditoría de reversión segura de lotes V9.3.8.2 aprobada.');

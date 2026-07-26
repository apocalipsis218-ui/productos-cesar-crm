import fs from 'node:fs';
import assert from 'node:assert/strict';
import { isAuditAdministrator, normalizeExceptionPayload, exceptionSummary } from '../src/auditExceptionsV9378.js';

const main=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../src/styles.css',import.meta.url),'utf8');
const sql=fs.readFileSync(new URL('../supabase/sql/36_actualizacion_v9378_auditoria_excepciones.sql',import.meta.url),'utf8');
const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));

assert.equal(isAuditAdministrator('Gerente'),true);
assert.equal(isAuditAdministrator('Administrador'),true);
assert.equal(isAuditAdministrator('Supervisor'),false);
assert.equal(isAuditAdministrator('Validación'),false);

const payload=normalizeExceptionPayload({modulo:'Validación',tipo_evento:'Diferencia de peso',gravedad:'Advertencia',motivo:'Se verificó físicamente',valor_esperado:'100',valor_registrado:'99.45',diferencia:'-0.55',unidad:'lb'});
assert.equal(payload.valor_esperado,100);
assert.equal(payload.valor_registrado,99.45);
assert.equal(payload.diferencia,-0.55);
assert.equal(payload.motivo,'Se verificó físicamente');

const summary=exceptionSummary([
  {creado_en:new Date().toISOString(),gravedad:'Advertencia',estado_revision:'Pendiente'},
  {creado_en:new Date().toISOString(),gravedad:'Crítica',estado_revision:'Requiere seguimiento'},
  {creado_en:'2020-01-01T00:00:00Z',gravedad:'Crítica',estado_revision:'Revisado'}
]);
assert.equal(summary.total,3);
assert.equal(summary.today,2);
assert.equal(summary.pending,1);
assert.equal(summary.critical,1);
assert.equal(summary.followup,1);

const checks=[
  ['versión V9.3.7.8',pkg.version==='9.3.7.8'&&/V9\.3\.7\.8 PWA/.test(main)],
  ['módulo privado por rol',/id==='auditoria' && !isAuditAdministrator/.test(main)],
  ['motivo obligatorio en interfaz',/Motivo obligatorio/.test(main)&&/Mínimo 5 caracteres/.test(main)],
  ['operación se detiene si falla auditoría',/La operación fue detenida/.test(main)],
  ['RPC de registro conectada',/registrar_excepcion_v9378/.test(main)&&/registrar_excepcion_v9378/.test(sql)],
  ['RPC de revisión conectada',/revisar_excepcion_v9378/.test(main)&&/revisar_excepcion_v9378/.test(sql)],
  ['RLS solo administrador consulta',/for select to authenticated[\s\S]*es_admin_operativo\(\)/i.test(sql)],
  ['empleado no actualiza ni elimina',/revoke all on public\.auditoria_excepciones from anon, authenticated/i.test(sql)&&!/grant (update|delete)/i.test(sql)],
  ['panel KPIs privado',/Auditoría privada de excepciones/.test(main)&&/Críticas abiertas/.test(main)],
  ['filtros y revisión',/auditExceptionStatus/.test(main)&&/Requiere seguimiento/.test(main)],
  ['exportación Excel',/exportAuditExceptions/.test(main)&&/XLSX\.writeFile/.test(main)],
  ['aceptación en Carnicería',/Diferencia de peso en preparación/.test(main)],
  ['aceptación en Facturación',/Diferencia en monto de factura/.test(main)&&/Diferencia de peso facturado/.test(main)],
  ['aceptación en Validación',/Diferencia de peso final/.test(main)&&/Lote creado con diferencia de peso/.test(main)],
  ['edición procesada auditada',/Modificación de orden procesada/.test(main)],
  ['diseño adaptable',/audit-exception-filters/.test(css)&&/@media\(max-width:620px\)/.test(css)],
  ['SQL no destruye datos',!/drop table|truncate/i.test(sql)]
];

for(const [label,ok] of checks){
  assert.equal(ok,true,`ERROR - ${label}`);
  console.log(`OK - ${label}`);
}
console.log('Auditoría Privada de Excepciones V9.3.7.8 aprobada.');

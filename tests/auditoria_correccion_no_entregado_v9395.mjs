import fs from 'node:fs';
import assert from 'node:assert/strict';

const sql47=fs.readFileSync(new URL('../supabase/sql/47_actualizacion_v9393_no_entregados_a_validacion.sql',import.meta.url),'utf8');
const sql48=fs.readFileSync(new URL('../supabase/sql/48_actualizacion_v9395_corregir_no_entregado_validacion.sql',import.meta.url),'utf8');
const schema=fs.readFileSync(new URL('../supabase/sql/01_migracion_ordenes_crm.sql',import.meta.url),'utf8');
const main=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');

assert.doesNotMatch(sql47,/\bnotas_estado\s*=/,'SQL 47 no debe escribir una columna inexistente');
assert.doesNotMatch(sql48,/\bnotas_estado\s*=/,'SQL 48 no debe escribir notas_estado');
assert.match(sql48,/create or replace function public\.pc_retornar_no_entregado_validacion_v9393/);
assert.match(sql48,/notas_validacion=concat_ws/);
assert.match(sql48,/insert into public\.orden_estados_historial/);
assert.match(sql48,/insert into public\.liquidacion_lote_eventos/);
assert.match(sql48,/estado='Facturada', resultado_entrega=null/);
assert.match(sql48,/factura_conservada/);
assert.match(sql48,/peso_validado_conservado/);
assert.doesNotMatch(schema,/\bnotas_estado\b/,'El esquema base confirma que notas_estado no existe');
assert.match(main,/recibir_lote_cxc_(?:v9393|v945)/);
assert.match(main,/pedido\(s\) regresaron a Validación/);

console.log('Auditoría V9.3.9.5 aprobada: No entregado retorna a Validación sin notas_estado.');

import assert from 'node:assert/strict';
import fs from 'node:fs';

const main=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const sql=fs.readFileSync(new URL('../supabase/sql/47_actualizacion_v9393_no_entregados_a_validacion.sql',import.meta.url),'utf8');
const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));

assert.match(pkg.version,/^9\.3\.9\.(?:[3-9]|\d{2,})$/);
assert.match(main,/recibir_orden_cxc_v9393/);
assert.match(main,/recibir_lote_cxc_v9393/);
assert.match(main,/motivo por el cual el pedido no fue entregado/i);
assert.match(sql,/create or replace function public\.pc_retornar_no_entregado_validacion_v9393/);
assert.match(sql,/create or replace function public\.pc_finalizar_lote_cxc_v9393/);
assert.match(sql,/estado='Facturada'/);
assert.match(sql,/resultado_entrega=null/);
assert.match(sql,/monto_cobrado=0/);
assert.match(sql,/monto_pendiente=0/);
assert.match(sql,/recibido_en=null/);
assert.match(sql,/delivery_nombre=null/);
assert.match(sql,/ultimo_resultado_delivery='No entregado'/);
assert.match(sql,/Pendiente de reasignación/);
assert.match(sql,/Factura y pesaje original conservados/);
assert.match(sql,/order by case when value->>'resultado'='No entregado' then 1 else 0 end/);
assert.match(sql,/no_entregados_a_validacion/);
assert.match(sql,/no_entregados_reabiertos/);
assert.match(sql,/ya_procesada/);
assert.doesNotMatch(sql,/peso_validado\s*=\s*null/i);
assert.doesNotMatch(sql,/factura_no\s*=\s*null/i);

console.log('Auditoría V9.3.9.3 de no entregados a Validación aprobada.');

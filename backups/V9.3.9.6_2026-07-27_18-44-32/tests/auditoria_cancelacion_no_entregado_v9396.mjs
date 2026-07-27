import fs from 'node:fs';
import assert from 'node:assert/strict';

const sql41=fs.readFileSync(new URL('../supabase/sql/41_actualizacion_v9383_cancelacion_segura_ordenes.sql',import.meta.url),'utf8');
const sql48=fs.readFileSync(new URL('../supabase/sql/48_actualizacion_v9395_corregir_no_entregado_validacion.sql',import.meta.url),'utf8');
const sql49=fs.readFileSync(new URL('../supabase/sql/49_actualizacion_v9396_cancelar_no_entregado_retornado.sql',import.meta.url),'utf8');

assert.match(sql41,/cancelar_orden_v9383/);
assert.match(sql48,/ultimo_resultado_delivery='No entregado'/);
assert.match(sql48,/ultimo_lote_no_entregado=v_lote\.codigo_lote/);

assert.match(sql49,/create or replace function public\.cancelar_orden_v9383/);
assert.match(sql49,/not in\s*\n?\s*\('cerrado','revertido','transferido totalmente'\)/);
assert.match(sql49,/v_retorno_no_entregado\s*:=/);
assert.match(sql49,/v_o\.ultimo_resultado_delivery='No entregado'/);
assert.match(sql49,/lower\(btrim\(coalesce\(e\.resultado,''\)\)\) in \('no entregado','no_entregado'\)/);
assert.match(sql49,/coalesce\(e\.monto_cobrado,0\)>0/);
assert.match(sql49,/coalesce\(e\.monto_pendiente,0\)>0/);
assert.match(sql49,/'lotes',coalesce/);
assert.match(sql49,/'retornada_desde_no_entregado',v_retorno_no_entregado/);
assert.doesNotMatch(sql49,/delete\s+from\s+public\.(entrega_lote_detalle|orden_entregas|orden_pagos)/i);

console.log('Auditoría V9.3.9.6 aprobada: la cancelación distingue lote activo de historial No entregado.');

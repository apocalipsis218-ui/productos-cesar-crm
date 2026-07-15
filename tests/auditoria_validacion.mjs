import fs from 'node:fs';
import assert from 'node:assert/strict';

const source = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const section = (a,b) => {
  const start=source.indexOf(a);
  const end=source.indexOf(b,start+a.length);
  assert.ok(start>=0 && end>start, `No se encontró la sección ${a}`);
  return source.slice(start,end);
};
const row = section('function renderValidationBatchRow(o){', '\nfunction renderValidacion(c){');
const render = section('function renderValidacion(c){', '\nfunction getBatchDelivery');
const batch = section('function bindValidationBatch(container,orders){', '\nfunction printDeliveryBatchSheet');
const dynamic = section('function bindDynamic(){', '\n\n\nfunction linkedOrderForCall');

assert.ok(render.includes('bindValidationBatch(c,orders);'), 'Falta enlazar la barra de lote.');
assert.ok(render.includes('bindDynamic();'), 'Falta enlazar las acciones generales de las órdenes.');

for (const selector of ['data-oper-order','data-return-invoice','data-validate-order']) {
  assert.ok((render+row).includes(selector), `No aparece ${selector} en Validación.`);
  assert.ok(dynamic.includes(`[${selector}]`), `No existe enlace para ${selector}.`);
}

for (const id of ['selectAllBatch','clearBatch','previewBatchRoute','createDeliveryBatch']) {
  assert.ok(render.includes(`id="${id}"`), `No aparece el botón ${id}.`);
  assert.ok(batch.includes(`$('#${id}',container).onclick`), `No existe onclick para ${id}.`);
}

for (const selector of ['data-batch-check','data-batch-weight']) {
  assert.ok(row.includes(selector), `No aparece ${selector}.`);
  assert.ok(batch.includes(`[${selector}]`), `No existe enlace para ${selector}.`);
}

console.log('OK: todos los controles del módulo de Validación tienen enlace de evento en V9.2.12.');

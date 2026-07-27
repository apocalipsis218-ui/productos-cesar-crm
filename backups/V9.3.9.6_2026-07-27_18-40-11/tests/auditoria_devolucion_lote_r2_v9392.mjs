import assert from 'node:assert/strict';
import fs from 'node:fs';
import {calculatePartialReturn,partialReturnMeasure,returnedWeightForMeasure} from '../src/partialReturnsV9392.js';

const main=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../src/styles.css',import.meta.url),'utf8');
const sql=fs.readFileSync(new URL('../supabase/sql/46_actualizacion_v9392_r2_devolucion_integrada_lote.sql',import.meta.url),'utf8');
const pkg=fs.readFileSync(new URL('../package.json',import.meta.url),'utf8');

assert.equal(partialReturnMeasure({unidad:'lb'}).kind,'weight');
assert.equal(partialReturnMeasure({unidad:'unidad',tipo_despacho_peso:'Unidad peso fijo'}).kind,'quantity');
assert.equal(returnedWeightForMeasure({unidad:'unidad',tipo_despacho_peso:'Unidad peso fijo',peso_estandar_lb:3.5},2),7);
assert.equal(returnedWeightForMeasure({unidad:'lb'},10),10);
assert.deepEqual(calculatePartialReturn(2612.50,[{name:'Mondongo',maxQty:20.9,qty:10,price:125,weight:10}]),{
  invoiceTotal:2612.5,returnedAmount:1250,netTotal:1362.5,returnedWeight:10,
  rows:[{name:'Mondongo',maxQty:20.9,qty:10,price:125,weight:10,amount:1250}]
});

const checks=[
  ['modo bloqueado',/Resultado final[\s\S]*select disabled[\s\S]*Devuelto parcial/.test(main)],
  ['un solo campo de medida',/data-return-measure/.test(main)&&/partialReturnMeasure/.test(main)&&/returnedWeightForMeasure/.test(main)],
  ['recalculo inmediato',/batchReturnAmount/.test(main)&&/batchReturnNet/.test(main)&&/batchReturnNetWeight/.test(main)],
  ['guardar y volver',/Guardar devolución y volver al lote/.test(main)&&/Cancelar y volver al lote/.test(main)],
  ['borrador dentro del lote',/const partialDrafts=new Map/.test(main)&&/partialDrafts\.set/.test(main)],
  ['cierre R2 o superior conectado',/receiveBatchCxcV9392R2/.test(main)&&/recibir_lote_cxc_v939(?:2_r2|3)/.test(main)],
  ['RPC transaccional',/create or replace function public\.recibir_lote_cxc_v9392_r2/.test(sql)&&/registrar_devolucion_parcial_v9392/.test(sql)&&/recibir_orden_cxc_v937/.test(sql)],
  ['detalle obligatorio',/Toda devolución parcial debe incluir el detalle de artículos/.test(sql)],
  ['protección lote completo',/Faltan % cliente\(s\) pendientes/.test(sql)&&/orden repetida/.test(sql)],
  ['diseño adaptable',/batch-return-item/.test(css)&&/@media\(max-width:900px\)/.test(css)],
  ['prueba integrada',/auditoria_devolucion_lote_r2_v9392\.mjs/.test(pkg)]
];
for(const [name,ok] of checks){ assert.ok(ok,`ERROR - ${name}`); console.log(`OK - ${name}`); }
console.log('Auditoría V9.3.9.2 R2 de devolución integrada al lote aprobada.');

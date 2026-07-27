import fs from 'node:fs';
import assert from 'node:assert/strict';
import {calculatePartialReturn,netDeliveredWeight} from '../src/partialReturnsV9392.js';

const main=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const sql=fs.readFileSync(new URL('../supabase/sql/45_actualizacion_v9392_devolucion_parcial_articulos.sql',import.meta.url),'utf8');
const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));

const result=calculatePartialReturn(3000,[
  {name:'Paleta',maxQty:10,qty:5,price:150,weight:5,destino:'Revision',motivo:'Cliente devolvió'}
]);
assert.equal(result.returnedAmount,750);
assert.equal(result.netTotal,2250);
assert.equal(result.returnedWeight,5);
assert.equal(netDeliveredWeight(20,5),15);
assert.throws(()=>calculatePartialReturn(3000,[{name:'Paleta',maxQty:2,qty:3,price:150,weight:3}]),/supera lo entregado/);
assert.throws(()=>calculatePartialReturn(3000,[{name:'Paleta',maxQty:20,qty:20,price:150,weight:20}]),/No entregado/);

const checks=[
  ['versión 9.3.9.2',pkg.version==='9.3.9.2'],
  ['modal por artículos',/partialReturnRowsHtml/.test(main)&&/data-return-detail/.test(main)],
  ['RPC conectada',/registrar_devolucion_parcial_v9392/.test(main)],
  ['batch muestra devolución con puente al detalle',/const opts=\['Cobrado','Entregado a crédito','Devuelto parcial','No entregado'\]/.test(main)&&/data-batch-partial/.test(main)&&/openLiquidacionOrdenModal\(o\)/.test(main)],
  ['batch bloquea devolución sin artículos',/Pulsa “Detallar artículos” para registrar producto, cantidad y peso/.test(main)],
  ['factura original conservada',/total_neto_liquidacion/.test(sql)&&/monto_original/.test(sql)],
  ['peso original y neto separados',/peso_devuelto/.test(sql)&&/peso_neto_entregado/.test(sql)],
  ['detalle formal',/create table if not exists public\.orden_devolucion_detalle/.test(sql)],
  ['control idempotente',/uq_devolucion_activa_orden_v9392/.test(sql)],
  ['transacción y bloqueo',/^begin;/m.test(sql)&&/for update/.test(sql)&&/commit;/m.test(sql)],
  ['devolución no crea crédito',/monto_credito=0/.test(sql)],
  ['prueba integrada',/auditoria_devolucion_parcial_v9392\.mjs/.test(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'))]
];
for(const [name,ok] of checks){ console.log(`${ok?'OK':'ERROR'} - ${name}`); assert.ok(ok,name); }
console.log('Auditoría V9.3.9.2 de devolución parcial por artículos aprobada.');

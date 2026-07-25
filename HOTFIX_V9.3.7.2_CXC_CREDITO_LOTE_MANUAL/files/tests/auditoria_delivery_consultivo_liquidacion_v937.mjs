import fs from 'node:fs';
import assert from 'node:assert/strict';
import {
  calculateCentralReceipt,
  consolidateFormalLiquidations,
  buildPendingDeliveryPanel,
  deliveryReadOnlyMetrics
} from '../src/centralLiquidationV937.js';

const main=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../src/styles.css',import.meta.url),'utf8');
const sql=fs.readFileSync(new URL('../supabase/30_actualizacion_v937_delivery_consultivo_liquidacion_central.sql',import.meta.url),'utf8');
const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));

const checks=[
  ['versión V9.3.7 visible',/V9\.3\.7(?:\.[12])? PWA/.test(main) && /^9\.3\.7(?:\.[12])?$/.test(pkg.version)],
  ['Delivery marcado como consulta',/Delivery consultivo/.test(main)],
  ['Delivery no emite botones de ruta o resultados',/function deliveryActionButtons\(o\)\{\s*return `<button class="btn small gray" data-oper-order=/.test(main)],
  ['Liquidación tiene panel de viajes pendientes',/deliveryPendingPanelHtml/.test(main) && /delivery-pending-strip-v937/.test(css)],
  ['Liquidación usa RPC individual',/recibir_orden_cxc_v937/.test(main)],
  ['Liquidación usa RPC de lote',/recibir_lote_cxc_v937/.test(main)],
  ['Historial consolida duplicados',/consolidateFormalLiquidations/.test(main)],
  ['Acción administrativa para duplicados',/consolidar_liquidaciones_duplicadas_v937/.test(main)],
  ['SQL crea unicidad por lote',/uq_liquidaciones_lotes_lote_v937/.test(sql)],
  ['SQL crea recepción individual',/create or replace function public\.recibir_orden_cxc_v937/i.test(sql)],
  ['SQL crea recepción de lote',/create or replace function public\.recibir_lote_cxc_v937/i.test(sql)],
  ['SQL limpia duplicados históricos',/consolidacion_automatica/.test(sql)],
  ['SQL valida que cada cliente pertenezca al lote',/La recepción contiene % cliente\(s\) que no pertenecen a este lote/.test(sql)],
  ['SQL rechaza órdenes repetidas en una recepción',/orden repetida dentro del mismo lote/.test(sql)],
  ['SQL evita finalizar dos veces el lote',/La última recepción individual ya ejecuta el cierre formal/.test(sql) && /return coalesce\(v_result/.test(sql)],
  ['devolución parcial no se clasifica como crédito',/resultado_entrega,o\.estado\) = 'Entregado a crédito'/.test(sql) && /resultado_entrega,o\.estado\) = 'Devuelto parcial' then coalesce\(o\.monto_pendiente/.test(sql)],
  ['RPC sensibles restringidas a usuarios autenticados',/revoke execute on function public\.recibir_orden_cxc_v937[\s\S]*grant execute on function public\.recibir_orden_cxc_v937/.test(sql)],
  ['ruta no transaccional anterior eliminada',!main.includes('async function saveFormalLiquidationBatch')],
  ['Delivery no enlaza acciones antiguas',!main.includes("$$('[data-route-order]')") && !main.includes("$$('[data-delivery-result]')")],
  ['auditoría integrada en npm test',/auditoria_delivery_consultivo_liquidacion_v937\.mjs/.test(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'))]
];
for(const [label,ok] of checks){ assert.ok(ok,label); console.log('OK - '+label); }

assert.deepEqual(calculateCentralReceipt(1000,'Cobrado',1000),{total:1000,result:'Cobrado',cash:1000,pending:0});
assert.deepEqual(calculateCentralReceipt(1000,'Entregado a crédito',250),{total:1000,result:'Entregado a crédito',cash:250,pending:750});
assert.throws(()=>calculateCentralReceipt(1000,'Cobrado',900));

const consolidated=consolidateFormalLiquidations([
  {id:1,lote_id:10,codigo_lote:'LOT-1',total_facturado:500,efectivo_recibido:400},
  {id:2,lote_id:10,codigo_lote:'LOT-1',total_facturado:500,efectivo_recibido:400},
  {id:3,lote_id:11,codigo_lote:'LOT-2',total_facturado:300,efectivo_recibido:300}
]);
assert.equal(consolidated.length,2);
assert.equal(consolidated.find(x=>x.lote_id===10).duplicate_count,2);
assert.equal(consolidated.find(x=>x.lote_id===10).total_facturado,500);
assert.equal(consolidated.find(x=>x.lote_id===10).efectivo_recibido,400);

const now=new Date('2026-07-22T16:00:00Z');
const panel=buildPendingDeliveryPanel(
  [{id:1,codigo_lote:'LOT-A',delivery_nombre:'Angel',estado:'Abierto',fecha_entrega:'2026-07-22T14:00:00Z',cantidad_ordenes:2}],
  [{lote_id:1,orden_id:1},{lote_id:1,orden_id:2}],
  [{id:1,total_factura:100,recibido_en:null},{id:2,total_factura:200,recibido_en:'2026-07-22T15:00:00Z'}],
  now
);
assert.equal(panel.length,1);
assert.equal(panel[0].pendingClients,1);
assert.equal(panel[0].partialLots,1);

const normalizedPanel=buildPendingDeliveryPanel(
  [
    {id:20,codigo_lote:'LOT-X',responsable_nombre:'RAFAEL PARRA',estado:'Abierto',fecha_entrega:'2026-07-22T14:00:00Z'},
    {id:21,codigo_lote:'LOT-Y',responsable_nombre:'Rafael Parra',estado:'Abierto',fecha_entrega:'2026-07-22T15:00:00Z'}
  ],
  [{lote_id:20,orden_id:20},{lote_id:21,orden_id:21}],
  [{id:20,total_factura:100,recibido_en:null},{id:21,total_factura:200,recibido_en:null}],
  now
);
assert.equal(normalizedPanel.length,1);
assert.equal(normalizedPanel[0].lots,2);
assert.equal(normalizedPanel[0].pendingAmount,300);

const metrics=deliveryReadOnlyMetrics([{key:'LOT-A'}],[{total_factura:100,asignado_delivery_en:'2026-07-22T15:00:00Z'}],now);
assert.equal(metrics.openTrips,1);
assert.equal(metrics.clients,1);
assert.equal(metrics.total,100);

console.log('Auditoría Delivery Consultivo y Liquidación Centralizada V9.3.7 aprobada.');

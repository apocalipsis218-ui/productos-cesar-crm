import fs from 'node:fs';
import assert from 'node:assert/strict';
import { percentageChange, buildDailySeries, aggregateProducts, aggregateClients, aggregateCrm } from '../src/salesAnalytics.js';

const main=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../src/styles.css',import.meta.url),'utf8');
const required=[
  'V9.2.15 · Ventas, clientes, productos y CRM',
  "reportTab:'resumen'",
  'function reportCommercialContext',
  'function reportSummaryTabV9215',
  'function reportVentasTabV9215',
  'function reportClientesTabV9215',
  'function reportProductosTabV9215',
  'function reportCrmTabV9215',
  'id="reportSeller"',
  'id="reportZone"',
  'id="reportClient"',
  'id="reportProduct"',
  'id="reportPayment"',
  'id="exportReportV9215"',
  'report-sales-chart',
  'report-v9215-table'
];
for(const marker of required){
  if(!main.includes(marker) && !css.includes(marker)) throw new Error('Falta marcador V9.2.15: '+marker);
}

assert.equal(percentageChange(120,100),20);
assert.equal(percentageChange(0,0),0);
assert.equal(percentageChange(100,0),null);

const orders=[
  {id:1,cliente_id:1,estado:'Cobrado',fecha:'2026-07-01',total_factura:100,items:[{producto_nombre:'Carne',unidad:'lb',cantidad_pedida:2,precio:50}]},
  {id:2,cliente_id:2,estado:'Entregado a crédito',fecha:'2026-07-02',total_factura:200,items:[{producto_nombre:'Carne',unidad:'lb',cantidad_pedida:4,precio:50},{producto_nombre:'Arroz',unidad:'saco',cantidad_pedida:1,precio:100}]}
];
const previous=[{id:3,cliente_id:1,estado:'Cobrado',fecha:'2026-06-01',total_factura:50,items:[{producto_nombre:'Carne',unidad:'lb',cantidad_pedida:1,precio:50}]}];
const series=buildDailySeries(orders,'2026-07-01','2026-07-03',o=>o.fecha,o=>o.total_factura);
assert.deepEqual(series.map(x=>x.value),[100,200,0]);
const products=aggregateProducts(orders,previous);
assert.equal(products.find(x=>x.producto==='Carne').cantidad,6);
assert.equal(products.find(x=>x.producto==='Carne').clientes,2);
const clients=aggregateClients({currentOrders:orders,previousOrders:previous,allOrders:[...orders,...previous],clients:[{id:1,negocio:'Cliente A',estado:'Activo'},{id:2,negocio:'Cliente B',estado:'Activo'}],from:'2026-07-01',to:'2026-07-31',amountFn:o=>o.total_factura,dateFn:o=>o.fecha});
assert.equal(clients.find(x=>String(x.clienteId)==='1').monto,100);
assert.equal(clients.find(x=>String(x.clienteId)==='2').segment,'Nuevo');
const crm=aggregateCrm({calls:[{id:10,cliente_id:1,vendedor:'Cesar',resultado:'Pidió'}],previousCalls:[],orders:[{...orders[0],llamada_id:10}],amountFn:o=>o.total_factura});
assert.equal(crm.conversion,100);
assert.equal(crm.linkedOrders.length,1);

console.log('OK: V9.2.15 integra ventas, clientes, productos, CRM, filtros y exportación.');

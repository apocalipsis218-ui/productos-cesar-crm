import fs from 'node:fs';
import assert from 'node:assert/strict';
import { calculatePreparedInvoiceAmount, buildQuickInvoiceTransition, QUICK_INVOICE_ALLOWED_STATES } from '../src/invoiceQuick.js';

const main=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../src/styles.css',import.meta.url),'utf8');
const pwa=fs.readFileSync(new URL('../src/pwa.js',import.meta.url),'utf8');
const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));
function ok(cond,msg){ if(!cond){console.error('FALLO - '+msg);process.exit(1);} console.log('OK - '+msg); }

ok(/^9\.3\.(?:[5-9]|[1-9]\d+)(?:\.\d+)?$/.test(pkg.version),'package actualizado a V9.3.5');
ok((main.includes('V9.3.5 PWA')||main.includes('V9.3.5.1 PWA')||main.includes('V9.3.6 PWA')||main.includes('V9.3.7 PWA')||main.includes('V9.3.7.1 PWA')||main.includes('V9.3.7.2 PWA'))&&(pwa.includes("APP_VERSION = 'V9.3.5 PWA'")||pwa.includes("APP_VERSION = 'V9.3.5.1 PWA'")||pwa.includes("APP_VERSION = 'V9.3.6 PWA'")||pwa.includes("APP_VERSION = 'V9.3.7 PWA'")||pwa.includes("APP_VERSION = 'V9.3.7.1 PWA'")||pwa.includes("APP_VERSION = 'V9.3.7.2 PWA'")),'versión V9.3.5 PWA o revisión visible');
ok(main.includes("data-quick-invoice=\"${o.id}\"")&&!/function renderFacturacion[\s\S]*?data-invoice-order=/.test(main.match(/function renderFacturacion[\s\S]*?\n\}/)?.[0]||''),'Facturación usa acción rápida sin abrir formulario');
ok(main.includes("button.dataset.processing='1'")&&main.includes("button.disabled=true")&&main.includes("Procesando..."),'protección contra doble clic');
ok(main.includes(".in('estado',transition.allowedStates)")&&main.includes(".select('id,estado')"),'actualización condicionada al estado vigente');
ok(main.includes("transition.nextState==='Lista para retiro'")&&main.includes("Orden facturada y enviada a Validación"),'flujo distingue retiro y delivery');
ok(main.includes('<span>Monto factura</span>')&&main.includes('class="batch-amount"'),'Validación muestra columna Monto factura');
ok(css.includes('V9.3.5 — FACTURACIÓN RÁPIDA Y VALIDACIÓN OPERATIVA'),'estilos V9.3.5 incluidos');
ok(!main.includes('x.orderClientName')&&!main.includes('x.orderClientPhone')&&!main.includes('escorderClientName'),'referencias defectuosas de cliente eliminadas');
ok(main.includes('${esc(orderClientName(x.o))}')&&main.includes('${esc(orderClientPhone(x.o))}'),'hoja de ruta usa datos correctos de la orden');
ok(pkg.scripts.test.includes('auditoria_facturacion_rapida_v935.mjs'),'auditoría V9.3.5 integrada');

const normal={
  id:1,estado:'Lista para facturar',condicion_pago:'Crédito',
  items:[
    {cantidad_pedida:10,cantidad_preparada:8,precio:100,estado_preparacion:'Preparado'},
    {cantidad_pedida:5,cantidad_preparada:0,precio:50,estado_preparacion:'Sin existencia'},
  ]
};
assert.equal(calculatePreparedInvoiceAmount(normal),800,'Debe facturar solo lo preparado y excluir sin existencia.');

const substituted={
  id:2,estado:'Lista para facturar',
  items:[{cantidad_pedida:3,cantidad_preparada:3,precio:100,estado_preparacion:'Sustituido',nota_preparacion:'Sustituido por: Producto B · Cantidad: 2'}]
};
assert.equal(calculatePreparedInvoiceAmount(substituted,{substitutePriceByName:()=>175}),350,'Debe valorar sustitución por cantidad y precio sustituto.');

const deliveryTransition=buildQuickInvoiceTransition(normal,{workerName:'Cesar Martinez',nowIso:'2026-07-21T20:00:00.000Z',amount:800,preparedWeight:18,storePickup:false,internalSale:false});
assert.equal(deliveryTransition.nextState,'Facturada');
assert.equal(deliveryTransition.payload.total_factura,800);
assert.equal(deliveryTransition.payload.peso_facturado,18);
assert.equal(deliveryTransition.payload.condicion_pago,'Crédito');
assert.deepEqual(deliveryTransition.allowedStates,QUICK_INVOICE_ALLOWED_STATES);

const pickupTransition=buildQuickInvoiceTransition({...normal,id:3},{workerName:'Cesar Martinez',amount:800,storePickup:true,internalSale:true});
assert.equal(pickupTransition.nextState,'Lista para retiro');
assert.equal(pickupTransition.payload.condicion_pago,'Contado');
assert.equal(pickupTransition.payload.delivery_nombre,null);

assert.throws(()=>buildQuickInvoiceTransition({...normal,id:4},{workerName:'Cesar',amount:0}),/total calculado/i);
assert.throws(()=>buildQuickInvoiceTransition({...normal,id:5,estado:'Facturada'},{workerName:'Cesar',amount:100}),/ya no está disponible/i);

console.log('Auditoría Facturación Rápida y Validación Operativa V9.3.5 aprobada.');

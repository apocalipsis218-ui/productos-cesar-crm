import fs from 'node:fs';
import assert from 'node:assert/strict';
import { normalizeValidationInvoiceAmount, requireValidationInvoiceAmount } from '../src/validationInvoice.js';

const main=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../src/styles.css',import.meta.url),'utf8');
const pwa=fs.readFileSync(new URL('../src/pwa.js',import.meta.url),'utf8');
const sql9371=fs.readFileSync(new URL('../supabase/31_actualizacion_v9371_responsables_transferencias.sql',import.meta.url),'utf8');
const sql9453=fs.readFileSync(new URL('../supabase/migrations/20260901134609_fecha_operativa_lote_v9453.sql',import.meta.url),'utf8');
const activeBatchSql=main.includes('crear_lote_entrega_v9453')?sql9453:sql9371;
const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));
function ok(cond,msg){ if(!cond){console.error('FALLO - '+msg);process.exit(1);} console.log('OK - '+msg); }

ok(/^(?:9\.3\.(?:[5-9]|[1-9]\d+)(?:\.\d+)?|9\.4\.[0-9]+)$/.test(pkg.version),'package base V9.3.5 con revisión V9.3.5.1 integrada');
ok(/V(?:9\.3\.9\.[0-9]+|9\.4\.[0-9]+) PWA/.test(main)&&/APP_VERSION = 'V(?:9\.3\.9\.[0-9]+|9\.4\.[0-9]+) PWA'/.test(pwa),'versión V9.3.5.1 PWA o superior visible');
ok(main.includes('data-batch-amount="${o.id}"')&&main.includes('Factura final'),'monto editable en Validación por lote');
ok(main.includes("const amount=normalizeValidationInvoiceAmount($('[data-batch-amount]',row)?.value||0)"),'lote usa el monto digitado por Validación');
ok(main.includes('amountChanged')&&main.includes('d.rows[id]={checked,weight,amount,updatedAt:new Date().toISOString()}'),'borrador conserva solo monto editado o fila activa');
ok(main.includes('missingAmounts')&&main.includes('Falta el monto final de factura'),'monto final obligatorio antes de crear lote');
ok((main.includes("total_factura:finalAmount")&&main.includes('Monto final: ${money(finalAmount)}'))||(/crear_lote_entrega_v(?:9371|9453)/.test(main)&&/total_factura=round\(\(x\.item->>'monto'\)::numeric,2\)/.test(activeBatchSql)&&/Monto final:/.test(activeBatchSql)),'orden y trazabilidad reciben monto definitivo del lote');
ok(main.includes('id="valMonto"')&&main.includes('Monto final de factura *'),'validación individual incluye monto editable');
ok((main.includes("total_factura:monto")&&main.includes('Monto final confirmado ${money(monto)}'))||(main.includes('p_items:[{orden_id:Number(o.id),monto')&&/total_factura=round\(\(x\.item->>'monto'\)::numeric,2\)/.test(activeBatchSql)),'validación individual guarda monto definitivo');
ok(main.includes('Este será el monto definitivo para Delivery y Liquidación.'),'responsabilidad financiera explicada');
ok(css.includes('V9.3.5.1 — MONTO FINAL EDITABLE EN VALIDACIÓN'),'estilos V9.3.5.1 incluidos');
ok(pkg.scripts.test.includes('auditoria_monto_validacion_v9351.mjs'),'auditoría V9.3.5.1 integrada');

assert.equal(normalizeValidationInvoiceAmount('1694.40'),1694.4);
assert.equal(normalizeValidationInvoiceAmount('abc'),0);
assert.equal(requireValidationInvoiceAmount(1035),1035);
assert.equal(requireValidationInvoiceAmount(379.999),380);
assert.throws(()=>requireValidationInvoiceAmount(0),/mayor que cero/i);
assert.throws(()=>requireValidationInvoiceAmount(''),/mayor que cero/i);

console.log('Auditoría Monto Final Editable en Validación V9.3.5.1 aprobada.');

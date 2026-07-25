import fs from 'node:fs';
import assert from 'node:assert/strict';
import { buildOperationalLotGroups, evaluateLotCorrection, lotUiKey } from '../src/lotOperationsV936.js';
const main=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../src/styles.css',import.meta.url),'utf8');
const sql=fs.readFileSync(new URL('../supabase/28_actualizacion_v936_correccion_lotes.sql',import.meta.url),'utf8');
const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));
const checks=[
 ['versión V9.3.6 o superior visible',/V9\.3\.(?:6|7(?:\.[1234])?) PWA/.test(main)],
 ['lotes plegables en Validación',/data-validation-lot-toggle/.test(main)&&/validationLots/.test(main)],
 ['lotes activos plegables en Delivery',/data-delivery-active-toggle/.test(main)&&/deliveryActive/.test(main)],
 ['lotes pendientes plegables en Liquidación',/data-liq-pending-toggle/.test(main)&&/liquidacionPending/.test(main)],
 ['corregir asignación visible',/Corregir asignación/.test(main)&&/openLotCorrectionModal/.test(main)],
 ['RPC de corrección integrada',/corregir_lote_entrega_v936/.test(main)&&/corregir_lote_entrega_v936/.test(sql)],
 ['auditoría inmutable de correcciones',/entrega_lote_correcciones/.test(sql)&&/revoke insert, update, delete/.test(sql)],
 ['estilos operativos V9.3.6',/V9\.3\.6 — LOTES OPERATIVOS/.test(css)],
 ['auditoría V9.3.6 integrada',pkg.scripts.test.includes('auditoria_mejoras_operativas_v936.mjs')]
];
for(const [label,ok] of checks){assert.ok(ok,label);console.log('OK - '+label);}
const orders=[{id:1,codigo:'A',lote:'LOT-1',estado:'Asignada a delivery',total_factura:100},{id:2,codigo:'B',lote:'LOT-1',estado:'Cobrado',total_factura:200},{id:3,codigo:'C',lote:'',estado:'Asignada a delivery',total_factura:50}];
const groups=buildOperationalLotGroups(orders,o=>o.lote,o=>o.total_factura,o=>o.estado==='Cobrado');
assert.equal(groups.length,2);assert.equal(groups.find(g=>g.displayCode==='LOT-1').total,300);assert.equal(groups.find(g=>g.displayCode==='LOT-1').reported,1);assert.ok(groups.find(g=>g.displayCode==='SIN-LOTE').key.includes('3'));
assert.equal(evaluateLotCorrection({lot:{id:8,estado:'Abierto'},orders:[orders[0]],hasLiquidation:false,canEdit:true}).allowed,true);
assert.equal(evaluateLotCorrection({lot:{id:8,estado:'Abierto'},orders:[orders[1]],hasLiquidation:false,canEdit:true}).allowed,false);
assert.match(lotUiKey('x','LOT-1',8),/^x:LOT-1:8$/);
console.log('Auditoría Mejoras Operativas V9.3.6 aprobada.');

import fs from 'node:fs';
import assert from 'node:assert/strict';
import {calculatePartialReturn,returnedWeightForMeasure} from '../src/partialReturnsV9392.js';

const main=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));

assert.match(main,/Historial de Facturación/,'Facturación debe exponer historial');
assert.match(main,/facturacionHistoryFrom/,'Historial debe filtrar por fecha');
assert.match(main,/facturacionHistoryStatus/,'Historial debe filtrar por estado');
assert.match(main,/facturacionHistoryWorker/,'Historial debe filtrar por responsable');
assert.match(main,/data-batch-partial-slot/,'El acceso al detalle debe ocupar una ranura condicional');
assert.doesNotMatch(main,/data-batch-partial="[^"]+"\s+\$\{defaultResult===/,'No debe renderizarse siempre el botón Detallar artículos');
assert.match(main,/function read\(requireReason=false\)/,'El cálculo debe funcionar antes de completar el motivo');
assert.match(main,/read\(true\)/,'El guardado debe exigir el motivo');
assert.match(main,/save\.textContent='Guardando\.\.\.'/,'El botón debe mostrar respuesta visible');

const item={unidad:'lb',tipo_despacho_peso:'Por libra',cantidad_preparada:25.1};
const qty=10;
const result=calculatePartialReturn(6020.4,[{
  detalle_id:1,name:'Carne de res para guisar',maxQty:25.1,qty,price:150,
  weight:returnedWeightForMeasure(item,qty),destino:'Revision',motivo:'Cliente devolvió el producto'
}]);
assert.equal(result.returnedAmount,1500);
assert.equal(result.netTotal,4520.4);
assert.equal(result.returnedWeight,10);
assert.match(pkg.version,/^(?:9\.3\.9\.(?:[4-9]|\d{2,})|9\.4\.0)$/);
assert.match(pkg.scripts.pretest,/auditoria_facturacion_devoluciones_v9394\.mjs/);

console.log('Auditoría Facturación y Devoluciones V9.3.9.4 aprobada.');

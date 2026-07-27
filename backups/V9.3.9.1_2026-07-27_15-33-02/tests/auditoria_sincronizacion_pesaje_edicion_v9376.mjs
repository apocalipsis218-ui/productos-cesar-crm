import fs from 'node:fs';
import assert from 'node:assert/strict';
import {
  orderCompositionChange,
  recalculatedPreparedWeightAfterRemoval,
  orderEditPreparationPatch
} from '../src/orderWeightRevisionV9376.js';

const main=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));

const previous=[
  {producto_id:1,producto_nombre:'Producto restante',cantidad_pedida:23,unidad:'lb',peso_equivalente_preparado:23},
  {producto_id:2,producto_nombre:'Producto eliminado',cantidad_pedida:6.98,unidad:'lb',peso_equivalente_preparado:6.98}
];
const retained=[previous[0]];
const removal=orderCompositionChange(previous,retained);
assert.equal(removal.changed,true);
assert.equal(removal.removalOnly,true);
assert.equal(removal.removed.length,1);
assert.equal(recalculatedPreparedWeightAfterRemoval({peso_preparado:29.98},removal.removed,retained),23);
const removalReset=orderEditPreparationPatch({peso_preparado:29.98},removal,retained);
assert.equal(removalReset.estado,'Pedido recibido');
assert.equal(removalReset.peso_preparado,null);
assert.equal(removalReset.peso_validado,null);

const addition=orderCompositionChange(retained,[...retained,{producto_id:3,producto_nombre:'Producto nuevo',cantidad_pedida:5,unidad:'lb'}]);
const reset=orderEditPreparationPatch({peso_preparado:23},addition,retained);
assert.equal(addition.removalOnly,false);
assert.equal(reset.estado,'Pedido recibido');
assert.equal(reset.peso_preparado,null);
assert.equal(reset.peso_facturado,null);
assert.equal(reset.peso_validado,null);

const checks=[
  ['versión V9.3.9.0 visible',pkg.version==='9.3.9.0'&&/V9\.3\.9\.0 PWA/.test(main)],
  ['conserva preparación de líneas sin cambios',/cantidad_preparada:i\.cantidad_preparada/.test(main)&&/peso_equivalente_preparado:i\.peso_equivalente_preparado/.test(main)],
  ['detecta cambio de composición',/orderCompositionChange\(o\?\.items\|\|\[\],clean\)/.test(main)],
  ['eliminación regresa a Carnicería',/composition\.changed\)\{[\s\S]*volverá a Carnicería/.test(main)],
  ['eliminación limpia peso anterior',/peso_preparado:null/.test(fs.readFileSync(new URL('../src/orderWeightRevisionV9376.js',import.meta.url),'utf8'))],
  ['limpia pesos posteriores',/peso_facturado:null/.test(fs.readFileSync(new URL('../src/orderWeightRevisionV9376.js',import.meta.url),'utf8'))&&/peso_validado:null/.test(fs.readFileSync(new URL('../src/orderWeightRevisionV9376.js',import.meta.url),'utf8'))],
  ['cambio de composición regresa a Carnicería',/orden volverá a Carnicería/.test(main)],
  ['auditoría explica invalidación',/Se invalidaron los pesos posteriores/.test(main)&&/nuevo pesaje en Carnicería/.test(main)],
  ['no elimina historial de pesajes',!/from\('orden_pesos'\)\.delete/.test(main)]
];
for(const [name,ok] of checks){
  assert.equal(ok,true,`ERROR - ${name}`);
  console.log(`OK - ${name}`);
}
console.log('Auditoría Sincronización de Pesaje tras Edición V9.3.9.0 aprobada.');

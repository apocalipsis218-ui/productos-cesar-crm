import fs from 'node:fs';
import assert from 'node:assert/strict';
import { orderCompositionChange, orderEditPreparationPatch } from '../src/orderWeightRevisionV9376.js';

const main=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const helper=fs.readFileSync(new URL('../src/orderWeightRevisionV9376.js',import.meta.url),'utf8');
const sql=fs.readFileSync(new URL('../supabase/sql/35_actualizacion_v9377_edicion_detalle_facturacion.sql',import.meta.url),'utf8');
const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));

const previous=[
  {producto_id:1,producto_nombre:'Pierna',cantidad_pedida:5,unidad:'lb'},
  {producto_id:2,producto_nombre:'Carne salada',cantidad_pedida:5,unidad:'lb'}
];
const next=[previous[0]];
const change=orderCompositionChange(previous,next);
const patch=orderEditPreparationPatch({estado:'Impresa para facturar',peso_preparado:29.98},change,next);

assert.equal(change.removalOnly,true);
assert.equal(patch.estado,'Pedido recibido');
assert.equal(patch.peso_preparado,null);
assert.equal(patch.peso_facturado,null);
assert.equal(patch.peso_validado,null);
assert.equal(patch.preparado_por,null);

const checks=[
  ['versión V9.3.7.8',pkg.version==='9.3.7.8'&&/V9\.3\.7\.8 PWA/.test(main)],
  ['borrado comprueba error',/deleted\.error/.test(main)],
  ['borrado comprueba cantidad real',/deleted\.data\|\|\[\]\)\.length/.test(main)],
  ['edición vuelve a Carnicería',/estado:'Pedido recibido'/.test(helper)],
  ['líneas vuelven pendientes',/estado_preparacion:'Pendiente'/.test(main)],
  ['SQL reemplaza restricción administrativa',/drop policy if exists v552_orden_detalle_delete_admin/i.test(sql)],
  ['SQL permite módulos operativos',/array\['ordenes','control','carniceria','facturacion'\]/i.test(sql)],
  ['SQL exige permiso editar',/'editar'/.test(sql)],
  ['SQL no destruye tablas',!/drop table|truncate/i.test(sql)]
];

for(const [name,ok] of checks){
  assert.equal(ok,true,`ERROR - ${name}`);
  console.log(`OK - ${name}`);
}
console.log('Auditoría Flujo de Edición desde Facturación V9.3.7.8 aprobada.');

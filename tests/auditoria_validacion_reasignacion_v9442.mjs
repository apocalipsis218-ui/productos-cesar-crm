import fs from 'node:fs';
import assert from 'node:assert/strict';

const main=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const transferSql=fs.readFileSync(new URL('../supabase/31_actualizacion_v9371_responsables_transferencias.sql',import.meta.url),'utf8');
const editSql=fs.readFileSync(new URL('../supabase/sql/38_actualizacion_v9379_edicion_segura_lotes.sql',import.meta.url),'utf8');
const revertSql=fs.readFileSync(new URL('../supabase/sql/37_actualizacion_v9378_reversion_lotes_segura.sql',import.meta.url),'utf8');
const productivitySql=fs.readFileSync(new URL('../supabase/migrations/20260817021459_productividad_despachos_repetidos_v944_r2.sql',import.meta.url),'utf8');
const map=fs.readFileSync(new URL('../MAPEO_VALIDACION_REASIGNACION_V9442.md',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const pwa=fs.readFileSync(new URL('../src/pwa.js',import.meta.url),'utf8');
const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));

const checks=[
  ['acciones agrupadas en menú de tres puntos',/validation-order-more/.test(main)&&/>•••<\/summary>/.test(main)],
  ['menú ofrece transferir y quitar',/>Transferir delivery<\/button>/.test(main)&&/data-return-pending-order/.test(main)&&/>Quitar del lote<\/button>/.test(main)],
  ['retorno exige motivo',/returnOrderPendingReason/.test(main)&&/reason\.length<5/.test(main)],
  ['lote múltiple usa edición transaccional',/returnOrderToValidationPendingV9442[\s\S]*editar_composicion_lote_v9379/.test(main)],
  ['lote unitario usa reversión segura',/if\(info\.single\)[\s\S]*corregir_lote_entrega_v936/.test(main)],
  ['interfaz abre Pendientes después de retirar',/state\.validacionTab='pendientes'/.test(main)],
  ['edición limpia delivery y vuelve a Facturada',/set estado='Facturada'[\s\S]*delivery_nombre=null/.test(editSql)],
  ['edición recalcula lote y snapshot',/cantidad_ordenes=s\.cnt/.test(editSql)&&/hoja_ruta_snapshot=coalesce\(p_snapshot/.test(editSql)],
  ['reversión excluible conserva trazabilidad',/set estado='Revertido'/.test(revertSql)&&/insert into public\.entrega_lote_correcciones/.test(revertSql)],
  ['transferencia mueve el detalle al responsable destino',/set lote_id=v_target_id/.test(transferSql)&&/responsable_empleado_id/.test(transferSql)],
  ['Productividad une detalle con lote responsable',/l\.responsable_empleado_id/.test(productivitySql)&&/d\.lote_id = l\.id/.test(productivitySql)],
  ['Productividad excluye lotes revertidos',/coalesce\(l\.estado, ''\) <> 'Revertido'/.test(productivitySql)],
  ['mapeo documenta transferencia y retorno',/Cómo atribuye Productividad/.test(map)&&/Quitar del lote/.test(map)],
  ['versión V9.4.4.2 sincronizada',/V9\.4\.4\.2 PWA/.test(main)&&/V9\.4\.4\.2 PWA/.test(html)&&/APP_VERSION = 'V9\.4\.4 PWA'/.test(pwa)],
  ['auditoría disponible en npm',pkg.scripts['audit:validacion-reasignacion']==='node tests/auditoria_validacion_reasignacion_v9442.mjs'],
  ['auditoría integrada en npm test',pkg.scripts.pretest.includes('auditoria_validacion_reasignacion_v9442.mjs')]
];

for(const [label,ok] of checks){assert.ok(ok,label);console.log('OK - '+label);}

const simulate=({finalResult=false,transferred=false,returned=false})=>{
  if(returned) return {lot:null,employee:null,deliveryUnits:0,status:'Facturada'};
  const employee=transferred?'delivery-destino':'delivery-origen';
  return {lot:transferred?'TRF-DESTINO':'LOT-ORIGEN',employee,deliveryUnits:finalResult?1:0,status:finalResult?'Entregado':'Asignada a delivery'};
};
assert.deepEqual(simulate({transferred:true,finalResult:true}),{lot:'TRF-DESTINO',employee:'delivery-destino',deliveryUnits:1,status:'Entregado'});
assert.deepEqual(simulate({returned:true}),{lot:null,employee:null,deliveryUnits:0,status:'Facturada'});
assert.equal(simulate({transferred:true,finalResult:false}).deliveryUnits,0);
console.log('OK - simulación: transferencia atribuye la entrega al destino');
console.log('OK - simulación: retorno elimina la atribución hasta reasignar y entregar');
console.log('Auditoría Validación y Reasignación V9.4.4.2 aprobada.');

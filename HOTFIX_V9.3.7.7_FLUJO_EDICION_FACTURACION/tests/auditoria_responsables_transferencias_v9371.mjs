import fs from 'node:fs';
import assert from 'node:assert/strict';
import {
  RESPONSIBLE_TYPES,
  normalizeResponsibleName,
  responsibleTypeLabel,
  inferResponsibleType,
  mergeResponsibleNames,
  canTransferOrder
} from '../src/tripResponsibilityV9371.js';

const helperSource=fs.readFileSync(new URL('../src/tripResponsibilityV9371.js',import.meta.url),'utf8');
const main=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const sql=fs.readFileSync(new URL('../supabase/31_actualizacion_v9371_responsables_transferencias.sql',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../src/styles.css',import.meta.url),'utf8');
const pwa=fs.readFileSync(new URL('../src/pwa.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const pkg=fs.readFileSync(new URL('../package.json',import.meta.url),'utf8');

const checks=[
  ['marcador V9.3.7.1 visible',/V9\.3\.7\.(?:1|2|3|4|5|6|7) PWA/.test(main)&&/V9\.3\.7\.(?:1|2|3|4|5|6|7) PWA/.test(pwa)&&/V9\.3\.7\.(?:1|2|3|4|5|6|7) PWA/.test(html)],
  ['responsable formal en Validación',/Responsable del viaje/.test(main)&&/tripResponsibleOptions/.test(main)],
  ['manual y otro empleado disponibles',/manual_externo/.test(helperSource)&&/otro_empleado/.test(helperSource)&&/Otros empleados/.test(main)],
  ['responsables manuales alimentan filtros',/mergeResponsibleNames/.test(main)&&/function activeDeliveryNames\(\)\{ return allTripResponsibleNames\(\); \}/.test(main)],
  ['creación de lote usa RPC transaccional',/crear_lote_entrega_v9371/.test(main)],
  ['validación individual crea lote formal',/p_items:\[\{orden_id:Number\(o\.id\)/.test(main)],
  ['transferencia visible por pedido',/data-transfer-order/.test(main)&&/Transferir pedido/.test(main)],
  ['transferencia usa RPC',/transferir_orden_lote_v9371/.test(main)],
  ['SQL agrega responsable formal',/add column if not exists responsable_tipo/i.test(sql)],
  ['SQL crea tabla de transferencias',/create table if not exists public\.entrega_pedido_transferencias/i.test(sql)],
  ['SQL crea lote transaccional',/create or replace function public\.crear_lote_entrega_v9371/i.test(sql)],
  ['SQL mueve detalle sin copiar orden',/update public\.entrega_lote_detalle[\s\S]*set lote_id=v_target_id,codigo_lote=v_target_code/.test(sql)],
  ['SQL recalcula lote origen',/clientes_restantes_origen/.test(sql)&&/Transferido totalmente/.test(sql)],
  ['SQL bloquea órdenes recibidas',/La orden ya fue recibida por CXC/.test(sql)],
  ['SQL registra auditoría de transferencia',/insert into public\.entrega_pedido_transferencias/.test(sql)],
  ['corrección completa sincroniza responsable formal',/create or replace function public\.corregir_lote_entrega_v936/.test(sql)&&/responsable_nombre=v_new_name/.test(sql)&&/responsable_tipo=v_new_type/.test(sql)],
  ['estilos V9.3.7.1/2 incluidos',/V9\.3\.7\.(?:1|2)/.test(css)],
  ['auditoría integrada en npm test',/auditoria_responsables_transferencias_v9371\.mjs/.test(pkg)]
];
for(const [label,ok] of checks){assert.ok(ok,label);console.log('OK - '+label);}

assert.equal(normalizeResponsibleName('  RAFAEL   PARRA '),'RAFAEL PARRA');
assert.equal(responsibleTypeLabel(RESPONSIBLE_TYPES.MANUAL),'Manual / externo');
assert.equal(inferResponsibleType('Angel',[{nombre:'Angel',activo:true}],['Angel']),RESPONSIBLE_TYPES.DELIVERY);
assert.equal(inferResponsibleType('Dariel',[{nombre:'Dariel',activo:true}],[]),RESPONSIBLE_TYPES.EMPLOYEE);
assert.equal(inferResponsibleType('Rafael Parra',[],[]),RESPONSIBLE_TYPES.MANUAL);
const names=mergeResponsibleNames({deliveryNames:['Angel'],lots:[{responsable_nombre:'Rafael Parra',estado:'Abierto'}],orders:[{delivery_nombre:'ANGEL'}]});
assert.deepEqual(names,['Angel','Rafael Parra']);
assert.equal(canTransferOrder({lot:{id:1,estado:'Abierto'},order:{id:2,estado:'Asignada a delivery'},canEdit:true}).allowed,true);
assert.equal(canTransferOrder({lot:{id:1,estado:'Cerrado'},order:{id:2},canEdit:true}).allowed,false);
assert.equal(canTransferOrder({lot:{id:1,estado:'Abierto'},order:{id:2,recibido_en:'2026-07-22'},canEdit:true}).allowed,false);

console.log('Auditoría Responsables Manuales y Transferencias V9.3.7.1 aprobada.');

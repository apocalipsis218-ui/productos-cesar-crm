import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  allocateCxcOldest,
  normalizeManualCxcApplications,
  cxcApplicationsTotal,
  groupCxcAccounts,
  cxcPortfolioSummary
} from '../src/cxcV940.js';

const main=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const pwa=fs.readFileSync(new URL('../src/pwa.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));
const sql=fs.readFileSync(new URL('../supabase/sql/51_actualizacion_v940_cxc_cobros_posteriores.sql',import.meta.url),'utf8');

const checks=[
  ['versión V9.4.x sincronizada',/^9\.4\.\d+$/.test(pkg.version)&&main.includes('V9.4.0 · CXC formal')&&pwa.includes(`APP_VERSION = 'V${pkg.version} PWA'`)&&html.includes(`V${pkg.version} PWA`)],
  ['cartera formal por orden',/cxc_saldo_inicial/.test(sql)&&/cxc_pagado_acumulado/.test(sql)&&/cxc_vencimiento/.test(sql)&&/cxc_estado/.test(sql)],
  ['backfill compatible con SQL Editor',
    /v_triggers_activos/.test(sql)&&
    /disable trigger %I/.test(sql)&&
    /enable trigger %I/.test(sql)&&
    /exception when others/.test(sql)&&
    !/create temporary table/.test(sql)&&
    /proteccion_identidad_activa/.test(sql)],
  ['vista ligera de CXC',/create or replace view public\.cxc_saldos_v940/.test(sql)&&/dias_atraso/.test(sql)&&/1-30 días/.test(sql)&&/31-60 días/.test(sql)&&/\+60 días/.test(sql)],
  ['recibos y aplicaciones',/create table if not exists public\.cxc_cobros/.test(sql)&&/create table if not exists public\.cxc_cobro_aplicaciones/.test(sql)&&/numero_recibo/.test(sql)&&/saldo_antes/.test(sql)&&/saldo_despues/.test(sql)],
  ['registro transaccional',/function public\.registrar_cobro_cxc_v940/.test(sql)&&/for update/.test(sql)&&/El cobro supera|supera el saldo/.test(sql)],
  ['bloqueo canónico contra concurrencia',/order by o\.id[\s\S]*for update of o/.test(sql)],
  ['reversión administrativa auditada',/function public\.reversar_cobro_cxc_v940/.test(sql)&&/Solo Administración o Gerencia/.test(sql)&&/Cobro reversado/.test(sql)],
  ['sin borrado de recibos',!/delete from public\.cxc_cobros/.test(sql)&&!/delete from public\.cxc_cobro_aplicaciones/.test(sql)],
  ['escritura directa bloqueada',/revoke insert,update,delete on public\.cxc_cobros/.test(sql)&&/security definer/.test(sql)],
  ['RPC conectadas en interfaz',main.includes("sb.rpc('registrar_cobro_cxc_v940'")&&main.includes("sb.rpc('reversar_cobro_cxc_v940'")&&main.includes("sb.rpc('actualizar_vencimiento_cxc_v940'")],
  ['pestañas CXC integradas',/Cuentas por cobrar/.test(main)&&/Historial de cobros/.test(main)&&/data-cxc-pay/.test(main)],
  ['métodos y referencia',/Efectivo/.test(main)&&/Transferencia/.test(main)&&/Mixto/.test(main)&&/referencia es obligatoria/i.test(main)],
  ['recibo imprimible',/function printCxcReceipt/.test(main)&&/Saldo anterior/.test(main)&&/Saldo restante/.test(main)],
  ['consulta operativa separada',/OPERATIONAL_PENDING_STATES_V940/.test(main)&&/\.in\('estado',OPERATIONAL_PENDING_STATES_V940\)/.test(main)&&!/not\('estado','in','\\(\"Cobrado\",\"Entregada en negocio\",\"Anulado\"\\)'\)/.test(main)],
  ['carga CXC específica',/function loadCxcDataV940/.test(main)&&/cxc_saldos_v940/.test(main)&&/cxc_cobro_aplicaciones/.test(main)],
  ['prueba integrada',pkg.scripts.pretest.includes('auditoria_cxc_cobros_v940.mjs')]
];

for(const [name,ok] of checks){
  assert.equal(Boolean(ok),true,`FALLO: ${name}`);
  console.log('OK - '+name);
}

const rows=[
  {orden_id:2,cliente_clave:'REG:1',cliente_nombre:'Cliente A',saldo_pendiente:300,cxc_vencimiento:'2026-07-20',dias_atraso:9,abonado_cxc:100},
  {orden_id:1,cliente_clave:'REG:1',cliente_nombre:'Cliente A',saldo_pendiente:500,cxc_vencimiento:'2026-07-10',dias_atraso:19,abonado_cxc:0},
  {orden_id:3,cliente_clave:'REG:2',cliente_nombre:'Cliente B',saldo_pendiente:200,cxc_vencimiento:'2026-08-10',dias_atraso:0,abonado_cxc:0}
];
assert.deepEqual(allocateCxcOldest(650,rows),[
  {orden_id:1,monto:500,saldo_antes:500,saldo_despues:0},
  {orden_id:2,monto:150,saldo_antes:300,saldo_despues:150}
]);
assert.throws(()=>allocateCxcOldest(1001,rows),/supera el saldo/);
const manual=normalizeManualCxcApplications([
  {orden_id:1,monto:125,saldo_pendiente:500},
  {orden_id:2,monto:75,saldo_pendiente:300}
]);
assert.equal(cxcApplicationsTotal(manual),200);
assert.throws(()=>normalizeManualCxcApplications([{orden_id:1,monto:501,saldo_pendiente:500}]),/superar el saldo/);
const groups=groupCxcAccounts(rows);
assert.equal(groups.length,2);
assert.equal(groups.find(g=>g.key==='REG:1').saldo,800);
assert.deepEqual(cxcPortfolioSummary(rows),{clientes:2,facturas:3,saldo:1000,vencido:800,maxAtraso:19});

console.log('Auditoría CXC y Cobros Posteriores V9.4.0 aprobada.');

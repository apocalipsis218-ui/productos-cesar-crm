import fs from 'node:fs';
import assert from 'node:assert/strict';
import { cashValueAfterCxcResultChange } from '../src/centralLiquidationV937.js';

const main=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const helper=fs.readFileSync(new URL('../src/centralLiquidationV937.js',import.meta.url),'utf8');
const sql31=fs.readFileSync(new URL('../supabase/31_actualizacion_v9371_responsables_transferencias.sql',import.meta.url),'utf8');
const sql32=fs.readFileSync(new URL('../supabase/32_actualizacion_v9372_credito_cero_lote_manual.sql',import.meta.url),'utf8');
const pwa=fs.readFileSync(new URL('../src/pwa.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));

const checks=[
  ['versión V9.3.7.2 conservada en la versión actual',/^(?:9\.3\.9\.[0-9]+|9\.4\.0)$/.test(pkg.version)&&main.includes(`V${pkg.version} PWA`)&&pwa.includes(`V${pkg.version} PWA`)&&html.includes(`V${pkg.version} PWA`)],
  ['selector CXC usa normalizador de efectivo',/cashValueAfterCxcResultChange\(total,sel\.value,inp\.value\)/.test(main)],
  ['helper de crédito exportado',/export function cashValueAfterCxcResultChange/.test(helper)],
  ['SQL 31 ya no consulta clientes.direccion',!/c\.direccion/i.test(sql31)],
  ['SQL 31 ya no consulta clientes.referencia',!/c\.referencia/i.test(sql31)],
  ['SQL 31 usa ubicación operativa existente',/o\.zona/.test(sql31)&&/o\.cliente_sector_orden/.test(sql31)&&/c\.sector/.test(sql31)],
  ['SQL 32 reemplaza RPC de lote',/create or replace function public\.crear_lote_entrega_v9371/i.test(sql32)],
  ['SQL 32 verifica columnas inexistentes',/sin_columna_direccion_inexistente/.test(sql32)&&/sin_columna_referencia_inexistente/.test(sql32)],
  ['auditoría V9.3.7.2 integrada en npm test',/auditoria_cxc_credito_lote_manual_v9372\.mjs/.test(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'))]
];
for(const [label,ok] of checks){ assert.ok(ok,label); console.log('OK - '+label); }

assert.equal(cashValueAfterCxcResultChange(5633,'Entregado a crédito',5633),0);
assert.equal(cashValueAfterCxcResultChange(5633,'No entregado',400),0);
assert.equal(cashValueAfterCxcResultChange(5633,'Cobrado',0),5633);
assert.equal(cashValueAfterCxcResultChange(5633,'Devuelto parcial',1200),1200);
assert.equal(cashValueAfterCxcResultChange(5633,'Entregado a crédito',0),0);

console.log('Auditoría CXC Crédito y Lote Manual V9.3.7.2 aprobada.');

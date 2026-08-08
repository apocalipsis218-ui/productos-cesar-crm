import fs from 'node:fs';
import assert from 'node:assert/strict';

const main=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const pwa=fs.readFileSync(new URL('../src/pwa.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const headers=fs.readFileSync(new URL('../public/_headers',import.meta.url),'utf8');
const sql=fs.readFileSync(
  new URL('../supabase/migrations/20260808004213_v942_r1_cierre_escrituras_directas.sql',import.meta.url),
  'utf8'
);
const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));

const checks=[
  ['versión V9.4.2 sincronizada',
    pkg.version==='9.4.2' && main.includes('V9.4.2 PWA') &&
    pwa.includes("APP_VERSION = 'V9.4.2 PWA'") && html.includes('V9.4.2 PWA')],
  ['eventos de orden usan RPC protegida',
    /function public\.registrar_evento_orden_v942/.test(sql) &&
    main.includes("sb.rpc('registrar_evento_orden_v942'")],
  ['impresión de preparación es atómica',
    /function public\.registrar_impresion_preparacion_v942/.test(sql) &&
    /impresiones_preparacion=coalesce\(impresiones_preparacion,0\)\+1/.test(sql) &&
    /insert into public\.orden_estados_historial/.test(sql) &&
    main.includes("sb.rpc('registrar_impresion_preparacion_v942'")],
  ['casos especiales tienen concurrencia y doble historial',
    /function public\.actualizar_caso_especial_v942/.test(sql) &&
    /for update;/.test(sql) && /p_actualizado_en_esperado/.test(sql) &&
    /insert into public\.orden_casos_historial/.test(sql) &&
    main.includes("sb.rpc('actualizar_caso_especial_v942'")],
  ['identidad y autorización se validan en servidor',
    (sql.match(/v_uid uuid:=auth\.uid\(\)/g)||[]).length===3 &&
    (sql.match(/tiene_algun_modulo/g)||[]).length>=4 &&
    (sql.match(/set search_path=public,pg_temp/g)||[]).length===3],
  ['RPC cerradas a anon y abiertas solo a authenticated',
    (sql.match(/from public,anon,authenticated/g)||[]).length>=3 &&
    (sql.match(/to authenticated;/g)||[]).length>=5],
  ['políticas heredadas amplias retiradas',
    /drop policy if exists ordenes_select_programadas/.test(sql) &&
    /drop policy if exists ordenes_update_programadas/.test(sql) &&
    /drop policy if exists orden_estados_historial_all/.test(sql)],
  ['escritura directa revocada en órdenes e historial',
    /revoke insert,update,delete,truncate,references,trigger[\s\S]*public\.ordenes from authenticated/.test(sql) &&
    /public\.orden_estados_historial from authenticated/.test(sql)],
  ['nuevos objetos requieren permisos explícitos',
    /alter default privileges for role postgres/.test(sql) &&
    /revoke execute on functions from public,anon,authenticated/.test(sql)],
  ['frontend sin escrituras directas críticas',
    !/sb\.from\('ordenes'\)\.(?:insert|update|delete)/.test(main) &&
    !/sb\.from\('orden_estados_historial'\)\.(?:insert|update|delete)/.test(main)],
  ['respaldos inseguros eliminados',
    !main.includes('saveUserPermissionsDirect') &&
    !main.includes('cleanupPedidosForCall') &&
    !main.includes('clearOrderCallLinks')],
  ['historial sensible no queda en localStorage',
    !main.includes('PENDING_HISTORY_KEY_V9380') &&
    !main.includes('pc_pending_order_history_v9380')],
  ['importaciones Excel tienen límites compensatorios',
    /MAX_XLSX_IMPORT_BYTES=2\*1024\*1024/.test(main) &&
    /MAX_XLSX_IMPORT_ROWS=5000/.test(main) &&
    /MAX_XLSX_IMPORT_COLUMNS=50/.test(main) &&
    /sheetRows:MAX_XLSX_IMPORT_ROWS\+2/.test(main) &&
    /Object\.create\(null\)/.test(main) &&
    main.includes("['__proto__','prototype','constructor']")],
  ['Cloudflare publica cabeceras defensivas',
    headers.includes("Content-Security-Policy: default-src 'self'") &&
    headers.includes("connect-src 'self' https://*.supabase.co wss://*.supabase.co") &&
    headers.includes('Cross-Origin-Opener-Policy: same-origin-allow-popups') &&
    headers.includes('Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()') &&
    headers.includes('X-Content-Type-Options: nosniff') &&
    headers.includes('X-Frame-Options: DENY')],
  ['migración no borra datos operativos',
    !/\b(?:delete from|truncate table|drop table)\s+public\.(?:ordenes|orden_estados_historial|orden_casos_historial)\b/i.test(sql)],
  ['auditoría integrada en npm test',
    pkg.scripts.pretest.includes('auditoria_preparacion_comercial_v942_r1.mjs')]
];

for(const [name,ok] of checks){
  assert.equal(Boolean(ok),true,`FALLO: ${name}`);
  console.log(`OK - ${name}`);
}

console.log('Auditoría Preparación Comercial V9.4.2 R1 aprobada.');

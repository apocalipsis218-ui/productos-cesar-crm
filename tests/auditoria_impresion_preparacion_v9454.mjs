import fs from 'node:fs';
import assert from 'node:assert/strict';

const main=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const sql=fs.readFileSync(
  new URL('../supabase/migrations/20260903195355_trazabilidad_impresion_preparacion_v9454.sql',import.meta.url),
  'utf8'
);
const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));

function bodyOf(name,next='function '){
  const start=main.indexOf(`function ${name}`);
  assert.ok(start>=0,`No se encontró ${name}`);
  const end=main.indexOf(next,start+12);
  return main.slice(start,end<0?main.length:end);
}

const printBody=bodyOf('printPreparationTicket');
const promptBody=bodyOf('showOrderWhatsAppPrompt');
const carnBody=bodyOf('carniceriaCard');

const checks=[
  ['botón de impresión disponible al guardar la orden',
    promptBody.includes('printSavedOrderPrep') &&
    promptBody.includes('Imprimir preparación') &&
    promptBody.includes("printPreparationTicket(o,'orden_creada')")],
  ['Carnicería continúa enviando su origen específico a la auditoría',
    carnBody.includes('data-print-origin="carniceria"') &&
    main.includes("printPreparationTicket(o,'carniceria')")],
  ['impresión usa la nueva RPC con origen',
    printBody.includes("sb.rpc('registrar_impresion_preparacion_v9454'") &&
    printBody.includes('p_origen:origin')],
  ['recibo no imprime Pendiente por cada artículo',
    printBody.includes("norm(st)!=='pendiente'") &&
    !printBody.includes("esc(st)}")],
  ['migración conserva contador general y agrega auditoría de Carnicería',
    sql.includes('impresiones_preparacion=coalesce(impresiones_preparacion,0)+1') &&
    sql.includes('impresiones_preparacion_carniceria') &&
    sql.includes('ultima_impresion_preparacion_carniceria') &&
    sql.includes('impreso_preparacion_carniceria_por_nombre')],
  ['servidor valida identidad, permiso y origen',
    sql.includes('v_uid uuid:=auth.uid()') &&
    sql.includes("v_origen not in ('carniceria','orden_creada','ordenes')") &&
    sql.includes("tiene_algun_modulo(array['carniceria'],'editar')")],
  ['función protegida con search_path vacío y permisos explícitos',
    sql.includes("set search_path=''" ) &&
    /revoke all on function public\.registrar_impresion_preparacion_v9454\(bigint,text,text\)[\s\S]*from public,anon,authenticated/.test(sql) &&
    /grant execute on function public\.registrar_impresion_preparacion_v9454\(bigint,text,text\)[\s\S]*to authenticated/.test(sql)],
  ['historial diferencia Carnicería y confirmación de orden',
    sql.includes('Impresión de preparación 80 mm · Carnicería') &&
    sql.includes('Impresión de preparación 80 mm · Confirmación de orden')],
  ['migración aditiva sin borrar datos operativos',
    !/\b(?:delete from|truncate table|drop table)\s+public\./i.test(sql)],
  ['revisión visual vigente e integrada en npm test',
    main.includes('V9.4.5.5 PWA') && html.includes('revisión funcional V9.4.5.5') &&
    pkg.scripts.pretest.includes('auditoria_impresion_preparacion_v9454.mjs')]
];

for(const [name,ok] of checks){
  assert.equal(Boolean(ok),true,`FALLO: ${name}`);
  console.log(`OK - ${name}`);
}

console.log('Auditoría V9.4.5.4 aprobada: impresión inmediata, origen verificable y recibo compacto.');

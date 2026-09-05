import fs from 'node:fs';
import assert from 'node:assert/strict';

const main=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const readme=fs.readFileSync(new URL('../README.md',import.meta.url),'utf8');

function bodyOf(name,next='function '){
  const start=main.indexOf(`function ${name}`);
  assert.ok(start>=0,`No se encontró ${name}`);
  const end=main.indexOf(next,start+12);
  return main.slice(start,end<0?main.length:end);
}

const auditBody=bodyOf('preparationPrintAudit');
const badgeBody=bodyOf('preparationPrintBadge');
const cardBody=bodyOf('carniceriaCard');

const checks=[
  ['estado visible usa el contador general',
    auditBody.includes('impresiones_preparacion||0') &&
    auditBody.includes('ultima_impresion_preparacion||null') &&
    auditBody.includes('impreso_preparacion_por')],
  ['un solo mensaje compacto para ambos orígenes',
    badgeBody.includes('🖨 Sin imprimir') &&
    badgeBody.includes('🖨 Impresa') &&
    !main.includes('Sin imprimir en Carnicería')],
  ['botón cambia a reimprimir después de cualquier impresión',
    cardBody.includes("Number(o.impresiones_preparacion||0)>0?'Reimprimir prep.':'Imprimir prep.'")],
  ['tarjeta muestra únicamente el indicador unificado',
    cardBody.includes('preparationPrintBadge(o)') &&
    !cardBody.includes('carniceriaPrintBadge(o)')],
  ['trazabilidad de origen se conserva al imprimir desde Carnicería',
    cardBody.includes('data-print-origin="carniceria"')],
  ['revisión V9.4.5.5 sincronizada',
    /V9\.4\.5\.(?:[5-9]|\d{2,}) PWA/.test(main) &&
    /revisión funcional V9\.4\.5\.(?:[5-9]|\d{2,})/.test(html) &&
    readme.includes('V9.4.5.5 — Estado unificado de impresión')]
];

for(const [name,ok] of checks){
  assert.equal(Boolean(ok),true,`FALLO: ${name}`);
  console.log(`OK - ${name}`);
}

console.log('Auditoría V9.4.5.5 aprobada: estado único y trazabilidad interna conservada.');

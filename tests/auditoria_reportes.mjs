import fs from 'node:fs';
const main=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../src/styles.css',import.meta.url),'utf8');
const required=[
  'V9.2.14 · Operación y tiempos',
  'id="reportPreset"',
  'id="reportFrom"',
  'id="reportTo"',
  'id="reportStatus"',
  'function reportPreviousRange',
  'function reportInvoicedAmount',
  'function reportIsActiveOrder',
  'Sin datos cerrados',
  'data-report-detail',
  'data-report-state-value',
  'data-report-stage',
  'data-report-product',
  'report-quality-grid'
];
for(const marker of required){ if(!main.includes(marker) && !css.includes(marker)) throw new Error('Falta marcador de Reportes V9.2.14: '+marker); }
if(main.includes('V8.5 · Reportes')) throw new Error('La etiqueta antigua V8.5 sigue presente.');
if(!css.includes('.report-filter-grid')||!css.includes('.report-kpi-grid')) throw new Error('Faltan estilos del nuevo reporte.');
console.log('OK: Reportes V9.2.14 tiene filtros, comparaciones, detalle y control de calidad.');

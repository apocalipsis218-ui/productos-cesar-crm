import fs from 'node:fs';
import assert from 'node:assert/strict';
import { workingMinutesBetween, isReopeningTransition, durationOutlierThreshold } from '../src/operationAnalytics.js';

const main=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../src/styles.css',import.meta.url),'utf8');
const required=[
  'V9.2.14 · Operación y tiempos',
  'function operationWorkingConfig',
  'function reportStageAnalysis',
  'function reportStalledOrders',
  'function reportOrderReopenings',
  'Cumplimiento SLA',
  'Órdenes detenidas',
  'Órdenes reabiertas',
  'Casos extremos',
  'id="alUseWork"',
  'id="alHolidays"',
  'id="alExtreme"',
  'data-report-operation',
  'operation-kpi-grid',
  'if(minutes===null||!Number.isFinite(minutes)) return null;',
  '}).filter(Boolean).filter(x=>x.minutes>x.sla)'
];
for(const marker of required){
  if(!main.includes(marker) && !css.includes(marker)) throw new Error('Falta marcador V9.2.14: '+marker);
}

const cfg={enabled:true,weekdaySchedule:{
  0:[['07:00','12:00']],
  1:[['07:00','12:00'],['14:00','17:00']],
  2:[['07:00','12:00'],['14:00','17:00']],
  3:[['07:00','12:00'],['14:00','17:00']],
  4:[['07:00','12:00'],['14:00','17:00']],
  5:[['07:00','12:00'],['14:00','17:00']],
  6:[['07:00','12:00'],['14:00','17:00']],
},holidays:[]};

assert.equal(workingMinutesBetween('2026-07-13T10:00:00','2026-07-13T15:00:00',cfg),180,'Debe descontar almuerzo de 12 a 2.');
assert.equal(workingMinutesBetween('2026-07-18T16:00:00','2026-07-19T10:00:00',cfg),240,'Debe contar 1 h sábado y 3 h domingo.');
assert.equal(workingMinutesBetween('2026-07-13T06:00:00','2026-07-13T08:00:00',cfg),60,'Debe excluir tiempo antes de apertura.');
assert.equal(workingMinutesBetween('2026-07-13T10:00:00','2026-07-13T15:00:00',{...cfg,holidays:['2026-07-13']}),0,'Debe excluir feriados configurados.');
assert.equal(isReopeningTransition('Facturada','Lista para facturar',''),true,'Debe detectar retroceso de estado.');
assert.equal(isReopeningTransition('En ruta','Cobrado',''),false,'No debe marcar avance normal como reapertura.');
assert.ok(durationOutlierThreshold([20,22,25,28,30],30,3)>=90,'El umbral extremo debe respetar el factor del SLA.');

console.log('OK: V9.2.14 calcula tiempo laborable, SLA, reaperturas y extremos.');

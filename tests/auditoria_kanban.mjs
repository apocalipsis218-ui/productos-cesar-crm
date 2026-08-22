import fs from 'node:fs';
import assert from 'node:assert/strict';

const source=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8').replace(/\r\n?/g,'\n');
const css=fs.readFileSync(new URL('../src/styles.css',import.meta.url),'utf8');
const section=(a,b)=>{const i=source.indexOf(a),j=source.indexOf(b,i+a.length);assert.ok(i>=0&&j>i,`No se encontró ${a}`);return source.slice(i,j);};
const kanban=section('function kanbanStageOf(o){','\n\n\nfunction employeeAreas()');
for(const token of ['kanbanClosedLimit:10','kanbanClosedHidden:false','kanbanHistoryPageSize:25']) assert.ok(source.includes(token),`Falta estado ${token}`);
for(const fn of ['kanbanClosedCard','openKanbanClosedHistory','renderKanbanClosedHistory','refreshKanbanPreserveScroll']) assert.ok(kanban.includes(`function ${fn}`),`Falta ${fn}`);
for(const control of ['data-kanban-closed-more','data-kanban-closed-toggle','data-kanban-closed-history','data-kanban-closed-reset']) assert.ok(kanban.includes(control),`Falta ${control}`);
for(const filter of ['kanbanHistorySearch','kanbanHistoryStatus','kanbanHistoryFrom','kanbanHistoryTo','kanbanHistoryPageSize']) assert.ok(kanban.includes(filter),`Falta filtro ${filter}`);
assert.ok(kanban.includes("grouped.cerradas.slice(0,state.kanbanClosedLimit)"),'Cerradas no están limitadas.');
assert.ok(css.includes('.kanban-list{min-height:0;overflow-y:auto'),'Falta scroll interno.');
assert.ok(css.includes('.kanban-history-table'),'Falta estilo del historial.');
console.log('OK: Kanban V9.2.14 limitado, paginado, filtrable y con scroll interno.');

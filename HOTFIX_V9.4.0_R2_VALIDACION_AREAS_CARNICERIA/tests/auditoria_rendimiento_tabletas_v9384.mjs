import fs from 'node:fs';
import assert from 'node:assert/strict';

const main=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const sql=fs.readFileSync(new URL('../supabase/sql/42_actualizacion_v9384_indices_rendimiento.sql',import.meta.url),'utf8');
const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));

const loadAllCalls=(main.match(/loadAll\(\)/g)||[]).length;
const checks=[
  ['versión V9.3.9.0 o superior sincronizada',/^(?:9\.3\.9\.[0-9]+|9\.4\.0)$/.test(pkg.version)&&main.includes(`V${pkg.version} PWA`)],
  ['carga operativa separada',/async function loadOperationalDataV9384/.test(main)],
  ['refresco visible por módulo',/async function refreshVisibleModuleV9384/.test(main)&&/operationalPagesV9384/.test(main)],
  ['Realtime no ejecuta carga completa',/async function refreshLiveData[\s\S]{0,260}await refreshVisibleModuleV9384\(\)/.test(main)],
  ['debounce agrupa eventos',/setTimeout\(\(\)=>refreshLiveData\(reason,true\),2200\)/.test(main)],
  ['base operativa limitada a seis consultas',/requests:6\+\(includeLots\?8:0\)\+\(includeCases\?1:0\)/.test(main)],
  ['lotes solo en módulos necesarios',/const includeLots=\['validacion','delivery','liquidacion'\]\.includes\(page\)/.test(main)],
  ['casos solo en vistas necesarias',/const includeCases=\['ordenes','alertas','kanban'\]\.includes\(page\)/.test(main)],
  ['pendientes históricos conservados',main.includes('fetchPendingOrdersV9380(orderSelect)')&&main.includes('mergeRecentAndPendingOrders')],
  ['archivadas excluidas',main.includes(".eq('archivada',false)")],
  ['carga completa reservada',loadAllCalls<=5],
  ['métrica de rendimiento disponible',main.includes('state.performanceV9384=')],
  ['índice de órdenes operativas',/idx_ordenes_operativas_v9384/.test(sql)],
  ['índices de tablas hijas',/idx_orden_detalle_orden_v9384/.test(sql)&&/idx_orden_historial_orden_fecha_v9384/.test(sql)],
  ['índices de lotes',/idx_lote_detalle_orden_v9384/.test(sql)&&/idx_lote_detalle_lote_v9384/.test(sql)],
  ['SQL actualiza estadísticas',/analyze public\.ordenes/.test(sql)&&/analyze public\.entrega_lote_detalle/.test(sql)],
  ['SQL no destruye datos',!/drop table|truncate table|delete from/i.test(sql)]
];

for(const [name,ok] of checks){
  assert.equal(Boolean(ok),true,`FALLO: ${name}`);
  console.log(`OK - ${name}`);
}

console.log('Auditoría Rendimiento de Tabletas V9.3.9.0 aprobada.');

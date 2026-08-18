import fs from 'node:fs';
import assert from 'node:assert/strict';

const main=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../src/styles.css',import.meta.url),'utf8');
const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));
const render=main.slice(
  main.indexOf('function productivityRoleActivityV9441('),
  main.indexOf('function productivityRulesHtml(')
);

const helperSource=main.slice(
  main.indexOf('function productivityRoleActivityV9441('),
  main.indexOf('function renderProductividad(')
);
const helpers=new Function('money','esc','state',`${helperSource};return {productivityRoleActivityV9441,productivityEmployeeSummariesV9441};`)(
  value=>`RD$ ${Number(value||0)}`,
  value=>String(value??''),
  {prodExpandedEmployeeId:null}
);
const virtual=helpers.productivityEmployeeSummariesV9441([
  {empleadoId:1,empleado:'Empleado 1',empleadoActivo:true,areaEmpleado:'Carnicería',rol:'Despachador',unidadesIncentivo:5,incentivo:20,tipoIncentivo:'Monto fijo',ordenes:5,libras:25,alertas:[]},
  {empleadoId:1,empleado:'Empleado 1',empleadoActivo:true,areaEmpleado:'Carnicería',rol:'Validación',unidadesIncentivo:0,incentivo:0,tipoIncentivo:'Sin incentivo',ordenes:4,alertas:[]},
  {empleadoId:1,empleado:'Empleado 1',empleadoActivo:true,areaEmpleado:'Carnicería',rol:'Delivery',unidadesIncentivo:3,incentivo:9,tipoIncentivo:'Monto fijo',ordenes:3,alertas:[]},
  {empleadoId:2,empleado:'Empleado 2',empleadoActivo:true,areaEmpleado:'Control',rol:'Control',unidadesIncentivo:0,incentivo:0,tipoIncentivo:'Sin incentivo',ordenes:2,alertas:[]}
]);

const checks=[
  ['versión visual V9.4.4.1 sincronizada',/V9\.4\.4\.1 PWA/.test(main)&&/V9\.4\.4\.1 · Productividad simplificada/.test(main)],
  ['vista principal consolida una fila por empleado',/function productivityEmployeeSummariesV9441/.test(main)&&/Resumen por empleado/.test(render)&&/Una sola fila por persona/.test(render)],
  ['detalle por rol permanece disponible bajo demanda',/data-prod-view="roles"/.test(render)&&/Detalle por función/.test(render)&&/productivityRoleDetailCardsV9441/.test(render)],
  ['incidencias se muestran en una vista separada',/data-prod-view="incidencias"/.test(render)&&/Incidencias de vinculación/.test(render)&&/productivity-quality-banner/.test(render)],
  ['el KPI ambiguo de operaciones fue retirado',!/Operaciones realizadas/.test(render)&&/Unidades incentivables/.test(render)],
  ['panel principal usa cuatro KPI esenciales',(render.match(/class="exec-kpi(?: primary)?"/g)||[]).length===4],
  ['facturado y cobrado solo aparecen en el detalle contextual',/productivityRoleActivityV9441/.test(render)&&!/th>Facturado</.test(render)&&!/th>Cobrado</.test(render)],
  ['tabla principal tiene siete columnas esenciales',/productivity-summary-table/.test(render)&&/colspan="7"/.test(render)&&!/colspan="11"/.test(render)],
  ['diseño aprovecha el ancho administrativo',/\.main:has\(\.productivity-page\)\{max-width:none\}/.test(css)&&/grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/.test(css)],
  ['vista móvil conserva resumen y detalle',/productivity-mobile-card employee-summary/.test(render)&&/productivity-mobile-detail-btn/.test(render)],
  ['simulación consolida tres funciones en un empleado',virtual.length===2&&virtual[0].rows.length===3],
  ['simulación suma solo unidades con regla de incentivo',virtual[0].unidades===8&&virtual[0].incentivo===29],
  ['simulación genera actividad específica sin dependencias fuera de alcance',/25 lb/.test(helpers.productivityRoleActivityV9441(virtual[0].rows.find(row=>row.rol==='Despachador')))],
  ['auditoría V9.4.4.1 integrada en npm test',pkg.scripts.pretest.includes('auditoria_productividad_simplificada_v9441.mjs')]
];

for(const [name,ok] of checks){
  assert.equal(Boolean(ok),true,`FALLO: ${name}`);
  console.log(`OK - ${name}`);
}

console.log('Auditoría Productividad Simplificada V9.4.4.1 aprobada.');

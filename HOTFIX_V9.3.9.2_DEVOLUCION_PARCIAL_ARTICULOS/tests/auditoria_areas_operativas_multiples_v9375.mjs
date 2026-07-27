import fs from 'node:fs';
import assert from 'node:assert/strict';

const main=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../src/styles.css',import.meta.url),'utf8');
const sql=fs.readFileSync(new URL('../supabase/sql/34_actualizacion_v9375_areas_operativas_multiples.sql',import.meta.url),'utf8');
const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));

const checks=[
  ['versión V9.3.9.0 o superior sincronizada',/^9\.3\.9\.[0-9]+$/.test(pkg.version)&&main.includes(`V${pkg.version} PWA`)],
  ['área principal conservada',/Área principal/.test(main)&&/area:primary/.test(main)],
  ['múltiples áreas adicionales editables',/Áreas operativas adicionales/.test(main)&&/data-emp-extra-area/.test(main)],
  ['rol y permisos no se modifican',/no cambian su rol ni sus permisos/i.test(main)],
  ['filtro combina área principal y adicionales',/employeeOperationalAreas/.test(main)&&/e\?\.areas_adicionales/.test(main)],
  ['estación acepta habilitados para Carnicería',/activeEmployees\('Carnicería'\)/.test(main)&&/habilitado para trabajar en Carnicería/.test(main)],
  ['cola conserva ID real del empleado',/tomado_por_empleado_id:employee\?\.id/.test(main)&&/carnQueueCountByEmployeeId/.test(main)],
  ['empleados sin usuario siguen disponibles',!/activeEmployees\('Carnicería'\)[^;]+linkedUserForEmployee/.test(main)],
  ['interfaz adaptable',/employee-area-grid/.test(css)&&/@media\(max-width:780px\)/.test(css)],
  ['SQL aditivo',/add column if not exists areas_adicionales text\[\]/.test(sql)],
  ['SQL valida áreas conocidas',/chk_empleados_areas_adicionales_v9375/.test(sql)&&/areas_adicionales <@ array/.test(sql)],
  ['SQL evita duplicar área principal',/not \(area = any\(areas_adicionales\)\)/.test(sql)],
  ['SQL no destruye empleados ni historial',!/\bdrop\s+table\b|\btruncate\b|\bdelete\s+from\s+public\.empleados_operativos\b/i.test(sql)]
];

for(const [name,ok] of checks){
  assert.equal(ok,true,`ERROR - ${name}`);
  console.log(`OK - ${name}`);
}

console.log('Auditoría Áreas Operativas Múltiples V9.3.9.0 aprobada.');

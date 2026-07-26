import fs from 'node:fs';
import assert from 'node:assert/strict';

const main=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const sql=fs.readFileSync(new URL('../supabase/sql/33_actualizacion_v9374_clientes_ocasionales_estaciones.sql',import.meta.url),'utf8');
const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));

const checks=[
  ['versión V9.3.7.6 visible',/V9\.3\.7\.6/.test(main)&&pkg.version==='9.3.7.6'],
  ['cliente ocasional disponible',/Cliente ocasional \/ sin registrar/.test(main)&&/value="Ocasional"/.test(main)],
  ['delivery ocasional exige teléfono',/teléfono es obligatorio para enviar un cliente ocasional por delivery/i.test(main)],
  ['delivery ocasional exige dirección',/dirección completa es obligatoria para enviar un cliente ocasional por delivery/i.test(main)],
  ['snapshot de dirección y referencia',/cliente_direccion_orden/.test(main)&&/cliente_referencia_orden/.test(main)],
  ['WhatsApp usa teléfono de la orden',/cliente_telefono_orden/.test(main)&&/isOrderWhatsAppEligible/.test(main)],
  ['variables WhatsApp operativas',/modalidad_entrega/.test(main)&&/direccion_entrega/.test(main)&&/referencia_entrega/.test(main)],
  ['impresión ocasional identificada',/CLIENTE OCASIONAL · VERIFICAR DIRECCIÓN/.test(main)&&/occasionalPrintBlock/.test(main)],
  ['cuenta de estación selecciona empleado',/isStationAccount/.test(main)&&/Selecciona el empleado que está usando esta estación/.test(main)],
  ['cola por empleado',/carnQueueCountByEmployeeId/.test(main)&&/tomado_por_empleado_id/.test(main)],
  ['auditoría conserva estación',/desde la estación/.test(main)],
  ['órdenes recientes visibles',/Nuevas \/ recientes/.test(main)&&/view==='recientes'/.test(main)],
  ['vista requiere acción',/Requieren acción/.test(main)&&/view==='accion'/.test(main)],
  ['búsqueda incluye ubicación',/orderClientAddress\(o\).*orderClientReference\(o\)/s.test(main)],
  ['cliente editable con dirección',/id="f_direccion"/.test(main)&&/id="f_referencia"/.test(main)],
  ['sector con búsqueda y alta',/list="sectorOptions"/.test(main)&&/agregar_sector_si_no_existe/.test(main)],
  ['SQL aditivo y compatible',/add column if not exists direccion/.test(sql)&&/add column if not exists cliente_direccion_orden/.test(sql)],
  ['SQL no destruye datos',!/\bdrop\s+table\b|\btruncate\b|\bdelete\s+from\s+public\.(clientes|ordenes)\b/i.test(sql)]
];

for(const [name,ok] of checks){
  assert.equal(ok,true,`ERROR - ${name}`);
  console.log(`OK - ${name}`);
}

console.log('Auditoría Clientes Ocasionales, Estaciones y Ordenamiento V9.3.7.6 aprobada.');

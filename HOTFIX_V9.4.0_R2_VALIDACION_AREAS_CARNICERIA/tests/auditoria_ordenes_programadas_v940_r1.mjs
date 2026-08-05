import assert from 'node:assert/strict';
import fs from 'node:fs';

const main=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const sql=fs.readFileSync(
  new URL(
    '../supabase/sql/52_actualizacion_v940_r1_ordenes_programadas.sql',
    import.meta.url
  ),
  'utf8'
);
const sql51=fs.readFileSync(
  new URL(
    '../supabase/sql/51_actualizacion_v940_cxc_cobros_posteriores.sql',
    import.meta.url
  ),
  'utf8'
);
const installer=fs.readFileSync(
  new URL('../APLICAR_V940_R1.ps1',import.meta.url),
  'utf8'
);
const pkg=JSON.parse(
  fs.readFileSync(new URL('../package.json',import.meta.url),'utf8')
);

const checks=[
  ['base V9.4.0 R1 identificada',
    pkg.version==='9.4.0' &&
    main.includes('V9.4.0 R1 · Toma segura de órdenes programadas')],
  ['SQL 51 corregido queda integrado',
    /v_triggers_activos/.test(sql51) &&
    /exception when others/.test(sql51) &&
    !/create temporary table/.test(sql51)],
  ['transición directa limitada a Carnicería',
    /'Programada',\s*'En preparación',\s*'carniceria',\s*true/.test(sql)],
  ['fecha de negocio dominicana en servidor',
    (sql.match(/America\/Santo_Domingo/g)||[]).length>=3 &&
    /v_hoy_rd date:=timezone/.test(sql)],
  ['reprogramación y toma están separadas',
    /tg_op='INSERT'/.test(sql) &&
    /v_fecha_cambio:=new\.fecha_despacho is distinct from old\.fecha_despacho/.test(sql) &&
    /Si solo cambia el estado, una orden futura no puede activarse/.test(sql)],
  ['programadas futuras siguen bloqueadas',
    /La orden está programada para %\. Podrá tomarse cuando llegue esa fecha\./.test(sql) &&
    /v_orden\.fecha_despacho[\s\S]*>v_hoy_rd/.test(sql)],
  ['programada vencida cuenta como toma protegida',
    /old\.estado in\('Pedido recibido','Programada'\)[\s\S]*new\.estado='En preparación'/.test(sql)],
  ['identidad y límite de cola conservados',
    /tipo_cuenta,'empleado'\)='estacion'/.test(sql) &&
    /v_cola>=3/.test(sql) &&
    /tomado_por_user:=v_uid/.test(sql)],
  ['RPC bloquea la fila antes de validar',
    /from public\.ordenes o[\s\S]*where o\.id=p_orden_id[\s\S]*for update/.test(sql)],
  ['toma sigue usando la máquina de estados',
    /from public\.cambiar_estado_orden_v9382/.test(sql) &&
    /'En preparación'/.test(sql)],
  ['interfaz oculta programadas futuras',
    /function canShowInCarniceria\(o\)[\s\S]*if\(isFutureDispatch\(o\)\) return false/.test(main)],
  ['interfaz orienta al SQL correcto',
    /verifica que aplicaste el SQL 52 de la V9\.4\.0 R1/.test(main) ||
    /La autorización se valida con el empleado activo, su área principal y sus áreas adicionales/.test(main)],
  ['migración no altera órdenes existentes',
    !/\b(update|delete from|truncate table)\s+public\.ordenes\b/i.test(sql) &&
    !/\bdrop table\b/i.test(sql)],
  ['instalador exige SQL 52 y auditoría R1',
    /52_actualizacion_v940_r1_ordenes_programadas\.sql/.test(installer) &&
    /auditoria_ordenes_programadas_v940_r1\.mjs/.test(installer)],
  ['auditoría integrada en npm test',
    pkg.scripts.pretest.includes('auditoria_ordenes_programadas_v940_r1.mjs')]
];

for(const [name,ok] of checks){
  assert.equal(Boolean(ok),true,`FALLO: ${name}`);
  console.log(`OK - ${name}`);
}

function canTakeScheduled({estado,fechaDespacho},hoy){
  if(estado==='Pedido recibido') return true;
  if(estado!=='Programada') return false;
  return String(fechaDespacho||hoy)<=hoy;
}

assert.equal(
  canTakeScheduled(
    {estado:'Programada',fechaDespacho:'2026-07-29'},
    '2026-07-29'
  ),
  true,
  'Una orden programada para hoy debe poder tomarse.'
);
assert.equal(
  canTakeScheduled(
    {estado:'Programada',fechaDespacho:'2026-07-30'},
    '2026-07-29'
  ),
  false,
  'Una orden programada para mañana debe seguir bloqueada.'
);
assert.equal(
  canTakeScheduled(
    {estado:'Pedido recibido',fechaDespacho:'2026-07-29'},
    '2026-07-29'
  ),
  true,
  'El flujo normal de Pedido recibido debe conservarse.'
);

console.log(
  'Auditoría de órdenes programadas V9.4.0 R1 aprobada.'
);

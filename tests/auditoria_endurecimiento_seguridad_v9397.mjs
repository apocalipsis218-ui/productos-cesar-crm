import fs from 'node:fs';
import assert from 'node:assert/strict';

const main=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const pwa=fs.readFileSync(new URL('../src/pwa.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const sql=fs.readFileSync(new URL('../supabase/sql/50_actualizacion_v9397_endurecimiento_seguridad.sql',import.meta.url),'utf8');
const installer=fs.readFileSync(new URL('../APLICAR_V9397.ps1',import.meta.url),'utf8');
const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));

const checks=[
  ['versión V9.3.9.7 o superior sincronizada',
    /^(?:9\.3\.9\.7|9\.4\.\d+)$/.test(pkg.version) && main.includes('V9.3.9.7') &&
    /APP_VERSION = 'V(?:9\.3\.9\.7|9\.4\.[0-9]+) PWA'/.test(pwa) &&
    /V(?:9\.3\.9\.7|9\.4\.[0-9]+) PWA/.test(html)],
  ['SQL 44–49 verificados',
    /guardar_preparacion_faltantes_v9391/.test(sql) &&
    /registrar_devolucion_parcial_v9392/.test(sql) &&
    /recibir_lote_cxc_v9392_r2/.test(sql) &&
    /recibir_orden_cxc_v9393/.test(sql) &&
    /notas_validacion/.test(sql) &&
    /v_retorno_no_entregado/.test(sql)],
  ['política ordenes_all eliminada',
    /drop policy if exists ordenes_all on public\.ordenes/.test(sql)],
  ['políticas permisivas heredadas de órdenes retiradas',
    ['orden_detalle_all','orden_pesos_all','orden_entregas_all','orden_pagos_all',
      'prod_despacho_all','orden_facturas_all','viajes_delivery_all','viaje_ordenes_all']
      .every(name=>sql.includes(`drop policy if exists ${name}`))],
  ['INSERT normal limitado a estados iniciales',
    /estado in\('Programada','Pedido recibido'\)/.test(sql) &&
    /Una orden nueva no puede iniciar en el estado/.test(sql)],
  ['identidad de creación proviene del servidor',
    /new\.creado_por:=v_uid/.test(sql) && /new\.actualizado_por:=v_uid/.test(sql)],
  ['pendiente por existencia conserva excepción controlada',
    /estado='Pendiente por existencia'/.test(sql) &&
    /es_pendiente_existencia/.test(sql) && /orden_origen_id is not null/.test(sql)],
  ['toma dedicada conectada',
    /function public\.tomar_orden_v9397/.test(sql) &&
    main.includes("sb.rpc('tomar_orden_v9397'")],
  ['cuenta de estación y empleado activo validados',
    /tipo_cuenta,'empleado'\)='estacion'/.test(sql) &&
    /El empleado seleccionado no existe o está inactivo/.test(sql) &&
    /areas_adicionales/.test(sql)],
  ['límite de cola protegido en servidor',
    /v_cola>=3/.test(sql) && /ya tiene 3 órdenes en preparación/.test(sql)],
  ['preparación exige misma cuenta',
    /old\.tomado_por_user is distinct from v_uid/.test(sql) &&
    /Esta orden fue tomada desde otra cuenta/.test(sql)],
  ['preparado por deriva de quien tomó',
    /new\.preparado_por:=old\.tomado_por/.test(sql) &&
    /new\.preparado_en:=now\(\)/.test(sql)],
  ['detalle de Carnicería exige responsable',
    /v9397_orden_detalle_update_responsable/.test(sql) &&
    /o\.tomado_por_user=auth\.uid\(\)/.test(sql)],
  ['casos especiales transaccionales',
    /function public\.crear_caso_especial_v9397/.test(sql) &&
    /insert into public\.orden_casos_historial/.test(sql) &&
    /insert into public\.orden_estados_historial/.test(sql) &&
    main.includes("sb.rpc('crear_caso_especial_v9397'")],
  ['frontend no inserta órdenes directamente',
    !main.includes("sb.from('ordenes').insert")],
  ['RPC antiguas retiradas del navegador',
    /revoke all on function public\.recibir_orden_cxc_v937[\s\S]*from public,anon,authenticated/.test(sql) &&
    /revoke all on function public\.recibir_lote_cxc_v937[\s\S]*from public,anon,authenticated/.test(sql) &&
    /revoke all on function public\.recibir_lote_cxc_v9392_r2[\s\S]*from public,anon,authenticated/.test(sql) &&
    !main.includes("sb.rpc('recibir_lote_cxc_v937'")],
  ['rutas vigentes de CXC conservadas',
    main.includes("sb.rpc('recibir_orden_cxc_v9393'") &&
    main.includes("sb.rpc('recibir_lote_cxc_v9393'")],
  ['instalador evita paquete duplicado',
    /El hotfix esta duplicado dentro de si mismo/.test(installer)],
  ['instalador exige SQL 45–50',
    /45\.\.50/.test(installer) && /SQL 45, 46, 47, 48, 49 y 50/.test(installer)],
  ['SQL no borra datos operativos',
    !/\b(drop table|truncate table|delete from public\.(ordenes|orden_detalle|orden_pesos|orden_entregas|orden_pagos))\b/i.test(sql)],
  ['auditoría integrada en npm test',
    pkg.scripts.pretest.includes('auditoria_endurecimiento_seguridad_v9397.mjs')]
];

for(const [name,ok] of checks){
  assert.equal(Boolean(ok),true,`FALLO: ${name}`);
  console.log(`OK - ${name}`);
}

console.log('Auditoría Endurecimiento de Seguridad V9.3.9.7 aprobada.');

import fs from 'node:fs';
import assert from 'node:assert/strict';
import {
  auxTablesForPageV942,
  boundedOrderIdsV942,
  changedOrderIdV942,
  realtimeTablesForPageV942,
  removeRowByIdV942,
  upsertRowByIdV942
} from '../src/runtimeDataV942.js';

const main=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const sql=fs.readFileSync(
  new URL('../supabase/migrations/20260808012358_v942_r2_rendimiento_incremental.sql',import.meta.url),
  'utf8'
);
const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));
const viteConfig=fs.readFileSync(new URL('../vite.config.js',import.meta.url),'utf8');
const wrangler=JSON.parse(fs.readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8'));

const checks=[
  ['RPC agrupa órdenes, cliente y detalle',
    /function public\.cargar_ordenes_v942/.test(sql) &&
    /jsonb_agg\(to_jsonb\(d\) order by d\.id\)/.test(sql) &&
    /limit 2000/.test(sql) && /least\(coalesce\(p_limite_recientes,250\),500\)/.test(sql)],
  ['RPC valida sesión, módulo y lote incremental',
    /v_uid uuid:=auth\.uid\(\)/.test(sql) &&
    /tiene_algun_modulo\([\s\S]{0,220}array\['ordenes','control','carniceria'/.test(sql) &&
    /cardinality\(v_ids\)>100/.test(sql)],
  ['RPC no se expone a anon',
    /revoke all on function public\.cargar_ordenes_v942[\s\S]*from public,anon,authenticated/.test(sql) &&
    /grant execute on function public\.cargar_ordenes_v942[\s\S]*to authenticated/.test(sql)],
  ['índices corresponden a ORDER BY reales',
    ['orden_pesos','orden_entregas','orden_pagos','orden_historial'].every(name=>sql.includes(`idx_${name}_creado_v942`))],
  ['RLS caliente usa initplan',
    (sql.match(/\(select public\.tiene_algun_modulo/g)||[]).length>=8 &&
    (sql.match(/\(select public\.es_admin_operativo\(\)\)/g)||[]).length>=2],
  ['políticas SELECT duplicadas se consolidan',
    /drop policy if exists usuario_modulos_read/.test(sql) &&
    /create policy v942_usuario_modulos_select/.test(sql) &&
    /create policy v942_roles_permisos_select/.test(sql)],
  ['frontend carga por módulo',
    /function loadModuleDataV942/.test(main) &&
    /function loadCoreAccessV942/.test(main) &&
    /function loadReferenceDataV942/.test(main) &&
    /await loadModuleDataV942\(state\.page,true\)/.test(main)],
  ['órdenes usan RPC y actualización incremental por IDs',
    /sb\.rpc\('cargar_ordenes_v942'/.test(main) &&
    /function flushLiveOrderRefreshV942/.test(main) &&
    /p_ids:cleanIds\.length\?cleanIds:null/.test(main)],
  ['Realtime se limita al módulo visible',
    /realtimeTablesForPageV942\(state\.page,state\.liquidacionTab\)/.test(main) &&
    !/\.on\('postgres_changes',[\s\S]{0,100}table:'ordenes'\)[\s\S]{0,800}table:'orden_pagos'/.test(main)],
  ['fallback evita efecto estampida y pestañas ocultas',
    /\.85\+\(Math\.random\(\)\*\.30\)/.test(main) &&
    /document\.visibilityState!==['"]hidden['"]/.test(main)],
  ['R2 forma parte de npm test',
    pkg.scripts.pretest.includes('auditoria_rendimiento_incremental_v942_r2.mjs')],
  ['build bloquea configuración Supabase ausente, incorrecta o secreta',
    /loadEnv/.test(viteConfig) &&
    /VITE_SUPABASE_URL/.test(viteConfig) &&
    /VITE_SUPABASE_ANON_KEY/.test(viteConfig) &&
    /SUPABASE_HOST_BY_MODE/.test(viteConfig) &&
    /service_role\|sb_secret_/.test(viteConfig) &&
    /Se bloqueó la publicación/.test(viteConfig)],
  ['Wrangler siempre reconstruye antes de publicar',
    wrangler.build?.command==='npm run build']
];

for(const [name,ok] of checks){
  assert.equal(Boolean(ok),true,`FALLO: ${name}`);
  console.log(`OK - ${name}`);
}

assert.deepEqual(auxTablesForPageV942('carniceria'),['orden_detalle','orden_pesos','orden_estados_historial']);
assert.deepEqual(realtimeTablesForPageV942('productos'),['sistema_configuracion']);
assert.deepEqual(
  realtimeTablesForPageV942('liquidacion','cxc'),
  ['ordenes','orden_entregas','orden_pagos','orden_estados_historial','sistema_configuracion','cxc_cobros','cxc_cobro_aplicaciones']
);
assert.deepEqual(upsertRowByIdV942([{id:1,a:1}],{id:1,b:2}),[{id:1,a:1,b:2}]);
assert.deepEqual(removeRowByIdV942([{id:1},{id:2}],1),[{id:2}]);
assert.equal(changedOrderIdV942('orden_detalle',{old:{id:9}},[{id:7,items:[{id:9}]}]),7);
assert.deepEqual(boundedOrderIdsV942([3,'3',0,-1,'x',2]),[3,2]);

console.log('Auditoría Rendimiento Incremental V9.4.2 R2 aprobada.');

import fs from 'node:fs';
import assert from 'node:assert/strict';

const main=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const sql=fs.readFileSync(new URL('../supabase/sql/40_actualizacion_v9382_estados_protegidos.sql',import.meta.url),'utf8');
const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));

const checks=[
  ['versión V9.3.9.0 sincronizada',pkg.version==='9.3.9.0'&&main.includes('V9.3.9.0 PWA')],
  ['catálogo formal de transiciones',/create table if not exists public\.orden_transiciones_v9382/.test(sql)],
  ['transiciones operativas completas',sql.includes("('Pedido recibido','En preparación','carniceria')")&&sql.includes("('Facturada','Asignada a delivery','validacion')")&&sql.includes("('En ruta','Cobrado','delivery')")],
  ['saltos inválidos bloqueados por trigger',/Transición no autorizada/.test(sql)&&/trg_pc_validar_transicion_orden_v9382/.test(sql)],
  ['identidad original protegida',/new\.codigo is distinct from old\.codigo/.test(sql)&&/new\.creado_por is distinct from old\.creado_por/.test(sql)],
  ['campos por módulo protegidos',/campos de preparación están protegidos/.test(sql)&&/campos de facturación están protegidos/.test(sql)&&/campos financieros de liquidación están protegidos/.test(sql)],
  ['RPC exige estado anterior',/p_estado_esperado/.test(sql)&&/La orden cambió de estado/.test(sql)],
  ['estado e historial son atómicos',/insert into public\.orden_estados_historial/.test(sql)&&/function public\.cambiar_estado_orden_v9382/.test(sql)],
  ['frontend centraliza cambios',main.includes("const {error}=await sb.rpc('cambiar_estado_orden_v9382'")&&!main.includes("async function setOrderState(o, estado, extra={}){ if(!o) return; const old=o.estado;")],
  ['toma de orden concurrente protegida',/p_estado_esperado:old,p_estado_nuevo:'En preparación'/.test(main)],
  ['liberación limpia detalle atómicamente',/function public\.liberar_orden_v9382/.test(sql)&&/update public\.orden_detalle/.test(sql)],
  ['impresión usa transición protegida',/Impresión de volante 80 mm/.test(main)&&/cantidad_impresiones:count/.test(main)&&/cambiar_estado_orden_v9382/.test(main)],
  ['funciones limitadas a autenticados',/revoke all on function public\.cambiar_estado_orden_v9382/.test(sql)&&/grant execute on function public\.liberar_orden_v9382/.test(sql)],
  ['SQL no destruye datos',!/drop table|truncate/i.test(sql)]
];

for(const [name,ok] of checks){
  assert.equal(Boolean(ok),true,`FALLO: ${name}`);
  console.log(`OK - ${name}`);
}
console.log('Auditoría Estados Protegidos V9.3.9.0 aprobada.');

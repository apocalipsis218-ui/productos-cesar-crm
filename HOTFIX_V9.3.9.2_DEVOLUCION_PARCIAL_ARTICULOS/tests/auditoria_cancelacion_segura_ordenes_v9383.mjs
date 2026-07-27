import fs from 'node:fs';
import assert from 'node:assert/strict';

const main=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const sql=fs.readFileSync(new URL('../supabase/sql/41_actualizacion_v9383_cancelacion_segura_ordenes.sql',import.meta.url),'utf8');
const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));

const checks=[
  ['versión V9.3.9.0 o superior sincronizada',/^9\.3\.9\.[0-9]+$/.test(pkg.version)&&main.includes(`V${pkg.version} PWA`)],
  ['columnas de archivado aditivas',/add column if not exists archivada boolean/.test(sql)&&/motivo_anulacion text/.test(sql)],
  ['snapshot privado antes de cancelar',/create table if not exists public\.orden_archivos_v9383/.test(sql)&&/'orden',to_jsonb\(v_o\)/.test(sql)],
  ['solo administración cancela',/Solo Gerente\/Administrador puede cancelar o archivar órdenes/.test(sql)],
  ['motivo obligatorio',/char_length\(btrim\(coalesce\(p_motivo,''\)\)\)<5/.test(sql)],
  ['bloquea lote activo',/pertenece a un lote activo/.test(sql)&&/entrega_lote_detalle/.test(sql)],
  ['bloquea entrega o pago',/tiene entrega o pago registrado/.test(sql)&&/orden_pagos/.test(sql)&&/orden_entregas/.test(sql)],
  ['estado, historial y auditoría juntos',/update public\.ordenes/.test(sql)&&/insert into public\.orden_estados_historial/.test(sql)&&/insert into public\.auditoria_excepciones/.test(sql)],
  ['borrado físico bloqueado',/trg_bloquear_delete_orden_v9383/.test(sql)&&/revoke delete on public\.ordenes/.test(sql)],
  ['historial no se puede borrar',/trg_bloquear_delete_historial_v9383/.test(sql)&&/revoke delete on public\.orden_estados_historial/.test(sql)],
  ['reverso ya no destruye órdenes',/create or replace function public\.revertir_gestion_segura/.test(sql)&&/perform public\.cancelar_orden_v9383/.test(sql)],
  ['frontend usa RPC segura',main.includes("sb.rpc('cancelar_orden_v9383'")],
  ['frontend no borra órdenes físicamente',!main.includes("sb.from('ordenes').delete()")],
  ['frontend no borra historial físicamente',!main.includes("sb.from('orden_estados_historial').delete()")],
  ['órdenes archivadas fuera de operación',main.includes(".eq('archivada',false)")],
  ['SQL 41 informado al usuario',main.includes('SQL 41 de la actualización anterior')],
  ['SQL no destruye datos actuales',!/drop table|truncate table/i.test(sql)]
];

for(const [name,ok] of checks){
  assert.equal(Boolean(ok),true,`FALLO: ${name}`);
  console.log(`OK - ${name}`);
}

console.log('Auditoría Cancelación Segura de Órdenes V9.3.9.0 aprobada.');

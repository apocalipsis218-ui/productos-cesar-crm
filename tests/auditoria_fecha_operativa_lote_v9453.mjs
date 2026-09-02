import fs from 'node:fs';
import assert from 'node:assert/strict';

const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const sql = fs.readFileSync(new URL('../supabase/migrations/20260901134609_fecha_operativa_lote_v9453.sql', import.meta.url), 'utf8');
const readme = fs.readFileSync(new URL('../README.md', import.meta.url), 'utf8');

function count(source, pattern) {
  return [...source.matchAll(pattern)].length;
}

assert.match(main, /id="batchOperationalDate" type="date"[^>]+max="\$\{esc\(today\(\)\)\}"/, 'El lote grupal debe incluir la fecha operativa con hoy como máximo.');
assert.match(main, /id="valOperationalDate" type="date"[^>]+value="\$\{esc\(today\(\)\)\}"[^>]+max="\$\{esc\(today\(\)\)\}"/, 'La validación individual debe iniciar en la fecha actual.');
assert.match(main, /d\.operationalDate=normalizeOperationalDate\(operationalDate\?\.value\)\|\|today\(\)/, 'La fecha elegida debe sobrevivir los re-renderizados del formulario.');
assert.match(main, /if\(normalized>today\(\)\).*La fecha del lote no puede ser posterior/, 'La interfaz debe rechazar fechas futuras.');
assert.equal(count(main, /sb\.rpc\('crear_lote_entrega_v9453'/g), 2, 'Los flujos grupal e individual deben usar la nueva RPC.');
assert.equal(count(main, /p_fecha_operativa:fechaOperativa/g), 2, 'Ambos flujos deben enviar la fecha operativa explícitamente.');
assert.equal(count(main, /Primero ejecuta el SQL 31 de la V9\.3\.7\.1 en Supabase\./g), 1, 'La creación de lotes no debe bloquearse por el estado del historial de transferencias.');
assert.match(main, /fecha_operativa:normalizeOperationalDate\(operationalDate\).*fecha_entrega:originalDate/, 'El snapshot debe conservar separadas la fecha del lote y la fecha real.');
assert.match(main, /<b>Fecha del lote:<\/b>.*<b>Registrado en el sistema:<\/b>/, 'La hoja de ruta debe mostrar ambas fechas.');
assert.match(main, /Fecha del lote:.*Liquidado:/, 'El historial de Delivery/Liquidación debe mostrar la fecha del lote.');
assert.match(main, /printValidationDailyReport[\s\S]*?<th>Fecha del lote<\/th><th>Registrado<\/th>/, 'El reporte de Validación debe separar la fecha operativa del registro.');
assert.match(css, /\.validation-batch-panel \.batch-toolbar\{display:grid;grid-template-columns:minmax\(220px,280px\) minmax\(190px,220px\) 1fr auto/, 'La barra debe reservar un espacio propio para la fecha.');

assert.match(sql, /alter table public\.entrega_lotes[\s\S]*add column if not exists fecha_operativa date/, 'La migración debe agregar fecha_operativa como date.');
assert.match(sql, /update public\.entrega_lotes[\s\S]*set fecha_operativa = \(coalesce\(fecha_entrega, creado_en, now\(\)\) at time zone 'America\/Santo_Domingo'\)::date/, 'Los lotes históricos deben recibir su fecha original dominicana.');
assert.match(sql, /alter column fecha_operativa set not null/, 'La fecha operativa debe ser obligatoria en la base de datos.');
assert.match(sql, /create or replace function public\.crear_lote_entrega_v9453\([\s\S]*p_fecha_operativa date/, 'La RPC debe tener un nombre único y recibir la fecha tipada.');
assert.match(sql, /security definer\s+set search_path = ''/, 'La función protegida debe fijar un search_path vacío.');
assert.match(sql, /v_today date := \(now\(\) at time zone 'America\/Santo_Domingo'\)::date/, 'La validación del día debe usar la zona horaria del negocio.');
assert.match(sql, /if v_operational_date > v_today then[\s\S]*raise exception 'La fecha del lote no puede ser posterior/, 'La base de datos también debe rechazar fechas futuras.');
assert.match(sql, /responsable_empleado_id, fecha_operativa, fecha_entrega[\s\S]*v_employee_id, v_operational_date, v_now/, 'El lote debe almacenar la fecha operativa y el instante real por separado.');
assert.match(sql, /validado_en=v_now,[\s\S]*asignado_delivery_en=v_now/, 'Los relojes reales de las órdenes no deben retroceder a la fecha seleccionada.');
assert.match(sql, /revoke execute on function public\.crear_lote_entrega_v9453[\s\S]*from public;[\s\S]*from anon;[\s\S]*grant execute[\s\S]*to authenticated;/, 'La ejecución debe quedar restringida a usuarios autenticados.');
assert.doesNotMatch(sql, /\b(drop table|truncate|delete from)\b/i, 'La migración no debe eliminar datos operativos.');
assert.doesNotMatch(sql, /update\s+public\.entrega_lotes\s+set\s+fecha_entrega/i, 'La migración no debe reescribir la fecha real histórica.');
assert.match(readme, /V9\.4\.5\.3 — Fecha operativa del lote/, 'README debe documentar la mejora.');

console.log('OK auditoría V9.4.5.3: fecha operativa separada del registro real, protegida en UI y base de datos.');

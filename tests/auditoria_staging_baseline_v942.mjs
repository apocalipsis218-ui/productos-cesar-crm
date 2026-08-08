import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const sqlUrl = new URL(
  '../supabase/staging/V9.4.2_STAGING_BASE_SCHEMA.sql',
  import.meta.url,
);
const sqlPath = fileURLToPath(sqlUrl);
const sql = readFileSync(sqlUrl, 'utf8');

const count = (pattern) => (sql.match(pattern) || []).length;

assert.ok(
  !sqlPath.includes('/supabase/migrations/'),
  'La línea base de staging no puede vivir en supabase/migrations',
);
assert.match(sql, /^-- V9\.4\.2 — Línea base exclusiva para STAGING/m);
assert.match(sql, /STAGING_BASE_SCHEMA abortado: el esquema public no está vacío/);
assert.match(sql, /^begin;$/m);
assert.match(sql, /^commit;$/m);

assert.equal(count(/\bcreate table public\./gi), 52, 'tablas públicas');
assert.equal(count(/\bcreate view public\./gi), 2, 'vistas');
assert.equal(count(/\bcreate type public\./gi), 4, 'tipos enumerados');
assert.equal(
  count(/\bcreate or replace function public\./gi),
  64,
  'funciones propias',
);
assert.equal(count(/\bcreate policy\b/gi), 133, 'políticas RLS');
assert.equal(
  count(/\bcreate (?:constraint )?trigger\b/gi),
  20,
  'triggers propios',
);
assert.equal(
  count(/\balter table public\.[^\n]+ enable row level security;/gi),
  52,
  'tablas con RLS',
);

const standaloneIndexes = count(/\bcreate (?:unique )?index\b/gi);
const constraintIndexes = count(
  /\balter table only public\.[^;]+ add constraint [^;]+\b(?:primary key|unique|exclude)\b/gi,
);
assert.equal(
  standaloneIndexes + constraintIndexes,
  155,
  'índices totales reproducidos',
);
assert.equal(
  count(/alter publication supabase_realtime add table public\./gi),
  9,
  'tablas Realtime',
);

assert.match(sql, /grant usage on schema public to anon, authenticated, service_role;/i);
assert.match(sql, /grant [^;]*select[^;]* on table public\./i);
assert.match(sql, /grant execute on function public\./i);
assert.doesNotMatch(sql, /\bcopy\s+public\./i);
assert.doesNotMatch(sql, /\bsb_(?:secret|publishable)_[A-Za-z0-9_-]+/);
assert.doesNotMatch(sql, /\bservice_role\s*[:=]\s*['"][^'"]+['"]/i);
assert.doesNotMatch(sql, /\bjmcbaduxjrzfnesbslmp\b|\bodlwbuagtrgmfpdohors\b/i);
assert.doesNotMatch(sql, /\bcreate\s+table\s+auth\./i);

console.log(
  'OK: línea base V9.4.2 de staging validada (DDL, RLS, permisos y Realtime; sin datos ni credenciales).',
);

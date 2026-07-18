import fs from 'node:fs';
import assert from 'node:assert/strict';

const source = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const sql = fs.readFileSync(new URL('../supabase/24_actualizacion_v9214_usuarios_permisos.sql', import.meta.url), 'utf8');

const section = (a,b) => {
  const start=source.indexOf(a);
  const end=source.indexOf(b,start+a.length);
  assert.ok(start>=0 && end>start, `No se encontró la sección ${a}`);
  return source.slice(start,end);
};

const users = section('function renderConfigUsuarios(c){','\nasync function saveUserPermissionsDirect');
const editor = section('function openUserPerms(u){','\nfunction openAuthGuide');
const saver = section('async function saveUserPermissions(u,profilePatch,overrides){','\nfunction openUserPerms');

assert.ok(source.includes('function openUserPerms(u){'), 'El botón Editar sigue apuntando a una función inexistente.');
assert.ok(users.includes('data-user='), 'Falta el botón Editar por usuario.');
assert.ok(users.includes('openUserPerms(u);'), 'El botón Editar no abre el editor.');
assert.ok(editor.includes('data-user-perm='), 'Falta la matriz de permisos por módulo.');
assert.ok(editor.includes('Heredar del rol'), 'Falta la opción para heredar permisos del rol.');
assert.ok(editor.includes("configOverride!=='editar'"), 'Falta protección contra autobloqueo administrativo.');
assert.ok(editor.includes('saveUserPermissions('), 'El editor no guarda perfil y permisos.');
assert.ok(saver.includes("sb.rpc('actualizar_usuario_permisos_v9214'"), 'Falta guardado transaccional RPC.');
assert.ok(saver.includes('saveUserPermissionsDirect'), 'Falta respaldo directo si la RPC todavía no está instalada.');
assert.ok(source.includes("userSearch:''") && source.includes("userRoleFilter:'Todos'") && source.includes("userStatusFilter:'Todos'"), 'Faltan filtros del módulo Usuarios.');
assert.ok(sql.includes("('reportes','Reportes'") && sql.includes("('auditoria','Auditoría'") && sql.includes("('kanban','Kanban'"), 'El SQL no registra todos los módulos de la V9.2.14.');
assert.ok(sql.includes('create or replace function public.actualizar_usuario_permisos_v9214'), 'Falta la función transaccional de Supabase.');
assert.ok(sql.includes('usuarios_permisos_historial'), 'Falta historial de cambios de usuarios y permisos.');

console.log('OK: módulo Usuarios V9.2.14 mapeado, enlazado y protegido.');

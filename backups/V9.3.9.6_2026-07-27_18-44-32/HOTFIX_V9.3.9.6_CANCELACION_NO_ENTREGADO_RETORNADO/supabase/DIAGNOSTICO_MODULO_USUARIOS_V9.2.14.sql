-- Productos César - V9.2.14
-- Diagnóstico CORREGIDO de solo lectura para Configuración -> Usuarios.
-- Puede ejecutarse ANTES o DESPUÉS de 24_actualizacion_v9214_usuarios_permisos.sql.
-- No modifica datos.

-- A) Credenciales de Auth sin perfil del CRM.
select au.id, au.email, au.created_at
from auth.users au
left join public.perfiles p on p.id = au.id
where p.id is null
order by au.created_at;

-- B) Perfiles del CRM sin credencial Auth.
-- No consulta p.correo porque esa columna puede no existir antes de la actualización.
select p.id, p.nombre, p.rol, p.activo
from public.perfiles p
left join auth.users au on au.id = p.id
where au.id is null
order by p.nombre;

-- C) Perfiles activos y su acceso final a Configuración.
-- El correo se obtiene de auth.users para que funcione antes de crear perfiles.correo.
select
  p.id,
  p.nombre,
  au.email as correo_auth,
  p.rol,
  p.activo,
  case
    when p.rol = 'Gerente' then 'editar'
    else coalesce(
      (select um.nivel
       from public.usuario_modulos um
       where um.usuario_id = p.id
         and um.modulo = 'config'
       limit 1),
      (select rp.nivel
       from public.roles_permisos rp
       where rp.rol = p.rol
         and rp.modulo = 'config'
       limit 1),
      'none'
    )
  end as config_final
from public.perfiles p
left join auth.users au on au.id = p.id
order by p.nombre;

-- D) Módulos faltantes respecto a la V9.2.14.
with esperados(id) as (
  values
    ('inicio'),('control'),('clientes'),('ordenes'),
    ('carniceria'),('facturacion'),('validacion'),('delivery'),
    ('liquidacion'),('alertas'),('kanban'),('productos'),
    ('productividad'),('reportes'),('auditoria'),('config')
)
select e.id as modulo_faltante
from esperados e
left join public.modulos_sistema m on m.id = e.id
where m.id is null;

-- E) Permisos personalizados huérfanos o inválidos.
select um.*
from public.usuario_modulos um
left join public.perfiles p on p.id = um.usuario_id
left join public.modulos_sistema m on m.id = um.modulo
where p.id is null
   or m.id is null
   or um.nivel not in ('none','ver','editar');

-- F) Funciones instaladas.
select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name in (
    'puede_configurar_usuarios_v9214',
    'actualizar_usuario_permisos_v9214'
  )
order by routine_name;

-- G) Políticas instaladas.
select schemaname, tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename in (
    'perfiles',
    'usuario_modulos',
    'usuarios_permisos_historial'
  )
order by tablename, policyname;

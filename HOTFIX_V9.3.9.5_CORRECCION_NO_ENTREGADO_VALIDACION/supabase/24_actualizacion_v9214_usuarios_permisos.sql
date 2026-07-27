-- Productos César - V9.2.14
-- Corrección y fortalecimiento del módulo Configuración -> Usuarios.
-- Ejecutar UNA VEZ en Supabase SQL Editor antes de usar el nuevo editor de usuarios.
-- Es seguro volver a ejecutarlo: usa IF NOT EXISTS, ON CONFLICT y CREATE OR REPLACE.

begin;

-- 1) Campos útiles del perfil. Correo es solo informativo; Auth sigue siendo la fuente de acceso.
alter table if exists public.perfiles
  add column if not exists correo text,
  add column if not exists actualizado_en timestamptz default now();

-- Sincronizar correos actuales desde auth.users sin exponer contraseñas ni claves.
update public.perfiles p
set correo = u.email,
    actualizado_en = coalesce(p.actualizado_en, now())
from auth.users u
where u.id = p.id
  and (p.correo is distinct from u.email);

-- 2) Asegurar todos los módulos presentes en la V9.2.14.
create table if not exists public.modulos_sistema (
  id text primary key,
  nombre text not null,
  descripcion text,
  orden integer not null default 0,
  activo boolean not null default true
);

insert into public.modulos_sistema (id,nombre,descripcion,orden,activo) values
('inicio','Inicio','Resumen general',1,true),
('control','Control','Llamadas y gestiones',2,true),
('clientes','Clientes','Ficha y WhatsApp',3,true),
('ordenes','Órdenes','Panel completo',4,true),
('carniceria','Carnicería','Preparar y pesar',5,true),
('facturacion','Facturación','Imprimir y facturar',6,true),
('validacion','Validación','Entrega a delivery',7,true),
('delivery','Delivery','Mis pedidos',8,true),
('liquidacion','Liquidación','Cobros y CXC',9,true),
('alertas','Alertas','Centro operativo',10,true),
('kanban','Kanban','Tablero de órdenes',11,true),
('productos','Productos','Catálogo',12,true),
('productividad','Productividad','Incentivos y KPI',13,true),
('reportes','Reportes','Indicadores y análisis',14,true),
('auditoria','Auditoría','Trazabilidad de acciones',15,true),
('config','Configuración','Sistema',16,true)
on conflict (id) do update set
  nombre=excluded.nombre,
  descripcion=excluded.descripcion,
  orden=excluded.orden,
  activo=excluded.activo;

-- 3) Asegurar tablas de permisos.
create table if not exists public.roles_permisos (
  rol text not null,
  modulo text not null references public.modulos_sistema(id) on delete cascade,
  nivel text not null default 'none' check (nivel in ('none','ver','editar')),
  actualizado_en timestamptz default now(),
  primary key (rol,modulo)
);

create table if not exists public.usuario_modulos (
  usuario_id uuid not null,
  modulo text not null references public.modulos_sistema(id) on delete cascade,
  nivel text not null default 'none' check (nivel in ('none','ver','editar')),
  actualizado_en timestamptz default now(),
  primary key (usuario_id,modulo)
);

-- 4) Mapa base por rol. Gerente obtiene editar en todo.
insert into public.roles_permisos (rol,modulo,nivel)
select 'Gerente', id, 'editar' from public.modulos_sistema
on conflict (rol,modulo) do update set nivel=excluded.nivel, actualizado_en=now();

insert into public.roles_permisos (rol,modulo,nivel) values
-- Control / ventas
('Control','inicio','ver'),('Control','control','editar'),('Control','clientes','editar'),('Control','ordenes','editar'),('Control','productos','ver'),
('Vendedor','inicio','ver'),('Vendedor','control','editar'),('Vendedor','clientes','editar'),('Vendedor','ordenes','editar'),('Vendedor','productos','ver'),
-- Operación
('Carnicería','inicio','ver'),('Carnicería','ordenes','ver'),('Carnicería','carniceria','editar'),('Carnicería','productos','ver'),
('Facturación','inicio','ver'),('Facturación','ordenes','ver'),('Facturación','facturacion','editar'),('Facturación','productos','ver'),
('Validación','inicio','ver'),('Validación','ordenes','ver'),('Validación','validacion','editar'),('Validación','delivery','ver'),
('Delivery','inicio','ver'),('Delivery','delivery','editar'),
('Liquidación','inicio','ver'),('Liquidación','ordenes','ver'),('Liquidación','liquidacion','editar'),
('Cobrador','inicio','ver'),('Cobrador','clientes','ver'),('Cobrador','ordenes','ver'),('Cobrador','delivery','ver'),('Cobrador','liquidacion','editar'),
-- Supervisor: operación amplia, configuración solo lectura por defecto.
('Supervisor','inicio','ver'),('Supervisor','control','ver'),('Supervisor','clientes','ver'),('Supervisor','ordenes','editar'),
('Supervisor','carniceria','editar'),('Supervisor','facturacion','editar'),('Supervisor','validacion','editar'),
('Supervisor','delivery','ver'),('Supervisor','liquidacion','ver'),('Supervisor','alertas','ver'),('Supervisor','kanban','ver'),
('Supervisor','productos','ver'),('Supervisor','productividad','ver'),('Supervisor','reportes','ver'),('Supervisor','auditoria','ver'),('Supervisor','config','ver')
on conflict (rol,modulo) do update set nivel=excluded.nivel, actualizado_en=now();

-- 5) Historial específico de cambios de perfil/permisos.
create table if not exists public.usuarios_permisos_historial (
  id bigserial primary key,
  usuario_objetivo uuid not null,
  cambiado_por uuid not null,
  antes jsonb,
  despues jsonb,
  creado_en timestamptz not null default now()
);

create index if not exists idx_usuarios_permisos_historial_objetivo
  on public.usuarios_permisos_historial(usuario_objetivo,creado_en desc);

-- 6) Función interna de autorización, independiente de políticas RLS.
create or replace function public.puede_configurar_usuarios_v9214()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.perfiles p
    where p.id = auth.uid()
      and coalesce(p.activo,true)=true
      and (
        p.rol = 'Gerente'
        or coalesce(
          (select um.nivel from public.usuario_modulos um where um.usuario_id=p.id and um.modulo='config' limit 1),
          (select rp.nivel from public.roles_permisos rp where rp.rol=p.rol and rp.modulo='config' limit 1),
          'none'
        )='editar'
      )
  );
$$;

-- 7) Guardado atómico del perfil y sus permisos personalizados.
create or replace function public.actualizar_usuario_permisos_v9214(
  p_usuario_id uuid,
  p_nombre text,
  p_rol text,
  p_activo boolean,
  p_vendedor text default null,
  p_modulos jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_antes jsonb;
  v_despues jsonb;
  v_config_final text;
begin
  if auth.uid() is null then
    raise exception 'Sesión no válida';
  end if;

  if not public.puede_configurar_usuarios_v9214() then
    raise exception 'No tienes permiso para editar usuarios';
  end if;

  if p_usuario_id is null or not exists(select 1 from public.perfiles where id=p_usuario_id) then
    raise exception 'El perfil indicado no existe';
  end if;

  if nullif(trim(coalesce(p_nombre,'')),'') is null then
    raise exception 'El nombre es obligatorio';
  end if;

  if nullif(trim(coalesce(p_rol,'')),'') is null then
    raise exception 'El rol es obligatorio';
  end if;

  if jsonb_typeof(coalesce(p_modulos,'[]'::jsonb)) <> 'array' then
    raise exception 'p_modulos debe ser un arreglo JSON';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(coalesce(p_modulos,'[]'::jsonb)) as x(modulo text,nivel text)
    where x.nivel not in ('none','ver','editar')
       or not exists(select 1 from public.modulos_sistema m where m.id=x.modulo)
  ) then
    raise exception 'Existe un módulo o nivel de permiso no válido';
  end if;

  -- Evitar que el administrador actual se bloquee a sí mismo.
  if p_usuario_id=auth.uid() and coalesce(p_activo,false)=false then
    raise exception 'No puedes desactivar tu propia cuenta';
  end if;

  select jsonb_build_object(
    'perfil',to_jsonb(p),
    'modulos',coalesce((select jsonb_agg(to_jsonb(um) order by um.modulo) from public.usuario_modulos um where um.usuario_id=p.id),'[]'::jsonb)
  ) into v_antes
  from public.perfiles p
  where p.id=p_usuario_id;

  -- Calcular acceso final a Configuración con los valores nuevos.
  if p_rol='Gerente' then
    v_config_final:='editar';
  else
    select coalesce(
      (select x.nivel from jsonb_to_recordset(coalesce(p_modulos,'[]'::jsonb)) as x(modulo text,nivel text) where x.modulo='config' limit 1),
      (select rp.nivel from public.roles_permisos rp where rp.rol=p_rol and rp.modulo='config' limit 1),
      'none'
    ) into v_config_final;
  end if;

  if p_usuario_id=auth.uid() and v_config_final<>'editar' then
    raise exception 'No puedes quitarte Configuración = Editar desde tu propia sesión';
  end if;

  update public.perfiles
  set nombre=trim(p_nombre),
      rol=trim(p_rol),
      activo=coalesce(p_activo,true),
      vendedor=nullif(trim(coalesce(p_vendedor,'')),''),
      actualizado_en=now()
  where id=p_usuario_id;

  delete from public.usuario_modulos where usuario_id=p_usuario_id;

  if p_rol<>'Gerente' then
    insert into public.usuario_modulos(usuario_id,modulo,nivel,actualizado_en)
    select p_usuario_id,x.modulo,x.nivel,now()
    from jsonb_to_recordset(coalesce(p_modulos,'[]'::jsonb)) as x(modulo text,nivel text)
    on conflict (usuario_id,modulo) do update
      set nivel=excluded.nivel, actualizado_en=now();
  end if;

  select jsonb_build_object(
    'perfil',to_jsonb(p),
    'modulos',coalesce((select jsonb_agg(to_jsonb(um) order by um.modulo) from public.usuario_modulos um where um.usuario_id=p.id),'[]'::jsonb)
  ) into v_despues
  from public.perfiles p
  where p.id=p_usuario_id;

  insert into public.usuarios_permisos_historial(usuario_objetivo,cambiado_por,antes,despues)
  values(p_usuario_id,auth.uid(),v_antes,v_despues);

  return jsonb_build_object('ok',true,'usuario_id',p_usuario_id,'config_final',v_config_final);
end;
$$;

-- 8) RLS y permisos.
alter table public.modulos_sistema enable row level security;
alter table public.roles_permisos enable row level security;
alter table public.usuario_modulos enable row level security;
alter table public.usuarios_permisos_historial enable row level security;
alter table public.perfiles enable row level security;

-- Lectura de configuración para usuarios autenticados.
drop policy if exists v9214_modulos_select on public.modulos_sistema;
create policy v9214_modulos_select on public.modulos_sistema for select to authenticated using (true);
drop policy if exists v9214_roles_select on public.roles_permisos;
create policy v9214_roles_select on public.roles_permisos for select to authenticated using (true);
drop policy if exists v9214_usuario_modulos_select on public.usuario_modulos;
create policy v9214_usuario_modulos_select on public.usuario_modulos for select to authenticated using (true);
drop policy if exists v9214_perfiles_select on public.perfiles;
create policy v9214_perfiles_select on public.perfiles for select to authenticated using (true);

-- Historial visible solo a quien puede editar Configuración.
drop policy if exists v9214_historial_usuarios_select on public.usuarios_permisos_historial;
create policy v9214_historial_usuarios_select on public.usuarios_permisos_historial
for select to authenticated using (public.puede_configurar_usuarios_v9214());

-- Retirar políticas de escritura antiguas que podrían ser más permisivas.
drop policy if exists perfiles_update_admin on public.perfiles;
drop policy if exists v551_perfiles_update_config on public.perfiles;
drop policy if exists usuario_modulos_admin on public.usuario_modulos;
drop policy if exists usuario_modulos_admin_all on public.usuario_modulos;
drop policy if exists v551_usuario_modulos_admin on public.usuario_modulos;

-- Mantener escritura directa como respaldo para el frontend; la función RPC es la vía recomendada.
drop policy if exists v9214_perfiles_update on public.perfiles;
create policy v9214_perfiles_update on public.perfiles for update to authenticated
using (public.puede_configurar_usuarios_v9214())
with check (public.puede_configurar_usuarios_v9214());

drop policy if exists v9214_usuario_modulos_write on public.usuario_modulos;
create policy v9214_usuario_modulos_write on public.usuario_modulos for all to authenticated
using (public.puede_configurar_usuarios_v9214())
with check (public.puede_configurar_usuarios_v9214());

grant select on public.modulos_sistema, public.roles_permisos, public.usuario_modulos, public.perfiles to authenticated;
grant select on public.usuarios_permisos_historial to authenticated;
grant update on public.perfiles to authenticated;
grant select,insert,update,delete on public.usuario_modulos to authenticated;
grant execute on function public.puede_configurar_usuarios_v9214() to authenticated;
grant execute on function public.actualizar_usuario_permisos_v9214(uuid,text,text,boolean,text,jsonb) to authenticated;

commit;

-- Verificación rápida (debe devolver 16 módulos):
select count(*) as modulos_v9214 from public.modulos_sistema where activo=true;

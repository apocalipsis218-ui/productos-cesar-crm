-- =========================================================
-- PRODUCTOS CÉSAR CRM · V9.3.0 R9
-- VINCULACIÓN DE USUARIOS CON EMPLEADOS OPERATIVOS
--
-- Objetivos:
--   1) Vincular cada usuario personal con empleados_operativos.id.
--   2) Distinguir usuarios personales de cuentas compartidas de estación.
--   3) Evitar que un empleado quede vinculado a dos usuarios.
--   4) Sincronizar nombre operativo y desactivación.
--   5) Guardar perfil, vínculo y permisos en una transacción.
--
-- Requiere que ya existan:
--   public.perfiles
--   public.empleados_operativos
--   public.usuario_modulos
--   public.roles_permisos
--   public.modulos_sistema
-- =========================================================

begin;

create extension if not exists unaccent;

-- ---------------------------------------------------------
-- 1. CAMPOS DE IDENTIDAD ESTABLE
-- ---------------------------------------------------------
alter table public.perfiles
  add column if not exists empleado_id bigint,
  add column if not exists tipo_cuenta text not null default 'empleado',
  add column if not exists actualizado_en timestamptz default now();

alter table public.perfiles
  drop constraint if exists perfiles_tipo_cuenta_check;

alter table public.perfiles
  add constraint perfiles_tipo_cuenta_check
  check (tipo_cuenta in ('empleado','estacion'));

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname='perfiles_empleado_id_fkey'
      and conrelid='public.perfiles'::regclass
  ) then
    alter table public.perfiles
      add constraint perfiles_empleado_id_fkey
      foreign key (empleado_id)
      references public.empleados_operativos(id)
      on update cascade
      on delete set null;
  end if;
end $$;

create index if not exists perfiles_empleado_id_idx
  on public.perfiles(empleado_id);

create unique index if not exists perfiles_empleado_id_unique
  on public.perfiles(empleado_id)
  where empleado_id is not null;

comment on column public.perfiles.empleado_id is
'Empleado operativo real vinculado al usuario. Un empleado solo puede pertenecer a un usuario.';

comment on column public.perfiles.tipo_cuenta is
'empleado = acceso personal; estacion = acceso compartido sin persona vinculada.';

-- ---------------------------------------------------------
-- 2. SINCRONIZAR CORREOS DESDE AUTH
-- ---------------------------------------------------------
update public.perfiles p
set correo=u.email,
    actualizado_en=now()
from auth.users u
where u.id=p.id
  and p.correo is distinct from u.email;

-- ---------------------------------------------------------
-- 3. MIGRACIÓN ASISTIDA POR COINCIDENCIA EXACTA DE NOMBRE
-- Solo enlaza cuando existe exactamente un empleado compatible
-- y ese empleado no está vinculado a otro perfil.
-- ---------------------------------------------------------
with candidatos as (
  select
    p.id as perfil_id,
    min(e.id) as empleado_id,
    count(*) as coincidencias
  from public.perfiles p
  join public.empleados_operativos e
    on lower(unaccent(trim(e.nombre))) = lower(unaccent(trim(coalesce(nullif(p.vendedor,''),nullif(p.nombre,''),''))))
  where p.empleado_id is null
  group by p.id
), unicos as (
  select c.perfil_id,c.empleado_id
  from candidatos c
  where c.coincidencias=1
    and not exists (
      select 1
      from public.perfiles p2
      where p2.empleado_id=c.empleado_id
        and p2.id<>c.perfil_id
    )
)
update public.perfiles p
set empleado_id=u.empleado_id,
    tipo_cuenta='empleado',
    actualizado_en=now()
from unicos u
where p.id=u.perfil_id;

-- Cuentas genéricas históricas se clasifican como estación si no
-- quedaron vinculadas. No se intenta adivinar una persona.
update public.perfiles
set tipo_cuenta='estacion',
    empleado_id=null,
    actualizado_en=now()
where empleado_id is null
  and (
    lower(coalesce(correo,'')) ~ '(carniceria|despacho|caja|validacion|estacion|puesto|turno|mostrador|crm\.com)'
    or lower(coalesce(nombre,'')) ~ '(carniceria|despacho|caja|validacion|estacion|puesto|turno|mostrador)'
  );

-- La identidad visible de los usuarios ya vinculados proviene del empleado.
update public.perfiles p
set nombre=e.nombre,
    vendedor=e.nombre,
    actualizado_en=now()
from public.empleados_operativos e
where p.empleado_id=e.id
  and (
    p.nombre is distinct from e.nombre
    or p.vendedor is distinct from e.nombre
  );

-- Un empleado inactivo no debe conservar un acceso activo.
update public.perfiles p
set activo=false,
    actualizado_en=now()
from public.empleados_operativos e
where p.empleado_id=e.id
  and e.activo=false
  and coalesce(p.activo,true)=true;

-- ---------------------------------------------------------
-- 4. SINCRONIZACIÓN AUTOMÁTICA DESDE EMPLEADOS
-- Cambiar nombre actualiza el perfil.
-- Desactivar empleado desactiva el acceso, sin borrar historial.
-- Reactivar empleado NO reactiva automáticamente el usuario.
-- ---------------------------------------------------------
create or replace function public.sincronizar_perfil_empleado_v930r9()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  update public.perfiles
  set nombre=new.nombre,
      vendedor=new.nombre,
      activo=case when new.activo=false then false else activo end,
      actualizado_en=now()
  where empleado_id=new.id;
  return new;
end;
$$;

drop trigger if exists empleados_sincronizar_perfil_v930r9
on public.empleados_operativos;

create trigger empleados_sincronizar_perfil_v930r9
after update of nombre,activo
on public.empleados_operativos
for each row
execute function public.sincronizar_perfil_empleado_v930r9();

-- ---------------------------------------------------------
-- 5. AUTORIZACIÓN PARA ADMINISTRAR USUARIOS
-- Se recrea para que el SQL sea autocontenido.
-- ---------------------------------------------------------
create or replace function public.puede_configurar_usuarios_v9214()
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select exists (
    select 1
    from public.perfiles p
    where p.id=auth.uid()
      and coalesce(p.activo,true)=true
      and (
        p.rol='Gerente'
        or coalesce(
          (select um.nivel from public.usuario_modulos um where um.usuario_id=p.id and um.modulo='config' limit 1),
          (select rp.nivel from public.roles_permisos rp where rp.rol=p.rol and rp.modulo='config' limit 1),
          'none'
        )='editar'
      )
  );
$$;

-- ---------------------------------------------------------
-- 6. GUARDADO TRANSACCIONAL R9
-- ---------------------------------------------------------
create or replace function public.actualizar_usuario_permisos_v930r9(
  p_usuario_id uuid,
  p_nombre text,
  p_rol text,
  p_activo boolean,
  p_vendedor text,
  p_empleado_id bigint,
  p_tipo_cuenta text,
  p_modulos jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_antes jsonb;
  v_despues jsonb;
  v_config_final text;
  v_empleado public.empleados_operativos%rowtype;
  v_nombre_final text;
  v_vendedor_final text;
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

  if nullif(trim(coalesce(p_rol,'')),'') is null then
    raise exception 'El rol es obligatorio';
  end if;

  if coalesce(p_tipo_cuenta,'') not in ('empleado','estacion') then
    raise exception 'Tipo de cuenta no válido';
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

  if p_tipo_cuenta='empleado' then
    if p_empleado_id is null then
      raise exception 'Selecciona el empleado vinculado';
    end if;

    select * into v_empleado
    from public.empleados_operativos
    where id=p_empleado_id;

    if not found then
      raise exception 'El empleado seleccionado no existe';
    end if;

    if coalesce(p_activo,true)=true and v_empleado.activo=false then
      raise exception 'No se puede activar un usuario vinculado a un empleado inactivo';
    end if;

    if exists (
      select 1
      from public.perfiles p
      where p.empleado_id=p_empleado_id
        and p.id<>p_usuario_id
    ) then
      raise exception 'Ese empleado ya está vinculado a otro usuario';
    end if;

    v_nombre_final:=trim(v_empleado.nombre);
    v_vendedor_final:=trim(v_empleado.nombre);
  else
    if p_empleado_id is not null then
      raise exception 'Una cuenta de estación no puede tener empleado vinculado';
    end if;
    if nullif(trim(coalesce(p_nombre,'')),'') is null then
      raise exception 'Escribe el nombre de la estación';
    end if;
    v_nombre_final:=trim(p_nombre);
    v_vendedor_final:=nullif(trim(coalesce(p_vendedor,'')),'');
  end if;

  if p_usuario_id=auth.uid() and coalesce(p_activo,false)=false then
    raise exception 'No puedes desactivar tu propia cuenta';
  end if;

  select jsonb_build_object(
    'perfil',to_jsonb(p),
    'modulos',coalesce((select jsonb_agg(to_jsonb(um) order by um.modulo) from public.usuario_modulos um where um.usuario_id=p.id),'[]'::jsonb)
  ) into v_antes
  from public.perfiles p
  where p.id=p_usuario_id;

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
  set nombre=v_nombre_final,
      rol=trim(p_rol),
      activo=coalesce(p_activo,true),
      vendedor=v_vendedor_final,
      empleado_id=case when p_tipo_cuenta='empleado' then p_empleado_id else null end,
      tipo_cuenta=p_tipo_cuenta,
      actualizado_en=now()
  where id=p_usuario_id;

  delete from public.usuario_modulos
  where usuario_id=p_usuario_id;

  if p_rol<>'Gerente' then
    insert into public.usuario_modulos(usuario_id,modulo,nivel,actualizado_en)
    select p_usuario_id,x.modulo,x.nivel,now()
    from jsonb_to_recordset(coalesce(p_modulos,'[]'::jsonb)) as x(modulo text,nivel text)
    on conflict (usuario_id,modulo) do update
      set nivel=excluded.nivel,
          actualizado_en=now();
  end if;

  select jsonb_build_object(
    'perfil',to_jsonb(p),
    'empleado',case when p.empleado_id is null then null else (select to_jsonb(e) from public.empleados_operativos e where e.id=p.empleado_id) end,
    'modulos',coalesce((select jsonb_agg(to_jsonb(um) order by um.modulo) from public.usuario_modulos um where um.usuario_id=p.id),'[]'::jsonb)
  ) into v_despues
  from public.perfiles p
  where p.id=p_usuario_id;

  insert into public.usuarios_permisos_historial(usuario_objetivo,cambiado_por,antes,despues)
  values(p_usuario_id,auth.uid(),v_antes,v_despues);

  return jsonb_build_object(
    'ok',true,
    'usuario_id',p_usuario_id,
    'empleado_id',case when p_tipo_cuenta='empleado' then p_empleado_id else null end,
    'tipo_cuenta',p_tipo_cuenta,
    'config_final',v_config_final
  );
end;
$$;

-- ---------------------------------------------------------
-- 7. RLS / GRANTS
-- ---------------------------------------------------------
alter table public.perfiles enable row level security;

-- Conserva las políticas instaladas en SQL 24. Se asegura el permiso de UPDATE.
grant select,update on public.perfiles to authenticated;
grant select on public.empleados_operativos to authenticated;
grant execute on function public.sincronizar_perfil_empleado_v930r9() to authenticated;
grant execute on function public.puede_configurar_usuarios_v9214() to authenticated;
grant execute on function public.actualizar_usuario_permisos_v930r9(uuid,text,text,boolean,text,bigint,text,jsonb) to authenticated;

notify pgrst, 'reload schema';

commit;

-- =========================================================
-- 8. VERIFICACIÓN
-- =========================================================
select
  count(*) as perfiles,
  count(*) filter (where empleado_id is not null) as vinculados,
  count(*) filter (where tipo_cuenta='empleado' and empleado_id is null) as personales_sin_vincular,
  count(*) filter (where tipo_cuenta='estacion') as cuentas_estacion
from public.perfiles;

-- Debe quedar sin filas.
select empleado_id,count(*) as usuarios_vinculados
from public.perfiles
where empleado_id is not null
group by empleado_id
having count(*)>1;

select
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='perfiles' and column_name='empleado_id') as empleado_id_creado,
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='perfiles' and column_name='tipo_cuenta') as tipo_cuenta_creado,
  to_regprocedure('public.actualizar_usuario_permisos_v930r9(uuid,text,text,boolean,text,bigint,text,jsonb)') is not null as rpc_r9_instalada;

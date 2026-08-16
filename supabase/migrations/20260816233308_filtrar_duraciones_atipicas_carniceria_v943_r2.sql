-- V9.4.3 R2 - El promedio mensual de Carnicería ignora duraciones atípicas.
-- Los pedidos siguen contando para clientes, preparaciones y libras; únicamente
-- se excluyen del tiempo promedio las muestras negativas o mayores a 8 horas.

create or replace function public.resumen_carniceria_mensual_v943(
  p_empleado_id bigint default null,
  p_mes date default null
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_actor public.perfiles%rowtype;
  v_empleado public.empleados_operativos%rowtype;
  v_empleado_id bigint;
  v_empleado_nombre text;
  v_es_admin boolean := false;
  v_es_estacion boolean := false;
  v_mes date := date_trunc(
    'month',
    coalesce(p_mes, (now() at time zone 'America/Santo_Domingo')::date)::timestamp
  )::date;
  v_inicio timestamptz;
  v_fin timestamptz;
  v_hoy date := (now() at time zone 'America/Santo_Domingo')::date;
  v_dias_mes integer;
  v_dias_transcurridos integer;
  v_result jsonb;
begin
  if v_uid is null then
    raise exception 'Sesión requerida.' using errcode = '42501';
  end if;

  select * into v_actor
  from public.perfiles
  where id = v_uid and coalesce(activo, true)
  limit 1;

  if not found then
    raise exception 'Perfil activo requerido.' using errcode = '42501';
  end if;

  v_es_admin := v_actor.rol in ('Gerente', 'Administrador', 'Supervisor');
  v_es_estacion := lower(coalesce(v_actor.tipo_cuenta, '')) = 'estacion';

  if not v_es_admin and not public.tiene_modulo('carniceria', 'ver') then
    raise exception 'No tienes acceso al módulo Carnicería.' using errcode = '42501';
  end if;

  if not v_es_admin and not v_es_estacion then
    if v_actor.empleado_id is null then
      raise exception 'Tu usuario no está vinculado a un empleado operativo.' using errcode = '42501';
    end if;
    if p_empleado_id is not null and p_empleado_id <> v_actor.empleado_id then
      raise exception 'Solo puedes consultar tu propio progreso.' using errcode = '42501';
    end if;
    v_empleado_id := v_actor.empleado_id;
  else
    v_empleado_id := p_empleado_id;
  end if;

  if v_empleado_id is not null then
    select * into v_empleado
    from public.empleados_operativos
    where id = v_empleado_id
      and activo
      and (
        lower(trim(area)) in ('carnicería', 'carniceria', 'despacho')
        or exists (
          select 1
          from unnest(coalesce(areas_adicionales, array[]::text[])) area_adicional
          where lower(trim(area_adicional)) in ('carnicería', 'carniceria', 'despacho')
        )
      )
    limit 1;

    if not found then
      raise exception 'El empleado no está activo o no pertenece a Carnicería.' using errcode = '22023';
    end if;
    v_empleado_nombre := v_empleado.nombre;
  else
    if not v_es_admin then
      raise exception 'La cuenta de estación debe seleccionar un despachador.' using errcode = '22023';
    end if;
    v_empleado_nombre := 'Equipo de Carnicería';
  end if;

  v_inicio := v_mes::timestamp at time zone 'America/Santo_Domingo';
  v_fin := (v_mes + interval '1 month')::timestamp at time zone 'America/Santo_Domingo';
  v_dias_mes := extract(day from (v_mes + interval '1 month - 1 day'))::integer;
  v_dias_transcurridos := case
    when v_hoy < v_mes then 0
    when v_hoy >= (v_mes + interval '1 month')::date then v_dias_mes
    else extract(day from v_hoy)::integer
  end;

  with preparadas as (
    select
      o.id,
      o.preparado_en,
      coalesce(o.peso_preparado, 0)::numeric as peso_preparado,
      case
        when o.tomado_en is not null
          then extract(epoch from (o.preparado_en - o.tomado_en)) / 60
        else null
      end as duracion_minutos,
      case
        when o.cliente_id is not null then 'cliente:' || o.cliente_id::text
        when nullif(regexp_replace(coalesce(o.cliente_telefono_orden, ''), '[^0-9]', '', 'g'), '') is not null
          then 'telefono:' || regexp_replace(o.cliente_telefono_orden, '[^0-9]', '', 'g')
        else 'orden:' || o.id::text
      end as cliente_clave
    from public.ordenes o
    where o.preparado_en >= v_inicio
      and o.preparado_en < v_fin
      and o.estado <> 'Anulado'
      and (
        v_empleado_id is null
        or o.tomado_por_empleado_id = v_empleado_id
        or (
          o.tomado_por_empleado_id is null
          and lower(trim(coalesce(o.preparado_por, ''))) = lower(trim(v_empleado_nombre))
        )
      )
  )
  select jsonb_build_object(
    'empleado_id', v_empleado_id,
    'empleado_nombre', v_empleado_nombre,
    'mes_inicio', v_mes,
    'mes_fin', (v_mes + interval '1 month - 1 day')::date,
    'clientes_unicos', count(distinct cliente_clave),
    'pedidos_preparados', count(*),
    'libras_preparadas', round(coalesce(sum(peso_preparado), 0), 2),
    'tiempo_promedio_minutos', coalesce(round(
      avg(duracion_minutos) filter (
        where duracion_minutos between 0 and 480
      ),
      1
    ), 0),
    'muestras_tiempo_validas', count(*) filter (
      where duracion_minutos between 0 and 480
    ),
    'duraciones_atipicas', count(*) filter (
      where duracion_minutos is not null
        and (duracion_minutos < 0 or duracion_minutos > 480)
    ),
    'preparados_hoy', count(*) filter (
      where (preparado_en at time zone 'America/Santo_Domingo')::date = v_hoy
    ),
    'dias_transcurridos', v_dias_transcurridos,
    'dias_mes', v_dias_mes,
    'generado_en', now()
  ) into v_result
  from preparadas;

  return v_result;
end;
$$;

comment on function public.resumen_carniceria_mensual_v943(bigint, date) is
  'Resumen mensual de Carnicería por empleado. Conserva todos los pedidos y excluye del promedio duraciones negativas o mayores a 480 minutos, informándolas como atípicas.';

revoke all on function public.resumen_carniceria_mensual_v943(bigint, date) from public;
revoke all on function public.resumen_carniceria_mensual_v943(bigint, date) from anon;
grant execute on function public.resumen_carniceria_mensual_v943(bigint, date) to authenticated;

-- V9.4.5.4 - Trazabilidad de impresiones de preparación por origen.
-- Conserva el contador general existente y registra por separado las impresiones
-- solicitadas desde el módulo Carnicería.

alter table public.ordenes
  add column if not exists impresiones_preparacion_carniceria integer not null default 0,
  add column if not exists ultima_impresion_preparacion_carniceria timestamptz,
  add column if not exists impreso_preparacion_carniceria_por uuid,
  add column if not exists impreso_preparacion_carniceria_por_nombre text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname='ordenes_impresiones_preparacion_carniceria_no_negativas'
      and conrelid='public.ordenes'::regclass
  ) then
    alter table public.ordenes
      add constraint ordenes_impresiones_preparacion_carniceria_no_negativas
      check (impresiones_preparacion_carniceria >= 0);
  end if;
end;
$$;

comment on column public.ordenes.impresiones_preparacion_carniceria is
  'Cantidad de veces que la impresión de preparación fue solicitada desde Carnicería.';
comment on column public.ordenes.ultima_impresion_preparacion_carniceria is
  'Fecha real de la última impresión de preparación solicitada desde Carnicería.';
comment on column public.ordenes.impreso_preparacion_carniceria_por is
  'Usuario autenticado que solicitó la última impresión desde Carnicería.';
comment on column public.ordenes.impreso_preparacion_carniceria_por_nombre is
  'Nombre del perfil al momento de la última impresión solicitada desde Carnicería.';

create or replace function public.registrar_impresion_preparacion_v9454(
  p_orden_id bigint,
  p_estado_esperado text,
  p_origen text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid:=auth.uid();
  v_o public.ordenes%rowtype;
  v_origen text:=lower(btrim(coalesce(p_origen,'')));
  v_nombre text;
  v_total integer;
  v_total_carniceria integer;
begin
  if v_uid is null then
    raise exception 'Sesión requerida.';
  end if;

  if v_origen not in ('carniceria','orden_creada','ordenes') then
    raise exception 'Origen de impresión no válido.';
  end if;

  if v_origen='carniceria' then
    if not public.es_admin_operativo()
       and not public.tiene_algun_modulo(array['carniceria'],'editar') then
      raise exception 'No tienes permiso para registrar una impresión de Carnicería.';
    end if;
  elsif not public.es_admin_operativo()
        and not public.tiene_algun_modulo(array['ordenes','control','carniceria'],'editar') then
    raise exception 'No tienes permiso para imprimir órdenes de preparación.';
  end if;

  select * into v_o
  from public.ordenes
  where id=p_orden_id
  for update;

  if not found then
    raise exception 'La orden no existe.';
  end if;

  if coalesce(v_o.archivada,false) or v_o.estado='Anulado' then
    raise exception 'No se puede imprimir una orden archivada o anulada.';
  end if;

  if p_estado_esperado is not null
     and v_o.estado is distinct from p_estado_esperado then
    raise exception 'La orden cambió de estado. Actualiza la pantalla antes de imprimir.';
  end if;

  select nullif(btrim(p.nombre),'') into v_nombre
  from public.perfiles p
  where p.id=v_uid;

  v_nombre:=coalesce(v_nombre,'Usuario '||left(v_uid::text,8));

  update public.ordenes
  set impresiones_preparacion=coalesce(impresiones_preparacion,0)+1,
      ultima_impresion_preparacion=now(),
      impreso_preparacion_por=v_uid,
      impresiones_preparacion_carniceria=case
        when v_origen='carniceria' then coalesce(impresiones_preparacion_carniceria,0)+1
        else coalesce(impresiones_preparacion_carniceria,0)
      end,
      ultima_impresion_preparacion_carniceria=case
        when v_origen='carniceria' then now()
        else ultima_impresion_preparacion_carniceria
      end,
      impreso_preparacion_carniceria_por=case
        when v_origen='carniceria' then v_uid
        else impreso_preparacion_carniceria_por
      end,
      impreso_preparacion_carniceria_por_nombre=case
        when v_origen='carniceria' then v_nombre
        else impreso_preparacion_carniceria_por_nombre
      end,
      actualizado_por=v_uid,
      actualizado_en=now()
  where id=v_o.id
  returning impresiones_preparacion,
            impresiones_preparacion_carniceria
       into v_total,v_total_carniceria;

  insert into public.orden_estados_historial(
    orden_id,estado_anterior,estado_nuevo,comentario,usuario
  ) values (
    v_o.id,
    v_o.estado,
    v_o.estado,
    case v_origen
      when 'carniceria' then 'Impresión de preparación 80 mm · Carnicería'
      when 'orden_creada' then 'Impresión de preparación 80 mm · Confirmación de orden'
      else 'Impresión de preparación 80 mm · Ficha de orden'
    end,
    v_uid
  );

  return jsonb_build_object(
    'ok',true,
    'orden_id',v_o.id,
    'origen',v_origen,
    'impresiones_preparacion',v_total,
    'impresiones_preparacion_carniceria',v_total_carniceria,
    'impreso_por',v_uid,
    'impreso_por_nombre',v_nombre,
    'version','9.4.5.4'
  );
end;
$$;

revoke all on function public.registrar_impresion_preparacion_v9454(bigint,text,text)
  from public,anon,authenticated;
grant execute on function public.registrar_impresion_preparacion_v9454(bigint,text,text)
  to authenticated;

comment on function public.registrar_impresion_preparacion_v9454(bigint,text,text) is
  'Registra de forma atómica la solicitud de impresión y distingue las realizadas desde Carnicería.';

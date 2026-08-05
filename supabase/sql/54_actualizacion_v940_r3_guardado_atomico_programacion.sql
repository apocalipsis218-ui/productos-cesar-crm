-- =========================================================
-- 54 - V9.4.0 R3 · GUARDADO ATÓMICO Y PROGRAMACIÓN PROTEGIDA
-- Productos César CRM
-- =========================================================

begin;

do $$
begin
  if to_regprocedure(
       'public.guardar_orden_v9381(bigint,bigint,jsonb,jsonb,boolean,text,text)'
     ) is null then
    raise exception 'Falta SQL 39: no existe guardar_orden_v9381.';
  end if;
  if to_regclass('public.orden_transiciones_v9382') is null
     or to_regprocedure(
       'public.tomar_orden_v9397(bigint,text,bigint,text,text)'
     ) is null then
    raise exception 'Faltan las protecciones de los SQL 40, 50, 52 o 53.';
  end if;
end $$;

alter table public.llamadas
  add column if not exists idempotencia_orden_v940r3 uuid;

create unique index if not exists uq_llamadas_idempotencia_orden_v940r3
  on public.llamadas(idempotencia_orden_v940r3)
  where idempotencia_orden_v940r3 is not null;

-- El trigger histórico creaba la orden antes de conocer sus artículos.
drop trigger if exists zz_trg_orden_desde_llamada on public.llamadas;

insert into public.orden_transiciones_v9382(
  estado_anterior,estado_nuevo,modulo,activo
) values(
  'Pedido recibido','Programada','ordenes',true
)
on conflict(estado_anterior,estado_nuevo)
do update set modulo=excluded.modulo,activo=true;

create or replace function public.fn_orden_programacion_flags()
returns trigger
language plpgsql
set search_path=public,pg_temp
as $$
declare
  v_hoy_rd date:=timezone('America/Santo_Domingo',now())::date;
  v_fecha_cambio boolean:=false;
  v_hora_cambio boolean:=false;
  v_programacion_cambio boolean:=false;
  v_futura boolean:=false;
  v_final boolean:=false;
  v_preoperativa boolean:=false;
  v_es_admin boolean:=false;
begin
  if new.fecha_despacho is null then
    new.fecha_despacho:=coalesce(new.fecha,v_hoy_rd);
  end if;

  if tg_op='INSERT' then
    v_fecha_cambio:=true;
    v_hora_cambio:=new.hora_despacho is not null;
    v_preoperativa:=true;
  else
    v_fecha_cambio:=new.fecha_despacho is distinct from old.fecha_despacho;
    v_hora_cambio:=new.hora_despacho is distinct from old.hora_despacho;
    v_preoperativa:=old.estado in('Programada','Pedido recibido');
    v_es_admin:=public.es_admin_operativo();
  end if;

  v_programacion_cambio:=v_fecha_cambio or v_hora_cambio;
  v_futura:=new.fecha_despacho>v_hoy_rd;
  v_final:=coalesce(new.estado,'') in(
    'Anulado','Cerrado','Cobrado','Entregado a crédito','No entregado',
    'Devuelto parcial','Entregada en negocio'
  );

  if tg_op='INSERT' then
    new.es_programada:=v_futura;
    if v_futura and not v_final then
      new.estado:='Programada';
      new.fecha_programacion:=coalesce(new.fecha_programacion,now());
    elsif new.estado='Programada' then
      new.estado:='Pedido recibido';
    end if;
    return new;
  end if;

  if v_programacion_cambio then
    if not v_preoperativa then
      if not v_es_admin then
        raise exception
          'La fecha de una orden procesada está protegida. Solicita una corrección administrativa.';
      end if;
      if v_futura then
        raise exception
          'Una orden procesada no puede reprogramarse a una fecha futura.';
      end if;
      new.es_programada:=false;
      return new;
    end if;

    new.es_programada:=v_futura;
    if v_futura and not v_final then
      new.estado:='Programada';
      new.fecha_programacion:=coalesce(new.fecha_programacion,now());
      new.programada_por:=coalesce(new.programada_por,auth.uid());
    elsif not v_futura and new.estado='Programada' then
      new.estado:='Pedido recibido';
    end if;
    return new;
  end if;

  new.es_programada:=v_futura;
  if v_futura and not v_final and new.estado<>'Programada' then
    raise exception
      'La orden está programada para %. Podrá tomarse cuando llegue esa fecha.',
      new.fecha_despacho;
  end if;
  if not v_futura and new.estado='Programada' then
    new.estado:='Pedido recibido';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_orden_programacion_flags on public.ordenes;
create trigger trg_orden_programacion_flags
before insert or update of fecha_despacho,hora_despacho,estado
on public.ordenes
for each row
execute function public.fn_orden_programacion_flags();

create or replace function public.fn_registrar_reprogramacion_v940r3()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  insert into public.orden_estados_historial(
    orden_id,estado_anterior,estado_nuevo,comentario,usuario
  ) values(
    new.id,old.estado,new.estado,
    format(
      'Programación actualizada: %s %s -> %s %s%s',
      coalesce(old.fecha_despacho::text,'sin fecha'),
      coalesce(to_char(old.hora_despacho,'HH24:MI'),''),
      coalesce(new.fecha_despacho::text,'sin fecha'),
      coalesce(to_char(new.hora_despacho,'HH24:MI'),''),
      case when old.estado not in('Programada','Pedido recibido')
        then ' · corrección administrativa' else '' end
    ),
    auth.uid()
  );
  return new;
end;
$$;

drop trigger if exists trg_pc_historial_reprogramacion_v940r3
  on public.ordenes;
create trigger trg_pc_historial_reprogramacion_v940r3
after update of fecha_despacho,hora_despacho
on public.ordenes
for each row
when(
  old.fecha_despacho is distinct from new.fecha_despacho
  or old.hora_despacho is distinct from new.hora_despacho
)
execute function public.fn_registrar_reprogramacion_v940r3();

create or replace function public.pc_validar_orden_con_detalle_v940r3()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if exists(
       select 1 from public.ordenes o
       where o.id=new.id
         and coalesce(o.archivada,false)=false
         and o.estado<>'Anulado'
     )
     and not exists(
       select 1 from public.orden_detalle d where d.orden_id=new.id
     ) then
    raise exception
      'La orden debe contener al menos un artículo. La operación fue revertida.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_pc_orden_con_detalle_v940r3 on public.ordenes;
create constraint trigger trg_pc_orden_con_detalle_v940r3
after insert on public.ordenes
deferrable initially deferred
for each row
execute function public.pc_validar_orden_con_detalle_v940r3();

create or replace function public.guardar_orden_desde_llamada_v940r3(
  p_llamada jsonb,
  p_orden jsonb,
  p_items jsonb,
  p_llamada_observacion text default null
) returns table(id bigint,codigo text,estado text)
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_uid uuid:=auth.uid();
  v_hoy_rd date:=timezone('America/Santo_Domingo',now())::date;
  v_token uuid;
  v_cliente_id bigint;
  v_llamada_id bigint;
  v_orden_id bigint;
begin
  if v_uid is null then raise exception 'Sesión no válida.'; end if;
  if jsonb_typeof(p_llamada)<>'object' then
    raise exception 'La gestión de llamada no es válida.';
  end if;
  if jsonb_typeof(p_orden)<>'object' then
    raise exception 'El encabezado de orden no es válido.';
  end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then
    raise exception 'La orden debe contener al menos un artículo.';
  end if;

  begin
    v_token:=nullif(p_llamada->>'idempotencia_token','')::uuid;
  exception when invalid_text_representation then
    raise exception 'El identificador de la operación no es válido.';
  end;
  if v_token is null then
    raise exception 'Falta el identificador seguro de la operación.';
  end if;

  v_cliente_id:=nullif(p_llamada->>'cliente_id','')::bigint;
  if v_cliente_id is null then
    raise exception 'Selecciona el cliente de la gestión.';
  end if;
  if not exists(select 1 from public.clientes c where c.id=v_cliente_id) then
    raise exception 'El cliente seleccionado ya no existe.';
  end if;
  if nullif(p_orden->>'cliente_id','')::bigint
     is distinct from v_cliente_id then
    raise exception 'La gestión y la orden deben pertenecer al mismo cliente.';
  end if;

  insert into public.llamadas(
    cliente_id,fecha,hora,vendedor,resultado,monto,proximo_contacto,
    observacion,idempotencia_orden_v940r3
  ) values(
    v_cliente_id,
    coalesce(nullif(p_llamada->>'fecha','')::date,v_hoy_rd),
    coalesce(
      nullif(p_llamada->>'hora','')::time,
      timezone('America/Santo_Domingo',now())::time
    ),
    nullif(btrim(p_llamada->>'vendedor'),''),
    'Pidió',
    coalesce(nullif(p_llamada->>'monto','')::numeric,0),
    nullif(p_llamada->>'proximo_contacto','')::date,
    nullif(btrim(p_llamada->>'observacion'),''),
    v_token
  )
  on conflict(idempotencia_orden_v940r3)
    where idempotencia_orden_v940r3 is not null
  do update
    set idempotencia_orden_v940r3=excluded.idempotencia_orden_v940r3
  returning llamadas.id into v_llamada_id;

  select o.id into v_orden_id
  from public.ordenes o
  where o.llamada_id=v_llamada_id
    and exists(
      select 1 from public.orden_detalle d where d.orden_id=o.id
    )
  for update;

  if v_orden_id is not null then
    return query
    select o.id,o.codigo,o.estado
    from public.ordenes o where o.id=v_orden_id;
    return;
  end if;

  return query
  select *
  from public.guardar_orden_v9381(
    null,v_llamada_id,p_orden,p_items,false,null,p_llamada_observacion
  );
end;
$$;

revoke all on function public.guardar_orden_desde_llamada_v940r3(
  jsonb,jsonb,jsonb,text
) from public,anon,authenticated;
grant execute on function public.guardar_orden_desde_llamada_v940r3(
  jsonb,jsonb,jsonb,text
) to authenticated;

comment on function public.guardar_orden_desde_llamada_v940r3 is
  'V9.4.0 R3: guarda gestión Pidió, orden y artículos de forma atómica e idempotente.';
comment on function public.fn_orden_programacion_flags is
  'V9.4.0 R3: programa solo órdenes preoperativas y protege fechas procesadas.';
comment on function public.pc_validar_orden_con_detalle_v940r3 is
  'V9.4.0 R3: impide confirmar una orden nueva normal sin artículos.';

notify pgrst,'reload schema';
commit;

select
  to_regprocedure(
    'public.guardar_orden_desde_llamada_v940r3(jsonb,jsonb,jsonb,text)'
  ) is not null as guardado_atomico_activo,
  not exists(
    select 1 from pg_trigger
    where tgrelid='public.llamadas'::regclass
      and tgname='zz_trg_orden_desde_llamada'
      and not tgisinternal and tgenabled<>'D'
  ) as orden_preliminar_retirada,
  exists(
    select 1 from public.orden_transiciones_v9382
    where estado_anterior='Pedido recibido'
      and estado_nuevo='Programada' and modulo='ordenes' and activo
  ) as programacion_preoperativa_activa,
  exists(
    select 1 from pg_trigger
    where tgrelid='public.ordenes'::regclass
      and tgname='trg_pc_orden_con_detalle_v940r3'
      and not tgisinternal and tgdeferrable and tgenabled<>'D'
  ) as detalle_obligatorio_activo,
  exists(
    select 1 from pg_trigger
    where tgrelid='public.ordenes'::regclass
      and tgname='trg_pc_historial_reprogramacion_v940r3'
      and not tgisinternal and tgenabled<>'D'
  ) as historial_reprogramacion_activo,
  to_regclass('public.uq_llamadas_idempotencia_orden_v940r3') is not null
    as idempotencia_activa,
  has_function_privilege(
    'authenticated',
    'public.guardar_orden_desde_llamada_v940r3(jsonb,jsonb,jsonb,text)',
    'execute'
  ) as ejecucion_autenticada_activa,
  '9.4.0 R3' as version;

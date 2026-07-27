-- =========================================================
-- 30 - V9.3.7 DELIVERY CONSULTIVO Y LIQUIDACIÓN CENTRALIZADA
-- Productos César CRM
--
-- Incluye:
--   • Limpieza y prevención de liquidaciones duplicadas por lote.
--   • Recepción individual transaccional desde CXC.
--   • Recepción completa de lote transaccional desde CXC.
--   • Cierre automático del lote al recibir el último cliente.
--   • Auditoría administrativa de consolidaciones y cierres.
--
-- Ejecutar completo en Supabase SQL Editor antes del frontend V9.3.7.
-- =========================================================

begin;

create table if not exists public.liquidacion_lote_eventos (
  id bigserial primary key,
  lote_id bigint references public.entrega_lotes(id) on delete set null,
  codigo_lote text,
  liquidacion_id bigint references public.liquidaciones_lotes(id) on delete set null,
  accion text not null,
  motivo text,
  usuario_id uuid references auth.users(id) on delete set null,
  usuario_nombre text,
  metadata jsonb not null default '{}'::jsonb,
  creado_en timestamptz not null default now()
);

create index if not exists idx_liquidacion_lote_eventos_codigo_fecha
on public.liquidacion_lote_eventos(upper(coalesce(codigo_lote,'')), creado_en desc);

alter table public.liquidacion_lote_eventos enable row level security;

drop policy if exists liquidacion_lote_eventos_select_v937 on public.liquidacion_lote_eventos;
create policy liquidacion_lote_eventos_select_v937
on public.liquidacion_lote_eventos for select to authenticated
using (public.puede_modulo_v930r5('liquidacion','ver'));

revoke insert, update, delete on public.liquidacion_lote_eventos from authenticated;
grant select on public.liquidacion_lote_eventos to authenticated;
grant usage, select on sequence public.liquidacion_lote_eventos_id_seq to authenticated;

-- ---------------------------------------------------------
-- 1. LIMPIEZA DEFENSIVA DE DETALLES REPETIDOS
-- ---------------------------------------------------------

delete from public.entrega_lote_detalle a
using public.entrega_lote_detalle b
where a.id > b.id
  and a.lote_id is not null
  and a.orden_id is not null
  and a.lote_id = b.lote_id
  and a.orden_id = b.orden_id;

delete from public.liquidacion_lote_detalle a
using public.liquidacion_lote_detalle b
where a.id > b.id
  and a.liquidacion_id = b.liquidacion_id
  and a.orden_id is not null
  and a.orden_id = b.orden_id;

-- ---------------------------------------------------------
-- 2. NORMALIZAR Y CONSOLIDAR LIQUIDACIONES HISTÓRICAS DUPLICADAS
-- ---------------------------------------------------------

-- Cuando existe lote_id, el código formal del lote es la fuente canónica.
-- Esto permite consolidar incluso filas duplicadas con códigos escritos de forma distinta.
update public.liquidaciones_lotes liq
set codigo_lote = lot.codigo_lote,
    delivery_nombre = coalesce(nullif(trim(liq.delivery_nombre),''), lot.delivery_nombre)
from public.entrega_lotes lot
where liq.lote_id = lot.id
  and (upper(trim(coalesce(liq.codigo_lote,''))) is distinct from upper(trim(lot.codigo_lote))
       or nullif(trim(liq.delivery_nombre),'') is null);

do $$
declare
  r record;
  v_dup_ids bigint[];
  v_total numeric(14,2);
  v_cash numeric(14,2);
  v_credit numeric(14,2);
  v_no_delivered numeric(14,2);
  v_count integer;
begin
  for r in
    select upper(trim(codigo_lote)) as codigo_normalizado,
           min(id) as keep_id,
           array_agg(id order by id) as all_ids,
           count(*) as duplicate_count
    from public.liquidaciones_lotes
    where nullif(trim(codigo_lote),'') is not null
      and upper(trim(codigo_lote)) <> 'SIN-LOTE'
    group by upper(trim(codigo_lote))
    having count(*) > 1
  loop
    v_dup_ids := array_remove(r.all_ids, r.keep_id);

    insert into public.liquidacion_lote_detalle (
      liquidacion_id, orden_id, cliente_id, codigo_orden, cliente_nombre,
      factura_no, resultado_entrega, total_factura, monto_cobrado,
      monto_credito, monto_no_entregado, observacion, creado_en
    )
    select distinct on (coalesce(d.orden_id::text, nullif(trim(d.codigo_orden),''), d.id::text))
      r.keep_id, d.orden_id, d.cliente_id, d.codigo_orden, d.cliente_nombre,
      d.factura_no, d.resultado_entrega, d.total_factura, d.monto_cobrado,
      d.monto_credito, d.monto_no_entregado, d.observacion, d.creado_en
    from public.liquidacion_lote_detalle d
    where d.liquidacion_id = any(r.all_ids)
      and not exists (
        select 1
        from public.liquidacion_lote_detalle k
        where k.liquidacion_id = r.keep_id
          and (
            (d.orden_id is not null and k.orden_id = d.orden_id)
            or (
              d.orden_id is null
              and nullif(trim(d.codigo_orden),'') is not null
              and upper(trim(k.codigo_orden)) = upper(trim(d.codigo_orden))
            )
          )
      )
    order by coalesce(d.orden_id::text, nullif(trim(d.codigo_orden),''), d.id::text), d.id desc;

    delete from public.liquidacion_lote_detalle
    where liquidacion_id = any(v_dup_ids);

    delete from public.liquidaciones_lotes
    where id = any(v_dup_ids);

    select
      coalesce(sum(total_factura),0),
      coalesce(sum(monto_cobrado),0),
      coalesce(sum(monto_credito),0),
      coalesce(sum(monto_no_entregado),0),
      count(*)
    into v_total, v_cash, v_credit, v_no_delivered, v_count
    from public.liquidacion_lote_detalle
    where liquidacion_id = r.keep_id;

    update public.liquidaciones_lotes
    set total_facturado = v_total,
        efectivo_reportado = v_cash,
        efectivo_recibido = v_cash,
        credito_pendiente = v_credit,
        no_entregado = v_no_delivered,
        diferencia = 0,
        observacion = concat_ws(' | ', nullif(trim(observacion),''),
          'V9.3.7: se consolidaron ' || r.duplicate_count || ' liquidaciones duplicadas.'),
        estado = 'Cerrado'
    where id = r.keep_id;

    insert into public.liquidacion_lote_eventos(
      lote_id, codigo_lote, liquidacion_id, accion, motivo, usuario_nombre, metadata
    )
    select lote_id, codigo_lote, id, 'consolidacion_automatica',
           'Migración V9.3.7: liquidaciones históricas duplicadas.',
           'Migración SQL 30',
           jsonb_build_object('cantidad_original',r.duplicate_count,'ids_eliminados',v_dup_ids,'ordenes_consolidadas',v_count)
    from public.liquidaciones_lotes
    where id = r.keep_id;
  end loop;
end $$;

-- ---------------------------------------------------------
-- 3. UNICIDAD: UN LOTE = UNA LIQUIDACIÓN
-- ---------------------------------------------------------

create unique index if not exists uq_entrega_lote_detalle_lote_orden_v937
on public.entrega_lote_detalle(lote_id, orden_id)
where lote_id is not null and orden_id is not null;

create unique index if not exists uq_liquidacion_lote_detalle_liq_orden_v937
on public.liquidacion_lote_detalle(liquidacion_id, orden_id)
where orden_id is not null;

create unique index if not exists uq_liquidaciones_lotes_lote_v937
on public.liquidaciones_lotes(lote_id)
where lote_id is not null;

create unique index if not exists uq_liquidaciones_lotes_codigo_v937
on public.liquidaciones_lotes(upper(trim(codigo_lote)))
where nullif(trim(codigo_lote),'') is not null
  and upper(trim(codigo_lote)) <> 'SIN-LOTE';

-- ---------------------------------------------------------
-- 4. CIERRE FORMAL ÚNICO DEL LOTE
-- ---------------------------------------------------------

create or replace function public.pc_finalizar_lote_cxc_v937(
  p_lote_id bigint,
  p_recibido_por text,
  p_observacion text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lote public.entrega_lotes%rowtype;
  v_pending integer := 0;
  v_total_orders integer := 0;
  v_total numeric(14,2) := 0;
  v_cash numeric(14,2) := 0;
  v_credit numeric(14,2) := 0;
  v_no_delivered numeric(14,2) := 0;
  v_liquidacion_id bigint;
  v_now timestamptz := now();
begin
  select * into v_lote
  from public.entrega_lotes
  where id = p_lote_id
  for update;

  if not found then
    raise exception 'No se encontró el lote.';
  end if;

  select count(*),
         count(*) filter (where o.id is null or o.recibido_en is null)
  into v_total_orders, v_pending
  from public.entrega_lote_detalle d
  left join public.ordenes o on o.id = d.orden_id
  where d.lote_id = v_lote.id;

  if v_total_orders = 0 then
    raise exception 'El lote no tiene órdenes formales vinculadas.';
  end if;

  if v_pending > 0 then
    update public.entrega_lotes
    set estado = 'Recibido parcial'
    where id = v_lote.id
      and lower(coalesce(estado,'')) <> 'revertido';

    return jsonb_build_object(
      'ok', true,
      'lote_cerrado', false,
      'lote_id', v_lote.id,
      'codigo_lote', v_lote.codigo_lote,
      'pendientes', v_pending,
      'total_ordenes', v_total_orders
    );
  end if;

  select
    coalesce(sum(coalesce(o.total_factura,o.total_estimado,0)),0),
    coalesce(sum(coalesce(o.monto_cobrado,0)),0),
    coalesce(sum(case when coalesce(o.resultado_entrega,o.estado) = 'Entregado a crédito' then coalesce(o.monto_pendiente,0) else 0 end),0),
    coalesce(sum(case
      when coalesce(o.resultado_entrega,o.estado) = 'No entregado' then coalesce(o.total_factura,o.total_estimado,0)
      when coalesce(o.resultado_entrega,o.estado) = 'Devuelto parcial' then coalesce(o.monto_pendiente,0)
      else 0 end),0)
  into v_total, v_cash, v_credit, v_no_delivered
  from public.entrega_lote_detalle d
  join public.ordenes o on o.id = d.orden_id
  where d.lote_id = v_lote.id;

  select id into v_liquidacion_id
  from public.liquidaciones_lotes
  where lote_id = v_lote.id
     or upper(trim(codigo_lote)) = upper(trim(v_lote.codigo_lote))
  order by id
  limit 1
  for update;

  if v_liquidacion_id is null then
    insert into public.liquidaciones_lotes(
      lote_id, codigo_lote, delivery_nombre, fecha_liquidacion,
      total_facturado, efectivo_reportado, efectivo_recibido,
      credito_pendiente, no_entregado, diferencia, recibido_por,
      observacion, estado, creado_por
    ) values (
      v_lote.id, v_lote.codigo_lote, v_lote.delivery_nombre, v_now,
      v_total, v_cash, v_cash, v_credit, v_no_delivered, 0,
      nullif(trim(p_recibido_por),''), nullif(trim(p_observacion),''),
      'Cerrado', auth.uid()
    ) returning id into v_liquidacion_id;
  else
    update public.liquidaciones_lotes
    set lote_id = v_lote.id,
        codigo_lote = v_lote.codigo_lote,
        delivery_nombre = v_lote.delivery_nombre,
        fecha_liquidacion = v_now,
        total_facturado = v_total,
        efectivo_reportado = v_cash,
        efectivo_recibido = v_cash,
        credito_pendiente = v_credit,
        no_entregado = v_no_delivered,
        diferencia = 0,
        recibido_por = coalesce(nullif(trim(p_recibido_por),''), recibido_por),
        observacion = concat_ws(' | ', nullif(trim(observacion),''), nullif(trim(p_observacion),'')),
        estado = 'Cerrado'
    where id = v_liquidacion_id;
  end if;

  insert into public.liquidacion_lote_detalle(
    liquidacion_id, orden_id, cliente_id, codigo_orden, cliente_nombre,
    factura_no, resultado_entrega, total_factura, monto_cobrado,
    monto_credito, monto_no_entregado, observacion
  )
  select
    v_liquidacion_id, o.id, o.cliente_id, o.codigo,
    coalesce(nullif(trim(o.cliente_nombre_orden),''), nullif(trim(c.negocio),''), 'Cliente'),
    o.factura_no, coalesce(o.resultado_entrega,o.estado),
    coalesce(o.total_factura,o.total_estimado,0), coalesce(o.monto_cobrado,0),
    case when coalesce(o.resultado_entrega,o.estado) = 'Entregado a crédito' then coalesce(o.monto_pendiente,0) else 0 end,
    case
      when coalesce(o.resultado_entrega,o.estado) = 'No entregado' then coalesce(o.total_factura,o.total_estimado,0)
      when coalesce(o.resultado_entrega,o.estado) = 'Devuelto parcial' then coalesce(o.monto_pendiente,0)
      else 0 end,
    o.notas_liquidacion
  from public.entrega_lote_detalle d
  join public.ordenes o on o.id = d.orden_id
  left join public.clientes c on c.id = o.cliente_id
  where d.lote_id = v_lote.id
  on conflict (liquidacion_id, orden_id) where orden_id is not null
  do update set
    cliente_id = excluded.cliente_id,
    codigo_orden = excluded.codigo_orden,
    cliente_nombre = excluded.cliente_nombre,
    factura_no = excluded.factura_no,
    resultado_entrega = excluded.resultado_entrega,
    total_factura = excluded.total_factura,
    monto_cobrado = excluded.monto_cobrado,
    monto_credito = excluded.monto_credito,
    monto_no_entregado = excluded.monto_no_entregado,
    observacion = excluded.observacion;

  update public.entrega_lote_detalle d
  set estado_liquidacion = 'Recibido',
      resultado_entrega = coalesce(o.resultado_entrega,o.estado),
      monto_cobrado = coalesce(o.monto_cobrado,0),
      monto_credito = case when coalesce(o.resultado_entrega,o.estado) = 'Entregado a crédito' then coalesce(o.monto_pendiente,0) else 0 end,
      observacion = o.notas_liquidacion
  from public.ordenes o
  where d.lote_id = v_lote.id
    and o.id = d.orden_id;

  update public.entrega_lotes
  set estado = 'Cerrado'
  where id = v_lote.id;

  insert into public.liquidacion_lote_eventos(
    lote_id, codigo_lote, liquidacion_id, accion, motivo,
    usuario_id, usuario_nombre, metadata
  ) values (
    v_lote.id, v_lote.codigo_lote, v_liquidacion_id,
    'lote_cerrado', nullif(trim(p_observacion),''), auth.uid(),
    nullif(trim(p_recibido_por),''),
    jsonb_build_object('ordenes',v_total_orders,'total_facturado',v_total,'efectivo',v_cash,'credito',v_credit,'no_entregado',v_no_delivered)
  );

  return jsonb_build_object(
    'ok', true,
    'lote_cerrado', true,
    'lote_id', v_lote.id,
    'codigo_lote', v_lote.codigo_lote,
    'liquidacion_id', v_liquidacion_id,
    'pendientes', 0,
    'total_ordenes', v_total_orders
  );
end;
$$;

-- ---------------------------------------------------------
-- 5. RECEPCIÓN INDIVIDUAL DESDE CXC
-- ---------------------------------------------------------

create or replace function public.recibir_orden_cxc_v937(
  p_orden_id bigint,
  p_resultado text,
  p_monto_recibido numeric,
  p_metodo text,
  p_recibido_por text,
  p_observacion text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_orden public.ordenes%rowtype;
  v_lote public.entrega_lotes%rowtype;
  v_total numeric(14,2);
  v_cash numeric(14,2);
  v_credit numeric(14,2);
  v_result text;
  v_now timestamptz := now();
  v_final jsonb;
begin
  if not public.puede_modulo_v930r5('liquidacion','editar') then
    raise exception 'No tienes permiso para recibir liquidaciones.';
  end if;

  select * into v_orden
  from public.ordenes
  where id = p_orden_id
  for update;

  if not found then raise exception 'No se encontró la orden.'; end if;
  if v_orden.recibido_en is not null then raise exception 'Esta orden ya fue recibida por CXC.'; end if;
  if coalesce(v_orden.modalidad_entrega,'Delivery') <> 'Delivery' then
    raise exception 'Esta orden no pertenece a un viaje de delivery.';
  end if;

  select l.* into v_lote
  from public.entrega_lote_detalle d
  join public.entrega_lotes l on l.id = d.lote_id
  where d.orden_id = v_orden.id
    and lower(coalesce(l.estado,'')) <> 'revertido'
  order by l.id desc
  limit 1
  for update of l;

  if not found then raise exception 'La orden no tiene un lote de delivery activo.'; end if;
  if lower(coalesce(v_lote.estado,'')) = 'cerrado' then raise exception 'El lote ya está cerrado.'; end if;

  v_total := coalesce(v_orden.total_factura,v_orden.total_estimado,0);
  if v_total <= 0 then raise exception 'La factura debe ser mayor que cero.'; end if;

  v_result := trim(coalesce(p_resultado,''));
  if v_result not in ('Cobrado','Entregado a crédito','No entregado','Devuelto parcial') then
    raise exception 'Resultado de recepción inválido.';
  end if;

  v_cash := round(coalesce(p_monto_recibido,0),2);
  if v_cash < 0 then raise exception 'El monto recibido no puede ser negativo.'; end if;
  if v_cash > v_total + 0.01 then raise exception 'El monto recibido no puede superar la factura.'; end if;

  if v_result = 'Cobrado' and abs(v_cash-v_total) > 0.01 then
    raise exception 'Para marcar Cobrado debe recibirse el total de la factura.';
  elsif v_result = 'Entregado a crédito' and v_cash >= v_total - 0.01 then
    raise exception 'Si recibió el total, seleccione Cobrado.';
  elsif v_result = 'No entregado' and v_cash > 0.01 then
    raise exception 'Una orden no entregada no puede registrar efectivo.';
  end if;

  if v_result in ('Entregado a crédito','Devuelto parcial') then
    -- monto_pendiente conserva el saldo no recibido; el cierre formal clasifica
    -- Entregado a crédito como crédito y Devuelto parcial como no entregado/devuelto.
    v_credit := greatest(v_total-v_cash,0);
  else
    v_credit := 0;
  end if;

  if v_cash > 0.01 then
    insert into public.orden_pagos(orden_id,cliente_id,monto,metodo,recibido_por)
    values(v_orden.id,v_orden.cliente_id,v_cash,coalesce(nullif(trim(p_metodo),''),'Efectivo'),auth.uid());
  end if;

  insert into public.orden_entregas(
    orden_id, resultado, monto_cobrado, monto_pendiente, notas, creado_por
  ) values (
    v_orden.id, v_result, v_cash, v_credit,
    concat_ws(' | ', nullif(trim(p_observacion),''), 'Recepción centralizada V9.3.7 por CXC.'),
    auth.uid()
  );

  update public.ordenes
  set estado = v_result,
      resultado_entrega = v_result,
      monto_cobrado = v_cash,
      monto_pendiente = v_credit,
      recibido_por = nullif(trim(p_recibido_por),''),
      recibido_en = v_now,
      notas_liquidacion = concat_ws(' | ', nullif(trim(notas_liquidacion),''), nullif(trim(p_observacion),''),
        'V9.3.7: recibido por CXC. Resultado: ' || v_result || '. Efectivo: ' || v_cash || '. Pendiente: ' || v_credit || '.')
  where id = v_orden.id;

  update public.entrega_lote_detalle
  set estado_liquidacion = 'Recibido',
      resultado_entrega = v_result,
      monto_cobrado = v_cash,
      monto_credito = case when v_result='Entregado a crédito' then v_credit else 0 end,
      observacion = concat_ws(' | ', nullif(trim(observacion),''), nullif(trim(p_observacion),''))
  where lote_id = v_lote.id
    and orden_id = v_orden.id;

  insert into public.orden_estados_historial(
    orden_id, estado_anterior, estado_nuevo, comentario, usuario
  ) values (
    v_orden.id, v_orden.estado, v_result,
    'Liquidación centralizada V9.3.7. Lote ' || v_lote.codigo_lote || '. Recibido por ' || coalesce(nullif(trim(p_recibido_por),''),'CXC') || '.',
    auth.uid()
  );

  v_final := public.pc_finalizar_lote_cxc_v937(v_lote.id,p_recibido_por,p_observacion);

  return v_final || jsonb_build_object(
    'orden_id', v_orden.id,
    'resultado', v_result,
    'monto_recibido', v_cash,
    'monto_pendiente', v_credit
  );
end;
$$;

-- ---------------------------------------------------------
-- 6. RECEPCIÓN COMPLETA DE LOTE EN UNA SOLA TRANSACCIÓN
-- ---------------------------------------------------------

create or replace function public.recibir_lote_cxc_v937(
  p_lote_id bigint,
  p_items jsonb,
  p_recibido_por text,
  p_observacion text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lote public.entrega_lotes%rowtype;
  v_item jsonb;
  v_missing integer;
  v_invalid integer;
  v_result jsonb;
begin
  if not public.puede_modulo_v930r5('liquidacion','editar') then
    raise exception 'No tienes permiso para recibir liquidaciones.';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items)=0 then
    raise exception 'El lote no contiene clientes para recibir.';
  end if;

  select * into v_lote from public.entrega_lotes where id=p_lote_id for update;
  if not found then raise exception 'No se encontró el lote.'; end if;
  if lower(coalesce(v_lote.estado,'')) in ('cerrado','revertido') then
    raise exception 'El lote está % y no puede recibirse.', v_lote.estado;
  end if;

  select count(*) into v_invalid
  from jsonb_array_elements(p_items) j
  where nullif(j->>'orden_id','') is null
     or not exists (
       select 1
       from public.entrega_lote_detalle d
       join public.ordenes o on o.id=d.orden_id
       where d.lote_id=v_lote.id
         and d.orden_id=(j->>'orden_id')::bigint
         and o.recibido_en is null
     );

  if v_invalid>0 then
    raise exception 'La recepción contiene % cliente(s) que no pertenecen a este lote o ya fueron recibidos.', v_invalid;
  end if;

  if (select count(*) from jsonb_array_elements(p_items)) <>
     (select count(distinct (j->>'orden_id')) from jsonb_array_elements(p_items) j) then
    raise exception 'La recepción contiene una orden repetida dentro del mismo lote.';
  end if;

  select count(*) into v_missing
  from public.entrega_lote_detalle d
  join public.ordenes o on o.id=d.orden_id
  where d.lote_id=v_lote.id
    and o.recibido_en is null
    and not exists (
      select 1 from jsonb_array_elements(p_items) j
      where (j->>'orden_id')::bigint=o.id
    );

  if v_missing>0 then
    raise exception 'Faltan % cliente(s) pendientes dentro de la recepción del lote.', v_missing;
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_result := public.recibir_orden_cxc_v937(
      (v_item->>'orden_id')::bigint,
      v_item->>'resultado',
      coalesce(nullif(v_item->>'monto_recibido','')::numeric,0),
      coalesce(v_item->>'metodo','Efectivo'),
      p_recibido_por,
      concat_ws(' | ', nullif(trim(v_item->>'observacion'),''), nullif(trim(p_observacion),''))
    );
  end loop;

  -- La última recepción individual ya ejecuta el cierre formal cuando corresponde.
  -- Devolver ese resultado evita duplicar eventos de cierre o recalcular el lote dos veces.
  return coalesce(v_result, jsonb_build_object('ok',false,'mensaje','No se procesaron clientes.'));
end;
$$;

-- ---------------------------------------------------------
-- 7. CONSOLIDACIÓN ADMINISTRATIVA MANUAL
-- ---------------------------------------------------------

create or replace function public.consolidar_liquidaciones_duplicadas_v937(
  p_codigo_lote text,
  p_motivo text default null,
  p_usuario_nombre text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := upper(trim(coalesce(p_codigo_lote,'')));
  v_keep_id bigint;
  v_ids bigint[];
  v_dup_ids bigint[];
  v_count integer;
  v_total numeric(14,2);
  v_cash numeric(14,2);
  v_credit numeric(14,2);
  v_no_delivered numeric(14,2);
begin
  if not public.puede_modulo_v930r5('liquidacion','editar') then
    raise exception 'No tienes permiso para consolidar liquidaciones.';
  end if;
  if v_code='' or v_code='SIN-LOTE' then raise exception 'Código de lote inválido.'; end if;
  if length(trim(coalesce(p_motivo,'')))<5 then raise exception 'Escribe un motivo de al menos 5 caracteres.'; end if;

  select min(id), array_agg(id order by id), count(*)
  into v_keep_id, v_ids, v_count
  from public.liquidaciones_lotes
  where upper(trim(codigo_lote))=v_code;

  if coalesce(v_count,0)<=1 then
    return jsonb_build_object('ok',true,'codigo_lote',v_code,'duplicados_eliminados',0,'mensaje','El lote ya tiene una sola liquidación.');
  end if;

  v_dup_ids:=array_remove(v_ids,v_keep_id);

  insert into public.liquidacion_lote_detalle(
    liquidacion_id, orden_id, cliente_id, codigo_orden, cliente_nombre,
    factura_no, resultado_entrega, total_factura, monto_cobrado,
    monto_credito, monto_no_entregado, observacion, creado_en
  )
  select distinct on (coalesce(d.orden_id::text, nullif(trim(d.codigo_orden),''), d.id::text))
    v_keep_id, d.orden_id, d.cliente_id, d.codigo_orden, d.cliente_nombre,
    d.factura_no, d.resultado_entrega, d.total_factura, d.monto_cobrado,
    d.monto_credito, d.monto_no_entregado, d.observacion, d.creado_en
  from public.liquidacion_lote_detalle d
  where d.liquidacion_id=any(v_ids)
  on conflict (liquidacion_id, orden_id) where orden_id is not null do nothing;

  delete from public.liquidacion_lote_detalle where liquidacion_id=any(v_dup_ids);
  delete from public.liquidaciones_lotes where id=any(v_dup_ids);

  select coalesce(sum(total_factura),0),coalesce(sum(monto_cobrado),0),
         coalesce(sum(monto_credito),0),coalesce(sum(monto_no_entregado),0)
  into v_total,v_cash,v_credit,v_no_delivered
  from public.liquidacion_lote_detalle where liquidacion_id=v_keep_id;

  update public.liquidaciones_lotes
  set total_facturado=v_total,efectivo_reportado=v_cash,efectivo_recibido=v_cash,
      credito_pendiente=v_credit,no_entregado=v_no_delivered,diferencia=0,
      observacion=concat_ws(' | ',nullif(trim(observacion),''),trim(p_motivo))
  where id=v_keep_id;

  insert into public.liquidacion_lote_eventos(
    lote_id,codigo_lote,liquidacion_id,accion,motivo,usuario_id,usuario_nombre,metadata
  )
  select lote_id,codigo_lote,id,'consolidacion_manual',trim(p_motivo),auth.uid(),
         coalesce(nullif(trim(p_usuario_nombre),''),'Usuario'),
         jsonb_build_object('ids_eliminados',v_dup_ids,'cantidad_original',v_count)
  from public.liquidaciones_lotes where id=v_keep_id;

  return jsonb_build_object('ok',true,'codigo_lote',v_code,'liquidacion_id',v_keep_id,'duplicados_eliminados',array_length(v_dup_ids,1));
end;
$$;

revoke execute on function public.recibir_orden_cxc_v937(bigint,text,numeric,text,text,text) from public;
revoke execute on function public.recibir_lote_cxc_v937(bigint,jsonb,text,text) from public;
revoke execute on function public.consolidar_liquidaciones_duplicadas_v937(text,text,text) from public;
revoke execute on function public.pc_finalizar_lote_cxc_v937(bigint,text,text) from public;

grant execute on function public.recibir_orden_cxc_v937(bigint,text,numeric,text,text,text) to authenticated;
grant execute on function public.recibir_lote_cxc_v937(bigint,jsonb,text,text) to authenticated;
grant execute on function public.consolidar_liquidaciones_duplicadas_v937(text,text,text) to authenticated;

notify pgrst, 'reload schema';
commit;

select
  to_regclass('public.liquidacion_lote_eventos') is not null as tabla_eventos,
  to_regprocedure('public.recibir_orden_cxc_v937(bigint,text,numeric,text,text,text)') is not null as rpc_recibir_orden,
  to_regprocedure('public.recibir_lote_cxc_v937(bigint,jsonb,text,text)') is not null as rpc_recibir_lote,
  to_regprocedure('public.consolidar_liquidaciones_duplicadas_v937(text,text,text)') is not null as rpc_consolidar,
  exists(select 1 from pg_indexes where schemaname='public' and indexname='uq_liquidaciones_lotes_lote_v937') as unicidad_lote;

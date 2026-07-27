-- =========================================================
-- 31 - V9.3.7.1 RESPONSABLES MANUALES Y TRANSFERENCIA DE PEDIDOS
-- Productos César CRM
--
-- Incluye:
--   • Responsable formal del viaje: delivery, otro empleado o manual/externo.
--   • Creación transaccional de lotes desde Validación.
--   • Inclusión de responsables manuales en Delivery y Liquidación.
--   • Transferencia individual de una orden entre responsables en la calle.
--   • Recálculo automático de lote origen y lote de transferencia.
--   • Auditoría completa y bloqueo de órdenes ya recibidas/liquidadas.
-- =========================================================

begin;

alter table public.entrega_lotes
  add column if not exists responsable_nombre text,
  add column if not exists responsable_tipo text,
  add column if not exists responsable_empleado_id bigint,
  add column if not exists es_transferencia boolean not null default false,
  add column if not exists lote_origen_id bigint references public.entrega_lotes(id) on delete set null,
  add column if not exists codigo_lote_origen text;

update public.entrega_lotes l
set responsable_nombre = coalesce(nullif(trim(l.responsable_nombre),''), nullif(trim(l.delivery_nombre),''), 'Sin responsable')
where nullif(trim(coalesce(l.responsable_nombre,'')),'') is null;

update public.entrega_lotes l
set responsable_empleado_id = e.id
from public.empleados_operativos e
where l.responsable_empleado_id is null
  and lower(trim(e.nombre)) = lower(trim(l.responsable_nombre));

update public.entrega_lotes l
set responsable_tipo = case
  when exists (
    select 1 from public.empleados_operativos e
    where lower(trim(e.nombre))=lower(trim(l.responsable_nombre))
      and e.activo is not false
      and lower(coalesce(e.area,'')) like '%delivery%'
  ) then 'delivery_registrado'
  when exists (
    select 1 from public.empleados_operativos e
    where lower(trim(e.nombre))=lower(trim(l.responsable_nombre))
      and e.activo is not false
  ) then 'otro_empleado'
  else 'manual_externo'
end
where nullif(trim(coalesce(l.responsable_tipo,'')),'') is null;

alter table public.entrega_lotes
  alter column responsable_nombre set default 'Sin responsable',
  alter column responsable_nombre set not null,
  alter column responsable_tipo set default 'delivery_registrado',
  alter column responsable_tipo set not null;

alter table public.entrega_lotes drop constraint if exists entrega_lotes_responsable_tipo_v9371_chk;
alter table public.entrega_lotes
  add constraint entrega_lotes_responsable_tipo_v9371_chk
  check (responsable_tipo in ('delivery_registrado','otro_empleado','manual_externo'));

create index if not exists idx_entrega_lotes_responsable_estado_v9371
on public.entrega_lotes(lower(responsable_nombre), estado, fecha_entrega desc);

create table if not exists public.entrega_pedido_transferencias (
  id bigserial primary key,
  orden_id bigint not null references public.ordenes(id) on delete restrict,
  lote_origen_id bigint not null references public.entrega_lotes(id) on delete restrict,
  lote_destino_id bigint not null references public.entrega_lotes(id) on delete restrict,
  codigo_lote_origen text not null,
  codigo_lote_destino text not null,
  responsable_anterior text not null,
  responsable_nuevo text not null,
  responsable_tipo_nuevo text not null
    check (responsable_tipo_nuevo in ('delivery_registrado','otro_empleado','manual_externo')),
  monto_factura numeric(14,2) not null default 0,
  peso_entregado numeric(12,2) not null default 0,
  motivo text not null check (length(trim(motivo)) >= 5),
  usuario_id uuid references auth.users(id) on delete set null,
  usuario_nombre text,
  metadata jsonb not null default '{}'::jsonb,
  creado_en timestamptz not null default now()
);

create index if not exists idx_entrega_transferencias_orden_fecha_v9371
on public.entrega_pedido_transferencias(orden_id, creado_en desc);
create index if not exists idx_entrega_transferencias_lotes_v9371
on public.entrega_pedido_transferencias(lote_origen_id, lote_destino_id);

alter table public.entrega_pedido_transferencias enable row level security;
drop policy if exists entrega_transferencias_select_v9371 on public.entrega_pedido_transferencias;
create policy entrega_transferencias_select_v9371
on public.entrega_pedido_transferencias for select to authenticated
using (
  public.puede_modulo_v930r5('validacion','ver')
  or public.puede_modulo_v930r5('delivery','ver')
  or public.puede_modulo_v930r5('liquidacion','ver')
);

revoke insert, update, delete on public.entrega_pedido_transferencias from authenticated;
grant select on public.entrega_pedido_transferencias to authenticated;
grant usage, select on sequence public.entrega_pedido_transferencias_id_seq to authenticated;

-- ---------------------------------------------------------
-- CREAR LOTE FORMAL Y TRANSACCIONAL
-- ---------------------------------------------------------
create or replace function public.crear_lote_entrega_v9371(
  p_codigo_lote text,
  p_responsable_nombre text,
  p_responsable_tipo text,
  p_items jsonb,
  p_validado_por text,
  p_snapshot jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := upper(trim(coalesce(p_codigo_lote,'')));
  v_name text := regexp_replace(trim(coalesce(p_responsable_nombre,'')),'[[:space:]]+',' ','g');
  v_type text := trim(coalesce(p_responsable_tipo,''));
  v_lote_id bigint;
  v_employee_id bigint;
  v_count integer;
  v_invalid integer;
  v_now timestamptz := now();
begin
  if not public.puede_modulo_v930r5('validacion','editar') then
    raise exception 'No tienes permiso para crear lotes de entrega.';
  end if;
  if v_code='' then raise exception 'Código de lote inválido.'; end if;
  if v_name='' then raise exception 'Es obligatorio identificar al responsable del viaje.'; end if;
  if v_type not in ('delivery_registrado','otro_empleado','manual_externo') then
    raise exception 'Tipo de responsable inválido.';
  end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then
    raise exception 'Selecciona al menos una orden para el lote.';
  end if;
  if exists(select 1 from public.entrega_lotes where upper(codigo_lote)=v_code) then
    raise exception 'Ya existe un lote con el código %.',v_code;
  end if;
  if (select count(*) from jsonb_array_elements(p_items)) <>
     (select count(distinct (x->>'orden_id')) from jsonb_array_elements(p_items) x) then
    raise exception 'El lote contiene una orden repetida.';
  end if;

  select count(*) into v_invalid
  from jsonb_array_elements(p_items) x
  left join public.ordenes o on o.id=(x->>'orden_id')::bigint
  where o.id is null
     or o.estado not in ('Facturada','Validada para delivery')
     or coalesce((x->>'monto')::numeric,0)<=0
     or exists (
       select 1 from public.entrega_lote_detalle d
       join public.entrega_lotes l on l.id=d.lote_id
       where d.orden_id=o.id
         and lower(coalesce(l.estado,'')) not in ('revertido','cerrado','transferido totalmente')
     );
  if v_invalid>0 then
    raise exception 'Hay % orden(es) inválidas, sin monto o ya asignadas a otro lote.',v_invalid;
  end if;

  select e.id into v_employee_id
  from public.empleados_operativos e
  where e.activo is not false and lower(trim(e.nombre))=lower(v_name)
  order by e.id limit 1;

  insert into public.entrega_lotes(
    codigo_lote, delivery_nombre, responsable_nombre, responsable_tipo,
    responsable_empleado_id, fecha_entrega, cantidad_ordenes,
    peso_esperado, peso_entregado, total_facturado, estado,
    creado_por, validado_por, hoja_ruta_snapshot
  )
  select
    v_code, v_name, v_name, v_type, v_employee_id, v_now,
    count(*),
    round(sum(coalesce((x->>'peso_esperado')::numeric,0)),2),
    round(sum(coalesce((x->>'peso_entregado')::numeric,0)),2),
    round(sum(coalesce((x->>'monto')::numeric,0)),2),
    'Abierto', auth.uid(), nullif(trim(p_validado_por),''),
    jsonb_set(
      jsonb_set(coalesce(p_snapshot,'{}'::jsonb),'{responsable_nombre}',to_jsonb(v_name),true),
      '{responsable_tipo}',to_jsonb(v_type),true
    )
  from jsonb_array_elements(p_items) x
  returning id into v_lote_id;

  insert into public.entrega_lote_detalle(
    lote_id,codigo_lote,orden_id,cliente_id,codigo_orden,
    cliente_nombre,telefono,sector,direccion,factura_no,
    monto_factura,peso_esperado,peso_entregado,estado_liquidacion
  )
  select
    v_lote_id,v_code,o.id,o.cliente_id,o.codigo,
    coalesce(nullif(trim(o.cliente_nombre_orden),''),c.negocio,'Cliente'),
    coalesce(nullif(trim(o.cliente_telefono_orden),''),c.telefono),
    coalesce(nullif(trim(o.cliente_sector_orden),''),c.sector,o.zona),
    coalesce(nullif(trim(o.zona),''),nullif(trim(o.cliente_sector_orden),''),c.sector),o.factura_no,
    round((x->>'monto')::numeric,2),
    round(coalesce((x->>'peso_esperado')::numeric,0),2),
    round(coalesce((x->>'peso_entregado')::numeric,0),2),'Pendiente'
  from jsonb_array_elements(p_items) x
  join public.ordenes o on o.id=(x->>'orden_id')::bigint
  left join public.clientes c on c.id=o.cliente_id;

  insert into public.orden_pesos(orden_id,tipo,libras,notas,creado_por)
  select o.id,'Entregado a delivery',round((x->>'peso_entregado')::numeric,2),
         concat_ws(' | ','Lote: '||v_code,nullif(trim(x->>'alerta'),'')),auth.uid()
  from jsonb_array_elements(p_items) x
  join public.ordenes o on o.id=(x->>'orden_id')::bigint
  where coalesce((x->>'peso_entregado')::numeric,0)>0;

  insert into public.orden_estados_historial(orden_id,estado_anterior,estado_nuevo,comentario,usuario)
  select o.id,o.estado,'Asignada a delivery',
         'Lote '||v_code||' asignado a '||v_name||' ('||v_type||'). Monto final: '||round((x->>'monto')::numeric,2)||'. Peso final: '||round(coalesce((x->>'peso_entregado')::numeric,0),2)||' lb.',
         auth.uid()
  from jsonb_array_elements(p_items) x
  join public.ordenes o on o.id=(x->>'orden_id')::bigint;

  update public.ordenes o
  set estado='Asignada a delivery',
      total_factura=round((x.item->>'monto')::numeric,2),
      validado_por=nullif(trim(p_validado_por),''),
      peso_validado=nullif(round(coalesce((x.item->>'peso_entregado')::numeric,0),2),0),
      validado_en=v_now,
      delivery_nombre=v_name,
      asignado_delivery_en=v_now,
      notas_validacion=concat_ws(' | ','Lote: '||v_code,nullif(trim(x.item->>'alerta'),''),'Responsable: '||v_name||' ('||v_type||')')
  from (select value as item from jsonb_array_elements(p_items)) x
  where o.id=(x.item->>'orden_id')::bigint;

  select count(*) into v_count from public.entrega_lote_detalle where lote_id=v_lote_id;
  return jsonb_build_object('ok',true,'lote_id',v_lote_id,'codigo_lote',v_code,
    'responsable_nombre',v_name,'responsable_tipo',v_type,'ordenes',v_count);
end;
$$;

-- ---------------------------------------------------------
-- TRANSFERIR UNA ORDEN A OTRO RESPONSABLE
-- ---------------------------------------------------------
create or replace function public.transferir_orden_lote_v9371(
  p_lote_origen_id bigint,
  p_orden_id bigint,
  p_responsable_nuevo text,
  p_responsable_tipo_nuevo text,
  p_motivo text,
  p_usuario_nombre text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source public.entrega_lotes%rowtype;
  v_order public.ordenes%rowtype;
  v_detail public.entrega_lote_detalle%rowtype;
  v_target_id bigint;
  v_target_code text;
  v_name text := regexp_replace(trim(coalesce(p_responsable_nuevo,'')),'[[:space:]]+',' ','g');
  v_type text := trim(coalesce(p_responsable_tipo_nuevo,''));
  v_reason text := trim(coalesce(p_motivo,''));
  v_employee_id bigint;
  v_remaining integer;
  v_user_name text;
  v_now timestamptz := now();
begin
  if not public.puede_modulo_v930r5('validacion','editar') then
    raise exception 'No tienes permiso para transferir pedidos.';
  end if;
  if v_name='' then raise exception 'Selecciona el nuevo responsable.'; end if;
  if v_type not in ('delivery_registrado','otro_empleado','manual_externo') then raise exception 'Tipo de responsable inválido.'; end if;
  if length(v_reason)<5 then raise exception 'El motivo debe tener al menos 5 caracteres.'; end if;

  select * into v_source from public.entrega_lotes where id=p_lote_origen_id for update;
  if not found then raise exception 'No se encontró el lote de origen.'; end if;
  if lower(coalesce(v_source.estado,'')) in ('cerrado','revertido','transferido totalmente') then
    raise exception 'El lote de origen está % y no admite transferencias.',v_source.estado;
  end if;
  if exists(select 1 from public.liquidaciones_lotes where lote_id=v_source.id or upper(codigo_lote)=upper(v_source.codigo_lote)) then
    raise exception 'El lote ya tiene una liquidación formal.';
  end if;

  select * into v_order from public.ordenes where id=p_orden_id for update;
  if not found then raise exception 'No se encontró la orden.'; end if;
  if v_order.recibido_en is not null then raise exception 'La orden ya fue recibida por CXC.'; end if;
  if coalesce(v_order.resultado_entrega,'')<>'' or v_order.estado in ('Cobrado','Entregado a crédito','No entregado','Devuelto parcial','Cerrado','Liquidado') then
    raise exception 'La orden ya tiene un resultado final y no puede transferirse.';
  end if;

  select * into v_detail
  from public.entrega_lote_detalle
  where lote_id=v_source.id and orden_id=v_order.id
  for update;
  if not found then raise exception 'La orden no pertenece al lote indicado.'; end if;
  if lower(trim(v_name))=lower(trim(coalesce(v_source.responsable_nombre,v_source.delivery_nombre))) then
    raise exception 'Selecciona un responsable diferente al actual.';
  end if;

  select e.id into v_employee_id
  from public.empleados_operativos e
  where e.activo is not false and lower(trim(e.nombre))=lower(v_name)
  order by e.id limit 1;

  v_target_code := 'TRF-'||to_char(v_now at time zone 'America/Santo_Domingo','YYMMDD-HH24MISS')||'-'||v_order.id;
  if exists(select 1 from public.entrega_lotes where codigo_lote=v_target_code) then
    v_target_code := v_target_code||'-'||txid_current();
  end if;

  insert into public.entrega_lotes(
    codigo_lote,delivery_nombre,responsable_nombre,responsable_tipo,responsable_empleado_id,
    fecha_entrega,cantidad_ordenes,peso_esperado,peso_entregado,total_facturado,estado,
    creado_por,validado_por,es_transferencia,lote_origen_id,codigo_lote_origen,hoja_ruta_snapshot
  ) values (
    v_target_code,v_name,v_name,v_type,v_employee_id,v_now,1,
    coalesce(v_detail.peso_esperado,0),coalesce(v_detail.peso_entregado,0),coalesce(v_detail.monto_factura,0),'Abierto',
    auth.uid(),coalesce(nullif(trim(p_usuario_nombre),''),v_source.validado_por),true,v_source.id,v_source.codigo_lote,
    jsonb_build_object('version','V9.3.7.1 PWA','codigo_lote',v_target_code,
      'responsable_nombre',v_name,'responsable_tipo',v_type,'es_transferencia',true,
      'codigo_lote_origen',v_source.codigo_lote,'orden_id',v_order.id,'fecha_entrega',v_now)
  ) returning id into v_target_id;

  update public.entrega_lote_detalle
  set lote_id=v_target_id,codigo_lote=v_target_code
  where id=v_detail.id;

  update public.ordenes
  set delivery_nombre=v_name,
      asignado_delivery_en=v_now,
      notas_validacion=concat_ws(' | ',nullif(trim(notas_validacion),''),
        'Transferencia V9.3.7.1: '||v_source.codigo_lote||' → '||v_target_code||'. Nuevo responsable: '||v_name||' ('||v_type||'). Motivo: '||v_reason)
  where id=v_order.id;

  update public.entrega_lotes l
  set cantidad_ordenes=s.cnt,
      peso_esperado=s.peso_esperado,
      peso_entregado=s.peso_entregado,
      total_facturado=s.total_facturado,
      estado=case when s.cnt=0 then 'Transferido totalmente' else l.estado end
  from (
    select count(*)::integer cnt,
           coalesce(round(sum(peso_esperado),2),0) peso_esperado,
           coalesce(round(sum(peso_entregado),2),0) peso_entregado,
           coalesce(round(sum(monto_factura),2),0) total_facturado
    from public.entrega_lote_detalle where lote_id=v_source.id
  ) s
  where l.id=v_source.id;

  select count(*) into v_remaining from public.entrega_lote_detalle where lote_id=v_source.id;

  select coalesce(nullif(trim(p_usuario_nombre),''),nullif(trim(p.nombre),''),'Usuario')
  into v_user_name from public.perfiles p where p.id=auth.uid();
  v_user_name:=coalesce(v_user_name,nullif(trim(p_usuario_nombre),''),'Usuario');

  insert into public.entrega_pedido_transferencias(
    orden_id,lote_origen_id,lote_destino_id,codigo_lote_origen,codigo_lote_destino,
    responsable_anterior,responsable_nuevo,responsable_tipo_nuevo,monto_factura,peso_entregado,
    motivo,usuario_id,usuario_nombre,metadata
  ) values (
    v_order.id,v_source.id,v_target_id,v_source.codigo_lote,v_target_code,
    coalesce(v_source.responsable_nombre,v_source.delivery_nombre),v_name,v_type,
    coalesce(v_detail.monto_factura,0),coalesce(v_detail.peso_entregado,0),v_reason,
    auth.uid(),v_user_name,jsonb_build_object('orden_codigo',v_order.codigo,'clientes_restantes_origen',v_remaining)
  );

  insert into public.orden_estados_historial(orden_id,estado_anterior,estado_nuevo,comentario,usuario)
  values(v_order.id,v_order.estado,v_order.estado,
    'Pedido transferido del lote '||v_source.codigo_lote||' ('||coalesce(v_source.responsable_nombre,v_source.delivery_nombre)||') al lote '||v_target_code||' ('||v_name||'). Motivo: '||v_reason,
    auth.uid());

  return jsonb_build_object('ok',true,'orden_id',v_order.id,'lote_origen_id',v_source.id,
    'lote_destino_id',v_target_id,'codigo_lote_destino',v_target_code,
    'responsable_nuevo',v_name,'responsable_tipo_nuevo',v_type,'restantes_origen',v_remaining);
end;
$$;



-- ---------------------------------------------------------
-- SINCRONIZAR CORRECCIÓN COMPLETA DE UN LOTE V9.3.6
-- Conserva la firma anterior, pero actualiza el responsable formal.
-- ---------------------------------------------------------
create or replace function public.corregir_lote_entrega_v936(
  p_lote_id bigint,
  p_accion text,
  p_nuevo_delivery text default null,
  p_motivo text default null,
  p_usuario_nombre text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lote public.entrega_lotes%rowtype;
  v_order_ids bigint[];
  v_blocked integer := 0;
  v_user_name text;
  v_now timestamptz := now();
  v_new_name text := regexp_replace(trim(coalesce(p_nuevo_delivery,'')),'[[:space:]]+',' ','g');
  v_new_type text;
  v_employee_id bigint;
begin
  if not public.puede_modulo_v930r5('validacion','editar') then
    raise exception 'No tienes permiso para corregir lotes.';
  end if;
  if p_accion not in ('cambiar_delivery','revertir_lote') then
    raise exception 'Acción de corrección inválida.';
  end if;
  if length(trim(coalesce(p_motivo,''))) < 5 then
    raise exception 'El motivo debe tener al menos 5 caracteres.';
  end if;

  select * into v_lote from public.entrega_lotes where id=p_lote_id for update;
  if not found then raise exception 'No se encontró el lote.'; end if;
  if lower(coalesce(v_lote.estado,'Abierto')) <> 'abierto' then
    raise exception 'El lote está % y no puede corregirse.', v_lote.estado;
  end if;
  if exists(select 1 from public.liquidaciones_lotes where lote_id=v_lote.id or upper(codigo_lote)=upper(v_lote.codigo_lote)) then
    raise exception 'El lote ya tiene una liquidación registrada.';
  end if;

  select array_agg(d.orden_id order by d.id) into v_order_ids
  from public.entrega_lote_detalle d
  where d.lote_id=v_lote.id and d.orden_id is not null;
  if coalesce(array_length(v_order_ids,1),0)=0 then
    raise exception 'El lote no tiene órdenes formales vinculadas.';
  end if;

  select count(*) into v_blocked
  from public.ordenes o
  where o.id=any(v_order_ids)
    and (
      o.recibido_en is not null
      or nullif(trim(coalesce(o.resultado_entrega,'')),'') is not null
      or o.estado in ('Cobrado','Entregado a crédito','No entregado','Devuelto parcial','Cerrado','Liquidado')
    );
  if v_blocked>0 then
    raise exception 'El lote ya tiene resultado, cobro o recepción posterior.';
  end if;

  select coalesce(nullif(trim(p_usuario_nombre),''),nullif(trim(p.nombre),''),'Usuario')
  into v_user_name from public.perfiles p where p.id=auth.uid();
  v_user_name:=coalesce(v_user_name,nullif(trim(p_usuario_nombre),''),'Usuario');

  if p_accion='cambiar_delivery' then
    if v_new_name='' then raise exception 'Selecciona el nuevo responsable.'; end if;
    if lower(v_new_name)=lower(trim(coalesce(v_lote.responsable_nombre,v_lote.delivery_nombre,''))) then
      raise exception 'Selecciona un responsable diferente.';
    end if;

    select e.id,
      case when lower(coalesce(e.area,'')) like '%delivery%' then 'delivery_registrado' else 'otro_empleado' end
    into v_employee_id,v_new_type
    from public.empleados_operativos e
    where e.activo is not false and lower(trim(e.nombre))=lower(v_new_name)
    order by e.id limit 1;
    v_new_type:=coalesce(v_new_type,'manual_externo');

    update public.entrega_lotes
    set delivery_nombre=v_new_name,
        responsable_nombre=v_new_name,
        responsable_tipo=v_new_type,
        responsable_empleado_id=v_employee_id,
        corregido_en=v_now,
        corregido_por=auth.uid(),
        motivo_correccion=trim(p_motivo),
        hoja_ruta_snapshot=jsonb_set(
          jsonb_set(
            jsonb_set(coalesce(hoja_ruta_snapshot,'{}'::jsonb),'{delivery_nombre}',to_jsonb(v_new_name),true),
            '{responsable_nombre}',to_jsonb(v_new_name),true
          ),
          '{responsable_tipo}',to_jsonb(v_new_type),true
        )
    where id=v_lote.id;

    update public.ordenes
    set delivery_nombre=v_new_name,
        notas_validacion=concat_ws(' | ',nullif(trim(notas_validacion),''),
          'Responsable corregido V9.3.7.1: '||v_new_name||' ('||v_new_type||'). Motivo: '||trim(p_motivo))
    where id=any(v_order_ids);
  else
    insert into public.orden_estados_historial(orden_id,estado_anterior,estado_nuevo,comentario,usuario)
    select o.id,o.estado,'Facturada','Lote '||v_lote.codigo_lote||' revertido desde Validación. Motivo: '||trim(p_motivo),auth.uid()
    from public.ordenes o where o.id=any(v_order_ids);

    update public.ordenes
    set estado='Facturada', delivery_nombre=null, asignado_delivery_en=null, resultado_entrega=null,
        monto_cobrado=0, monto_pendiente=null, recibido_en=null,
        notas_validacion=concat_ws(' | ',nullif(trim(notas_validacion),''),
          'Corrección V9.3.7.1: lote '||v_lote.codigo_lote||' revertido. Motivo: '||trim(p_motivo))
    where id=any(v_order_ids);

    update public.entrega_lotes
    set estado='Revertido', corregido_en=v_now, corregido_por=auth.uid(), motivo_correccion=trim(p_motivo),
        hoja_ruta_snapshot=jsonb_set(coalesce(hoja_ruta_snapshot,'{}'::jsonb),'{estado}',to_jsonb('Revertido'::text),true)
    where id=v_lote.id;
  end if;

  insert into public.entrega_lote_correcciones(lote_id,codigo_lote,accion,delivery_anterior,delivery_nuevo,motivo,usuario_id,usuario_nombre,metadata)
  values(v_lote.id,v_lote.codigo_lote,p_accion,coalesce(v_lote.responsable_nombre,v_lote.delivery_nombre),
    case when p_accion='cambiar_delivery' then v_new_name else null end,trim(p_motivo),auth.uid(),v_user_name,
    jsonb_build_object('orden_ids',v_order_ids,'estado_anterior',v_lote.estado,'responsable_tipo_nuevo',v_new_type));

  return jsonb_build_object('ok',true,'lote_id',v_lote.id,'codigo_lote',v_lote.codigo_lote,'accion',p_accion,
    'responsable_nuevo',case when p_accion='cambiar_delivery' then v_new_name else null end,
    'responsable_tipo_nuevo',case when p_accion='cambiar_delivery' then v_new_type else null end,
    'ordenes',coalesce(array_length(v_order_ids,1),0));
end;
$$;

revoke execute on function public.crear_lote_entrega_v9371(text,text,text,jsonb,text,jsonb) from public;
revoke execute on function public.transferir_orden_lote_v9371(bigint,bigint,text,text,text,text) from public;
revoke execute on function public.corregir_lote_entrega_v936(bigint,text,text,text,text) from public;
grant execute on function public.crear_lote_entrega_v9371(text,text,text,jsonb,text,jsonb) to authenticated;
grant execute on function public.transferir_orden_lote_v9371(bigint,bigint,text,text,text,text) to authenticated;
grant execute on function public.corregir_lote_entrega_v936(bigint,text,text,text,text) to authenticated;

notify pgrst, 'reload schema';
commit;

select
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='entrega_lotes' and column_name='responsable_tipo') as responsable_formal,
  to_regclass('public.entrega_pedido_transferencias') is not null as tabla_transferencias,
  to_regprocedure('public.crear_lote_entrega_v9371(text,text,text,jsonb,text,jsonb)') is not null as rpc_crear_lote,
  to_regprocedure('public.transferir_orden_lote_v9371(bigint,bigint,text,text,text,text)') is not null as rpc_transferir,
  to_regprocedure('public.corregir_lote_entrega_v936(bigint,text,text,text,text)') is not null as rpc_corregir_sincronizado;

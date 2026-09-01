-- =========================================================
-- V9.4.5.3 - FECHA OPERATIVA DEL LOTE DE DELIVERY
-- Productos Cesar CRM
--
-- Separa la fecha comercial seleccionada por el usuario de la
-- fecha/hora real de registro. No reescribe creado_en, fecha_entrega,
-- validado_en ni asignado_delivery_en.
-- =========================================================

begin;

alter table public.entrega_lotes
  add column if not exists fecha_operativa date;

update public.entrega_lotes
set fecha_operativa = (coalesce(fecha_entrega, creado_en, now()) at time zone 'America/Santo_Domingo')::date
where fecha_operativa is null;

alter table public.entrega_lotes
  alter column fecha_operativa set default ((now() at time zone 'America/Santo_Domingo')::date),
  alter column fecha_operativa set not null;

comment on column public.entrega_lotes.fecha_operativa is
'Fecha comercial del lote seleccionada en Validacion. La fecha/hora real de registro permanece en fecha_entrega y creado_en.';

create index if not exists idx_entrega_lotes_fecha_operativa_v9453
  on public.entrega_lotes(fecha_operativa desc, delivery_nombre, id desc);

create or replace function public.crear_lote_entrega_v9453(
  p_codigo_lote text,
  p_responsable_nombre text,
  p_responsable_tipo text,
  p_items jsonb,
  p_validado_por text,
  p_fecha_operativa date,
  p_snapshot jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
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
  v_today date := (now() at time zone 'America/Santo_Domingo')::date;
  v_operational_date date := p_fecha_operativa;
  v_snapshot jsonb;
begin
  if not public.puede_modulo_v930r5('validacion','editar') then
    raise exception 'No tienes permiso para crear lotes de entrega.';
  end if;
  if v_code='' then raise exception 'Codigo de lote invalido.'; end if;
  if v_name='' then raise exception 'Es obligatorio identificar al responsable del viaje.'; end if;
  if v_type not in ('delivery_registrado','otro_empleado','manual_externo') then
    raise exception 'Tipo de responsable invalido.';
  end if;
  if v_operational_date is null then
    raise exception 'Selecciona la fecha de entrega al responsable.';
  end if;
  if v_operational_date > v_today then
    raise exception 'La fecha del lote no puede ser posterior a la fecha actual.';
  end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then
    raise exception 'Selecciona al menos una orden para el lote.';
  end if;
  if exists(select 1 from public.entrega_lotes where upper(codigo_lote)=v_code) then
    raise exception 'Ya existe un lote con el codigo %.',v_code;
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
    raise exception 'Hay % orden(es) invalidas, sin monto o ya asignadas a otro lote.',v_invalid;
  end if;

  select e.id into v_employee_id
  from public.empleados_operativos e
  where e.activo is not false and lower(trim(e.nombre))=lower(v_name)
  order by e.id limit 1;

  v_snapshot := jsonb_set(
    jsonb_set(
      jsonb_set(coalesce(p_snapshot,'{}'::jsonb),'{responsable_nombre}',to_jsonb(v_name),true),
      '{responsable_tipo}',to_jsonb(v_type),true
    ),
    '{fecha_operativa}',to_jsonb(v_operational_date),true
  );

  insert into public.entrega_lotes(
    codigo_lote, delivery_nombre, responsable_nombre, responsable_tipo,
    responsable_empleado_id, fecha_operativa, fecha_entrega, cantidad_ordenes,
    peso_esperado, peso_entregado, total_facturado, estado,
    creado_por, validado_por, hoja_ruta_snapshot
  )
  select
    v_code, v_name, v_name, v_type, v_employee_id, v_operational_date, v_now,
    count(*),
    round(sum(coalesce((x->>'peso_esperado')::numeric,0)),2),
    round(sum(coalesce((x->>'peso_entregado')::numeric,0)),2),
    round(sum(coalesce((x->>'monto')::numeric,0)),2),
    'Abierto', auth.uid(), nullif(trim(p_validado_por),''), v_snapshot
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
         concat_ws(' | ','Lote: '||v_code,'Fecha del lote: '||v_operational_date::text,nullif(trim(x->>'alerta'),'')),auth.uid()
  from jsonb_array_elements(p_items) x
  join public.ordenes o on o.id=(x->>'orden_id')::bigint
  where coalesce((x->>'peso_entregado')::numeric,0)>0;

  insert into public.orden_estados_historial(orden_id,estado_anterior,estado_nuevo,comentario,usuario)
  select o.id,o.estado,'Asignada a delivery',
         'Lote '||v_code||' asignado a '||v_name||' ('||v_type||'). Fecha del lote: '||to_char(v_operational_date,'DD/MM/YYYY')||'. Monto final: '||round((x->>'monto')::numeric,2)||'. Peso final: '||round(coalesce((x->>'peso_entregado')::numeric,0),2)||' lb.',
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
      notas_validacion=concat_ws(' | ','Lote: '||v_code,'Fecha del lote: '||v_operational_date::text,nullif(trim(x.item->>'alerta'),''),'Responsable: '||v_name||' ('||v_type||')')
  from (select value as item from jsonb_array_elements(p_items)) x
  where o.id=(x.item->>'orden_id')::bigint;

  select count(*) into v_count from public.entrega_lote_detalle where lote_id=v_lote_id;
  return jsonb_build_object('ok',true,'lote_id',v_lote_id,'codigo_lote',v_code,
    'responsable_nombre',v_name,'responsable_tipo',v_type,'fecha_operativa',v_operational_date,'registrado_en',v_now,'ordenes',v_count);
end;
$$;

comment on function public.crear_lote_entrega_v9453(text,text,text,jsonb,text,date,jsonb) is
'Crea un lote transaccional y conserva por separado la fecha operativa seleccionada y la fecha/hora real de registro.';

revoke execute on function public.crear_lote_entrega_v9453(text,text,text,jsonb,text,date,jsonb) from public;
revoke execute on function public.crear_lote_entrega_v9453(text,text,text,jsonb,text,date,jsonb) from anon;
revoke execute on function public.crear_lote_entrega_v9453(text,text,text,jsonb,text,date,jsonb) from authenticated;
grant execute on function public.crear_lote_entrega_v9453(text,text,text,jsonb,text,date,jsonb) to authenticated;

notify pgrst, 'reload schema';

commit;

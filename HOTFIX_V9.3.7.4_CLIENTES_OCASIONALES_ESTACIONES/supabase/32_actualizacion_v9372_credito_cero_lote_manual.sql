-- =========================================================
-- 32 - V9.3.7.2 CREDITO EN CERO Y LOTES MANUALES
-- Productos Cesar CRM
--
-- Corrige la funcion de creacion de lotes V9.3.7.1.
-- La version anterior consultaba columnas inexistentes
-- public.clientes.direccion y public.clientes.referencia.
-- No elimina lotes, ordenes, clientes ni liquidaciones.
-- =========================================================

begin;

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

revoke execute on function public.crear_lote_entrega_v9371(text,text,text,jsonb,text,jsonb) from public;
grant execute on function public.crear_lote_entrega_v9371(text,text,text,jsonb,text,jsonb) to authenticated;

commit;

select
  to_regprocedure('public.crear_lote_entrega_v9371(text,text,text,jsonb,text,jsonb)') is not null as rpc_corregida,
  position('c.direccion' in lower(pg_get_functiondef('public.crear_lote_entrega_v9371(text,text,text,jsonb,text,jsonb)'::regprocedure))) = 0 as sin_columna_direccion_inexistente,
  position('c.referencia' in lower(pg_get_functiondef('public.crear_lote_entrega_v9371(text,text,text,jsonb,text,jsonb)'::regprocedure))) = 0 as sin_columna_referencia_inexistente,
  position('o.zona' in lower(pg_get_functiondef('public.crear_lote_entrega_v9371(text,text,text,jsonb,text,jsonb)'::regprocedure))) > 0 as usa_referencia_operativa_existente;

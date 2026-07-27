-- V9.3.8.1 - Guardado transaccional de órdenes y preparación
-- Ejecutar después del SQL 38.

create or replace function public.guardar_orden_v9381(
  p_orden_id bigint,
  p_llamada_id bigint,
  p_orden jsonb,
  p_items jsonb,
  p_composicion_cambio boolean default false,
  p_comentario text default null,
  p_llamada_observacion text default null
) returns table(id bigint, codigo text, estado text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id bigint;
  v_codigo text;
  v_estado_anterior text;
  v_estado_nuevo text;
  v_item jsonb;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Sesión no válida.'; end if;
  if not public.tiene_algun_modulo(array['ordenes','control','carniceria','facturacion'], 'editar')
     and not public.es_admin_operativo() then
    raise exception 'No tienes permiso para guardar órdenes.';
  end if;
  if jsonb_typeof(p_orden) <> 'object' then raise exception 'Encabezado de orden no válido.'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items)=0 then
    raise exception 'La orden debe contener al menos un artículo.';
  end if;

  if p_orden_id is not null then
    select o.id,o.codigo,o.estado into v_id,v_codigo,v_estado_anterior
    from public.ordenes o where o.id=p_orden_id for update;
    if v_id is null then raise exception 'La orden ya no existe.'; end if;
  elsif p_llamada_id is not null then
    select o.id,o.codigo,o.estado into v_id,v_codigo,v_estado_anterior
    from public.ordenes o where o.llamada_id=p_llamada_id for update;
  end if;

  if v_id is null then
    insert into public.ordenes(
      cliente_id,llamada_id,tipo_cliente_orden,cliente_nombre_orden,cliente_telefono_orden,
      cliente_sector_orden,cliente_direccion_orden,cliente_referencia_orden,modalidad_entrega,
      fecha,fecha_despacho,hora_despacho,es_programada,nota_programacion,programada_por,
      fecha_programacion,prioridad,tipo_orden,requiere_preparacion,requiere_facturacion,
      requiere_delivery,canal,vendedor,estado,condicion_pago,total_estimado,total_factura,
      factura_no,delivery_nombre,zona,notas,creado_por,actualizado_por
    ) values (
      nullif(p_orden->>'cliente_id','')::bigint,p_llamada_id,p_orden->>'tipo_cliente_orden',
      p_orden->>'cliente_nombre_orden',p_orden->>'cliente_telefono_orden',
      p_orden->>'cliente_sector_orden',p_orden->>'cliente_direccion_orden',
      p_orden->>'cliente_referencia_orden',p_orden->>'modalidad_entrega',
      coalesce(nullif(p_orden->>'fecha','')::date,current_date),
      nullif(p_orden->>'fecha_despacho','')::date,nullif(p_orden->>'hora_despacho','')::time,
      coalesce((p_orden->>'es_programada')::boolean,false),p_orden->>'nota_programacion',
      nullif(p_orden->>'programada_por','')::uuid,nullif(p_orden->>'fecha_programacion','')::timestamptz,
      p_orden->>'prioridad',p_orden->>'tipo_orden',
      coalesce((p_orden->>'requiere_preparacion')::boolean,true),
      coalesce((p_orden->>'requiere_facturacion')::boolean,true),
      coalesce((p_orden->>'requiere_delivery')::boolean,true),
      p_orden->>'canal',p_orden->>'vendedor',p_orden->>'estado',p_orden->>'condicion_pago',
      coalesce((p_orden->>'total_estimado')::numeric,0),coalesce((p_orden->>'total_factura')::numeric,0),
      p_orden->>'factura_no',p_orden->>'delivery_nombre',p_orden->>'zona',p_orden->>'notas',v_uid,v_uid
    ) returning ordenes.id,ordenes.codigo,ordenes.estado into v_id,v_codigo,v_estado_anterior;
  else
    update public.ordenes o set
      cliente_id=nullif(p_orden->>'cliente_id','')::bigint,
      tipo_cliente_orden=p_orden->>'tipo_cliente_orden',
      cliente_nombre_orden=p_orden->>'cliente_nombre_orden',
      cliente_telefono_orden=p_orden->>'cliente_telefono_orden',
      cliente_sector_orden=p_orden->>'cliente_sector_orden',
      cliente_direccion_orden=p_orden->>'cliente_direccion_orden',
      cliente_referencia_orden=p_orden->>'cliente_referencia_orden',
      modalidad_entrega=p_orden->>'modalidad_entrega',
      fecha=coalesce(nullif(p_orden->>'fecha','')::date,o.fecha),
      fecha_despacho=nullif(p_orden->>'fecha_despacho','')::date,
      hora_despacho=nullif(p_orden->>'hora_despacho','')::time,
      es_programada=coalesce((p_orden->>'es_programada')::boolean,false),
      nota_programacion=p_orden->>'nota_programacion',
      programada_por=nullif(p_orden->>'programada_por','')::uuid,
      fecha_programacion=nullif(p_orden->>'fecha_programacion','')::timestamptz,
      prioridad=p_orden->>'prioridad',tipo_orden=p_orden->>'tipo_orden',
      requiere_preparacion=coalesce((p_orden->>'requiere_preparacion')::boolean,true),
      requiere_facturacion=coalesce((p_orden->>'requiere_facturacion')::boolean,true),
      requiere_delivery=coalesce((p_orden->>'requiere_delivery')::boolean,true),
      canal=p_orden->>'canal',vendedor=p_orden->>'vendedor',estado=p_orden->>'estado',
      condicion_pago=p_orden->>'condicion_pago',
      total_estimado=coalesce((p_orden->>'total_estimado')::numeric,0),
      total_factura=coalesce((p_orden->>'total_factura')::numeric,0),
      factura_no=p_orden->>'factura_no',delivery_nombre=p_orden->>'delivery_nombre',
      zona=p_orden->>'zona',notas=p_orden->>'notas',
      tomado_por=case when p_orden ? 'tomado_por' then p_orden->>'tomado_por' else o.tomado_por end,
      tomado_por_empleado_id=case when p_orden ? 'tomado_por_empleado_id' then nullif(p_orden->>'tomado_por_empleado_id','')::bigint else o.tomado_por_empleado_id end,
      tomado_en=case when p_orden ? 'tomado_en' then nullif(p_orden->>'tomado_en','')::timestamptz else o.tomado_en end,
      tomado_por_user=case when p_orden ? 'tomado_por_user' then nullif(p_orden->>'tomado_por_user','')::uuid else o.tomado_por_user end,
      preparado_por=case when p_orden ? 'preparado_por' then p_orden->>'preparado_por' else o.preparado_por end,
      preparado_en=case when p_orden ? 'preparado_en' then nullif(p_orden->>'preparado_en','')::timestamptz else o.preparado_en end,
      peso_preparado=case when p_orden ? 'peso_preparado' then nullif(p_orden->>'peso_preparado','')::numeric else o.peso_preparado end,
      peso_calculado_preparado=case when p_orden ? 'peso_calculado_preparado' then nullif(p_orden->>'peso_calculado_preparado','')::numeric else o.peso_calculado_preparado end,
      paquetes_preparados=case when p_orden ? 'paquetes_preparados' then nullif(p_orden->>'paquetes_preparados','')::integer else o.paquetes_preparados end,
      notas_preparacion=case when p_orden ? 'notas_preparacion' then p_orden->>'notas_preparacion' else o.notas_preparacion end,
      facturado_por=case when p_orden ? 'facturado_por' then p_orden->>'facturado_por' else o.facturado_por end,
      facturado_en=case when p_orden ? 'facturado_en' then nullif(p_orden->>'facturado_en','')::timestamptz else o.facturado_en end,
      peso_facturado=case when p_orden ? 'peso_facturado' then nullif(p_orden->>'peso_facturado','')::numeric else o.peso_facturado end,
      peso_validado=case when p_orden ? 'peso_validado' then nullif(p_orden->>'peso_validado','')::numeric else o.peso_validado end,
      validado_por=case when p_orden ? 'validado_por' then p_orden->>'validado_por' else o.validado_por end,
      validado_en=case when p_orden ? 'validado_en' then nullif(p_orden->>'validado_en','')::timestamptz else o.validado_en end,
      actualizado_por=v_uid,actualizado_en=now()
    where o.id=v_id
    returning o.estado into v_estado_nuevo;
  end if;

  delete from public.orden_detalle where orden_id=v_id;
  for v_item in select value from jsonb_array_elements(p_items)
  loop
    insert into public.orden_detalle(
      orden_id,producto_id,producto_nombre,cantidad_pedida,unidad,precio,subtotal,notas,
      cantidad_preparada,estado_preparacion,nota_preparacion,peso_equivalente_preparado,
      tipo_despacho_peso,requiere_pesaje,peso_estandar_lb,tolerancia_lb,suma_peso_final,
      permite_fraccion,peso_equivalente_solicitado
    ) values (
      v_id,nullif(v_item->>'producto_id','')::bigint,v_item->>'producto_nombre',
      coalesce((v_item->>'cantidad_pedida')::numeric,0),coalesce(v_item->>'unidad','lb'),
      coalesce((v_item->>'precio')::numeric,0),coalesce((v_item->>'subtotal')::numeric,0),
      v_item->>'notas',nullif(v_item->>'cantidad_preparada','')::numeric,
      coalesce(v_item->>'estado_preparacion','Pendiente'),v_item->>'nota_preparacion',
      nullif(v_item->>'peso_equivalente_preparado','')::numeric,v_item->>'tipo_despacho_peso',
      nullif(v_item->>'requiere_pesaje','')::boolean,nullif(v_item->>'peso_estandar_lb','')::numeric,
      nullif(v_item->>'tolerancia_lb','')::numeric,nullif(v_item->>'suma_peso_final','')::boolean,
      nullif(v_item->>'permite_fraccion','')::boolean,nullif(v_item->>'peso_equivalente_solicitado','')::numeric
    );
  end loop;

  if p_composicion_cambio then
    insert into public.orden_estados_historial(orden_id,estado_anterior,estado_nuevo,comentario,usuario)
    values(v_id,v_estado_anterior,coalesce(v_estado_nuevo,p_orden->>'estado'),p_comentario,v_uid);
  end if;

  if p_llamada_id is not null then
    update public.llamadas set resultado='Pidió',
      monto=coalesce((p_orden->>'total_estimado')::numeric,0),
      observacion=regexp_replace(
        coalesce(p_llamada_observacion,''),
        'Orden la nueva orden',
        'Orden '||v_codigo
      )
    where llamadas.id=p_llamada_id;
  end if;

  return query select o.id,o.codigo,o.estado from public.ordenes o where o.id=v_id;
end;
$$;

create or replace function public.guardar_preparacion_v9381(
  p_orden_id bigint,
  p_lineas jsonb,
  p_cabecera jsonb,
  p_final boolean default false
) returns table(id bigint, codigo text, estado text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_orden public.ordenes%rowtype;
  v_linea jsonb;
  v_actualizadas integer := 0;
  v_total integer;
  v_nuevo_estado text;
  v_peso numeric;
begin
  if v_uid is null then raise exception 'Sesión no válida.'; end if;
  if not public.tiene_algun_modulo(array['carniceria'], 'editar') and not public.es_admin_operativo() then
    raise exception 'No tienes permiso para guardar preparación.';
  end if;
  if jsonb_typeof(p_lineas) <> 'array' then raise exception 'Detalle de preparación no válido.'; end if;

  select * into v_orden from public.ordenes where ordenes.id=p_orden_id for update;
  if not found then raise exception 'La orden ya no existe.'; end if;
  if v_orden.estado not in ('Pedido recibido','En preparación') then
    raise exception 'La orden cambió de etapa. Actualiza la pantalla antes de guardar.';
  end if;
  select count(*) into v_total from public.orden_detalle where orden_id=p_orden_id;
  if v_total<>jsonb_array_length(p_lineas) then
    raise exception 'El detalle cambió mientras preparabas la orden. Actualiza y vuelve a revisar.';
  end if;

  for v_linea in select value from jsonb_array_elements(p_lineas)
  loop
    update public.orden_detalle set
      cantidad_preparada=nullif(v_linea->>'cantidad_preparada','')::numeric,
      estado_preparacion=coalesce(v_linea->>'estado_preparacion','Pendiente'),
      nota_preparacion=v_linea->>'nota_preparacion',
      peso_equivalente_preparado=coalesce(nullif(v_linea->>'peso_equivalente_preparado','')::numeric,0),
      peso_equivalente_solicitado=coalesce(nullif(v_linea->>'peso_equivalente_solicitado','')::numeric,0)
    where orden_detalle.id=nullif(v_linea->>'id','')::bigint and orden_id=p_orden_id;
    if found then v_actualizadas:=v_actualizadas+1; end if;
  end loop;
  if v_actualizadas<>v_total then raise exception 'No se pudieron confirmar todas las líneas de la orden.'; end if;

  v_nuevo_estado:=case when p_final then 'Lista para facturar' else 'En preparación' end;
  v_peso:=nullif(p_cabecera->>'peso_preparado','')::numeric;
  update public.ordenes set
    estado=v_nuevo_estado,
    tomado_por=coalesce(nullif(p_cabecera->>'tomado_por',''),v_orden.tomado_por),
    tomado_en=coalesce(nullif(p_cabecera->>'tomado_en','')::timestamptz,v_orden.tomado_en,now()),
    tomado_por_user=coalesce(nullif(p_cabecera->>'tomado_por_user','')::uuid,v_orden.tomado_por_user,v_uid),
    peso_preparado=v_peso,
    peso_calculado_preparado=nullif(p_cabecera->>'peso_calculado_preparado','')::numeric,
    paquetes_preparados=nullif(p_cabecera->>'paquetes_preparados','')::integer,
    notas_preparacion=p_cabecera->>'notas_preparacion',
    total_estimado=coalesce(nullif(p_cabecera->>'total_estimado','')::numeric,v_orden.total_estimado),
    preparado_por=case when p_final then p_cabecera->>'tomado_por' else null end,
    preparado_en=case when p_final then now() else null end,
    actualizado_por=v_uid,actualizado_en=now()
  where ordenes.id=p_orden_id;

  if p_final and coalesce(v_peso,0)>0 then
    insert into public.orden_pesos(orden_id,tipo,libras,paquetes,notas,creado_por)
    values(p_orden_id,'Preparado',v_peso,nullif(p_cabecera->>'paquetes_preparados','')::integer,
      p_cabecera->>'notas_preparacion',v_uid);
  end if;
  insert into public.orden_estados_historial(orden_id,estado_anterior,estado_nuevo,comentario,usuario)
  values(p_orden_id,v_orden.estado,v_nuevo_estado,
    case when p_final then 'Preparada, detallada y pesada' else 'Avance de preparación guardado sin marcar como preparado' end,v_uid);

  return query select o.id,o.codigo,o.estado from public.ordenes o where o.id=p_orden_id;
end;
$$;

revoke all on function public.guardar_orden_v9381(bigint,bigint,jsonb,jsonb,boolean,text,text) from public;
grant execute on function public.guardar_orden_v9381(bigint,bigint,jsonb,jsonb,boolean,text,text) to authenticated;
revoke all on function public.guardar_preparacion_v9381(bigint,jsonb,jsonb,boolean) from public;
grant execute on function public.guardar_preparacion_v9381(bigint,jsonb,jsonb,boolean) to authenticated;

comment on function public.guardar_orden_v9381 is
  'V9.3.8.1: guarda encabezado, detalle, historial y vínculo de llamada en una sola transacción.';
comment on function public.guardar_preparacion_v9381 is
  'V9.3.8.1: guarda detalle, encabezado, peso e historial de Carnicería en una sola transacción.';

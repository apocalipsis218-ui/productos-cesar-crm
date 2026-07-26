begin;

-- =========================================================
-- V9.3.7.9 - EDICIÓN SEGURA DE LA COMPOSICIÓN DEL LOTE
-- Agrega o retira órdenes antes de recibir/liquidar y recalcula
-- todos los totales dentro de la misma transacción.
-- =========================================================

create or replace function public.editar_composicion_lote_v9379(
  p_lote_id bigint,
  p_agregar_ordenes bigint[] default '{}'::bigint[],
  p_retirar_ordenes bigint[] default '{}'::bigint[],
  p_motivo text default null,
  p_usuario_nombre text default null,
  p_snapshot jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lote public.entrega_lotes%rowtype;
  v_reason text := btrim(coalesce(p_motivo,''));
  v_add bigint[] := coalesce(p_agregar_ordenes,'{}'::bigint[]);
  v_remove bigint[] := coalesce(p_retirar_ordenes,'{}'::bigint[]);
  v_current_count integer;
  v_new_count integer;
  v_invalid integer;
  v_user_name text;
  v_user_role text;
  v_before jsonb;
  v_after jsonb;
  v_now timestamptz := now();
begin
  if auth.uid() is null then raise exception 'Sesión requerida.'; end if;
  if not public.puede_modulo_v930r5('validacion','editar') then
    raise exception 'No tienes permiso para editar lotes.';
  end if;
  if char_length(v_reason)<5 then
    raise exception 'El motivo debe tener al menos 5 caracteres.';
  end if;
  if cardinality(v_add)=0 and cardinality(v_remove)=0 then
    raise exception 'Selecciona al menos una orden para agregar o retirar.';
  end if;
  if exists(
    select 1
    from unnest(v_add) as a(id)
    join unnest(v_remove) as r(id) on r.id=a.id
  ) then
    raise exception 'Una misma orden no puede agregarse y retirarse a la vez.';
  end if;
  if cardinality(v_add)<>(select count(distinct id) from unnest(v_add) as x(id))
     or cardinality(v_remove)<>(select count(distinct id) from unnest(v_remove) as x(id)) then
    raise exception 'La solicitud contiene órdenes repetidas.';
  end if;

  select * into v_lote
  from public.entrega_lotes
  where id=p_lote_id
  for update;
  if not found then raise exception 'No se encontró el lote.'; end if;
  if lower(coalesce(v_lote.estado,'Abierto')) <> 'abierto' then
    raise exception 'El lote está % y no puede editarse.',v_lote.estado;
  end if;
  if exists(
    select 1 from public.liquidaciones_lotes
    where lote_id=v_lote.id or upper(codigo_lote)=upper(v_lote.codigo_lote)
  ) then
    raise exception 'El lote ya tiene una liquidación registrada.';
  end if;
  if exists(
    select 1
    from public.entrega_lote_detalle d
    join public.ordenes o on o.id=d.orden_id
    where d.lote_id=v_lote.id
      and (
        o.recibido_en is not null
        or nullif(btrim(coalesce(o.resultado_entrega,'')),'') is not null
        or o.estado in ('Cobrado','Entregado a crédito','No entregado','Devuelto parcial','Cerrado','Liquidado')
      )
  ) then
    raise exception 'El lote tiene resultados, recepción o cierre posterior y no puede editarse.';
  end if;

  select count(*) into v_current_count
  from public.entrega_lote_detalle
  where lote_id=v_lote.id;

  select count(*) into v_invalid
  from unnest(v_remove) x
  where not exists(
    select 1 from public.entrega_lote_detalle d
    where d.lote_id=v_lote.id and d.orden_id=x
  );
  if v_invalid>0 then
    raise exception 'Hay % orden(es) seleccionadas para retirar que no pertenecen al lote.',v_invalid;
  end if;

  select count(*) into v_invalid
  from unnest(v_add) x
  left join public.ordenes o on o.id=x
  where o.id is null
     or o.estado not in ('Facturada','Validada para delivery')
     or coalesce(o.total_factura,o.total_estimado,0)<=0
     or o.recibido_en is not null
     or nullif(btrim(coalesce(o.resultado_entrega,'')),'') is not null
     or exists(
       select 1
       from public.entrega_lote_detalle d
       join public.entrega_lotes l on l.id=d.lote_id
       where d.orden_id=o.id
         and lower(coalesce(l.estado,'')) not in ('revertido','cerrado','transferido totalmente')
     );
  if v_invalid>0 then
    raise exception 'Hay % orden(es) inválidas, sin monto o asignadas a otro lote.',v_invalid;
  end if;

  if v_current_count-cardinality(v_remove)+cardinality(v_add)<1 then
    raise exception 'El lote debe conservar al menos una orden. Para eliminarlo completo utiliza Revertir lote.';
  end if;

  v_before:=jsonb_build_object(
    'cantidad_ordenes',v_lote.cantidad_ordenes,
    'peso_esperado',v_lote.peso_esperado,
    'peso_entregado',v_lote.peso_entregado,
    'total_facturado',v_lote.total_facturado
  );

  insert into public.orden_estados_historial(
    orden_id,estado_anterior,estado_nuevo,comentario,usuario
  )
  select o.id,o.estado,'Facturada',
    'Orden retirada del lote '||v_lote.codigo_lote||'. Motivo: '||v_reason,
    auth.uid()
  from public.ordenes o
  where o.id=any(v_remove);

  delete from public.entrega_lote_detalle
  where lote_id=v_lote.id and orden_id=any(v_remove);

  update public.ordenes
  set estado='Facturada',
      delivery_nombre=null,
      asignado_delivery_en=null,
      resultado_entrega=null,
      monto_cobrado=0,
      monto_pendiente=0,
      recibido_en=null,
      notas_validacion=concat_ws(
        ' | ',nullif(btrim(notas_validacion),''),
        'Retirada del lote '||v_lote.codigo_lote||' V9.3.7.9. Motivo: '||v_reason
      )
  where id=any(v_remove);

  insert into public.entrega_lote_detalle(
    lote_id,codigo_lote,orden_id,cliente_id,codigo_orden,
    cliente_nombre,telefono,sector,direccion,factura_no,
    monto_factura,peso_esperado,peso_entregado,estado_liquidacion
  )
  select
    v_lote.id,v_lote.codigo_lote,o.id,o.cliente_id,o.codigo,
    coalesce(nullif(btrim(o.cliente_nombre_orden),''),c.negocio,'Cliente'),
    coalesce(nullif(btrim(o.cliente_telefono_orden),''),c.telefono),
    coalesce(nullif(btrim(o.cliente_sector_orden),''),c.sector,o.zona),
    coalesce(nullif(btrim(o.zona),''),nullif(btrim(o.cliente_sector_orden),''),c.sector),
    o.factura_no,
    round(coalesce(o.total_factura,o.total_estimado,0),2),
    round(coalesce(o.peso_preparado,0),2),
    round(coalesce(o.peso_validado,o.peso_preparado,0),2),
    'Pendiente'
  from public.ordenes o
  left join public.clientes c on c.id=o.cliente_id
  where o.id=any(v_add);

  insert into public.orden_estados_historial(
    orden_id,estado_anterior,estado_nuevo,comentario,usuario
  )
  select o.id,o.estado,'Asignada a delivery',
    'Orden agregada al lote '||v_lote.codigo_lote||' con responsable '||
    coalesce(v_lote.responsable_nombre,v_lote.delivery_nombre)||'. Motivo: '||v_reason,
    auth.uid()
  from public.ordenes o
  where o.id=any(v_add);

  update public.ordenes
  set estado='Asignada a delivery',
      delivery_nombre=coalesce(v_lote.responsable_nombre,v_lote.delivery_nombre),
      asignado_delivery_en=v_now,
      validado_en=coalesce(validado_en,v_now),
      validado_por=coalesce(validado_por,v_lote.validado_por),
      notas_validacion=concat_ws(
        ' | ',nullif(btrim(notas_validacion),''),
        'Agregada al lote '||v_lote.codigo_lote||' V9.3.7.9. Motivo: '||v_reason
      )
  where id=any(v_add);

  update public.entrega_lotes l
  set cantidad_ordenes=s.cnt,
      peso_esperado=s.peso_esperado,
      peso_entregado=s.peso_entregado,
      total_facturado=s.total_facturado,
      hoja_ruta_snapshot=coalesce(p_snapshot,l.hoja_ruta_snapshot),
      corregido_en=v_now,
      corregido_por=auth.uid(),
      motivo_correccion=v_reason
  from(
    select count(*)::integer cnt,
      coalesce(round(sum(peso_esperado),2),0) peso_esperado,
      coalesce(round(sum(peso_entregado),2),0) peso_entregado,
      coalesce(round(sum(monto_factura),2),0) total_facturado
    from public.entrega_lote_detalle
    where lote_id=v_lote.id
  ) s
  where l.id=v_lote.id;

  select cantidad_ordenes into v_new_count
  from public.entrega_lotes
  where id=v_lote.id;

  select jsonb_build_object(
    'cantidad_ordenes',cantidad_ordenes,
    'peso_esperado',peso_esperado,
    'peso_entregado',peso_entregado,
    'total_facturado',total_facturado
  )
  into v_after
  from public.entrega_lotes
  where id=v_lote.id;

  select
    coalesce(nullif(btrim(p_usuario_nombre),''),nullif(btrim(p.nombre),''),'Usuario'),
    p.rol
  into v_user_name,v_user_role
  from public.perfiles p
  where p.id=auth.uid();
  v_user_name:=coalesce(v_user_name,nullif(btrim(p_usuario_nombre),''),'Usuario');

  insert into public.auditoria_excepciones(
    usuario_id,usuario_nombre,usuario_rol,modulo,tipo_evento,gravedad,
    accion,motivo,lote_codigo,detalle,dispositivo
  )
  values(
    auth.uid(),v_user_name,v_user_role,'Validación','Edición de composición de lote','Crítica',
    'Agregó o retiró órdenes de un lote existente',v_reason,v_lote.codigo_lote,
    jsonb_build_object(
      'lote_id',v_lote.id,
      'ordenes_agregadas',v_add,
      'ordenes_retiradas',v_remove,
      'totales_anteriores',v_before,
      'totales_nuevos',v_after,
      'responsable',coalesce(v_lote.responsable_nombre,v_lote.delivery_nombre)
    ),
    'RPC editar_composicion_lote_v9379'
  );

  return jsonb_build_object(
    'ok',true,
    'lote_id',v_lote.id,
    'codigo_lote',v_lote.codigo_lote,
    'agregadas',cardinality(v_add),
    'retiradas',cardinality(v_remove),
    'cantidad_ordenes',v_new_count,
    'totales',v_after
  );
end;
$$;

revoke execute on function public.editar_composicion_lote_v9379(bigint,bigint[],bigint[],text,text,jsonb) from public, anon;
grant execute on function public.editar_composicion_lote_v9379(bigint,bigint[],bigint[],text,text,jsonb) to authenticated;

notify pgrst, 'reload schema';
commit;

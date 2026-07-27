-- =========================================================
-- 47 - V9.3.9.3 · NO ENTREGADOS REGRESAN A VALIDACIÓN
-- Productos César CRM
-- =========================================================
begin;

alter table public.ordenes
  add column if not exists ultimo_resultado_delivery text,
  add column if not exists ultimo_lote_no_entregado text,
  add column if not exists ultimo_no_entregado_en timestamptz,
  add column if not exists no_entregado_reintentos integer not null default 0;

insert into public.orden_transiciones_v9382(estado_anterior,estado_nuevo,modulo,activo)
values
  ('No entregado','Facturada','liquidacion',true),
  ('Facturada','No entregado','liquidacion',true)
on conflict(estado_anterior,estado_nuevo)
do update set modulo=excluded.modulo,activo=true;

create or replace function public.pc_retornar_no_entregado_validacion_v9393(
  p_orden_id bigint, p_lote_id bigint, p_recibido_por text,
  p_observacion text default null
) returns jsonb
language plpgsql security definer set search_path=public,pg_temp
as $$
declare
  v_orden public.ordenes%rowtype;
  v_lote public.entrega_lotes%rowtype;
  v_motivo text:=btrim(coalesce(p_observacion,''));
  v_now timestamptz:=now();
begin
  select * into v_orden from public.ordenes where id=p_orden_id for update;
  if not found then raise exception 'No se encontró la orden no entregada.'; end if;
  select * into v_lote from public.entrega_lotes where id=p_lote_id for update;
  if not found then raise exception 'No se encontró el lote del intento de entrega.'; end if;
  if v_motivo='' then raise exception 'Debes indicar el motivo por el cual el pedido no fue entregado.'; end if;

  if v_orden.estado='Facturada' and v_orden.resultado_entrega is null
     and v_orden.recibido_en is null
     and v_orden.ultimo_lote_no_entregado=v_lote.codigo_lote then
    return jsonb_build_object('ok',true,'orden_id',v_orden.id,
      'retornada_validacion',true,'ya_procesada',true,'codigo_lote',v_lote.codigo_lote);
  end if;

  if coalesce(v_orden.resultado_entrega,v_orden.estado)<>'No entregado'
     or v_orden.recibido_en is null then
    raise exception 'La orden no tiene una recepción No entregado pendiente de retorno.';
  end if;

  update public.ordenes
  set estado='Facturada', resultado_entrega=null, monto_cobrado=0, monto_pendiente=0,
      recibido_por=null, recibido_en=null, delivery_nombre=null,
      asignado_delivery_en=null, en_ruta_en=null,
      ultimo_resultado_delivery='No entregado',
      ultimo_lote_no_entregado=v_lote.codigo_lote,
      ultimo_no_entregado_en=v_now,
      no_entregado_reintentos=coalesce(no_entregado_reintentos,0)+1,
      notas_validacion=concat_ws(' | ',nullif(btrim(notas_validacion),''),
        'Pendiente de reasignación. No entregado en lote '||v_lote.codigo_lote||
        '. Motivo: '||v_motivo||'. Recibido en CXC por '||
        coalesce(nullif(btrim(p_recibido_por),''),'CXC')||'.'),
      notas_estado=concat_ws(' | ',nullif(btrim(notas_estado),''),
        'V9.3.9.3: devuelta a Validación para reasignación desde '||v_lote.codigo_lote||'.')
  where id=v_orden.id;

  insert into public.orden_estados_historial(
    orden_id,estado_anterior,estado_nuevo,comentario,usuario
  ) values (
    v_orden.id,'No entregado','Facturada',
    'V9.3.9.3: pedido no entregado regresó a Validación para reasignación. '||
    'Lote anterior: '||v_lote.codigo_lote||'. Motivo: '||v_motivo||
    '. Factura y pesaje original conservados.',auth.uid()
  );

  insert into public.liquidacion_lote_eventos(
    lote_id,codigo_lote,liquidacion_id,accion,motivo,
    usuario_id,usuario_nombre,metadata
  ) values (
    v_lote.id,v_lote.codigo_lote,
    (select id from public.liquidaciones_lotes where lote_id=v_lote.id order by id limit 1),
    'no_entregado_retorna_validacion',v_motivo,auth.uid(),
    nullif(btrim(p_recibido_por),''),
    jsonb_build_object('orden_id',v_orden.id,'codigo_orden',v_orden.codigo,
      'estado_anterior','No entregado','estado_nuevo','Facturada',
      'pendiente_reasignacion',true,'factura_conservada',v_orden.factura_no,
      'peso_validado_conservado',v_orden.peso_validado,
      'reintento',coalesce(v_orden.no_entregado_reintentos,0)+1)
  );

  return jsonb_build_object('ok',true,'orden_id',v_orden.id,
    'codigo_orden',v_orden.codigo,'retornada_validacion',true,
    'pendiente_reasignacion',true,'codigo_lote',v_lote.codigo_lote);
end;
$$;

-- Permite cerrar correctamente un lote recibido cliente por cliente aunque una
-- orden no entregada ya haya regresado a Validación. La orden se repone solo
-- durante el cálculo del snapshot y vuelve a quedar abierta en la misma transacción.
create or replace function public.pc_finalizar_lote_cxc_v9393(
  p_lote_id bigint, p_recibido_por text, p_observacion text default null
) returns jsonb
language plpgsql security definer set search_path=public,pg_temp
as $$
declare
  v_ids bigint[];
  v_result jsonb;
begin
  select array_agg(o.id) into v_ids
  from public.entrega_lote_detalle d
  join public.entrega_lotes l on l.id=d.lote_id
  join public.ordenes o on o.id=d.orden_id
  where d.lote_id=p_lote_id
    and d.estado_liquidacion='Recibido'
    and d.resultado_entrega='No entregado'
    and o.estado='Facturada'
    and o.resultado_entrega is null
    and o.recibido_en is null
    and o.ultimo_lote_no_entregado=l.codigo_lote;

  if coalesce(array_length(v_ids,1),0)>0 then
    update public.ordenes
    set estado='No entregado',resultado_entrega='No entregado',
        recibido_en=coalesce(ultimo_no_entregado_en,now()),
        recibido_por=coalesce(nullif(btrim(p_recibido_por),''),'CXC'),
        monto_cobrado=0,monto_pendiente=0
    where id=any(v_ids);
  end if;

  v_result:=public.pc_finalizar_lote_cxc_v937(p_lote_id,p_recibido_por,p_observacion);

  if coalesce(array_length(v_ids,1),0)>0 then
    update public.ordenes
    set estado='Facturada',resultado_entrega=null,recibido_en=null,
        recibido_por=null,monto_cobrado=0,monto_pendiente=0
    where id=any(v_ids);
  end if;

  return v_result||jsonb_build_object(
    'version_finalizacion','9.3.9.3',
    'no_entregados_reabiertos',coalesce(array_length(v_ids,1),0)
  );
end;
$$;

create or replace function public.recibir_orden_cxc_v9393(
  p_orden_id bigint, p_resultado text, p_monto_recibido numeric,
  p_metodo text, p_recibido_por text, p_observacion text default null
) returns jsonb
language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_lote_id bigint; v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Sesión no válida.'; end if;
  select d.lote_id into v_lote_id
  from public.entrega_lote_detalle d join public.entrega_lotes l on l.id=d.lote_id
  where d.orden_id=p_orden_id and lower(coalesce(l.estado,''))<>'revertido'
  order by d.id desc limit 1;
  if v_lote_id is null then raise exception 'La orden no tiene un lote activo.'; end if;

  v_result:=public.recibir_orden_cxc_v937(
    p_orden_id,p_resultado,p_monto_recibido,p_metodo,p_recibido_por,p_observacion);
  if p_resultado='No entregado' then
    v_result:=v_result||public.pc_retornar_no_entregado_validacion_v9393(
      p_orden_id,v_lote_id,p_recibido_por,p_observacion);
    v_result:=v_result||public.pc_finalizar_lote_cxc_v9393(
      v_lote_id,p_recibido_por,p_observacion);
  end if;
  return v_result||jsonb_build_object('version','9.3.9.3');
end;
$$;

create or replace function public.recibir_lote_cxc_v9393(
  p_lote_id bigint, p_items jsonb, p_recibido_por text,
  p_observacion text default null
) returns jsonb
language plpgsql security definer set search_path=public,pg_temp
as $$
declare
  v_lote public.entrega_lotes%rowtype; v_item jsonb; v_resultado text;
  v_missing integer; v_invalid integer; v_result jsonb; v_returned integer:=0;
begin
  if auth.uid() is null then raise exception 'Sesión no válida.'; end if;
  if not public.puede_modulo_v930r5('liquidacion','editar') then
    raise exception 'No tienes permiso para recibir liquidaciones.';
  end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then
    raise exception 'El lote no contiene clientes para recibir.';
  end if;
  select * into v_lote from public.entrega_lotes where id=p_lote_id for update;
  if not found then raise exception 'No se encontró el lote.'; end if;
  if lower(coalesce(v_lote.estado,'')) in('cerrado','revertido') then
    raise exception 'El lote está % y no puede recibirse.',v_lote.estado;
  end if;

  select count(*) into v_invalid from jsonb_array_elements(p_items) j
  where nullif(j->>'orden_id','') is null
     or coalesce(j->>'resultado','') not in('Cobrado','Entregado a crédito','No entregado','Devuelto parcial')
     or not exists(select 1 from public.entrega_lote_detalle d
       join public.ordenes o on o.id=d.orden_id
       where d.lote_id=v_lote.id and d.orden_id=(j->>'orden_id')::bigint
         and o.recibido_en is null);
  if v_invalid>0 then
    raise exception 'La recepción contiene % cliente(s) inválidos, ajenos al lote o ya recibidos.',v_invalid;
  end if;
  if (select count(*) from jsonb_array_elements(p_items)) <>
     (select count(distinct (j->>'orden_id')) from jsonb_array_elements(p_items) j) then
    raise exception 'La recepción contiene una orden repetida dentro del mismo lote.';
  end if;
  select count(*) into v_missing from public.entrega_lote_detalle d
  join public.ordenes o on o.id=d.orden_id
  where d.lote_id=v_lote.id and o.recibido_en is null
    and not exists(select 1 from jsonb_array_elements(p_items) j
      where (j->>'orden_id')::bigint=o.id);
  if v_missing>0 then
    raise exception 'Faltan % cliente(s) pendientes dentro de la recepción del lote.',v_missing;
  end if;
  if exists(select 1 from jsonb_array_elements(p_items) j
    where j->>'resultado'='No entregado'
      and btrim(coalesce(j->>'observacion',p_observacion,''))='') then
    raise exception 'Cada pedido no entregado debe incluir el motivo del intento fallido.';
  end if;
  if exists(select 1 from jsonb_array_elements(p_items) j
    where j->>'resultado'='Devuelto parcial'
      and (coalesce(jsonb_typeof(j->'lineas'),'')<>'array'
        or coalesce(jsonb_array_length(j->'lineas'),0)=0)) then
    raise exception 'Toda devolución parcial debe incluir el detalle de artículos.';
  end if;

  -- Los no entregados van al final: así el lote genera primero su snapshot de cierre.
  for v_item in select value from jsonb_array_elements(p_items)
    order by case when value->>'resultado'='No entregado' then 1 else 0 end
  loop
    v_resultado:=v_item->>'resultado';
    if v_resultado='Devuelto parcial' then
      v_result:=public.registrar_devolucion_parcial_v9392(
        (v_item->>'orden_id')::bigint,v_item->'lineas',
        coalesce(nullif(v_item->>'monto_recibido','')::numeric,0),
        coalesce(nullif(v_item->>'metodo',''),'Efectivo'),p_recibido_por,
        concat_ws(' | ',nullif(btrim(v_item->>'observacion'),''),nullif(btrim(p_observacion),''))
      );
    else
      v_result:=public.recibir_orden_cxc_v937(
        (v_item->>'orden_id')::bigint,v_resultado,
        coalesce(nullif(v_item->>'monto_recibido','')::numeric,0),
        coalesce(nullif(v_item->>'metodo',''),'Efectivo'),p_recibido_por,
        concat_ws(' | ',nullif(btrim(v_item->>'observacion'),''),nullif(btrim(p_observacion),''))
      );
    end if;
  end loop;

  -- Después del cierre formal se reabren solo las órdenes no entregadas.
  for v_item in select value from jsonb_array_elements(p_items)
    where value->>'resultado'='No entregado'
  loop
    perform public.pc_retornar_no_entregado_validacion_v9393(
      (v_item->>'orden_id')::bigint,v_lote.id,p_recibido_por,
      concat_ws(' | ',nullif(btrim(v_item->>'observacion'),''),nullif(btrim(p_observacion),''))
    );
    v_returned:=v_returned+1;
  end loop;

  return coalesce(v_result,jsonb_build_object('ok',false,'mensaje','No se procesaron clientes.'))
    ||jsonb_build_object('version','9.3.9.3','cierre_atomico',true,
      'no_entregados_a_validacion',v_returned);
end;
$$;

revoke execute on function public.pc_retornar_no_entregado_validacion_v9393(bigint,bigint,text,text) from public;
revoke execute on function public.pc_finalizar_lote_cxc_v9393(bigint,text,text) from public;
revoke execute on function public.recibir_orden_cxc_v9393(bigint,text,numeric,text,text,text) from public;
revoke execute on function public.recibir_lote_cxc_v9393(bigint,jsonb,text,text) from public;
grant execute on function public.recibir_orden_cxc_v9393(bigint,text,numeric,text,text,text) to authenticated;
grant execute on function public.recibir_lote_cxc_v9393(bigint,jsonb,text,text) to authenticated;

notify pgrst,'reload schema';
commit;

select
  to_regprocedure('public.recibir_orden_cxc_v9393(bigint,text,numeric,text,text,text)') is not null as rpc_individual,
  to_regprocedure('public.recibir_lote_cxc_v9393(bigint,jsonb,text,text)') is not null as rpc_lote;

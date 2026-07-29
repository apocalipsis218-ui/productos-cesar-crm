-- =========================================================
-- 48 - V9.3.9.5 · CORREGIR RETORNO NO ENTREGADO A VALIDACIÓN
-- Productos César CRM
--
-- Corrige el error en tiempo de ejecución:
--   column "notas_estado" does not exist
--
-- La tabla ordenes conserva la nota operativa en notas_validacion.
-- La transición completa permanece en orden_estados_historial y
-- liquidacion_lote_eventos. No se agrega una columna redundante.
-- =========================================================
begin;

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
        coalesce(nullif(btrim(p_recibido_por),''),'CXC')||'.')
  where id=v_orden.id;

  insert into public.orden_estados_historial(
    orden_id,estado_anterior,estado_nuevo,comentario,usuario
  ) values (
    v_orden.id,'No entregado','Facturada',
    'V9.3.9.5: pedido no entregado regresó a Validación para reasignación. '||
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
      'reintento',coalesce(v_orden.no_entregado_reintentos,0)+1,
      'version','9.3.9.5')
  );

  return jsonb_build_object('ok',true,'orden_id',v_orden.id,
    'codigo_orden',v_orden.codigo,'retornada_validacion',true,
    'pendiente_reasignacion',true,'codigo_lote',v_lote.codigo_lote,
    'version','9.3.9.5');
end;
$$;

revoke execute on function public.pc_retornar_no_entregado_validacion_v9393(bigint,bigint,text,text) from public;

notify pgrst,'reload schema';
commit;

select
  to_regprocedure('public.pc_retornar_no_entregado_validacion_v9393(bigint,bigint,text,text)') is not null
    as retorno_no_entregado_corregido,
  exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='ordenes' and column_name='notas_validacion'
  ) as notas_validacion_disponible;

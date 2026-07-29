-- =========================================================
-- 49 - V9.3.9.6 · CANCELACIÓN SEGURA DE NO ENTREGADOS
-- Productos César CRM
--
-- Corrige dos falsos bloqueos del SQL 41:
--   1) Un lote cerrado se interpretaba como lote activo.
--   2) El intento histórico "No entregado" impedía cancelar una
--      orden ya retornada a Validación, aunque no tuviera cobros.
--
-- No elimina el detalle del lote, la entrega fallida ni el pesaje.
-- Toda esa relación se conserva como trazabilidad histórica.
-- =========================================================
begin;

create or replace function public.cancelar_orden_v9383(
  p_orden_id bigint,
  p_estado_esperado text,
  p_motivo text,
  p_archivar boolean default false
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_uid uuid:=auth.uid();
  v_o public.ordenes%rowtype;
  v_avanzada boolean:=false;
  v_retorno_no_entregado boolean:=false;
  v_snapshot jsonb;
  v_accion text;
  v_perfil public.perfiles%rowtype;
begin
  if v_uid is null then raise exception 'Sesión requerida.'; end if;
  if not public.es_admin_operativo() then
    raise exception 'Solo Gerente/Administrador puede cancelar o archivar órdenes.';
  end if;
  if char_length(btrim(coalesce(p_motivo,'')))<5 then
    raise exception 'El motivo debe tener al menos 5 caracteres.';
  end if;

  select * into v_o from public.ordenes where id=p_orden_id for update;
  if not found then raise exception 'La orden no existe.'; end if;
  if v_o.estado<>p_estado_esperado then
    raise exception 'La orden cambió de estado: se esperaba %, pero está en %.',p_estado_esperado,v_o.estado;
  end if;
  if v_o.estado='Anulado' or coalesce(v_o.archivada,false) then
    raise exception 'La orden ya está anulada o archivada.';
  end if;

  -- Cerrado, Revertido y Transferido totalmente son estados históricos,
  -- no una asignación activa que deba bloquear la anulación.
  if exists(
    select 1 from public.entrega_lote_detalle d
    join public.entrega_lotes l on l.id=d.lote_id
    where d.orden_id=p_orden_id
      and lower(btrim(coalesce(l.estado,''))) not in
        ('cerrado','revertido','transferido totalmente')
  ) then
    raise exception 'La orden pertenece a un lote activo. Corrige o revierte el lote antes de cancelarla.';
  end if;

  -- Excepción estricta: se puede cancelar una orden devuelta a Validación
  -- tras uno o varios intentos No entregado, únicamente si no existe dinero
  -- recibido ni otro resultado de entrega.
  v_retorno_no_entregado :=
    v_o.estado='Facturada'
    and v_o.resultado_entrega is null
    and v_o.recibido_en is null
    and v_o.ultimo_resultado_delivery='No entregado'
    and nullif(btrim(coalesce(v_o.ultimo_lote_no_entregado,'')),'') is not null
    and not exists(
      select 1 from public.orden_pagos p
      where p.orden_id=p_orden_id and coalesce(p.monto,0)>0
    )
    and exists(
      select 1 from public.orden_entregas e
      where e.orden_id=p_orden_id
        and lower(btrim(coalesce(e.resultado,''))) in ('no entregado','no_entregado')
    )
    and not exists(
      select 1 from public.orden_entregas e
      where e.orden_id=p_orden_id
        and (
          lower(btrim(coalesce(e.resultado,''))) not in ('no entregado','no_entregado')
          or coalesce(e.monto_cobrado,0)>0
          or coalesce(e.monto_pendiente,0)>0
        )
    );

  if (
    exists(select 1 from public.orden_pagos where orden_id=p_orden_id)
    or exists(select 1 from public.orden_entregas where orden_id=p_orden_id)
  ) and not v_retorno_no_entregado then
    raise exception 'La orden tiene entrega o pago registrado. Debe corregirse desde Liquidación antes de cancelarla.';
  end if;

  v_avanzada :=
    coalesce(v_o.estado,'') not in ('Programada','Pedido recibido')
    or v_o.tomado_por is not null
    or v_o.preparado_por is not null
    or v_o.facturado_por is not null
    or v_o.validado_por is not null
    or v_o.factura_no is not null
    or coalesce(v_o.cantidad_impresiones,0)>0
    or exists(select 1 from public.orden_pesos where orden_id=p_orden_id);

  if p_archivar and v_avanzada then
    raise exception 'Esta orden ya avanzó. Puede anularse, pero no ocultarse como una orden recién creada.';
  end if;

  select jsonb_build_object(
    'orden',to_jsonb(v_o),
    'detalle',coalesce((select jsonb_agg(to_jsonb(d) order by d.id) from public.orden_detalle d where d.orden_id=p_orden_id),'[]'::jsonb),
    'pesos',coalesce((select jsonb_agg(to_jsonb(p) order by p.id) from public.orden_pesos p where p.orden_id=p_orden_id),'[]'::jsonb),
    'entregas',coalesce((select jsonb_agg(to_jsonb(e) order by e.id) from public.orden_entregas e where e.orden_id=p_orden_id),'[]'::jsonb),
    'pagos',coalesce((select jsonb_agg(to_jsonb(pg) order by pg.id) from public.orden_pagos pg where pg.orden_id=p_orden_id),'[]'::jsonb),
    'lotes',coalesce((
      select jsonb_agg(
        jsonb_build_object('detalle',to_jsonb(d),'lote',to_jsonb(l))
        order by d.id
      )
      from public.entrega_lote_detalle d
      join public.entrega_lotes l on l.id=d.lote_id
      where d.orden_id=p_orden_id
    ),'[]'::jsonb)
  ) into v_snapshot;

  v_accion:=case when p_archivar then 'Archivada' else 'Anulada' end;

  update public.ordenes
  set estado='Anulado',
      archivada=p_archivar,
      archivada_en=case when p_archivar then now() else null end,
      archivada_por=case when p_archivar then v_uid else null end,
      motivo_anulacion=btrim(p_motivo),
      notas=concat_ws(E'\n',nullif(notas,''),
        '['||to_char(now(),'DD/MM/YYYY HH24:MI')||'] '||v_accion||': '||btrim(p_motivo)),
      actualizado_por=v_uid,
      actualizado_en=now()
  where id=p_orden_id;

  insert into public.orden_estados_historial(
    orden_id,estado_anterior,estado_nuevo,comentario,usuario
  ) values(
    p_orden_id,v_o.estado,'Anulado',
    v_accion||' de forma segura: '||btrim(p_motivo)||
      case when v_retorno_no_entregado
        then ' Orden retornada desde No entregado; lote e intento conservados como historial.'
        else '' end,
    v_uid
  );

  insert into public.orden_archivos_v9383(
    orden_id,orden_codigo,accion,motivo,estado_anterior,usuario_id,snapshot
  ) values(
    p_orden_id,v_o.codigo,v_accion,btrim(p_motivo),v_o.estado,v_uid,v_snapshot
  );

  select * into v_perfil from public.perfiles where id=v_uid;
  insert into public.auditoria_excepciones(
    usuario_id,usuario_nombre,usuario_rol,modulo,tipo_evento,gravedad,
    accion,motivo,orden_id,orden_codigo,cliente_nombre,detalle
  ) values(
    v_uid,coalesce(v_perfil.nombre,v_perfil.correo,v_uid::text),v_perfil.rol,
    'Órdenes','Cancelación segura de orden','Crítica',v_accion,btrim(p_motivo),
    p_orden_id,v_o.codigo,coalesce(v_o.cliente_nombre_orden,'Cliente'),
    jsonb_build_object(
      'estado_anterior',v_o.estado,
      'archivada',p_archivar,
      'retornada_desde_no_entregado',v_retorno_no_entregado,
      'lote_historico',v_o.ultimo_lote_no_entregado,
      'snapshot_id',currval(pg_get_serial_sequence('public.orden_archivos_v9383','id')),
      'version','9.3.9.6'
    )
  );

  return jsonb_build_object(
    'ok',true,'orden_id',p_orden_id,'codigo',v_o.codigo,
    'accion',v_accion,'estado','Anulado','archivada',p_archivar,
    'retornada_desde_no_entregado',v_retorno_no_entregado,
    'version','9.3.9.6'
  );
end;
$$;

revoke all on function public.cancelar_orden_v9383(bigint,text,text,boolean)
  from public,anon;
grant execute on function public.cancelar_orden_v9383(bigint,text,text,boolean)
  to authenticated;

notify pgrst,'reload schema';
commit;

select
  to_regprocedure('public.cancelar_orden_v9383(bigint,text,text,boolean)') is not null
    as cancelacion_corregida,
  '9.3.9.6' as version;

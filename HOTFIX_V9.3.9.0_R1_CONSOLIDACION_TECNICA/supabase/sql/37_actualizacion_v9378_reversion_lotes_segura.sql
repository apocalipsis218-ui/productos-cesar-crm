begin;

-- V9.3.7.9 - REVERSIÓN SEGURA DE LOTES
-- Corrige monto_pendiente NOT NULL y audita la reversión.

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
  v_user_role text;
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
  if exists(
    select 1 from public.liquidaciones_lotes
    where lote_id=v_lote.id or upper(codigo_lote)=upper(v_lote.codigo_lote)
  ) then
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

  select
    coalesce(nullif(trim(p_usuario_nombre),''),nullif(trim(p.nombre),''),'Usuario'),
    p.rol
  into v_user_name,v_user_role
  from public.perfiles p
  where p.id=auth.uid();
  v_user_name:=coalesce(v_user_name,nullif(trim(p_usuario_nombre),''),'Usuario');

  if p_accion='cambiar_delivery' then
    if v_new_name='' then raise exception 'Selecciona el nuevo responsable.'; end if;
    if lower(v_new_name)=lower(trim(coalesce(v_lote.responsable_nombre,v_lote.delivery_nombre,''))) then
      raise exception 'Selecciona un responsable diferente.';
    end if;

    select e.id,
      case when lower(coalesce(e.area,'')) like '%delivery%'
        then 'delivery_registrado' else 'otro_empleado' end
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
          'Responsable corregido V9.3.7.9: '||v_new_name||' ('||v_new_type||'). Motivo: '||trim(p_motivo))
    where id=any(v_order_ids);
  else
    insert into public.orden_estados_historial(
      orden_id,estado_anterior,estado_nuevo,comentario,usuario
    )
    select o.id,o.estado,'Facturada',
      'Lote '||v_lote.codigo_lote||' revertido desde Validación. Motivo: '||trim(p_motivo),
      auth.uid()
    from public.ordenes o
    where o.id=any(v_order_ids);

    update public.ordenes
    set estado='Facturada',
        delivery_nombre=null,
        asignado_delivery_en=null,
        resultado_entrega=null,
        monto_cobrado=0,
        monto_pendiente=0,
        recibido_en=null,
        notas_validacion=concat_ws(' | ',nullif(trim(notas_validacion),''),
          'Corrección V9.3.7.9: lote '||v_lote.codigo_lote||' revertido. Motivo: '||trim(p_motivo))
    where id=any(v_order_ids);

    update public.entrega_lotes
    set estado='Revertido',
        corregido_en=v_now,
        corregido_por=auth.uid(),
        motivo_correccion=trim(p_motivo),
        hoja_ruta_snapshot=jsonb_set(
          coalesce(hoja_ruta_snapshot,'{}'::jsonb),
          '{estado}',to_jsonb('Revertido'::text),true
        )
    where id=v_lote.id;

    insert into public.auditoria_excepciones(
      usuario_id,usuario_nombre,usuario_rol,modulo,tipo_evento,gravedad,
      accion,motivo,lote_codigo,detalle,dispositivo
    )
    values(
      auth.uid(),v_user_name,v_user_role,'Validación','Reversión de lote de entrega','Crítica',
      'Revirtió lote y devolvió órdenes a Validación',trim(p_motivo),v_lote.codigo_lote,
      jsonb_build_object(
        'lote_id',v_lote.id,
        'orden_ids',v_order_ids,
        'cantidad_ordenes',coalesce(array_length(v_order_ids,1),0),
        'responsable_anterior',coalesce(v_lote.responsable_nombre,v_lote.delivery_nombre),
        'estado_anterior',v_lote.estado,
        'estado_nuevo','Revertido',
        'ordenes_estado_nuevo','Facturada'
      ),
      'RPC corregir_lote_entrega_v936'
    );
  end if;

  insert into public.entrega_lote_correcciones(
    lote_id,codigo_lote,accion,delivery_anterior,delivery_nuevo,motivo,
    usuario_id,usuario_nombre,metadata
  )
  values(
    v_lote.id,v_lote.codigo_lote,p_accion,
    coalesce(v_lote.responsable_nombre,v_lote.delivery_nombre),
    case when p_accion='cambiar_delivery' then v_new_name else null end,
    trim(p_motivo),auth.uid(),v_user_name,
    jsonb_build_object(
      'orden_ids',v_order_ids,
      'estado_anterior',v_lote.estado,
      'responsable_tipo_nuevo',v_new_type,
      'monto_pendiente_restablecido',case when p_accion='revertir_lote' then 0 else null end
    )
  );

  return jsonb_build_object(
    'ok',true,'lote_id',v_lote.id,'codigo_lote',v_lote.codigo_lote,'accion',p_accion,
    'responsable_nuevo',case when p_accion='cambiar_delivery' then v_new_name else null end,
    'responsable_tipo_nuevo',case when p_accion='cambiar_delivery' then v_new_type else null end,
    'ordenes',coalesce(array_length(v_order_ids,1),0)
  );
end;
$$;

revoke execute on function public.corregir_lote_entrega_v936(bigint,text,text,text,text) from public, anon;
grant execute on function public.corregir_lote_entrega_v936(bigint,text,text,text,text) to authenticated;

notify pgrst, 'reload schema';
commit;

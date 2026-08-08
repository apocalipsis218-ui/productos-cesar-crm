-- =========================================================
-- V9.4.2 R1 · CIERRE DE ESCRITURAS DIRECTAS
-- Productos César CRM
-- =========================================================

begin;

-- ---------------------------------------------------------
-- 0. PRERREQUISITOS
-- ---------------------------------------------------------
do $$
begin
  if to_regclass('public.ordenes') is null
     or to_regclass('public.orden_estados_historial') is null
     or to_regclass('public.orden_casos_historial') is null then
    raise exception 'Faltan tablas operativas de órdenes e historial.';
  end if;

  if to_regprocedure('public.es_admin_operativo()') is null
     or to_regprocedure('public.tiene_algun_modulo(text[],text)') is null
     or to_regprocedure('public.revertir_gestion_segura(bigint,text)') is null
     or to_regprocedure('public.actualizar_usuario_permisos_v930r9(uuid,text,text,boolean,text,bigint,text,jsonb)') is null then
    raise exception 'Faltan RPC de seguridad requeridas por V9.4.2 R1.';
  end if;
end $$;

-- ---------------------------------------------------------
-- 1. EVENTOS DE ORDEN: SOLO POR RPC
-- ---------------------------------------------------------
create or replace function public.registrar_evento_orden_v942(
  p_orden_id bigint,
  p_comentario text
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_uid uuid:=auth.uid();
  v_o public.ordenes%rowtype;
  v_comentario text:=btrim(coalesce(p_comentario,''));
begin
  if v_uid is null then
    raise exception 'Sesión requerida.';
  end if;

  if not public.es_admin_operativo()
     and not public.tiene_algun_modulo(
       array['ordenes','control','carniceria','facturacion','validacion','delivery','liquidacion'],
       'editar'
     ) then
    raise exception 'No tienes permiso para registrar eventos de órdenes.';
  end if;

  if char_length(v_comentario) not between 3 and 500 then
    raise exception 'El comentario debe tener entre 3 y 500 caracteres.';
  end if;

  select * into v_o
  from public.ordenes
  where id=p_orden_id
  for share;

  if not found then
    raise exception 'La orden no existe.';
  end if;

  insert into public.orden_estados_historial(
    orden_id,estado_anterior,estado_nuevo,comentario,usuario
  ) values (
    v_o.id,v_o.estado,v_o.estado,v_comentario,v_uid
  );

  return jsonb_build_object(
    'ok',true,
    'orden_id',v_o.id,
    'estado',v_o.estado,
    'version','9.4.2-r1'
  );
end;
$$;

-- ---------------------------------------------------------
-- 2. IMPRESIÓN DE PREPARACIÓN: CONTADOR + HISTORIAL ATÓMICO
-- ---------------------------------------------------------
create or replace function public.registrar_impresion_preparacion_v942(
  p_orden_id bigint,
  p_estado_esperado text
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_uid uuid:=auth.uid();
  v_o public.ordenes%rowtype;
  v_total integer;
begin
  if v_uid is null then
    raise exception 'Sesión requerida.';
  end if;

  if not public.es_admin_operativo()
     and not public.tiene_algun_modulo(array['ordenes','control','carniceria'],'editar') then
    raise exception 'No tienes permiso para imprimir órdenes de preparación.';
  end if;

  select * into v_o
  from public.ordenes
  where id=p_orden_id
  for update;

  if not found then
    raise exception 'La orden no existe.';
  end if;

  if coalesce(v_o.archivada,false) or v_o.estado='Anulado' then
    raise exception 'No se puede imprimir una orden archivada o anulada.';
  end if;

  if p_estado_esperado is not null
     and v_o.estado is distinct from p_estado_esperado then
    raise exception 'La orden cambió de estado. Actualiza la pantalla antes de imprimir.';
  end if;

  update public.ordenes
  set impresiones_preparacion=coalesce(impresiones_preparacion,0)+1,
      ultima_impresion_preparacion=now(),
      impreso_preparacion_por=v_uid,
      actualizado_por=v_uid,
      actualizado_en=now()
  where id=v_o.id
  returning impresiones_preparacion into v_total;

  insert into public.orden_estados_historial(
    orden_id,estado_anterior,estado_nuevo,comentario,usuario
  ) values (
    v_o.id,v_o.estado,v_o.estado,
    'Impresión de orden de preparación 80 mm',v_uid
  );

  return jsonb_build_object(
    'ok',true,
    'orden_id',v_o.id,
    'impresiones_preparacion',v_total,
    'version','9.4.2-r1'
  );
end;
$$;

-- ---------------------------------------------------------
-- 3. CASOS ESPECIALES: CAMBIO + DOS HISTORIALES ATÓMICOS
-- ---------------------------------------------------------
create or replace function public.actualizar_caso_especial_v942(
  p_orden_id bigint,
  p_estado_esperado text,
  p_actualizado_en_esperado timestamptz,
  p_cambios jsonb,
  p_comentario text
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_uid uuid:=auth.uid();
  v_o public.ordenes%rowtype;
  v_estado_nuevo text;
  v_estado_caso text;
  v_tipo text;
  v_actor text;
  v_comentario text:=btrim(coalesce(p_comentario,''));
begin
  if v_uid is null then
    raise exception 'Sesión requerida.';
  end if;

  if not public.es_admin_operativo()
     and not public.tiene_algun_modulo(array['ordenes','control'],'editar') then
    raise exception 'No tienes permiso para actualizar casos especiales.';
  end if;

  if jsonb_typeof(p_cambios) is distinct from 'object' then
    raise exception 'Los cambios del caso no son válidos.';
  end if;

  if exists (
    select 1
    from jsonb_object_keys(p_cambios) as k(clave)
    where k.clave <> all(array[
      'tipo_orden','requiere_preparacion','requiere_facturacion','requiere_delivery',
      'modalidad_entrega','delivery_nombre','estado_caso_especial','responsable_caso',
      'accion_caso','producto_recoger','producto_entregar','monto_ajuste',
      'fecha_compromiso','requiere_nota_credito','resolucion_caso','notas','estado'
    ]::text[])
  ) then
    raise exception 'La solicitud contiene campos no autorizados.';
  end if;

  if char_length(v_comentario) not between 3 and 1000 then
    raise exception 'El comentario debe tener entre 3 y 1000 caracteres.';
  end if;

  select * into v_o
  from public.ordenes
  where id=p_orden_id
  for update;

  if not found then
    raise exception 'La orden no existe.';
  end if;

  if coalesce(v_o.archivada,false) or v_o.estado='Anulado' then
    raise exception 'No se puede modificar un caso archivado o anulado.';
  end if;

  if p_estado_esperado is not null
     and v_o.estado is distinct from p_estado_esperado then
    raise exception 'La orden cambió de estado. Actualiza la pantalla e intenta nuevamente.';
  end if;

  if p_actualizado_en_esperado is not null
     and v_o.actualizado_en is distinct from p_actualizado_en_esperado then
    raise exception 'Otro usuario modificó esta orden. Actualiza la pantalla antes de guardar.';
  end if;

  v_tipo:=case when p_cambios ? 'tipo_orden'
    then nullif(btrim(p_cambios->>'tipo_orden'),'') else v_o.tipo_orden end;
  if v_tipo not in(
    'Devolución / recogida','Cambio / sustitución','Incidente / reclamo'
  ) then
    raise exception 'Tipo de caso especial no válido.';
  end if;

  v_estado_caso:=case when p_cambios ? 'estado_caso_especial'
    then nullif(btrim(p_cambios->>'estado_caso_especial'),'')
    else v_o.estado_caso_especial end;
  if v_estado_caso not in(
    'Abierto','En revisión','Asignado a delivery','En ruta de recogida',
    'Pendiente de crédito','Resuelto','Cerrado'
  ) then
    raise exception 'Estado de caso especial no válido.';
  end if;

  v_estado_nuevo:=case when p_cambios ? 'estado'
    then nullif(btrim(p_cambios->>'estado'),'') else v_o.estado end;
  if v_estado_nuevo is null then
    raise exception 'El estado operativo no puede quedar vacío.';
  end if;

  select coalesce(nullif(btrim(nombre),''),nullif(btrim(correo),''),v_uid::text)
  into v_actor
  from public.perfiles
  where id=v_uid;
  v_actor:=coalesce(v_actor,v_uid::text);

  update public.ordenes
  set tipo_orden=v_tipo,
      requiere_preparacion=case when p_cambios ? 'requiere_preparacion'
        then (p_cambios->>'requiere_preparacion')::boolean else v_o.requiere_preparacion end,
      requiere_facturacion=case when p_cambios ? 'requiere_facturacion'
        then (p_cambios->>'requiere_facturacion')::boolean else v_o.requiere_facturacion end,
      requiere_delivery=case when p_cambios ? 'requiere_delivery'
        then (p_cambios->>'requiere_delivery')::boolean else v_o.requiere_delivery end,
      modalidad_entrega=case when p_cambios ? 'modalidad_entrega'
        then nullif(btrim(p_cambios->>'modalidad_entrega'),'') else v_o.modalidad_entrega end,
      delivery_nombre=case when p_cambios ? 'delivery_nombre'
        then nullif(btrim(p_cambios->>'delivery_nombre'),'') else v_o.delivery_nombre end,
      estado_caso_especial=v_estado_caso,
      responsable_caso=case when p_cambios ? 'responsable_caso'
        then nullif(btrim(p_cambios->>'responsable_caso'),'') else v_o.responsable_caso end,
      accion_caso=case when p_cambios ? 'accion_caso'
        then nullif(btrim(p_cambios->>'accion_caso'),'') else v_o.accion_caso end,
      producto_recoger=case when p_cambios ? 'producto_recoger'
        then nullif(btrim(p_cambios->>'producto_recoger'),'') else v_o.producto_recoger end,
      producto_entregar=case when p_cambios ? 'producto_entregar'
        then nullif(btrim(p_cambios->>'producto_entregar'),'') else v_o.producto_entregar end,
      monto_ajuste=case when p_cambios ? 'monto_ajuste'
        then greatest(coalesce(nullif(p_cambios->>'monto_ajuste','')::numeric,0),0)
        else v_o.monto_ajuste end,
      fecha_compromiso=case when p_cambios ? 'fecha_compromiso'
        then nullif(p_cambios->>'fecha_compromiso','')::date else v_o.fecha_compromiso end,
      requiere_nota_credito=case when p_cambios ? 'requiere_nota_credito'
        then (p_cambios->>'requiere_nota_credito')::boolean else v_o.requiere_nota_credito end,
      resolucion_caso=case when p_cambios ? 'resolucion_caso'
        then nullif(btrim(p_cambios->>'resolucion_caso'),'') else v_o.resolucion_caso end,
      notas=case when p_cambios ? 'notas'
        then nullif(p_cambios->>'notas','') else v_o.notas end,
      estado=v_estado_nuevo,
      caso_resuelto_por=case when v_estado_caso in('Resuelto','Cerrado')
        then v_actor else null end,
      caso_resuelto_en=case when v_estado_caso in('Resuelto','Cerrado')
        then coalesce(v_o.caso_resuelto_en,now()) else null end,
      actualizado_por=v_uid,
      actualizado_en=now()
  where id=v_o.id;

  insert into public.orden_casos_historial(
    orden_id,estado_caso,comentario,usuario
  ) values (
    v_o.id,v_estado_caso,v_comentario,v_uid
  );

  insert into public.orden_estados_historial(
    orden_id,estado_anterior,estado_nuevo,comentario,usuario
  ) values (
    v_o.id,v_o.estado,v_estado_nuevo,
    'Caso especial: '||v_estado_caso||'. '||v_comentario,v_uid
  );

  return jsonb_build_object(
    'ok',true,
    'orden_id',v_o.id,
    'estado',v_estado_nuevo,
    'estado_caso_especial',v_estado_caso,
    'version','9.4.2-r1'
  );
end;
$$;

-- ---------------------------------------------------------
-- 4. EXPONER ÚNICAMENTE LAS RPC NECESARIAS
-- ---------------------------------------------------------
revoke all on function public.registrar_evento_orden_v942(bigint,text)
  from public,anon,authenticated;
revoke all on function public.registrar_impresion_preparacion_v942(bigint,text)
  from public,anon,authenticated;
revoke all on function public.actualizar_caso_especial_v942(bigint,text,timestamptz,jsonb,text)
  from public,anon,authenticated;

grant execute on function public.registrar_evento_orden_v942(bigint,text)
  to authenticated;
grant execute on function public.registrar_impresion_preparacion_v942(bigint,text)
  to authenticated;
grant execute on function public.actualizar_caso_especial_v942(bigint,text,timestamptz,jsonb,text)
  to authenticated;

-- ---------------------------------------------------------
-- 5. RETIRAR POLÍTICAS PERMISIVAS HEREDADAS
-- ---------------------------------------------------------
drop policy if exists ordenes_select_programadas on public.ordenes;
drop policy if exists ordenes_update_programadas on public.ordenes;
drop policy if exists orden_estados_historial_all on public.orden_estados_historial;

-- Las lecturas siguen bajo las políticas RLS operativas vigentes.
revoke all on table public.ordenes from anon;
revoke all on table public.orden_estados_historial from anon;

revoke insert,update,delete,truncate,references,trigger
  on table public.ordenes from authenticated;
revoke insert,update,delete,truncate,references,trigger
  on table public.orden_estados_historial from authenticated;

grant select on table public.ordenes to authenticated;
grant select on table public.orden_estados_historial to authenticated;

-- Nuevos objetos dejan de exponerse por accidente. Cada migración futura
-- deberá declarar sus GRANT explícitos junto con RLS.
alter default privileges for role postgres in schema public
  revoke select,insert,update,delete,truncate,references,trigger
  on tables from anon,authenticated;
alter default privileges for role postgres in schema public
  revoke usage,select,update on sequences from anon,authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from public,anon,authenticated;

notify pgrst,'reload schema';

commit;

-- ---------------------------------------------------------
-- 6. VERIFICACIÓN DE LA MIGRACIÓN
-- ---------------------------------------------------------
select
  not exists(
    select 1 from pg_policies
    where schemaname='public' and tablename='ordenes'
      and policyname in('ordenes_select_programadas','ordenes_update_programadas')
  ) as politicas_ordenes_abiertas_retiradas,
  not exists(
    select 1 from pg_policies
    where schemaname='public' and tablename='orden_estados_historial'
      and policyname='orden_estados_historial_all'
  ) as politica_historial_abierta_retirada,
  not has_table_privilege('authenticated','public.ordenes','insert,update,delete,truncate')
    as ordenes_sin_escritura_directa,
  not has_table_privilege('authenticated','public.orden_estados_historial','insert,update,delete,truncate')
    as historial_sin_escritura_directa,
  has_function_privilege(
    'authenticated','public.registrar_evento_orden_v942(bigint,text)','execute'
  ) as rpc_evento_authenticated,
  not has_function_privilege(
    'anon','public.registrar_evento_orden_v942(bigint,text)','execute'
  ) as rpc_evento_cerrada_anon,
  '9.4.2-r1' as version;

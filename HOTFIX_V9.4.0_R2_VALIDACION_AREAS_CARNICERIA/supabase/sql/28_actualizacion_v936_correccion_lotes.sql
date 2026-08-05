-- =========================================================
-- 28 - V9.3.6 CORRECCIÓN SEGURA DE LOTES DE DELIVERY
-- Productos César CRM
-- Ejecutar completo en Supabase SQL Editor antes del frontend V9.3.6.
-- =========================================================
begin;

alter table public.entrega_lotes
  add column if not exists corregido_en timestamptz,
  add column if not exists corregido_por uuid references auth.users(id) on delete set null,
  add column if not exists motivo_correccion text;

create table if not exists public.entrega_lote_correcciones (
  id bigserial primary key,
  lote_id bigint not null references public.entrega_lotes(id) on delete restrict,
  codigo_lote text not null,
  accion text not null check (accion in ('cambiar_delivery','revertir_lote')),
  delivery_anterior text,
  delivery_nuevo text,
  motivo text not null check (length(trim(motivo)) >= 5),
  usuario_id uuid references auth.users(id) on delete set null,
  usuario_nombre text,
  fecha_evento timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_entrega_lote_correcciones_lote_fecha
on public.entrega_lote_correcciones(lote_id, fecha_evento desc);

alter table public.entrega_lote_correcciones enable row level security;

drop policy if exists entrega_lote_correcciones_select_v936 on public.entrega_lote_correcciones;
create policy entrega_lote_correcciones_select_v936
on public.entrega_lote_correcciones for select to authenticated
using (public.puede_modulo_v930r5('validacion','ver'));

-- Las modificaciones se realizan exclusivamente mediante la RPC transaccional.
revoke insert, update, delete on public.entrega_lote_correcciones from authenticated;
grant select on public.entrega_lote_correcciones to authenticated;
grant usage, select on sequence public.entrega_lote_correcciones_id_seq to authenticated;

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
      or o.estado in ('En ruta','Cobrado','Entregado a crédito','No entregado','Devuelto parcial','Cerrado','Liquidado')
    );
  if v_blocked>0 then
    raise exception 'El lote ya tiene ruta, resultado, cobro o recepción posterior.';
  end if;

  select coalesce(nullif(trim(p_usuario_nombre),''),nullif(trim(p.nombre),''),'Usuario')
  into v_user_name from public.perfiles p where p.id=auth.uid();
  v_user_name:=coalesce(v_user_name,nullif(trim(p_usuario_nombre),''),'Usuario');

  if p_accion='cambiar_delivery' then
    if nullif(trim(coalesce(p_nuevo_delivery,'')),'') is null then raise exception 'Selecciona el nuevo delivery.'; end if;
    if lower(trim(p_nuevo_delivery))=lower(trim(v_lote.delivery_nombre)) then raise exception 'Selecciona un delivery diferente.'; end if;

    update public.entrega_lotes
    set delivery_nombre=trim(p_nuevo_delivery), corregido_en=v_now, corregido_por=auth.uid(), motivo_correccion=trim(p_motivo),
        hoja_ruta_snapshot=jsonb_set(coalesce(hoja_ruta_snapshot,'{}'::jsonb),'{delivery_nombre}',to_jsonb(trim(p_nuevo_delivery)),true)
    where id=v_lote.id;

    update public.ordenes set delivery_nombre=trim(p_nuevo_delivery) where id=any(v_order_ids);
  else
    insert into public.orden_estados_historial(orden_id,estado_anterior,estado_nuevo,comentario,usuario)
    select o.id,o.estado,'Facturada','Lote '||v_lote.codigo_lote||' revertido desde Validación. Motivo: '||trim(p_motivo),auth.uid()
    from public.ordenes o where o.id=any(v_order_ids);

    update public.ordenes
    set estado='Facturada', delivery_nombre=null, asignado_delivery_en=null, resultado_entrega=null,
        monto_cobrado=0, monto_pendiente=null, recibido_en=null,
        notas_validacion=concat_ws(' | ',
          nullif(trim(both ' |' from regexp_replace(coalesce(notas_validacion,''),'(^|[[:space:]]*\|[[:space:]]*)Lote:[[:space:]]*LOT-[A-Z0-9-]+','','gi')),''),
          'Corrección V9.3.6: lote '||v_lote.codigo_lote||' revertido. Motivo: '||trim(p_motivo)
        )
    where id=any(v_order_ids);

    update public.entrega_lotes
    set estado='Revertido', corregido_en=v_now, corregido_por=auth.uid(), motivo_correccion=trim(p_motivo),
        hoja_ruta_snapshot=jsonb_set(coalesce(hoja_ruta_snapshot,'{}'::jsonb),'{estado}',to_jsonb('Revertido'::text),true)
    where id=v_lote.id;
  end if;

  insert into public.entrega_lote_correcciones(lote_id,codigo_lote,accion,delivery_anterior,delivery_nuevo,motivo,usuario_id,usuario_nombre,metadata)
  values(v_lote.id,v_lote.codigo_lote,p_accion,v_lote.delivery_nombre,case when p_accion='cambiar_delivery' then trim(p_nuevo_delivery) else null end,trim(p_motivo),auth.uid(),v_user_name,jsonb_build_object('orden_ids',v_order_ids,'estado_anterior',v_lote.estado));

  return jsonb_build_object('ok',true,'lote_id',v_lote.id,'codigo_lote',v_lote.codigo_lote,'accion',p_accion,'ordenes',coalesce(array_length(v_order_ids,1),0));
end;
$$;

grant execute on function public.corregir_lote_entrega_v936(bigint,text,text,text,text) to authenticated;
notify pgrst, 'reload schema';
commit;

select
  to_regclass('public.entrega_lote_correcciones') is not null as tabla_correcciones,
  to_regprocedure('public.corregir_lote_entrega_v936(bigint,text,text,text,text)') is not null as rpc_correccion,
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='entrega_lotes' and column_name='corregido_en') as lote_ampliado;

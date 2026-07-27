begin;

-- =========================================================
-- V9.3.9.2 R2 · DEVOLUCIÓN INTEGRADA AL CIERRE DEL LOTE
-- Ejecutar una sola vez después del SQL 45.
-- Recibe cobros, créditos, no entregados y devoluciones detalladas
-- dentro de una única transacción de PostgreSQL.
-- =========================================================

create or replace function public.recibir_lote_cxc_v9392_r2(
  p_lote_id bigint,
  p_items jsonb,
  p_recibido_por text,
  p_observacion text default null
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_lote public.entrega_lotes%rowtype;
  v_item jsonb;
  v_resultado text;
  v_missing integer;
  v_invalid integer;
  v_result jsonb;
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

  select count(*) into v_invalid
  from jsonb_array_elements(p_items) j
  where nullif(j->>'orden_id','') is null
     or coalesce(j->>'resultado','') not in('Cobrado','Entregado a crédito','No entregado','Devuelto parcial')
     or not exists(
       select 1 from public.entrega_lote_detalle d
       join public.ordenes o on o.id=d.orden_id
       where d.lote_id=v_lote.id
         and d.orden_id=(j->>'orden_id')::bigint
         and o.recibido_en is null
     );
  if v_invalid>0 then
    raise exception 'La recepción contiene % cliente(s) inválidos, ajenos al lote o ya recibidos.',v_invalid;
  end if;

  if (select count(*) from jsonb_array_elements(p_items)) <>
     (select count(distinct (j->>'orden_id')) from jsonb_array_elements(p_items) j) then
    raise exception 'La recepción contiene una orden repetida dentro del mismo lote.';
  end if;

  select count(*) into v_missing
  from public.entrega_lote_detalle d
  join public.ordenes o on o.id=d.orden_id
  where d.lote_id=v_lote.id and o.recibido_en is null
    and not exists(
      select 1 from jsonb_array_elements(p_items) j
      where (j->>'orden_id')::bigint=o.id
    );
  if v_missing>0 then
    raise exception 'Faltan % cliente(s) pendientes dentro de la recepción del lote.',v_missing;
  end if;

  if exists(
    select 1 from jsonb_array_elements(p_items) j
    where j->>'resultado'='Devuelto parcial'
      and (coalesce(jsonb_typeof(j->'lineas'),'')<>'array' or coalesce(jsonb_array_length(j->'lineas'),0)=0)
  ) then
    raise exception 'Toda devolución parcial debe incluir el detalle de artículos.';
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_resultado:=v_item->>'resultado';
    if v_resultado='Devuelto parcial' then
      v_result:=public.registrar_devolucion_parcial_v9392(
        (v_item->>'orden_id')::bigint,
        v_item->'lineas',
        coalesce(nullif(v_item->>'monto_recibido','')::numeric,0),
        coalesce(nullif(v_item->>'metodo',''),'Efectivo'),
        p_recibido_por,
        concat_ws(' | ',nullif(btrim(v_item->>'observacion'),''),nullif(btrim(p_observacion),''))
      );
    else
      v_result:=public.recibir_orden_cxc_v937(
        (v_item->>'orden_id')::bigint,
        v_resultado,
        coalesce(nullif(v_item->>'monto_recibido','')::numeric,0),
        coalesce(nullif(v_item->>'metodo',''),'Efectivo'),
        p_recibido_por,
        concat_ws(' | ',nullif(btrim(v_item->>'observacion'),''),nullif(btrim(p_observacion),''))
      );
    end if;
  end loop;

  return coalesce(v_result,jsonb_build_object('ok',false,'mensaje','No se procesaron clientes.'))
    ||jsonb_build_object('version','9.3.9.2 R2','cierre_atomico',true);
end;
$$;

revoke execute on function public.recibir_lote_cxc_v9392_r2(bigint,jsonb,text,text) from public;
grant execute on function public.recibir_lote_cxc_v9392_r2(bigint,jsonb,text,text) to authenticated;

notify pgrst,'reload schema';
commit;

select to_regprocedure('public.recibir_lote_cxc_v9392_r2(bigint,jsonb,text,text)') is not null as rpc_r2;

-- 15_actualizacion_v63_reverso_seguro.sql
-- Productos César · V6.3 Reverso seguro de gestiones y órdenes vinculadas
-- Ejecutar después de V6.1/V6.2.

create or replace function public.revertir_gestion_segura(
  p_llamada_id bigint,
  p_motivo text default 'Gestión revertida desde Control'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_llamada record;
  v_rol text;
  v_order record;
  v_advanced boolean;
  v_motivo text := coalesce(nullif(trim(p_motivo),''),'Gestión revertida desde Control');
  v_orders_count int := 0;
  v_deleted_orders int := 0;
  v_annulled_orders int := 0;
begin
  select * into v_llamada
  from public.llamadas
  where id = p_llamada_id;

  if not found then
    return jsonb_build_object('ok', false, 'message', 'No se encontró la gestión.');
  end if;

  v_rol := public.mi_rol();

  if coalesce(v_rol,'') not in ('Gerente','Supervisor') then
    -- Conserva compatibilidad si luego se permite a vendedores revertir su propia cartera.
    if not exists (
      select 1 from public.clientes c
      where c.id = v_llamada.cliente_id
        and c.vendedor = public.mi_vendedor()
        and coalesce(v_rol,'') in ('Vendedor','Control')
    ) then
      raise exception 'No tienes permiso para revertir esta gestión.';
    end if;
  end if;

  -- Revisa órdenes vinculadas por llamada_id o por pedido_crm_id.
  for v_order in
    select o.*
    from public.ordenes o
    where o.llamada_id = p_llamada_id
       or o.pedido_crm_id in (select p.id from public.pedidos p where p.llamada_id = p_llamada_id)
  loop
    v_orders_count := v_orders_count + 1;

    v_advanced := false;
    if coalesce(v_order.estado,'') not in ('','Pedido recibido','Programada','Anulado') then
      v_advanced := true;
    end if;
    if coalesce(v_order.preparado_por,'') <> ''
       or coalesce(v_order.facturado_por,'') <> ''
       or coalesce(v_order.validado_por,'') <> ''
       or coalesce(v_order.recibido_por,'') <> ''
       or coalesce(v_order.factura_no,'') <> ''
       or coalesce(v_order.delivery_nombre,'') <> ''
       or coalesce(v_order.peso_preparado,0) <> 0
       or coalesce(v_order.peso_facturado,0) <> 0
       or coalesce(v_order.peso_validado,0) <> 0
       or coalesce(v_order.cantidad_impresiones,0) <> 0 then
      v_advanced := true;
    end if;
    if exists (select 1 from public.orden_pesos p where p.orden_id = v_order.id) then v_advanced := true; end if;
    if exists (select 1 from public.orden_entregas e where e.orden_id = v_order.id) then v_advanced := true; end if;
    if exists (select 1 from public.orden_pagos pg where pg.orden_id = v_order.id) then v_advanced := true; end if;

    if v_advanced then
      update public.ordenes
      set estado = 'Anulado',
          llamada_id = null,
          pedido_crm_id = null,
          notas = concat_ws(E'\n', nullif(notas,''), '[' || to_char(now(),'DD/MM/YYYY HH24:MI') || '] Orden anulada por reverso de gestión: ' || v_motivo),
          actualizado_en = now()
      where id = v_order.id;

      insert into public.orden_estados_historial (orden_id, estado_anterior, estado_nuevo, comentario, creado_por)
      values (v_order.id, v_order.estado, 'Anulado', 'Reverso seguro de gestión: ' || v_motivo, auth.uid())
      on conflict do nothing;

      v_annulled_orders := v_annulled_orders + 1;
    else
      delete from public.orden_pagos where orden_id = v_order.id;
      delete from public.orden_entregas where orden_id = v_order.id;
      delete from public.orden_pesos where orden_id = v_order.id;
      delete from public.orden_estados_historial where orden_id = v_order.id;
      delete from public.orden_detalle where orden_id = v_order.id;
      delete from public.ordenes where id = v_order.id;
      v_deleted_orders := v_deleted_orders + 1;
    end if;
  end loop;

  -- Limpia el pedido CRM interno antes de borrar la llamada para evitar el FK pedidos_llamada_id_fkey.
  delete from public.pedidos where llamada_id = p_llamada_id;

  -- Borra la gestión. Al eliminarse, el cliente vuelve a pendientes según la agenda del día.
  delete from public.llamadas where id = p_llamada_id;

  return jsonb_build_object(
    'ok', true,
    'message', 'Gestión revertida de forma segura.',
    'orders_found', v_orders_count,
    'orders_deleted', v_deleted_orders,
    'orders_annulled', v_annulled_orders
  );
end;
$$;

grant execute on function public.revertir_gestion_segura(bigint,text) to authenticated;

select 'listo: V6.3 reverso seguro de gestiones y órdenes vinculadas' as estado;

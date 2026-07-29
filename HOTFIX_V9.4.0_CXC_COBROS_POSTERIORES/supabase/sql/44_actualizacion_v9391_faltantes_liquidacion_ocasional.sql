begin;

-- =========================================================
-- V9.3.9.1
-- 1) Liquidación segura de clientes ocasionales.
-- 2) Órdenes pendientes por artículos sin existencia.
-- Ejecutar una sola vez después del SQL 43.
-- No elimina ni transforma información comercial existente.
-- =========================================================

-- Los clientes ocasionales viven en el snapshot de la orden y, por diseño,
-- no tienen un registro en public.clientes. El pago conserva ambos modelos.
alter table public.orden_pagos
  alter column cliente_id drop not null,
  add column if not exists cliente_nombre text,
  add column if not exists cliente_telefono text,
  add column if not exists tipo_cliente text;

create or replace function public.pc_snapshot_pago_cliente_v9391()
returns trigger
language plpgsql
set search_path=public,pg_temp
as $$
declare
  v_orden public.ordenes%rowtype;
begin
  select * into v_orden from public.ordenes where id=new.orden_id;
  if not found then raise exception 'La orden asociada al pago no existe.'; end if;

  new.cliente_id:=coalesce(new.cliente_id,v_orden.cliente_id);
  new.cliente_nombre:=coalesce(
    nullif(btrim(new.cliente_nombre),''),
    nullif(btrim(v_orden.cliente_nombre_orden),''),
    (select nullif(btrim(c.negocio),'') from public.clientes c where c.id=v_orden.cliente_id),
    'Cliente ocasional'
  );
  new.cliente_telefono:=coalesce(
    nullif(btrim(new.cliente_telefono),''),
    nullif(btrim(v_orden.cliente_telefono_orden),''),
    (select nullif(btrim(c.telefono),'') from public.clientes c where c.id=v_orden.cliente_id)
  );
  new.tipo_cliente:=coalesce(
    nullif(btrim(new.tipo_cliente),''),
    nullif(btrim(v_orden.tipo_cliente_orden),''),
    case when v_orden.cliente_id is null then 'Ocasional' else 'Registrado' end
  );

  if new.cliente_id is null and nullif(btrim(new.cliente_nombre),'') is null then
    raise exception 'El pago de un cliente ocasional requiere el nombre conservado en la orden.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_snapshot_pago_cliente_v9391 on public.orden_pagos;
create trigger trg_snapshot_pago_cliente_v9391
before insert or update of orden_id,cliente_id,cliente_nombre,cliente_telefono,tipo_cliente
on public.orden_pagos
for each row execute function public.pc_snapshot_pago_cliente_v9391();

-- Completa el snapshot de pagos históricos sin alterar su relación formal.
update public.orden_pagos p
set cliente_nombre=coalesce(
      p.cliente_nombre,o.cliente_nombre_orden,
      (select c.negocio from public.clientes c where c.id=coalesce(p.cliente_id,o.cliente_id)),
      'Cliente ocasional'
    ),
    cliente_telefono=coalesce(
      p.cliente_telefono,o.cliente_telefono_orden,
      (select c.telefono from public.clientes c where c.id=coalesce(p.cliente_id,o.cliente_id))
    ),
    tipo_cliente=coalesce(
      p.tipo_cliente,o.tipo_cliente_orden,
      case when coalesce(p.cliente_id,o.cliente_id) is null then 'Ocasional' else 'Registrado' end
    )
from public.ordenes o
where o.id=p.orden_id
  and (p.cliente_nombre is null or p.tipo_cliente is null);

-- Vínculo y control de la orden generada por faltantes.
alter table public.ordenes
  add column if not exists orden_origen_id bigint references public.ordenes(id) on delete restrict,
  add column if not exists es_pendiente_existencia boolean not null default false,
  add column if not exists liberado_existencia_en timestamptz,
  add column if not exists liberado_existencia_por uuid references auth.users(id);

create unique index if not exists uq_orden_pendiente_existencia_origen_v9391
  on public.ordenes(orden_origen_id)
  where es_pendiente_existencia and estado<>'Anulado';

create index if not exists idx_ordenes_pendiente_existencia_v9391
  on public.ordenes(estado,fecha_despacho,creado_en desc)
  where es_pendiente_existencia;

alter table public.ordenes drop constraint if exists chk_orden_estado;
alter table public.ordenes add constraint chk_orden_estado check(estado in(
  'Programada','Pendiente por existencia','Pedido recibido','En preparación','Preparado',
  'Lista para facturar','Impresa para facturar','Facturada','Lista para validar',
  'Validada para ruta','Validada para delivery','Lista para retiro','Entregada en negocio',
  'Asignada a delivery','En ruta','Entregado','Entregado a crédito','Cobrado',
  'No entregado','Devuelto parcial','Cerrado','Anulado'
)) not valid;

insert into public.orden_transiciones_v9382(estado_anterior,estado_nuevo,modulo,activo)
values
  ('Pendiente por existencia','Pedido recibido','ordenes',true),
  ('Pendiente por existencia','Anulado','ordenes',true)
on conflict(estado_anterior,estado_nuevo)
do update set modulo=excluded.modulo,activo=true;

create or replace function public.guardar_preparacion_faltantes_v9391(
  p_orden_id bigint,
  p_lineas jsonb,
  p_cabecera jsonb,
  p_generar_pendiente boolean default false,
  p_fecha_estimada date default null,
  p_observacion text default null
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_uid uuid:=auth.uid();
  v_origen public.ordenes%rowtype;
  v_pendiente_id bigint;
  v_pendiente_codigo text;
  v_faltantes integer;
  v_resultado record;
begin
  if v_uid is null then raise exception 'Sesión no válida.'; end if;
  if jsonb_typeof(p_lineas)<>'array' then raise exception 'Detalle de preparación no válido.'; end if;

  select * into v_origen from public.ordenes where id=p_orden_id for update;
  if not found then raise exception 'La orden original ya no existe.'; end if;

  select count(*) into v_faltantes
  from jsonb_array_elements(p_lineas) l
  where l->>'estado_preparacion'='Sin existencia';

  if p_generar_pendiente and v_faltantes=0 then
    raise exception 'No existen artículos marcados Sin existencia para generar seguimiento.';
  end if;

  -- El guardado final y la creación del pendiente comparten la misma transacción.
  select * into v_resultado
  from public.guardar_preparacion_v9381(p_orden_id,p_lineas,p_cabecera,true);

  if p_generar_pendiente then
    select id,codigo into v_pendiente_id,v_pendiente_codigo
    from public.ordenes
    where orden_origen_id=p_orden_id
      and es_pendiente_existencia
      and estado<>'Anulado'
    for update;

    if v_pendiente_id is null then
      insert into public.ordenes(
        cliente_id,tipo_cliente_orden,cliente_nombre_orden,cliente_telefono_orden,
        cliente_sector_orden,cliente_direccion_orden,cliente_referencia_orden,
        modalidad_entrega,fecha,fecha_despacho,hora_despacho,es_programada,
        nota_programacion,prioridad,tipo_orden,requiere_preparacion,
        requiere_facturacion,requiere_delivery,canal,vendedor,estado,
        condicion_pago,total_estimado,total_factura,delivery_nombre,zona,notas,
        orden_origen_id,es_pendiente_existencia,creado_por,actualizado_por
      ) values (
        v_origen.cliente_id,v_origen.tipo_cliente_orden,v_origen.cliente_nombre_orden,
        v_origen.cliente_telefono_orden,v_origen.cliente_sector_orden,
        v_origen.cliente_direccion_orden,v_origen.cliente_referencia_orden,
        v_origen.modalidad_entrega,current_date,
        coalesce(p_fecha_estimada,current_date+1),v_origen.hora_despacho,true,
        concat_ws(' · ','Pendiente por artículos sin existencia de '||v_origen.codigo,
          nullif(btrim(p_observacion),'')),
        coalesce(v_origen.prioridad,'Normal'),coalesce(v_origen.tipo_orden,'Pedido normal'),
        true,true,v_origen.requiere_delivery,v_origen.canal,v_origen.vendedor,
        'Pendiente por existencia',v_origen.condicion_pago,0,0,
        v_origen.delivery_nombre,v_origen.zona,
        'Generada automáticamente desde '||v_origen.codigo||'. No preparar hasta liberar existencia.',
        p_orden_id,true,v_uid,v_uid
      ) returning id,codigo into v_pendiente_id,v_pendiente_codigo;

      insert into public.orden_detalle(
        orden_id,producto_id,producto_nombre,cantidad_pedida,unidad,precio,subtotal,notas,
        cantidad_preparada,estado_preparacion,nota_preparacion,
        peso_equivalente_preparado,tipo_despacho_peso,requiere_pesaje,peso_estandar_lb,
        tolerancia_lb,suma_peso_final,permite_fraccion,peso_equivalente_solicitado
      )
      select
        v_pendiente_id,d.producto_id,d.producto_nombre,d.cantidad_pedida,d.unidad,d.precio,
        round(d.cantidad_pedida*d.precio,2),
        concat_ws(' | ',nullif(btrim(d.notas),''),'Faltante de '||v_origen.codigo),
        null,'Pendiente',null,0,d.tipo_despacho_peso,d.requiere_pesaje,d.peso_estandar_lb,
        d.tolerancia_lb,d.suma_peso_final,d.permite_fraccion,d.peso_equivalente_solicitado
      from public.orden_detalle d
      join jsonb_array_elements(p_lineas) l
        on nullif(l->>'id','')::bigint=d.id
      where d.orden_id=p_orden_id
        and l->>'estado_preparacion'='Sin existencia';

      update public.ordenes p
      set total_estimado=coalesce((
        select sum(subtotal) from public.orden_detalle where orden_id=p.id
      ),0)
      where p.id=v_pendiente_id;

      insert into public.orden_estados_historial(
        orden_id,estado_anterior,estado_nuevo,comentario,usuario
      ) values (
        v_pendiente_id,null,'Pendiente por existencia',
        'Generada desde '||v_origen.codigo||' con '||v_faltantes||' artículo(s) sin existencia.',
        v_uid
      );
      insert into public.orden_estados_historial(
        orden_id,estado_anterior,estado_nuevo,comentario,usuario
      ) values (
        p_orden_id,v_origen.estado,'Lista para facturar',
        'Se creó '||v_pendiente_codigo||' para dar seguimiento a artículos sin existencia.',
        v_uid
      );
    end if;
  end if;

  return jsonb_build_object(
    'ok',true,'orden_id',p_orden_id,'orden_codigo',v_resultado.codigo,
    'faltantes',v_faltantes,'pendiente_generada',p_generar_pendiente,
    'pendiente_id',v_pendiente_id,'pendiente_codigo',v_pendiente_codigo
  );
end;
$$;

create or replace function public.liberar_pendiente_existencia_v9391(
  p_orden_id bigint,
  p_observacion text default null
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_uid uuid:=auth.uid();
  v_orden public.ordenes%rowtype;
begin
  if v_uid is null then raise exception 'Sesión no válida.'; end if;
  if not public.tiene_algun_modulo(array['ordenes','carniceria'],'editar')
     and not public.es_admin_operativo() then
    raise exception 'No tienes permiso para liberar esta orden.';
  end if;
  select * into v_orden from public.ordenes where id=p_orden_id for update;
  if not found then raise exception 'La orden pendiente no existe.'; end if;
  if not v_orden.es_pendiente_existencia or v_orden.estado<>'Pendiente por existencia' then
    raise exception 'La orden ya fue liberada o no corresponde a un faltante.';
  end if;

  update public.ordenes
  set estado='Pedido recibido',fecha_despacho=current_date,es_programada=false,
      liberado_existencia_en=now(),liberado_existencia_por=v_uid,
      nota_programacion=concat_ws(' · ',nota_programacion,nullif(btrim(p_observacion),'')),
      actualizado_por=v_uid,actualizado_en=now()
  where id=p_orden_id;

  insert into public.orden_estados_historial(
    orden_id,estado_anterior,estado_nuevo,comentario,usuario
  ) values (
    p_orden_id,'Pendiente por existencia','Pedido recibido',
    concat_ws(' · ','Existencia confirmada; enviada a Carnicería.',nullif(btrim(p_observacion),'')),
    v_uid
  );
  return jsonb_build_object('ok',true,'orden_id',p_orden_id,'codigo',v_orden.codigo);
end;
$$;

revoke all on function public.guardar_preparacion_faltantes_v9391(bigint,jsonb,jsonb,boolean,date,text)
  from public,anon;
grant execute on function public.guardar_preparacion_faltantes_v9391(bigint,jsonb,jsonb,boolean,date,text)
  to authenticated;
revoke all on function public.liberar_pendiente_existencia_v9391(bigint,text)
  from public,anon;
grant execute on function public.liberar_pendiente_existencia_v9391(bigint,text)
  to authenticated;

notify pgrst,'reload schema';
commit;

-- V9.3.8.2 - Máquina de estados y campos críticos protegidos
-- Ejecutar después del SQL 39.

create table if not exists public.orden_transiciones_v9382(
  estado_anterior text not null,
  estado_nuevo text not null,
  modulo text not null,
  activo boolean not null default true,
  primary key(estado_anterior,estado_nuevo)
);

insert into public.orden_transiciones_v9382(estado_anterior,estado_nuevo,modulo) values
('Programada','Pedido recibido','ordenes'),
('Pedido recibido','En preparación','carniceria'),
('Pedido recibido','Lista para facturar','carniceria'),
('Pedido recibido','Facturada','facturacion'),
('Pedido recibido','Validada para delivery','validacion'),
('En preparación','Pedido recibido','carniceria'),
('En preparación','Lista para facturar','carniceria'),
('Preparado','Lista para facturar','carniceria'),
('Lista para facturar','Impresa para facturar','facturacion'),
('Lista para facturar','Facturada','facturacion'),
('Lista para facturar','Lista para retiro','facturacion'),
('Impresa para facturar','Facturada','facturacion'),
('Impresa para facturar','Lista para retiro','facturacion'),
('Facturada','Impresa para facturar','validacion'),
('Facturada','Lista para validar','validacion'),
('Facturada','Validada para ruta','validacion'),
('Facturada','Validada para delivery','validacion'),
('Facturada','Asignada a delivery','validacion'),
('Lista para validar','Validada para ruta','validacion'),
('Lista para validar','Validada para delivery','validacion'),
('Validada para ruta','Asignada a delivery','validacion'),
('Validada para delivery','Asignada a delivery','validacion'),
('Validada para delivery','Facturada','validacion'),
('Lista para retiro','Entregada en negocio','validacion'),
('Asignada a delivery','En ruta','delivery'),
('Asignada a delivery','Facturada','validacion'),
('Asignada a delivery','Cobrado','delivery'),
('Asignada a delivery','Entregado','delivery'),
('Asignada a delivery','Entregado a crédito','delivery'),
('Asignada a delivery','No entregado','delivery'),
('Asignada a delivery','Devuelto parcial','delivery'),
('En ruta','Cobrado','delivery'),
('En ruta','Entregado','delivery'),
('En ruta','Entregado a crédito','delivery'),
('En ruta','No entregado','delivery'),
('En ruta','Devuelto parcial','delivery'),
('Entregado','Cobrado','liquidacion'),
('Entregado','Entregado a crédito','liquidacion'),
('Cobrado','Cerrado','liquidacion'),
('Entregado a crédito','Cerrado','liquidacion'),
('No entregado','Cerrado','liquidacion'),
('Devuelto parcial','Cerrado','liquidacion')
on conflict(estado_anterior,estado_nuevo) do update set modulo=excluded.modulo,activo=true;

-- Una edición auditada de composición puede devolver la orden al inicio.
insert into public.orden_transiciones_v9382(estado_anterior,estado_nuevo,modulo)
select s,'Pedido recibido','ordenes'
from unnest(array[
  'Lista para facturar','Impresa para facturar','Facturada','Lista para validar',
  'Validada para ruta','Validada para delivery','Lista para retiro'
]) s
on conflict(estado_anterior,estado_nuevo) do update set modulo=excluded.modulo,activo=true;

-- La anulación administrativa está permitida desde estados no finales.
insert into public.orden_transiciones_v9382(estado_anterior,estado_nuevo,modulo)
select s,'Anulado','ordenes'
from unnest(array[
  'Programada','Pedido recibido','En preparación','Preparado','Lista para facturar',
  'Impresa para facturar','Facturada','Lista para validar','Validada para ruta',
  'Validada para delivery','Lista para retiro','Asignada a delivery','En ruta'
]) s
on conflict(estado_anterior,estado_nuevo) do update set modulo=excluded.modulo,activo=true;

alter table public.ordenes drop constraint if exists chk_orden_estado;
alter table public.ordenes add constraint chk_orden_estado check(estado in(
  'Programada','Pedido recibido','En preparación','Preparado','Lista para facturar',
  'Impresa para facturar','Facturada','Lista para validar','Validada para ruta',
  'Validada para delivery','Lista para retiro','Entregada en negocio',
  'Asignada a delivery','En ruta','Entregado','Entregado a crédito','Cobrado',
  'No entregado','Devuelto parcial','Cerrado','Anulado'
)) not valid;

create or replace function public.pc_validar_transicion_orden_v9382()
returns trigger language plpgsql security definer
set search_path=public,pg_temp
as $$
declare v_modulo text;
begin
  if new.id is distinct from old.id
     or new.codigo is distinct from old.codigo
     or new.creado_por is distinct from old.creado_por
     or new.creado_en is distinct from old.creado_en then
    raise exception 'No se permite modificar la identidad original de la orden.';
  end if;
  if new.estado is distinct from old.estado then
    select t.modulo into v_modulo from public.orden_transiciones_v9382 t
    where t.estado_anterior=old.estado and t.estado_nuevo=new.estado and t.activo;
    if v_modulo is null then raise exception 'Transición no autorizada: % → %.',old.estado,new.estado; end if;
    if not public.es_admin_operativo()
       and not public.tiene_algun_modulo(array[v_modulo],'editar') then
      raise exception 'No tienes permiso para mover la orden desde el módulo %.',v_modulo;
    end if;
  end if;
  if not public.es_admin_operativo()
     and (new.tomado_por,new.preparado_por,new.peso_preparado,new.paquetes_preparados,new.preparado_en)
         is distinct from
         (old.tomado_por,old.preparado_por,old.peso_preparado,old.paquetes_preparados,old.preparado_en)
     and not public.tiene_algun_modulo(array['carniceria','ordenes'],'editar') then
    raise exception 'Los campos de preparación están protegidos.';
  end if;
  if not public.es_admin_operativo()
     and (new.facturado_por,new.factura_no,new.total_factura,new.peso_facturado,new.facturado_en)
         is distinct from
         (old.facturado_por,old.factura_no,old.total_factura,old.peso_facturado,old.facturado_en)
     and not public.tiene_algun_modulo(array['facturacion','validacion','ordenes'],'editar') then
    raise exception 'Los campos de facturación están protegidos.';
  end if;
  if not public.es_admin_operativo()
     and (new.validado_por,new.peso_validado,new.validado_en)
         is distinct from (old.validado_por,old.peso_validado,old.validado_en)
     and not public.tiene_algun_modulo(array['validacion'],'editar') then
    raise exception 'Los campos de validación están protegidos.';
  end if;
  if not public.es_admin_operativo()
     and (new.resultado_entrega,new.monto_cobrado,new.monto_pendiente,new.recibido_en)
         is distinct from (old.resultado_entrega,old.monto_cobrado,old.monto_pendiente,old.recibido_en)
     and not public.tiene_algun_modulo(array['delivery','liquidacion'],'editar') then
    raise exception 'Los campos financieros de liquidación están protegidos.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_pc_validar_transicion_orden_v9382 on public.ordenes;
create trigger trg_pc_validar_transicion_orden_v9382
before update on public.ordenes for each row
execute function public.pc_validar_transicion_orden_v9382();

create or replace function public.cambiar_estado_orden_v9382(
  p_orden_id bigint,
  p_estado_esperado text,
  p_estado_nuevo text,
  p_cambios jsonb default '{}'::jsonb,
  p_comentario text default 'Cambio desde sistema',
  p_modulo text default 'ordenes'
) returns table(id bigint,codigo text,estado text)
language plpgsql security definer
set search_path=public,pg_temp
as $$
declare
  v_uid uuid:=auth.uid();
  v_o public.ordenes%rowtype;
  v_modulo text;
  v_keys text[];
  v_allowed constant text[]:=array[
    'facturado_por','facturado_en','factura_no','total_factura','peso_facturado',
    'condicion_pago','delivery_nombre','validado_por','validado_en','peso_validado',
    'retirado_por','entregado_mostrador_por','entregado_mostrador_en','notas_retiro',
    'recibido_por','recibido_en','resultado_entrega','monto_cobrado','monto_pendiente',
    'notas_liquidacion','cantidad_impresiones','ultima_impresion','impreso_por',
    'tomado_por','tomado_por_empleado_id','tomado_en','tomado_por_user',
    'preparado_por','preparado_en','peso_preparado','paquetes_preparados',
    'notas_preparacion','liberado_por','liberado_en','motivo_liberacion','notas'
  ];
begin
  if v_uid is null then raise exception 'Sesión no válida.'; end if;
  if jsonb_typeof(coalesce(p_cambios,'{}'::jsonb))<>'object' then raise exception 'Cambios no válidos.'; end if;
  select array_agg(k) into v_keys from jsonb_object_keys(coalesce(p_cambios,'{}'::jsonb)) k;
  if exists(select 1 from unnest(coalesce(v_keys,array[]::text[])) k where not(k=any(v_allowed))) then
    raise exception 'La operación intenta modificar un campo protegido.';
  end if;
  select * into v_o from public.ordenes where ordenes.id=p_orden_id for update;
  if not found then raise exception 'La orden no existe.'; end if;
  if v_o.estado<>p_estado_esperado then
    raise exception 'La orden cambió de estado: se esperaba %, pero está en %.',p_estado_esperado,v_o.estado;
  end if;
  if p_estado_nuevo<>v_o.estado then
    select t.modulo into v_modulo from public.orden_transiciones_v9382 t
    where t.estado_anterior=v_o.estado and t.estado_nuevo=p_estado_nuevo and t.activo;
    if v_modulo is null then raise exception 'Transición no autorizada: % → %.',v_o.estado,p_estado_nuevo; end if;
  else v_modulo:=p_modulo;
  end if;
  if not public.es_admin_operativo()
     and not public.tiene_algun_modulo(array[coalesce(v_modulo,p_modulo)],'editar') then
    raise exception 'No tienes permiso para realizar esta transición en %.',coalesce(v_modulo,p_modulo);
  end if;

  update public.ordenes o set
    estado=p_estado_nuevo,
    facturado_por=case when p_cambios?'facturado_por' then p_cambios->>'facturado_por' else o.facturado_por end,
    facturado_en=case when p_cambios?'facturado_en' then nullif(p_cambios->>'facturado_en','')::timestamptz else o.facturado_en end,
    factura_no=case when p_cambios?'factura_no' then p_cambios->>'factura_no' else o.factura_no end,
    total_factura=case when p_cambios?'total_factura' then coalesce(nullif(p_cambios->>'total_factura','')::numeric,0) else o.total_factura end,
    peso_facturado=case when p_cambios?'peso_facturado' then nullif(p_cambios->>'peso_facturado','')::numeric else o.peso_facturado end,
    condicion_pago=case when p_cambios?'condicion_pago' then p_cambios->>'condicion_pago' else o.condicion_pago end,
    delivery_nombre=case when p_cambios?'delivery_nombre' then p_cambios->>'delivery_nombre' else o.delivery_nombre end,
    validado_por=case when p_cambios?'validado_por' then p_cambios->>'validado_por' else o.validado_por end,
    validado_en=case when p_cambios?'validado_en' then nullif(p_cambios->>'validado_en','')::timestamptz else o.validado_en end,
    peso_validado=case when p_cambios?'peso_validado' then nullif(p_cambios->>'peso_validado','')::numeric else o.peso_validado end,
    retirado_por=case when p_cambios?'retirado_por' then p_cambios->>'retirado_por' else o.retirado_por end,
    entregado_mostrador_por=case when p_cambios?'entregado_mostrador_por' then p_cambios->>'entregado_mostrador_por' else o.entregado_mostrador_por end,
    entregado_mostrador_en=case when p_cambios?'entregado_mostrador_en' then nullif(p_cambios->>'entregado_mostrador_en','')::timestamptz else o.entregado_mostrador_en end,
    notas_retiro=case when p_cambios?'notas_retiro' then p_cambios->>'notas_retiro' else o.notas_retiro end,
    recibido_por=case when p_cambios?'recibido_por' then p_cambios->>'recibido_por' else o.recibido_por end,
    recibido_en=case when p_cambios?'recibido_en' then nullif(p_cambios->>'recibido_en','')::timestamptz else o.recibido_en end,
    resultado_entrega=case when p_cambios?'resultado_entrega' then p_cambios->>'resultado_entrega' else o.resultado_entrega end,
    monto_cobrado=case when p_cambios?'monto_cobrado' then coalesce(nullif(p_cambios->>'monto_cobrado','')::numeric,0) else o.monto_cobrado end,
    monto_pendiente=case when p_cambios?'monto_pendiente' then coalesce(nullif(p_cambios->>'monto_pendiente','')::numeric,0) else o.monto_pendiente end,
    notas_liquidacion=case when p_cambios?'notas_liquidacion' then p_cambios->>'notas_liquidacion' else o.notas_liquidacion end,
    cantidad_impresiones=case when p_cambios?'cantidad_impresiones' then coalesce(nullif(p_cambios->>'cantidad_impresiones','')::integer,0) else o.cantidad_impresiones end,
    ultima_impresion=case when p_cambios?'ultima_impresion' then nullif(p_cambios->>'ultima_impresion','')::timestamptz else o.ultima_impresion end,
    impreso_por=case when p_cambios?'impreso_por' then nullif(p_cambios->>'impreso_por','')::uuid else o.impreso_por end,
    tomado_por=case when p_cambios?'tomado_por' then p_cambios->>'tomado_por' else o.tomado_por end,
    tomado_por_empleado_id=case when p_cambios?'tomado_por_empleado_id' then nullif(p_cambios->>'tomado_por_empleado_id','')::bigint else o.tomado_por_empleado_id end,
    tomado_en=case when p_cambios?'tomado_en' then nullif(p_cambios->>'tomado_en','')::timestamptz else o.tomado_en end,
    tomado_por_user=case when p_cambios?'tomado_por_user' then nullif(p_cambios->>'tomado_por_user','')::uuid else o.tomado_por_user end,
    preparado_por=case when p_cambios?'preparado_por' then p_cambios->>'preparado_por' else o.preparado_por end,
    preparado_en=case when p_cambios?'preparado_en' then nullif(p_cambios->>'preparado_en','')::timestamptz else o.preparado_en end,
    peso_preparado=case when p_cambios?'peso_preparado' then nullif(p_cambios->>'peso_preparado','')::numeric else o.peso_preparado end,
    paquetes_preparados=case when p_cambios?'paquetes_preparados' then nullif(p_cambios->>'paquetes_preparados','')::integer else o.paquetes_preparados end,
    notas_preparacion=case when p_cambios?'notas_preparacion' then p_cambios->>'notas_preparacion' else o.notas_preparacion end,
    liberado_por=case when p_cambios?'liberado_por' then nullif(p_cambios->>'liberado_por','')::uuid else o.liberado_por end,
    liberado_en=case when p_cambios?'liberado_en' then nullif(p_cambios->>'liberado_en','')::timestamptz else o.liberado_en end,
    motivo_liberacion=case when p_cambios?'motivo_liberacion' then p_cambios->>'motivo_liberacion' else o.motivo_liberacion end,
    notas=case when p_cambios?'notas' then p_cambios->>'notas' else o.notas end,
    actualizado_por=v_uid,actualizado_en=now()
  where o.id=p_orden_id;

  insert into public.orden_estados_historial(orden_id,estado_anterior,estado_nuevo,comentario,usuario)
  values(p_orden_id,v_o.estado,p_estado_nuevo,coalesce(nullif(trim(p_comentario),''),'Cambio desde sistema'),v_uid);
  return query select o.id,o.codigo,o.estado from public.ordenes o where o.id=p_orden_id;
end;
$$;

create or replace function public.liberar_orden_v9382(p_orden_id bigint,p_estado_esperado text,p_motivo text)
returns table(id bigint,codigo text,estado text)
language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_o public.ordenes%rowtype; v_uid uuid:=auth.uid();
begin
  if v_uid is null then raise exception 'Sesión no válida.'; end if;
  if trim(coalesce(p_motivo,''))='' then raise exception 'El motivo es obligatorio.'; end if;
  if not public.es_admin_operativo() and not public.tiene_algun_modulo(array['carniceria'],'editar') then
    raise exception 'No tienes permiso para liberar órdenes.';
  end if;
  select * into v_o from public.ordenes where ordenes.id=p_orden_id for update;
  if not found then raise exception 'La orden no existe.'; end if;
  if v_o.estado<>p_estado_esperado then raise exception 'La orden cambió de estado. Actualiza la pantalla.'; end if;
  if v_o.estado<>'En preparación' then raise exception 'Solo se puede liberar una orden en preparación.'; end if;
  update public.ordenes set estado='Pedido recibido',tomado_por=null,tomado_por_empleado_id=null,
    tomado_en=null,tomado_por_user=null,preparado_por=null,preparado_en=null,peso_preparado=null,
    peso_calculado_preparado=null,paquetes_preparados=null,notas_preparacion=null,
    liberado_por=v_uid,liberado_en=now(),motivo_liberacion=trim(p_motivo),
    actualizado_por=v_uid,actualizado_en=now() where ordenes.id=p_orden_id;
  update public.orden_detalle set cantidad_preparada=null,estado_preparacion='Pendiente',
    nota_preparacion=null,peso_equivalente_preparado=null where orden_id=p_orden_id;
  insert into public.orden_estados_historial(orden_id,estado_anterior,estado_nuevo,comentario,usuario)
  values(p_orden_id,v_o.estado,'Pedido recibido','Pedido soltado/liberado. '||trim(p_motivo),v_uid);
  return query select o.id,o.codigo,o.estado from public.ordenes o where o.id=p_orden_id;
end;
$$;

alter table public.orden_transiciones_v9382 enable row level security;
drop policy if exists orden_transiciones_v9382_select on public.orden_transiciones_v9382;
create policy orden_transiciones_v9382_select on public.orden_transiciones_v9382
for select to authenticated using(true);
revoke insert,update,delete on public.orden_transiciones_v9382 from authenticated;
grant select on public.orden_transiciones_v9382 to authenticated;
revoke all on function public.cambiar_estado_orden_v9382(bigint,text,text,jsonb,text,text) from public;
grant execute on function public.cambiar_estado_orden_v9382(bigint,text,text,jsonb,text,text) to authenticated;
revoke all on function public.liberar_orden_v9382(bigint,text,text) from public;
grant execute on function public.liberar_orden_v9382(bigint,text,text) to authenticated;

comment on table public.orden_transiciones_v9382 is 'Transiciones operativas autorizadas V9.3.8.2.';
comment on function public.cambiar_estado_orden_v9382 is 'Cambio de estado concurrente, autorizado y auditado en una transacción.';

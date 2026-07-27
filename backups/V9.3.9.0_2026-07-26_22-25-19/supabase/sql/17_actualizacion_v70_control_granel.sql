-- V7.0 - Control de despacho al granel / fraccionado
-- Ejecutar en Supabase SQL Editor antes de subir el HTML V7.0.

alter table if exists public.productos_despacho
  add column if not exists permite_fraccion boolean;

alter table if exists public.orden_detalle
  add column if not exists permite_fraccion boolean;

-- Inicializa productos existentes según la lógica operativa:
-- por libra permite fracciones; unidad con peso fijo / no pesa se bloquea por defecto;
-- unidad variable queda permitida hasta que el producto sea revisado manualmente.
update public.productos_despacho
set permite_fraccion = case
  when lower(coalesce(unidad,'')) in ('lb','lbs','libra','libras') then true
  when coalesce(tipo_despacho_peso,'') = 'Por libra' then true
  when coalesce(tipo_despacho_peso,'') in ('Unidad peso fijo','No pesa') then false
  else true
end
where permite_fraccion is null;

alter table if exists public.productos_despacho
  alter column permite_fraccion set default true;

-- Snapshot para detalles existentes. Mantiene la regla del producto original.
update public.orden_detalle od
set permite_fraccion = coalesce(od.permite_fraccion, pd.permite_fraccion,
  case
    when lower(coalesce(od.unidad,'')) in ('lb','lbs','libra','libras') then true
    when coalesce(od.tipo_despacho_peso,'') in ('Unidad peso fijo','No pesa') then false
    else true
  end)
from public.productos_despacho pd
where od.producto_id = pd.id
  and od.permite_fraccion is null;

update public.orden_detalle
set permite_fraccion = case
  when lower(coalesce(unidad,'')) in ('lb','lbs','libra','libras') then true
  when coalesce(tipo_despacho_peso,'') in ('Unidad peso fijo','No pesa') then false
  else true
end
where permite_fraccion is null;

comment on column public.productos_despacho.permite_fraccion is 'Si es false, el producto no se despacha al granel: solo cantidades enteras (1,2,3...)';
comment on column public.orden_detalle.permite_fraccion is 'Snapshot de la regla del producto al crear la orden; Carnicería bloquea fracciones cuando es false';

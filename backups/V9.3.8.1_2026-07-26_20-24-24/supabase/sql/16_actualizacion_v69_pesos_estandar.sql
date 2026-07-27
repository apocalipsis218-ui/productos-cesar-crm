-- V6.9 - Productos con peso estándar y control de despacho
-- Ejecutar en Supabase SQL Editor antes de subir el HTML V6.9.

alter table if exists public.productos_despacho
  add column if not exists tipo_despacho_peso text not null default 'Por libra',
  add column if not exists requiere_pesaje boolean not null default true,
  add column if not exists peso_estandar_lb numeric(12,3),
  add column if not exists tolerancia_lb numeric(12,3) not null default 0.25,
  add column if not exists suma_peso_final boolean not null default true,
  add column if not exists permitir_ajustar_peso boolean not null default true;

alter table if exists public.orden_detalle
  add column if not exists tipo_despacho_peso text,
  add column if not exists requiere_pesaje boolean,
  add column if not exists peso_estandar_lb numeric(12,3),
  add column if not exists tolerancia_lb numeric(12,3),
  add column if not exists suma_peso_final boolean,
  add column if not exists peso_equivalente_solicitado numeric(12,3),
  add column if not exists peso_equivalente_preparado numeric(12,3);

-- Normaliza productos existentes: si su unidad es lb se consideran por libra; lo demás queda como unidad variable
-- para que el despachador registre el peso real hasta que el producto se configure manualmente.
update public.productos_despacho
set tipo_despacho_peso = case
  when lower(coalesce(unidad,'')) in ('lb','lbs','libra','libras') then 'Por libra'
  when tipo_despacho_peso is null or tipo_despacho_peso = '' then 'Unidad peso variable'
  else tipo_despacho_peso
end
where tipo_despacho_peso is null or tipo_despacho_peso = 'Por libra';

-- Asegura valores válidos.
update public.productos_despacho
set tipo_despacho_peso = 'Por libra'
where tipo_despacho_peso not in ('Por libra','Unidad peso fijo','Unidad peso variable','No pesa');

-- Snapshot inicial para detalles existentes que todavía no tengan configuración.
update public.orden_detalle od
set
  tipo_despacho_peso = coalesce(od.tipo_despacho_peso, pd.tipo_despacho_peso, case when lower(coalesce(od.unidad,'')) in ('lb','lbs','libra','libras') then 'Por libra' else 'Unidad peso variable' end),
  requiere_pesaje = coalesce(od.requiere_pesaje, pd.requiere_pesaje, true),
  peso_estandar_lb = coalesce(od.peso_estandar_lb, pd.peso_estandar_lb),
  tolerancia_lb = coalesce(od.tolerancia_lb, pd.tolerancia_lb, 0.25),
  suma_peso_final = coalesce(od.suma_peso_final, pd.suma_peso_final, true)
from public.productos_despacho pd
where od.producto_id = pd.id;

update public.orden_detalle
set
  tipo_despacho_peso = coalesce(tipo_despacho_peso, case when lower(coalesce(unidad,'')) in ('lb','lbs','libra','libras') then 'Por libra' else 'Unidad peso variable' end),
  requiere_pesaje = coalesce(requiere_pesaje, true),
  tolerancia_lb = coalesce(tolerancia_lb, 0.25),
  suma_peso_final = coalesce(suma_peso_final, true)
where tipo_despacho_peso is null or requiere_pesaje is null or tolerancia_lb is null or suma_peso_final is null;

-- Calcula peso equivalente solicitado en órdenes existentes cuando se puede determinar.
update public.orden_detalle
set peso_equivalente_solicitado = case
  when suma_peso_final is false or tipo_despacho_peso = 'No pesa' then 0
  when tipo_despacho_peso = 'Unidad peso fijo' then coalesce(cantidad_pedida,0) * coalesce(peso_estandar_lb,0)
  when tipo_despacho_peso = 'Por libra' then coalesce(cantidad_pedida,0)
  else peso_equivalente_solicitado
end
where peso_equivalente_solicitado is null;

comment on column public.productos_despacho.tipo_despacho_peso is 'Por libra, Unidad peso fijo, Unidad peso variable o No pesa';
comment on column public.productos_despacho.peso_estandar_lb is 'Libras equivalentes por cada unidad cuando el tipo es Unidad peso fijo';
comment on column public.orden_detalle.peso_equivalente_preparado is 'Peso en libras calculado por Carnicería según la configuración de despacho del producto';

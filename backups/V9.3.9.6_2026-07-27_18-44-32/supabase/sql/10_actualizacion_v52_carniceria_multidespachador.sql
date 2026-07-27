-- 10_actualizacion_v52_carniceria_multidespachador.sql
-- Productos César · V5.2 Carnicería multi-despachador
-- Ejecutar en Supabase SQL Editor antes de subir el HTML V5.2.

-- 1) Campos para toma/bloqueo visible de órdenes en carnicería.
alter table public.ordenes add column if not exists tomado_por text;
alter table public.ordenes add column if not exists tomado_en timestamptz;
alter table public.ordenes add column if not exists tomado_por_user uuid references auth.users(id);
alter table public.ordenes add column if not exists liberado_por uuid references auth.users(id);
alter table public.ordenes add column if not exists liberado_en timestamptz;
alter table public.ordenes add column if not exists motivo_liberacion text;
alter table public.ordenes add column if not exists impresiones_preparacion integer not null default 0;
alter table public.ordenes add column if not exists ultima_impresion_preparacion timestamptz;
alter table public.ordenes add column if not exists impreso_preparacion_por uuid references auth.users(id);

-- 2) Detalle de preparación por artículo. No cambia los precios originales.
alter table public.orden_detalle add column if not exists cantidad_preparada numeric;
alter table public.orden_detalle add column if not exists estado_preparacion text not null default 'Pendiente';
alter table public.orden_detalle add column if not exists nota_preparacion text;

-- 3) Inicializar cantidad preparada igual a la solicitada solo para órdenes existentes sin detalle de preparación.
update public.orden_detalle
set cantidad_preparada = cantidad_pedida
where cantidad_preparada is null;

-- 4) Asegurar que el estado En preparación esté permitido.
alter table public.ordenes drop constraint if exists chk_orden_estado;
alter table public.ordenes add constraint chk_orden_estado check (estado in (
  'Programada',
  'Pedido recibido',
  'En preparación',
  'Preparado',
  'Lista para facturar',
  'Impresa para facturar',
  'Facturada',
  'Lista para validar',
  'Validada para ruta',
  'Validada para delivery',
  'Asignada a delivery',
  'En ruta',
  'Entregado',
  'Entregado a crédito',
  'Cobrado',
  'No entregado',
  'Devuelto parcial',
  'Cerrado',
  'Anulado'
));

-- 5) Índices útiles.
create index if not exists idx_ordenes_estado_tomado on public.ordenes(estado, tomado_por);
create index if not exists idx_orden_detalle_preparacion on public.orden_detalle(orden_id, estado_preparacion);

-- 6) Catálogo de estados de preparación por artículo, si usa catalogo_items.
insert into public.catalogo_items (catalogo_id, valor, orden, activo)
select v.catalogo_id, v.valor, v.orden, true
from (values
  ('estado_preparacion_articulo','Pendiente',10),
  ('estado_preparacion_articulo','Preparado',20),
  ('estado_preparacion_articulo','Parcial',30),
  ('estado_preparacion_articulo','Sin existencia',40),
  ('estado_preparacion_articulo','Sustituido',50)
) as v(catalogo_id, valor, orden)
where not exists (
  select 1 from public.catalogo_items ci
  where ci.catalogo_id = v.catalogo_id and ci.valor = v.valor
);

-- Fin V5.2.

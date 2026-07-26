-- ============================================================
-- 07_actualizacion_v35.sql · Productos César V3.5
-- Deliverys configurables y refuerzo del detalle de órdenes.
-- Ejecutar en Supabase CRM antes de subir el HTML V3.5.
-- ============================================================

-- Detalle de productos de cada orden, por si no existe en esta base.
create table if not exists public.orden_detalle (
  id bigint generated always as identity primary key,
  orden_id bigint not null references public.ordenes(id) on delete cascade,
  producto_id bigint references public.productos_despacho(id),
  producto_nombre text not null,
  cantidad_pedida numeric(14,2) not null default 0,
  cantidad_despachada numeric(14,2),
  unidad text not null default 'lb',
  precio numeric(14,2) not null default 0,
  subtotal numeric(14,2) not null default 0,
  notas text,
  creado_en timestamptz not null default now()
);
create index if not exists idx_orden_detalle_orden on public.orden_detalle(orden_id);

alter table public.orden_detalle enable row level security;
drop policy if exists orden_detalle_all on public.orden_detalle;
create policy orden_detalle_all on public.orden_detalle
  for all to authenticated using (true) with check (true);

-- Deliverys configurables para usar en pedidos, rutas y despacho.
create table if not exists public.deliverys_config (
  id bigint generated always as identity primary key,
  nombre text not null unique,
  telefono text,
  zona text,
  activo boolean not null default true,
  observaciones text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index if not exists idx_deliverys_config_activo on public.deliverys_config(activo);

alter table public.deliverys_config enable row level security;
drop policy if exists deliverys_config_all on public.deliverys_config;
create policy deliverys_config_all on public.deliverys_config
  for all to authenticated using (true) with check (true);

-- Semilla opcional: puedes editar o eliminar estos nombres desde Configuración > Deliverys.
insert into public.deliverys_config (nombre, activo)
values ('Delivery 1', true), ('Delivery 2', true)
on conflict (nombre) do nothing;

-- Asegura permisos visuales del módulo configuración para gerente.
insert into public.roles_permisos (rol, modulo, nivel) values
  ('Gerente','config','editar')
on conflict (rol, modulo) do update set nivel=excluded.nivel;

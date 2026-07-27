-- Productos César V9.0.9
-- Cierre formal de lote, recibo de liquidación e historial por delivery/fecha.
-- Ejecutar completo en Supabase SQL Editor.

create table if not exists public.entrega_lotes (
  id bigserial primary key,
  codigo_lote text not null unique,
  delivery_nombre text not null,
  fecha_entrega timestamptz not null default now(),
  cantidad_ordenes integer not null default 0,
  peso_esperado numeric(12,2) not null default 0,
  peso_entregado numeric(12,2) not null default 0,
  total_facturado numeric(14,2) not null default 0,
  estado text not null default 'Abierto',
  creado_por uuid references auth.users(id),
  creado_en timestamptz not null default now()
);

create table if not exists public.entrega_lote_detalle (
  id bigserial primary key,
  lote_id bigint references public.entrega_lotes(id) on delete cascade,
  codigo_lote text not null,
  orden_id bigint references public.ordenes(id) on delete set null,
  cliente_id bigint references public.clientes(id) on delete set null,
  codigo_orden text,
  factura_no text,
  monto_factura numeric(14,2) not null default 0,
  peso_esperado numeric(12,2) not null default 0,
  peso_entregado numeric(12,2) not null default 0,
  estado_liquidacion text not null default 'Pendiente',
  resultado_entrega text,
  monto_cobrado numeric(14,2) not null default 0,
  monto_credito numeric(14,2) not null default 0,
  observacion text,
  creado_en timestamptz not null default now()
);

create table if not exists public.liquidaciones_lotes (
  id bigserial primary key,
  lote_id bigint references public.entrega_lotes(id) on delete set null,
  codigo_lote text not null,
  delivery_nombre text not null,
  fecha_liquidacion timestamptz not null default now(),
  total_facturado numeric(14,2) not null default 0,
  efectivo_reportado numeric(14,2) not null default 0,
  efectivo_recibido numeric(14,2) not null default 0,
  credito_pendiente numeric(14,2) not null default 0,
  no_entregado numeric(14,2) not null default 0,
  diferencia numeric(14,2) not null default 0,
  recibido_por text,
  observacion text,
  estado text not null default 'Cerrado',
  creado_por uuid references auth.users(id),
  creado_en timestamptz not null default now()
);

create table if not exists public.liquidacion_lote_detalle (
  id bigserial primary key,
  liquidacion_id bigint references public.liquidaciones_lotes(id) on delete cascade,
  orden_id bigint references public.ordenes(id) on delete set null,
  cliente_id bigint references public.clientes(id) on delete set null,
  codigo_orden text,
  cliente_nombre text,
  factura_no text,
  resultado_entrega text,
  total_factura numeric(14,2) not null default 0,
  monto_cobrado numeric(14,2) not null default 0,
  monto_credito numeric(14,2) not null default 0,
  monto_no_entregado numeric(14,2) not null default 0,
  observacion text,
  creado_en timestamptz not null default now()
);

alter table public.entrega_lotes add column if not exists estado text not null default 'Abierto';
alter table public.entrega_lote_detalle add column if not exists estado_liquidacion text not null default 'Pendiente';
alter table public.entrega_lote_detalle add column if not exists resultado_entrega text;
alter table public.entrega_lote_detalle add column if not exists monto_cobrado numeric(14,2) not null default 0;
alter table public.entrega_lote_detalle add column if not exists monto_credito numeric(14,2) not null default 0;
alter table public.entrega_lote_detalle add column if not exists observacion text;

create index if not exists idx_entrega_lotes_codigo on public.entrega_lotes(codigo_lote);
create index if not exists idx_entrega_lotes_delivery_fecha on public.entrega_lotes(delivery_nombre, fecha_entrega desc);
create index if not exists idx_entrega_lote_detalle_lote on public.entrega_lote_detalle(codigo_lote);
create index if not exists idx_entrega_lote_detalle_orden on public.entrega_lote_detalle(orden_id);
create index if not exists idx_liquidaciones_lotes_codigo on public.liquidaciones_lotes(codigo_lote);
create index if not exists idx_liquidaciones_lotes_delivery_fecha on public.liquidaciones_lotes(delivery_nombre, fecha_liquidacion desc);
alter table public.liquidacion_lote_detalle add column if not exists codigo_orden text;
alter table public.liquidacion_lote_detalle add column if not exists cliente_nombre text;
alter table public.liquidacion_lote_detalle add column if not exists factura_no text;

create index if not exists idx_liquidacion_lote_detalle_liq on public.liquidacion_lote_detalle(liquidacion_id);
create index if not exists idx_liquidacion_lote_detalle_orden on public.liquidacion_lote_detalle(orden_id);

alter table public.entrega_lotes enable row level security;
alter table public.entrega_lote_detalle enable row level security;
alter table public.liquidaciones_lotes enable row level security;
alter table public.liquidacion_lote_detalle enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='entrega_lotes' and policyname='entrega_lotes_auth_all') then
    create policy entrega_lotes_auth_all on public.entrega_lotes for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='entrega_lote_detalle' and policyname='entrega_lote_detalle_auth_all') then
    create policy entrega_lote_detalle_auth_all on public.entrega_lote_detalle for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='liquidaciones_lotes' and policyname='liquidaciones_lotes_auth_all') then
    create policy liquidaciones_lotes_auth_all on public.liquidaciones_lotes for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='liquidacion_lote_detalle' and policyname='liquidacion_lote_detalle_auth_all') then
    create policy liquidacion_lote_detalle_auth_all on public.liquidacion_lote_detalle for all to authenticated using (true) with check (true);
  end if;
end $$;

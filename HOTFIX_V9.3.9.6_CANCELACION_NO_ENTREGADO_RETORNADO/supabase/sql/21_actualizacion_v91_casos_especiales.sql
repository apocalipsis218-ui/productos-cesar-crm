-- V9.1 - Devoluciones, cambios e incidencias completas
-- Ejecutar después de V9.0.9.

alter table if exists public.ordenes
  add column if not exists estado_caso_especial text default 'Abierto',
  add column if not exists responsable_caso text,
  add column if not exists accion_caso text,
  add column if not exists producto_recoger text,
  add column if not exists producto_entregar text,
  add column if not exists monto_ajuste numeric(14,2) default 0,
  add column if not exists fecha_compromiso date,
  add column if not exists requiere_nota_credito boolean default false,
  add column if not exists resolucion_caso text,
  add column if not exists caso_resuelto_en timestamptz,
  add column if not exists caso_resuelto_por text;

create table if not exists public.orden_casos_historial (
  id bigserial primary key,
  orden_id bigint references public.ordenes(id) on delete cascade,
  estado_caso text,
  comentario text,
  usuario uuid,
  creado_en timestamptz default now()
);

create index if not exists idx_orden_casos_historial_orden on public.orden_casos_historial(orden_id);
create index if not exists idx_orden_casos_historial_creado on public.orden_casos_historial(creado_en desc);

alter table if exists public.orden_casos_historial enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='orden_casos_historial' and policyname='orden_casos_historial_select'
  ) then
    create policy orden_casos_historial_select on public.orden_casos_historial
      for select using (auth.uid() is not null);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='orden_casos_historial' and policyname='orden_casos_historial_insert'
  ) then
    create policy orden_casos_historial_insert on public.orden_casos_historial
      for insert with check (auth.uid() is not null);
  end if;
end $$;

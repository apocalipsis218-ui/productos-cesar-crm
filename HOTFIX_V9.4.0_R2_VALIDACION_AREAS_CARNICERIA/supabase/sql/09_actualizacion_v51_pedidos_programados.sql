-- 09_actualizacion_v51_pedidos_programados.sql
-- Productos César · V5.1 Pedidos programados
-- Ejecutar una sola vez en Supabase SQL Editor antes de subir el HTML V5.1.

-- 1) Campos de programación en órdenes.
alter table public.ordenes add column if not exists fecha_despacho date;
alter table public.ordenes add column if not exists hora_despacho time;
alter table public.ordenes add column if not exists es_programada boolean not null default false;
alter table public.ordenes add column if not exists nota_programacion text;
alter table public.ordenes add column if not exists programada_por uuid references auth.users(id);
alter table public.ordenes add column if not exists fecha_programacion timestamptz;
alter table public.ordenes add column if not exists prioridad text not null default 'Normal';
alter table public.ordenes add column if not exists permitir_adelantar boolean not null default false;

-- 2) Inicializar fecha de despacho en órdenes existentes.
update public.ordenes
set fecha_despacho = coalesce(fecha_despacho, fecha, current_date)
where fecha_despacho is null;

-- 3) Ampliar estados permitidos para incluir Programada.
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

-- 4) Agregar estado Programada al catálogo de estados si existe el módulo de catálogos.
insert into public.catalogo_items (catalogo_id, valor, orden, activo)
select 'estado_orden', 'Programada', 5, true
where not exists (
  select 1 from public.catalogo_items
  where catalogo_id = 'estado_orden' and valor = 'Programada'
);

-- 5) Índices útiles para filtrar por fecha y estado.
create index if not exists idx_ordenes_fecha_despacho on public.ordenes(fecha_despacho);
create index if not exists idx_ordenes_estado_fecha_despacho on public.ordenes(estado, fecha_despacho);

-- 6) Trigger para marcar automáticamente es_programada según fecha_despacho.
create or replace function public.fn_orden_programacion_flags()
returns trigger
language plpgsql
as $$
begin
  if new.fecha_despacho is null then
    new.fecha_despacho := coalesce(new.fecha, current_date);
  end if;

  new.es_programada := new.fecha_despacho > current_date;

  if new.es_programada and coalesce(new.estado, '') not in ('Anulado','Cerrado','Cobrado','Entregado a crédito','No entregado','Devuelto parcial') then
    new.estado := 'Programada';
    if new.fecha_programacion is null then
      new.fecha_programacion := now();
    end if;
  end if;

  if not new.es_programada and new.estado = 'Programada' then
    new.estado := 'Pedido recibido';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_orden_programacion_flags on public.ordenes;
create trigger trg_orden_programacion_flags
before insert or update of fecha_despacho, estado
on public.ordenes
for each row
execute function public.fn_orden_programacion_flags();

-- 7) Permisos RLS genéricos para usuarios autenticados, si las políticas no existían.
do $$
begin
  begin
    create policy "ordenes_select_programadas" on public.ordenes for select to authenticated using (true);
  exception when duplicate_object then null;
  end;
  begin
    create policy "ordenes_update_programadas" on public.ordenes for update to authenticated using (true) with check (true);
  exception when duplicate_object then null;
  end;
end $$;

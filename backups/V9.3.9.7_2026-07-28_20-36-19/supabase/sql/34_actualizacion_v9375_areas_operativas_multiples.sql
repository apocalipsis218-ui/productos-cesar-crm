begin;

-- V9.3.7.6 · área principal + múltiples áreas operativas por empleado.
-- Migración aditiva: conserva empleados, usuarios, roles, órdenes e historial.

alter table if exists public.empleados_operativos
  add column if not exists areas_adicionales text[] not null default '{}'::text[];

update public.empleados_operativos
set areas_adicionales = '{}'::text[]
where areas_adicionales is null;

alter table public.empleados_operativos
  drop constraint if exists chk_empleados_areas_adicionales_v9375;

alter table public.empleados_operativos
  add constraint chk_empleados_areas_adicionales_v9375
  check (
    areas_adicionales <@ array[
      'Carnicería','Facturación','Validación','Delivery','Liquidación','CXC',
      'Vendedor','Control','Gerencia','Supervisor','Administración'
    ]::text[]
    and not (area = any(areas_adicionales))
  );

create index if not exists idx_empleados_areas_adicionales_v9375
  on public.empleados_operativos using gin (areas_adicionales);

comment on column public.empleados_operativos.areas_adicionales is
  'Áreas donde el empleado también puede operar sin cambiar su área principal, rol ni permisos del CRM.';

commit;

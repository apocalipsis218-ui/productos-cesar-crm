create extension if not exists unaccent;

-- V9.2.1 - Empleados unificados, vendedores heredados y delivery desde empleados
-- Ejecutar una sola vez en Supabase SQL Editor.
-- Objetivo:
-- 1) Usar empleados_operativos como fuente única para vendedores, deliverys, carnicería, facturación, validación, liquidación y CXC.
-- 2) Migrar nombres heredados de vendedores (Chiqui, Carlito, Cesar/César, Papilo) al empleado activo César Martínez/Cesar Martinez.
-- 3) Dejar deliverys_config como compatibilidad histórica, pero el sistema ya tomará deliverys desde empleados_operativos.


-- Compatibilidad V9.2.2: ampliar áreas permitidas antes de insertar Delivery/Vendedor.
alter table if exists public.empleados_operativos
  drop constraint if exists chk_empleados_operativos_area;

alter table if exists public.empleados_operativos
  add constraint chk_empleados_operativos_area check (
    area in ('Carnicería','Facturación','Validación','Delivery','Liquidación','CXC','Vendedor','Control','Gerencia','Supervisor','Administración')
  );

-- Asegurar que exista César Martínez como empleado operativo.
-- Si ya existe con o sin acento, no crea duplicado.
insert into public.empleados_operativos (nombre, area, activo, observaciones)
select 'Cesar Martinez', 'Vendedor', true, 'Empleado usado para unificar vendedores heredados desde V9.2.1.'
where not exists (
  select 1 from public.empleados_operativos
  where lower(unaccent(nombre)) in ('cesar martinez','cesar martínez')
);

-- Agregar como empleados tipo Delivery los deliverys existentes en deliverys_config, si no existen ya.
insert into public.empleados_operativos (nombre, area, activo, observaciones)
select d.nombre, 'Delivery', coalesce(d.activo,true), concat('Migrado desde deliverys_config V9.2.1. ', coalesce(d.observaciones,''))
from public.deliverys_config d
where d.nombre is not null
  and trim(d.nombre) <> ''
  and not exists (
    select 1 from public.empleados_operativos e
    where lower(unaccent(e.nombre)) = lower(unaccent(d.nombre))
  );

-- Tomar el nombre real de César Martínez desde empleados_operativos.
with cesar as (
  select nombre
  from public.empleados_operativos
  where lower(unaccent(nombre)) in ('cesar martinez','cesar martínez')
  order by case when activo then 0 else 1 end, id
  limit 1
)
update public.clientes c
set vendedor = (select nombre from cesar)
where lower(unaccent(trim(coalesce(c.vendedor,'')))) in ('chiqui','carlito','cesar','papilo');

with cesar as (
  select nombre
  from public.empleados_operativos
  where lower(unaccent(nombre)) in ('cesar martinez','cesar martínez')
  order by case when activo then 0 else 1 end, id
  limit 1
)
update public.ordenes o
set vendedor = (select nombre from cesar)
where lower(unaccent(trim(coalesce(o.vendedor,'')))) in ('chiqui','carlito','cesar','papilo');

with cesar as (
  select nombre
  from public.empleados_operativos
  where lower(unaccent(nombre)) in ('cesar martinez','cesar martínez')
  order by case when activo then 0 else 1 end, id
  limit 1
)
update public.llamadas l
set vendedor = (select nombre from cesar)
where lower(unaccent(trim(coalesce(l.vendedor,'')))) in ('chiqui','carlito','cesar','papilo');

-- En caso de que la extensión unaccent no esté instalada, ejecutar primero:
-- create extension if not exists unaccent;

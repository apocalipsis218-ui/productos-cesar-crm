create extension if not exists unaccent;

-- V9.2.2 - Corrección de áreas de empleados operativos
-- Ejecutar en Supabase SQL Editor.
-- Corrige el error:
-- ERROR: new row for relation "empleados_operativos" violates check constraint "chk_empleados_operativos_area"
-- Causa: la tabla empleados_operativos solo permitía áreas antiguas
-- ('Carnicería','Facturación','Validación','CXC') y ahora el CRM unifica Delivery y Vendedor como empleados.

alter table if exists public.empleados_operativos
  drop constraint if exists chk_empleados_operativos_area;

alter table if exists public.empleados_operativos
  add constraint chk_empleados_operativos_area check (
    area in (
      'Carnicería',
      'Facturación',
      'Validación',
      'Delivery',
      'Liquidación',
      'CXC',
      'Vendedor',
      'Control',
      'Gerencia',
      'Supervisor',
      'Administración'
    )
  );

-- Asegurar que exista César Martínez como empleado vendedor.
insert into public.empleados_operativos (nombre, area, activo, observaciones)
select 'Cesar Martinez', 'Vendedor', true, 'Empleado usado para unificar vendedores heredados desde V9.2.2.'
where not exists (
  select 1 from public.empleados_operativos
  where lower(unaccent(nombre)) in ('cesar martinez','cesar martínez')
);

-- Migrar deliverys existentes a empleados, ahora que el constraint permite area = Delivery.
insert into public.empleados_operativos (nombre, area, activo, observaciones)
select d.nombre, 'Delivery', coalesce(d.activo,true), concat('Migrado desde deliverys_config V9.2.2. ', coalesce(d.observaciones,''))
from public.deliverys_config d
where d.nombre is not null
  and trim(d.nombre) <> ''
  and not exists (
    select 1 from public.empleados_operativos e
    where lower(unaccent(e.nombre)) = lower(unaccent(d.nombre))
  );

-- Unificar vendedores heredados en clientes hacia César Martínez.
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

-- Unificar vendedores heredados en órdenes, si la columna existe.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='ordenes' and column_name='vendedor'
  ) then
    execute $q$
      with cesar as (
        select nombre
        from public.empleados_operativos
        where lower(unaccent(nombre)) in ('cesar martinez','cesar martínez')
        order by case when activo then 0 else 1 end, id
        limit 1
      )
      update public.ordenes o
      set vendedor = (select nombre from cesar)
      where lower(unaccent(trim(coalesce(o.vendedor,'')))) in ('chiqui','carlito','cesar','papilo')
    $q$;
  end if;
end $$;

-- Unificar vendedores heredados en llamadas, si la columna existe.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='llamadas' and column_name='vendedor'
  ) then
    execute $q$
      with cesar as (
        select nombre
        from public.empleados_operativos
        where lower(unaccent(nombre)) in ('cesar martinez','cesar martínez')
        order by case when activo then 0 else 1 end, id
        limit 1
      )
      update public.llamadas l
      set vendedor = (select nombre from cesar)
      where lower(unaccent(trim(coalesce(l.vendedor,'')))) in ('chiqui','carlito','cesar','papilo')
    $q$;
  end if;
end $$;

begin;

-- V9.3.7.6 · clientes ocasionales, dirección y trazabilidad de estaciones.
-- Migración aditiva: no elimina ni transforma clientes u órdenes existentes.

alter table if exists public.clientes
  add column if not exists direccion text,
  add column if not exists referencia text;

alter table if exists public.ordenes
  add column if not exists cliente_direccion_orden text,
  add column if not exists cliente_referencia_orden text,
  add column if not exists tomado_por_empleado_id bigint;

alter table public.ordenes drop constraint if exists ordenes_tipo_cliente_orden_chk;
alter table public.ordenes drop constraint if exists ordenes_cliente_ocasional_chk;
alter table public.ordenes
  add constraint ordenes_tipo_cliente_orden_chk
    check (tipo_cliente_orden in ('Registrado', 'Ocasional', 'Venta interna')),
  add constraint ordenes_cliente_ocasional_chk
    check (
      tipo_cliente_orden <> 'Ocasional'
      or (
        cliente_id is null
        and (
          modalidad_entrega <> 'Delivery'
          or (
            nullif(btrim(cliente_telefono_orden), '') is not null
            and nullif(btrim(cliente_sector_orden), '') is not null
            and nullif(btrim(cliente_direccion_orden), '') is not null
          )
        )
      )
    );

create or replace function public.pc_normalizar_flujo_orden_v933()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_negocio text;
  v_telefono text;
  v_sector text;
  v_direccion text;
  v_referencia text;
begin
  new.tipo_cliente_orden := coalesce(nullif(btrim(new.tipo_cliente_orden), ''), 'Registrado');
  new.modalidad_entrega := coalesce(nullif(btrim(new.modalidad_entrega), ''), 'Delivery');

  if new.tipo_cliente_orden not in ('Registrado', 'Ocasional', 'Venta interna') then
    raise exception 'Tipo de cliente de orden no válido: %', new.tipo_cliente_orden;
  end if;

  if new.modalidad_entrega not in ('Delivery', 'Retiro en negocio', 'No aplica') then
    raise exception 'Modalidad de entrega no válida: %', new.modalidad_entrega;
  end if;

  if new.tipo_cliente_orden = 'Registrado' then
    if new.cliente_id is null then
      raise exception 'Una orden de cliente registrado requiere cliente_id.';
    end if;

    select c.negocio, c.telefono, c.sector, c.direccion, c.referencia
      into v_negocio, v_telefono, v_sector, v_direccion, v_referencia
    from public.clientes c
    where c.id = new.cliente_id;

    if not found then
      raise exception 'No existe el cliente registrado con id %.', new.cliente_id;
    end if;

    if tg_op = 'INSERT' or new.cliente_id is distinct from old.cliente_id then
      new.cliente_nombre_orden := coalesce(nullif(btrim(new.cliente_nombre_orden), ''), nullif(btrim(v_negocio), ''));
      new.cliente_telefono_orden := coalesce(nullif(btrim(new.cliente_telefono_orden), ''), nullif(btrim(v_telefono), ''));
      new.cliente_sector_orden := coalesce(nullif(btrim(new.cliente_sector_orden), ''), nullif(btrim(v_sector), ''));
      new.cliente_direccion_orden := coalesce(nullif(btrim(new.cliente_direccion_orden), ''), nullif(btrim(v_direccion), ''));
      new.cliente_referencia_orden := coalesce(nullif(btrim(new.cliente_referencia_orden), ''), nullif(btrim(v_referencia), ''));
    end if;
  elsif new.tipo_cliente_orden = 'Venta interna' then
    new.cliente_id := null;
    new.modalidad_entrega := 'Retiro en negocio';
    new.condicion_pago := 'Contado';
    new.requiere_delivery := false;
    new.delivery_nombre := null;
    new.cliente_sector_orden := coalesce(nullif(btrim(new.cliente_sector_orden), ''), 'Mostrador');
  else
    new.cliente_id := null;
    if new.modalidad_entrega = 'Delivery' then
      if nullif(btrim(new.cliente_telefono_orden), '') is null
         or nullif(btrim(new.cliente_sector_orden), '') is null
         or nullif(btrim(new.cliente_direccion_orden), '') is null then
        raise exception 'Cliente ocasional con delivery requiere teléfono, sector y dirección.';
      end if;
      new.requiere_delivery := true;
    end if;
  end if;

  new.cliente_nombre_orden := nullif(btrim(new.cliente_nombre_orden), '');
  new.cliente_telefono_orden := nullif(btrim(new.cliente_telefono_orden), '');
  new.cliente_sector_orden := nullif(btrim(new.cliente_sector_orden), '');
  new.cliente_direccion_orden := nullif(btrim(new.cliente_direccion_orden), '');
  new.cliente_referencia_orden := nullif(btrim(new.cliente_referencia_orden), '');

  if new.cliente_nombre_orden is null then
    raise exception 'El nombre del cliente o comprador es obligatorio.';
  end if;

  if new.modalidad_entrega in ('Retiro en negocio', 'No aplica') then
    new.requiere_delivery := false;
    new.delivery_nombre := null;
  else
    new.requiere_delivery := true;
  end if;

  return new;
end;
$$;

do $$
begin
  if to_regclass('public.empleados_operativos') is not null
     and not exists (
       select 1
       from pg_constraint
       where conname = 'ordenes_tomado_por_empleado_fk'
         and conrelid = 'public.ordenes'::regclass
     ) then
    alter table public.ordenes
      add constraint ordenes_tomado_por_empleado_fk
      foreign key (tomado_por_empleado_id)
      references public.empleados_operativos(id)
      on delete set null;
  end if;
end $$;

create index if not exists idx_ordenes_creado_reciente
  on public.ordenes (creado_en desc);

create index if not exists idx_ordenes_tomado_empleado
  on public.ordenes (tomado_por_empleado_id)
  where tomado_por_empleado_id is not null;

create or replace function public.agregar_sector_si_no_existe(p_sector text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sector text := nullif(btrim(p_sector), '');
  v_existente text;
  v_orden integer;
begin
  if auth.uid() is null then
    raise exception 'Autenticación requerida';
  end if;

  if v_sector is null then
    raise exception 'El sector es obligatorio';
  end if;

  select ci.valor
    into v_existente
  from public.catalogo_items ci
  where ci.catalogo_id = 'sectores'
    and lower(regexp_replace(translate(ci.valor, 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun'), '[^a-zA-Z0-9]+', '', 'g'))
        = lower(regexp_replace(translate(v_sector, 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun'), '[^a-zA-Z0-9]+', '', 'g'))
  order by ci.activo desc, ci.id
  limit 1;

  if v_existente is not null then
    return v_existente;
  end if;

  select coalesce(max(ci.orden), 0) + 1
    into v_orden
  from public.catalogo_items ci
  where ci.catalogo_id = 'sectores';

  insert into public.catalogo_items (catalogo_id, valor, orden, activo)
  values ('sectores', v_sector, v_orden, true);

  return v_sector;
end;
$$;

revoke all on function public.agregar_sector_si_no_existe(text) from public;
grant execute on function public.agregar_sector_si_no_existe(text) to authenticated;

comment on column public.ordenes.cliente_direccion_orden is
  'Snapshot de dirección usado por la orden; permite clientes ocasionales y conserva historial.';
comment on column public.ordenes.cliente_referencia_orden is
  'Referencia de ubicación vigente al crear o editar la orden.';
comment on column public.ordenes.tomado_por_empleado_id is
  'Empleado real que tomó el pedido, incluso cuando se utilizó una cuenta compartida de estación.';

commit;

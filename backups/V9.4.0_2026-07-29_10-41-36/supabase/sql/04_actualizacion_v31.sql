-- ============================================================
-- 04_actualizacion_v31.sql · Productos César Integrado V3.1
-- Ejecutar DESPUÉS del SQL V3.
-- Habilita edición y reversión de gestiones/llamadas desde el módulo Control.
-- ============================================================

alter table if exists public.llamadas enable row level security;
alter table if exists public.pedidos enable row level security;
alter table if exists public.ordenes enable row level security;

-- Permitir editar gestiones: Gerente/Supervisor todas; Vendedor solo las de su cartera.
drop policy if exists llam_update_v31 on public.llamadas;
create policy llam_update_v31 on public.llamadas
for update using (
  public.mi_rol() in ('Gerente','Supervisor')
  or (
    public.mi_rol() = 'Vendedor'
    and exists (
      select 1 from public.clientes c
      where c.id = llamadas.cliente_id
      and c.vendedor = public.mi_vendedor()
    )
  )
) with check (
  public.mi_rol() in ('Gerente','Supervisor')
  or (
    public.mi_rol() = 'Vendedor'
    and exists (
      select 1 from public.clientes c
      where c.id = llamadas.cliente_id
      and c.vendedor = public.mi_vendedor()
    )
  )
);

-- Permitir revertir/eliminar una gestión registrada por error.
drop policy if exists llam_delete_v31 on public.llamadas;
create policy llam_delete_v31 on public.llamadas
for delete using (
  public.mi_rol() in ('Gerente','Supervisor')
  or (
    public.mi_rol() = 'Vendedor'
    and exists (
      select 1 from public.clientes c
      where c.id = llamadas.cliente_id
      and c.vendedor = public.mi_vendedor()
    )
  )
);

-- Si una llamada "Pidió" creó pedido/orden automáticamente, la app intentará limpiarlo.
drop policy if exists ped_delete_v31 on public.pedidos;
create policy ped_delete_v31 on public.pedidos
for delete using (
  public.mi_rol() in ('Gerente','Supervisor')
  or (public.mi_rol() = 'Vendedor' and vendedor = public.mi_vendedor())
);

drop policy if exists orden_delete_v31 on public.ordenes;
create policy orden_delete_v31 on public.ordenes
for delete using (
  public.mi_rol() in ('Gerente','Supervisor')
  or (public.mi_rol() = 'Vendedor' and vendedor = public.mi_vendedor())
);

-- Asegura que los módulos principales existan en configuración.
insert into public.modulos_sistema (id, nombre, grupo, descripcion, orden, activo) values
  ('control','Control llamadas','Ventas','Gestión diaria de llamadas con edición y reversión.',20,true),
  ('clientes','Clientes','CRM','Ficha completa, WhatsApp e historial.',30,true),
  ('ordenes','Órdenes','Operaciones','Pedidos, despacho y delivery.',40,true),
  ('productos','Productos','Operaciones','Catálogo de productos.',50,true),
  ('config','Configuración','Sistema','Catálogos, plantillas, usuarios y módulos.',90,true)
on conflict (id) do update set
  nombre = excluded.nombre,
  grupo = excluded.grupo,
  descripcion = excluded.descripcion,
  orden = excluded.orden,
  activo = true;

-- Permisos base para que el Gerente pueda operar todos los módulos.
insert into public.roles_permisos (rol, modulo, nivel) values
  ('Gerente','control','editar'),
  ('Gerente','clientes','editar'),
  ('Gerente','ordenes','editar'),
  ('Gerente','productos','editar'),
  ('Gerente','config','editar'),
  ('Vendedor','control','editar'),
  ('Vendedor','clientes','ver')
on conflict (rol, modulo) do update set nivel = excluded.nivel;

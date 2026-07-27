-- ============================================================
-- 05_actualizacion_v32.sql · Productos César Integrado V3.2
-- Ejecutar DESPUÉS del SQL V3.1.
-- Agrega hora de gestión y refuerza permisos de edición/reversión.
-- ============================================================

-- Hora visible de la gestión en el módulo Control e historial del cliente.
alter table if exists public.llamadas
  add column if not exists hora time;

-- Rellena la hora de gestiones anteriores usando creado_en cuando esté disponible.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='llamadas' and column_name='creado_en'
  ) then
    update public.llamadas
      set hora = creado_en::time
      where hora is null and creado_en is not null;
  end if;
end $$;

alter table if exists public.llamadas enable row level security;
alter table if exists public.pedidos enable row level security;
alter table if exists public.ordenes enable row level security;

-- Permitir editar gestiones: Gerente/Supervisor todas; Vendedor solo las de su cartera.
drop policy if exists llam_update_v32 on public.llamadas;
create policy llam_update_v32 on public.llamadas
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
drop policy if exists llam_delete_v32 on public.llamadas;
create policy llam_delete_v32 on public.llamadas
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

-- Políticas de respaldo para limpiar pedidos/órdenes generados por llamada revertida.
drop policy if exists ped_delete_v32 on public.pedidos;
create policy ped_delete_v32 on public.pedidos
for delete using (
  public.mi_rol() in ('Gerente','Supervisor')
  or (public.mi_rol() = 'Vendedor' and vendedor = public.mi_vendedor())
);

drop policy if exists orden_delete_v32 on public.ordenes;
create policy orden_delete_v32 on public.ordenes
for delete using (
  public.mi_rol() in ('Gerente','Supervisor')
  or (public.mi_rol() = 'Vendedor' and vendedor = public.mi_vendedor())
);

-- Actualiza descripción de módulo control.
insert into public.modulos_sistema (id, nombre, grupo, descripcion, orden, activo) values
  ('control','Control llamadas','Ventas','Gestión diaria, agenda por fecha, edición, reversión y hora de gestión.',20,true),
  ('config','Configuración','Sistema','Catálogos, plantillas, usuarios, módulos y apariencia.',90,true)
on conflict (id) do update set
  nombre = excluded.nombre,
  grupo = excluded.grupo,
  descripcion = excluded.descripcion,
  orden = excluded.orden,
  activo = true;

insert into public.roles_permisos (rol, modulo, nivel) values
  ('Gerente','control','editar'),
  ('Gerente','config','editar'),
  ('Vendedor','control','editar')
on conflict (rol, modulo) do update set nivel = excluded.nivel;

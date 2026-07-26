-- ============================================================
-- 06_actualizacion_v33.sql · Productos César Integrado V3.3
-- Ejecutar DESPUÉS del SQL V3.2.
-- Activa eliminación/desactivación de productos desde el catálogo.
-- ============================================================

alter table if exists public.productos_despacho enable row level security;

-- Permite al Gerente/Supervisor administrar productos.
-- Lectura para usuarios autenticados; escritura para roles operativos según configuración actual.
drop policy if exists prod_despacho_all on public.productos_despacho;
create policy prod_despacho_all on public.productos_despacho
for all to authenticated
using (
  public.mi_rol() in ('Gerente','Supervisor','Vendedor','Cobrador')
)
with check (
  public.mi_rol() in ('Gerente','Supervisor','Vendedor','Cobrador')
);

grant select, insert, update, delete on public.productos_despacho to authenticated;

-- Actualiza descripción del módulo de productos.
insert into public.modulos_sistema (id, nombre, grupo, descripcion, orden, activo) values
  ('productos','Productos','Operaciones','Catálogo con importar/exportar Excel, editar, activar/desactivar y eliminar artículos.',50,true)
on conflict (id) do update set
  nombre = excluded.nombre,
  grupo = excluded.grupo,
  descripcion = excluded.descripcion,
  orden = excluded.orden,
  activo = true;

insert into public.roles_permisos (rol, modulo, nivel) values
  ('Gerente','productos','editar'),
  ('Supervisor','productos','editar'),
  ('Vendedor','productos','editar')
on conflict (rol, modulo) do update set nivel = excluded.nivel;

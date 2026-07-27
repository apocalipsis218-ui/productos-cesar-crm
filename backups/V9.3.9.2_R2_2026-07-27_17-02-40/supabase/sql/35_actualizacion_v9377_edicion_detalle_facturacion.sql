begin;

-- V9.3.7.7
-- Permite que los usuarios con permiso de edición en Órdenes, Control,
-- Carnicería o Facturación eliminen líneas al editar una orden.
-- La política anterior limitaba DELETE exclusivamente a administradores:
-- la interfaz quitaba el artículo, pero Supabase conservaba el registro.

alter table public.orden_detalle enable row level security;

drop policy if exists v552_orden_detalle_delete_admin on public.orden_detalle;
drop policy if exists v9377_orden_detalle_delete_operativo on public.orden_detalle;

create policy v9377_orden_detalle_delete_operativo
on public.orden_detalle
for delete
to authenticated
using (
  public.tiene_algun_modulo(
    array['ordenes','control','carniceria','facturacion'],
    'editar'
  )
);

notify pgrst, 'reload schema';

commit;

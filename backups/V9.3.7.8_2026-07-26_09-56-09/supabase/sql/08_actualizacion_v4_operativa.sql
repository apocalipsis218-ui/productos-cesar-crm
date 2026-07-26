-- ============================================================
-- 08_actualizacion_v4_operativa.sql · Sistema Productos César V4
-- Flujo operativo por departamentos:
-- CRM / llamada -> orden -> carnicería/peso -> facturación/impresión 80mm
-- -> validación -> delivery -> liquidación/CXC.
-- Ejecutar en Supabase CRM antes de subir el HTML V4.
-- ============================================================

create extension if not exists pgcrypto;

-- 1) Nuevos roles operativos, si el tipo enum existe.
do $$
begin
  if exists (select 1 from pg_type where typname = 'rol_usuario') then
    alter type public.rol_usuario add value if not exists 'Carnicería';
    alter type public.rol_usuario add value if not exists 'Facturación';
    alter type public.rol_usuario add value if not exists 'Verificador';
    alter type public.rol_usuario add value if not exists 'Delivery';
    alter type public.rol_usuario add value if not exists 'CXC';
  end if;
exception when duplicate_object then null;
end $$;

-- 2) Módulos operativos nuevos.
insert into public.modulos_sistema (id, nombre, grupo, descripcion, orden, activo) values
  ('carniceria','Carnicería / Despacho','Operación','Órdenes recibidas para preparar, pesar y enviar a facturación.',41,true),
  ('facturacion','Facturación','Operación','Órdenes listas para imprimir en ticket 80 mm y registrar factura externa.',42,true),
  ('validacion','Validación / Entrega','Operación','Validación final de peso y asignación al delivery.',43,true),
  ('delivery','Delivery','Operación','Pedidos asignados por delivery.',44,true),
  ('liquidacion','Liquidación / CXC','Operación','Recepción de dinero, crédito, devoluciones y cierre de rutas.',45,true),
  ('ordenes','Órdenes','Operación','Vista completa de trazabilidad del flujo operativo.',40,true)
on conflict (id) do update set
  nombre = excluded.nombre,
  grupo = excluded.grupo,
  descripcion = excluded.descripcion,
  orden = excluded.orden,
  activo = true;

-- 3) Permisos por rol. Ajusta desde Configuración > Usuarios si necesitas restringir más.
insert into public.roles_permisos (rol, modulo, nivel) values
  ('Gerente','inicio','editar'),('Gerente','control','editar'),('Gerente','clientes','editar'),('Gerente','ordenes','editar'),('Gerente','carniceria','editar'),('Gerente','facturacion','editar'),('Gerente','validacion','editar'),('Gerente','delivery','editar'),('Gerente','liquidacion','editar'),('Gerente','productos','editar'),('Gerente','config','editar'),
  ('Supervisor','ordenes','editar'),('Supervisor','carniceria','editar'),('Supervisor','facturacion','editar'),('Supervisor','validacion','editar'),('Supervisor','delivery','ver'),('Supervisor','liquidacion','editar'),('Supervisor','productos','editar'),('Supervisor','config','ver'),
  ('Vendedor','control','editar'),('Vendedor','clientes','ver'),('Vendedor','ordenes','editar'),('Vendedor','carniceria','none'),('Vendedor','facturacion','none'),('Vendedor','validacion','none'),('Vendedor','delivery','none'),('Vendedor','liquidacion','none'),
  ('Cobrador','clientes','ver'),('Cobrador','ordenes','ver'),('Cobrador','delivery','ver'),('Cobrador','liquidacion','editar'),
  ('Carnicería','ordenes','ver'),('Carnicería','carniceria','editar'),('Carnicería','facturacion','none'),('Carnicería','validacion','none'),('Carnicería','delivery','none'),('Carnicería','liquidacion','none'),
  ('Facturación','ordenes','ver'),('Facturación','facturacion','editar'),('Facturación','carniceria','none'),('Facturación','validacion','none'),('Facturación','delivery','none'),('Facturación','liquidacion','none'),
  ('Verificador','ordenes','ver'),('Verificador','validacion','editar'),('Verificador','facturacion','ver'),('Verificador','delivery','ver'),('Verificador','liquidacion','none'),
  ('Delivery','ordenes','ver'),('Delivery','delivery','editar'),('Delivery','liquidacion','none'),
  ('CXC','ordenes','ver'),('CXC','delivery','ver'),('CXC','liquidacion','editar')
on conflict (rol, modulo) do update set nivel = excluded.nivel;

-- 4) Catálogo de estados ampliado.
insert into public.catalogos (id, nombre, descripcion, orden, activo) values
  ('estado_orden','Estados de orden','Estados operativos desde pedido hasta cierre.',80,true)
on conflict (id) do update set activo=true;

insert into public.catalogo_items (catalogo_id, valor, orden, activo) values
  ('estado_orden','Pedido recibido',10,true),
  ('estado_orden','En preparación',20,true),
  ('estado_orden','Lista para facturar',30,true),
  ('estado_orden','Impresa para facturar',35,true),
  ('estado_orden','Facturada',40,true),
  ('estado_orden','Validada para delivery',50,true),
  ('estado_orden','Asignada a delivery',60,true),
  ('estado_orden','En ruta',70,true),
  ('estado_orden','Cobrado',80,true),
  ('estado_orden','Entregado a crédito',90,true),
  ('estado_orden','No entregado',100,true),
  ('estado_orden','Devuelto parcial',110,true),
  ('estado_orden','Cerrado',120,true),
  ('estado_orden','Anulado',130,true)
on conflict (catalogo_id, valor) do update set activo=true, orden=excluded.orden;

-- 5) Empleados operativos configurables.
create table if not exists public.empleados_operativos (
  id bigint generated always as identity primary key,
  nombre text not null,
  area text not null,
  activo boolean not null default true,
  observaciones text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (nombre, area),
  constraint chk_empleados_operativos_area check (area in ('Carnicería','Facturación','Validación','CXC'))
);
create index if not exists idx_empleados_operativos_area on public.empleados_operativos(area);
create index if not exists idx_empleados_operativos_activo on public.empleados_operativos(activo);

alter table public.empleados_operativos enable row level security;
drop policy if exists empleados_operativos_all on public.empleados_operativos;
create policy empleados_operativos_all on public.empleados_operativos
for all to authenticated using (true) with check (true);
grant select, insert, update, delete on public.empleados_operativos to authenticated;

-- Semillas editables desde Configuración > Empleados operativos.
insert into public.empleados_operativos (nombre, area, activo) values
  ('Carnicería 1','Carnicería',true),
  ('Facturación 1','Facturación',true),
  ('Verificador 1','Validación',true),
  ('CXC 1','CXC',true)
on conflict (nombre, area) do nothing;

-- 6) Reforzar tabla de órdenes con campos de trazabilidad por departamento.
alter table public.ordenes add column if not exists preparado_por text;
alter table public.ordenes add column if not exists peso_preparado numeric(14,2);
alter table public.ordenes add column if not exists paquetes_preparados int;
alter table public.ordenes add column if not exists preparado_en timestamptz;
alter table public.ordenes add column if not exists notas_preparacion text;

alter table public.ordenes add column if not exists facturado_por text;
alter table public.ordenes add column if not exists facturado_en timestamptz;
alter table public.ordenes add column if not exists peso_facturado numeric(14,2);

alter table public.ordenes add column if not exists validado_por text;
alter table public.ordenes add column if not exists peso_validado numeric(14,2);
alter table public.ordenes add column if not exists validado_en timestamptz;
alter table public.ordenes add column if not exists notas_validacion text;
alter table public.ordenes add column if not exists asignado_delivery_en timestamptz;
alter table public.ordenes add column if not exists en_ruta_en timestamptz;

alter table public.ordenes add column if not exists recibido_por text;
alter table public.ordenes add column if not exists recibido_en timestamptz;
alter table public.ordenes add column if not exists resultado_entrega text;
alter table public.ordenes add column if not exists monto_cobrado numeric(14,2) not null default 0;
alter table public.ordenes add column if not exists monto_pendiente numeric(14,2) not null default 0;
alter table public.ordenes add column if not exists notas_liquidacion text;

alter table public.ordenes add column if not exists cantidad_impresiones int not null default 0;
alter table public.ordenes add column if not exists ultima_impresion timestamptz;
alter table public.ordenes add column if not exists impreso_por uuid references auth.users(id);

-- Si había una restricción rígida de estados, se amplía.
alter table public.ordenes drop constraint if exists chk_orden_estado;
alter table public.ordenes add constraint chk_orden_estado check (estado in (
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

-- 7) Historial de estados/movimientos.
create table if not exists public.orden_estados_historial (
  id bigint generated always as identity primary key,
  orden_id bigint not null references public.ordenes(id) on delete cascade,
  estado_anterior text,
  estado_nuevo text not null,
  comentario text,
  usuario uuid references auth.users(id),
  creado_en timestamptz not null default now()
);
create index if not exists idx_orden_estados_historial_orden on public.orden_estados_historial(orden_id);

alter table public.orden_estados_historial enable row level security;
drop policy if exists orden_estados_historial_all on public.orden_estados_historial;
create policy orden_estados_historial_all on public.orden_estados_historial
for all to authenticated using (true) with check (true);
grant select, insert, update, delete on public.orden_estados_historial to authenticated;

-- 8) Asegurar políticas y permisos en tablas relacionadas.
alter table if exists public.orden_pesos enable row level security;
drop policy if exists orden_pesos_all on public.orden_pesos;
create policy orden_pesos_all on public.orden_pesos
for all to authenticated using (true) with check (true);
grant select, insert, update, delete on public.orden_pesos to authenticated;

alter table if exists public.orden_entregas enable row level security;
drop policy if exists orden_entregas_all on public.orden_entregas;
create policy orden_entregas_all on public.orden_entregas
for all to authenticated using (true) with check (true);
grant select, insert, update, delete on public.orden_entregas to authenticated;

alter table if exists public.orden_pagos enable row level security;
drop policy if exists orden_pagos_all on public.orden_pagos;
create policy orden_pagos_all on public.orden_pagos
for all to authenticated using (true) with check (true);
grant select, insert, update, delete on public.orden_pagos to authenticated;

-- Permitir resultados con nombres legibles usados por la V4.
alter table if exists public.orden_entregas drop constraint if exists chk_orden_entrega_resultado;
alter table if exists public.orden_entregas add constraint chk_orden_entrega_resultado check (resultado in (
  'Cobrado',
  'Entregado a crédito',
  'No entregado',
  'Devuelto parcial',
  'entregado_cobrado',
  'entregado_credito',
  'no_entregado',
  'devuelto_parcial'
));

-- 9) Refuerzo de deliverys.
alter table if exists public.deliverys_config enable row level security;
drop policy if exists deliverys_config_all on public.deliverys_config;
create policy deliverys_config_all on public.deliverys_config
for all to authenticated using (true) with check (true);
grant select, insert, update, delete on public.deliverys_config to authenticated;

-- 10) Actualizar perfil de César como Gerente.
insert into public.perfiles (id, nombre, rol, vendedor, activo)
select id, coalesce(raw_user_meta_data->>'nombre', email), 'Gerente', 'Cesar', true
from auth.users
where email = 'apocalipsis218@gmail.com'
on conflict (id) do update set rol='Gerente', vendedor='Cesar', activo=true;

-- ============================================================
-- Fin V4.
-- ============================================================

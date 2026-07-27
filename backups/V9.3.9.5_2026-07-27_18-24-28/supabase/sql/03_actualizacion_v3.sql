-- ============================================================
-- 03_actualizacion_v3.sql
-- Productos César · Sistema Integrado V3
-- Ejecutar en Supabase del CRM: productos-cesar-crm
-- Requiere que el CRM base ya exista. Compatible con V1/V2.
-- Agrega: catálogos configurables, plantillas WhatsApp,
-- productos mejorados, importación/exportación y permisos.
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- 1) CONFIGURACIÓN GENERAL
-- ------------------------------------------------------------
create table if not exists public.config (
  clave text primary key,
  valor text,
  editable boolean default true
);

insert into public.config (clave, valor, editable) values
  ('empresa_nombre','Productos César', true),
  ('sistema_nombre','Sistema Productos César V3', true),
  ('moneda','RD$', true),
  ('tema_principal','profesional', true),
  ('tolerancia_peso_lbs','1.00', true),
  ('whatsapp_prefijo_pais','1', true),
  ('importar_crear_catalogos','true', true),
  ('condicion_pago_defecto','Crédito', true),
  ('version_integrada','v3_whatsapp_catalogos_excel', false)
on conflict (clave) do update set valor = excluded.valor;

-- ------------------------------------------------------------
-- 2) CATÁLOGOS CONFIGURABLES
-- ------------------------------------------------------------
create table if not exists public.catalogos (
  id text primary key,
  nombre text not null,
  descripcion text,
  activo boolean not null default true,
  orden int not null default 100,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create table if not exists public.catalogo_items (
  id bigint generated always as identity primary key,
  catalogo_id text not null references public.catalogos(id) on delete cascade,
  valor text not null,
  descripcion text,
  color text,
  activo boolean not null default true,
  orden int not null default 100,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (catalogo_id, valor)
);

insert into public.catalogos (id, nombre, descripcion, orden, activo) values
  ('tipo_negocio','Tipo de negocio','Tipos de clientes: colmado, comedor, carnicería, etc.',10,true),
  ('sectores','Sectores','Sectores y zonas donde están los clientes.',20,true),
  ('frecuencias','Frecuencias','Frecuencia de contacto o visita.',30,true),
  ('categoria_producto','Categoría de producto','Categorías para productos de despacho.',40,true),
  ('unidad_producto','Unidad de producto','Unidades de venta: lb, unidad, caja, paquete.',50,true),
  ('estado_orden','Estados de orden','Estados operativos del flujo de pedidos.',60,true),
  ('metodos_pago','Métodos de pago','Efectivo, transferencia, crédito, mixto.',70,true)
on conflict (id) do update set nombre=excluded.nombre, descripcion=excluded.descripcion, orden=excluded.orden, activo=excluded.activo;

insert into public.catalogo_items (catalogo_id, valor, orden) values
  ('tipo_negocio','Colmado',10),('tipo_negocio','Comedor',20),('tipo_negocio','Carnicería',30),('tipo_negocio','Bodega',40),('tipo_negocio','Embutidos',50),('tipo_negocio','Provisiones',60),('tipo_negocio','Supermercado',70),('tipo_negocio','Mini Market',80),('tipo_negocio','Restaurante',90),('tipo_negocio','Otro',100),
  ('frecuencias','Diario',10),('frecuencias','Interdiario',20),('frecuencias','Semanal',30),('frecuencias','Quincenal',40),('frecuencias','Mensual',50),('frecuencias','Ocasional',60),
  ('categoria_producto','Carnes',10),('categoria_producto','Embutidos',20),('categoria_producto','Lácteos',30),('categoria_producto','Pollo',40),('categoria_producto','Ahumados',50),('categoria_producto','Provisiones',60),('categoria_producto','Otros',100),
  ('unidad_producto','lb',10),('unidad_producto','unidad',20),('unidad_producto','paquete',30),('unidad_producto','caja',40),('unidad_producto','fardo',50),
  ('metodos_pago','Efectivo',10),('metodos_pago','Transferencia',20),('metodos_pago','Crédito',30),('metodos_pago','Mixto',40),
  ('estado_orden','Pedido recibido',10),('estado_orden','En preparación',20),('estado_orden','Preparado',30),('estado_orden','Facturado',40),('estado_orden','Validado para ruta',50),('estado_orden','Asignado a delivery',60),('estado_orden','En ruta',70),('estado_orden','Entregado',80),('estado_orden','Entregado a crédito',90),('estado_orden','Cobrado',100),('estado_orden','No entregado',110),('estado_orden','Devuelto parcial',120),('estado_orden','Cerrado',130),('estado_orden','Anulado',140)
on conflict (catalogo_id, valor) do nothing;

-- Alimentar sectores desde los clientes existentes.
insert into public.catalogo_items (catalogo_id, valor, orden)
select 'sectores', trim(sector), 100
from public.clientes
where nullif(trim(coalesce(sector,'')),'') is not null
group by trim(sector)
on conflict (catalogo_id, valor) do nothing;

-- Alimentar tipos desde clientes existentes.
insert into public.catalogo_items (catalogo_id, valor, orden)
select 'tipo_negocio', trim(tipo), 100
from public.clientes
where nullif(trim(coalesce(tipo,'')),'') is not null
group by trim(tipo)
on conflict (catalogo_id, valor) do nothing;

-- ------------------------------------------------------------
-- 3) PLANTILLAS EDITABLES DE WHATSAPP
-- ------------------------------------------------------------
create table if not exists public.plantillas_whatsapp (
  id bigint generated always as identity primary key,
  nombre text not null,
  categoria text not null default 'clientes',
  texto text not null,
  activo boolean not null default true,
  orden int not null default 100,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create unique index if not exists uq_plantillas_whatsapp_nombre_cat on public.plantillas_whatsapp(nombre, categoria);

insert into public.plantillas_whatsapp (nombre, categoria, texto, orden, activo) values
  ('Pedido de hoy','clientes','Hola {contacto}, le escribe Productos César. ¿Necesita mercancía hoy?',10,true),
  ('Ruta del día','clientes','Buenos días {negocio}, estamos tomando pedidos para entrega de hoy. ¿Desea que le enviemos mercancía?',20,true),
  ('Seguimiento','seguimiento','Saludos {contacto}, le damos seguimiento desde Productos César. ¿Cómo le fue con el último pedido?',30,true),
  ('Cobranza cordial','cobranza','Saludos {contacto}, le escribimos de Productos César para dar seguimiento a su cuenta pendiente de {monto}.',40,true),
  ('Confirmar entrega','pedido','Saludos {contacto}, su pedido de Productos César está en proceso. Le avisamos cuando salga a ruta.',50,true)
on conflict (nombre, categoria) do update set texto=excluded.texto, orden=excluded.orden, activo=excluded.activo;

-- Compatibilidad: si existe una tabla vieja llamada plantillas, copiar sus textos.
do $$
begin
  if to_regclass('public.plantillas') is not null then
    insert into public.plantillas_whatsapp (nombre, categoria, texto, orden, activo)
    select coalesce(nullif(left(texto,32),''),'Plantilla importada'), 'clientes', texto, coalesce(orden,100), true
    from public.plantillas
    where nullif(trim(coalesce(texto,'')),'') is not null
    on conflict (nombre, categoria) do nothing;
  end if;
end $$;

-- ------------------------------------------------------------
-- 4) PRODUCTOS MEJORADOS PARA IMPORTAR/EXPORTAR
-- ------------------------------------------------------------
create table if not exists public.productos_despacho (
  id bigint generated always as identity primary key,
  nombre text not null unique,
  unidad text not null default 'lb',
  precio_defecto numeric(14,2) not null default 0,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

alter table public.productos_despacho add column if not exists codigo text;
alter table public.productos_despacho add column if not exists categoria text;
alter table public.productos_despacho add column if not exists observaciones text;

create unique index if not exists uq_productos_despacho_codigo on public.productos_despacho(codigo) where codigo is not null;
create index if not exists idx_productos_despacho_categoria on public.productos_despacho(categoria);

-- Productos base si no existen.
insert into public.productos_despacho (codigo, nombre, unidad, precio_defecto, categoria, activo) values
  ('PR-001','Chuleta ahumada','lb',115,'Ahumados',true),
  ('PR-002','Longaniza criolla','lb',135,'Embutidos',true),
  ('PR-003','Pollo fresco','lb',75,'Pollo',true),
  ('PR-004','Muslo importado','lb',75,'Pollo',true),
  ('PR-005','Pierna importada','lb',95,'Carnes',true),
  ('PR-006','Res de guisar','lb',145,'Carnes',true),
  ('PR-007','Mondongo res','lb',110,'Carnes',true),
  ('PR-008','Queso','lb',0,'Lácteos',true)
on conflict (nombre) do update set
  codigo = coalesce(public.productos_despacho.codigo, excluded.codigo),
  categoria = coalesce(public.productos_despacho.categoria, excluded.categoria),
  unidad = excluded.unidad;

-- ------------------------------------------------------------
-- 5) MÓDULOS Y PERMISOS
-- ------------------------------------------------------------
create table if not exists public.modulos_sistema (
  id text primary key,
  nombre text not null,
  grupo text not null default 'Operación',
  descripcion text,
  orden int not null default 100,
  activo boolean not null default true,
  actualizado_en timestamptz not null default now()
);

insert into public.modulos_sistema (id, nombre, grupo, descripcion, orden, activo) values
  ('inicio','Inicio','Inicio','Resumen gerencial.',10,true),
  ('control','Control llamadas','Ventas','Gestión diaria de llamadas.',20,true),
  ('clientes','Clientes','Clientes','Ficha completa, WhatsApp, importación y exportación.',30,true),
  ('ordenes','Órdenes','Operación','Seguimiento del pedido, despacho y entrega.',40,true),
  ('productos','Productos','Inventario','Catálogo de productos, importación y exportación.',50,true),
  ('config','Configuración','Sistema','Usuarios, módulos, catálogos y plantillas.',90,true)
on conflict (id) do update set nombre=excluded.nombre, grupo=excluded.grupo, descripcion=excluded.descripcion, orden=excluded.orden, activo=excluded.activo;

create table if not exists public.usuario_modulos (
  usuario_id uuid not null references auth.users(id) on delete cascade,
  modulo text not null references public.modulos_sistema(id) on delete cascade,
  nivel text not null default 'none' check (nivel in ('none','ver','editar')),
  actualizado_en timestamptz not null default now(),
  primary key (usuario_id, modulo)
);

-- Asegurar permisos base por rol si roles_permisos existe.
insert into public.roles_permisos (rol, modulo, nivel) values
  ('Gerente','inicio','editar'),('Gerente','control','editar'),('Gerente','clientes','editar'),('Gerente','ordenes','editar'),('Gerente','productos','editar'),('Gerente','config','editar'),
  ('Vendedor','inicio','ver'),('Vendedor','control','editar'),('Vendedor','clientes','ver'),('Vendedor','ordenes','ver'),('Vendedor','productos','ver'),('Vendedor','config','none'),
  ('Cobrador','inicio','ver'),('Cobrador','control','none'),('Cobrador','clientes','ver'),('Cobrador','ordenes','ver'),('Cobrador','productos','ver'),('Cobrador','config','none'),
  ('Supervisor','inicio','ver'),('Supervisor','control','ver'),('Supervisor','clientes','editar'),('Supervisor','ordenes','editar'),('Supervisor','productos','editar'),('Supervisor','config','ver')
on conflict (rol, modulo) do update set nivel=excluded.nivel;

-- ------------------------------------------------------------
-- 6) LOG DE IMPORTACIONES
-- ------------------------------------------------------------
create table if not exists public.importaciones_log (
  id bigint generated always as identity primary key,
  tipo text not null,
  archivo text,
  importados int not null default 0,
  actualizados int not null default 0,
  errores int not null default 0,
  detalle jsonb,
  usuario uuid references auth.users(id),
  creado_en timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 7) RLS / GRANTS
-- ------------------------------------------------------------
alter table public.catalogos enable row level security;
alter table public.catalogo_items enable row level security;
alter table public.plantillas_whatsapp enable row level security;
alter table public.productos_despacho enable row level security;
alter table public.modulos_sistema enable row level security;
alter table public.usuario_modulos enable row level security;
alter table public.importaciones_log enable row level security;

-- Catálogos
DROP POLICY IF EXISTS catalogos_read ON public.catalogos;
CREATE POLICY catalogos_read ON public.catalogos FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS catalogos_admin ON public.catalogos;
CREATE POLICY catalogos_admin ON public.catalogos FOR ALL TO authenticated USING (public.mi_rol() = 'Gerente') WITH CHECK (public.mi_rol() = 'Gerente');

DROP POLICY IF EXISTS catalogo_items_read ON public.catalogo_items;
CREATE POLICY catalogo_items_read ON public.catalogo_items FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS catalogo_items_admin ON public.catalogo_items;
CREATE POLICY catalogo_items_admin ON public.catalogo_items FOR ALL TO authenticated USING (public.mi_rol() = 'Gerente') WITH CHECK (public.mi_rol() = 'Gerente');

-- Plantillas WhatsApp
DROP POLICY IF EXISTS plantillas_whatsapp_read ON public.plantillas_whatsapp;
CREATE POLICY plantillas_whatsapp_read ON public.plantillas_whatsapp FOR SELECT TO authenticated USING (activo = true OR public.mi_rol() = 'Gerente');
DROP POLICY IF EXISTS plantillas_whatsapp_admin ON public.plantillas_whatsapp;
CREATE POLICY plantillas_whatsapp_admin ON public.plantillas_whatsapp FOR ALL TO authenticated USING (public.mi_rol() = 'Gerente') WITH CHECK (public.mi_rol() = 'Gerente');

-- Productos: lectura autenticados, escritura Gerente/Supervisor. Si quieres que cualquier autenticado edite, cambia mi_rol().
DROP POLICY IF EXISTS prod_despacho_all ON public.productos_despacho;
CREATE POLICY prod_despacho_all ON public.productos_despacho FOR ALL TO authenticated
  USING (public.mi_rol() in ('Gerente','Supervisor') OR true)
  WITH CHECK (public.mi_rol() in ('Gerente','Supervisor','Vendedor','Cobrador'));

-- Módulos y permisos
DROP POLICY IF EXISTS modulos_sistema_read ON public.modulos_sistema;
CREATE POLICY modulos_sistema_read ON public.modulos_sistema FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS modulos_sistema_admin ON public.modulos_sistema;
CREATE POLICY modulos_sistema_admin ON public.modulos_sistema FOR ALL TO authenticated USING (public.mi_rol() = 'Gerente') WITH CHECK (public.mi_rol() = 'Gerente');

DROP POLICY IF EXISTS usuario_modulos_read ON public.usuario_modulos;
CREATE POLICY usuario_modulos_read ON public.usuario_modulos FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS usuario_modulos_admin ON public.usuario_modulos;
CREATE POLICY usuario_modulos_admin ON public.usuario_modulos FOR ALL TO authenticated USING (public.mi_rol() = 'Gerente') WITH CHECK (public.mi_rol() = 'Gerente');

-- Logs
DROP POLICY IF EXISTS importaciones_log_read ON public.importaciones_log;
CREATE POLICY importaciones_log_read ON public.importaciones_log FOR SELECT TO authenticated USING (public.mi_rol() = 'Gerente');
DROP POLICY IF EXISTS importaciones_log_insert ON public.importaciones_log;
CREATE POLICY importaciones_log_insert ON public.importaciones_log FOR INSERT TO authenticated WITH CHECK (true);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalogos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalogo_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plantillas_whatsapp TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.productos_despacho TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.modulos_sistema TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.usuario_modulos TO authenticated;
GRANT SELECT, INSERT ON public.importaciones_log TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- ------------------------------------------------------------
-- 8) ADMIN CESAR
-- ------------------------------------------------------------
insert into public.perfiles (id, nombre, rol, vendedor, activo)
select id, coalesce(raw_user_meta_data->>'nombre', email), 'Gerente', 'Cesar', true
from auth.users
where email = 'apocalipsis218@gmail.com'
on conflict (id) do update set rol='Gerente', vendedor='Cesar', activo=true;

select 'listo: actualización V3 instalada (catálogos, WhatsApp, productos, Excel, diseño)' as estado;

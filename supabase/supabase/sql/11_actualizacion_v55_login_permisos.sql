-- Productos César - V5.5 Login y permisos por empleado
-- Ejecutar en Supabase SQL Editor antes de subir el HTML V5.5.
-- Este script es seguro para ejecutar más de una vez.

-- 1) Asegurar columnas básicas del perfil operativo.
ALTER TABLE IF EXISTS public.perfiles
  ADD COLUMN IF NOT EXISTS nombre text,
  ADD COLUMN IF NOT EXISTS rol text DEFAULT 'Sin perfil',
  ADD COLUMN IF NOT EXISTS vendedor text,
  ADD COLUMN IF NOT EXISTS activo boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS creado_en timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS actualizado_en timestamptz DEFAULT now();

-- 2) Catálogo de módulos del sistema.
CREATE TABLE IF NOT EXISTS public.modulos_sistema (
  id text PRIMARY KEY,
  nombre text NOT NULL,
  descripcion text,
  orden integer NOT NULL DEFAULT 0,
  activo boolean NOT NULL DEFAULT true
);

INSERT INTO public.modulos_sistema (id,nombre,descripcion,orden,activo) VALUES
('inicio','Inicio','Resumen general',1,true),
('control','Control','Llamadas y gestiones',2,true),
('clientes','Clientes','Ficha y WhatsApp',3,true),
('ordenes','Órdenes','Panel completo',4,true),
('carniceria','Carnicería','Preparar y pesar',5,true),
('facturacion','Facturación','Imprimir y facturar',6,true),
('validacion','Validación','Entrega a delivery',7,true),
('delivery','Delivery','Mis pedidos',8,true),
('liquidacion','Liquidación','Cobros y CXC',9,true),
('productos','Productos','Catálogo',10,true),
('config','Configuración','Sistema',11,true)
ON CONFLICT (id) DO UPDATE SET
  nombre=EXCLUDED.nombre,
  descripcion=EXCLUDED.descripcion,
  orden=EXCLUDED.orden,
  activo=EXCLUDED.activo;

-- 3) Permisos por rol. nivel: none, ver, editar.
CREATE TABLE IF NOT EXISTS public.roles_permisos (
  rol text NOT NULL,
  modulo text NOT NULL REFERENCES public.modulos_sistema(id) ON DELETE CASCADE,
  nivel text NOT NULL DEFAULT 'none' CHECK (nivel IN ('none','ver','editar')),
  actualizado_en timestamptz DEFAULT now(),
  PRIMARY KEY (rol, modulo)
);

-- Gerente: todo editar.
INSERT INTO public.roles_permisos (rol,modulo,nivel) SELECT 'Gerente', id, 'editar' FROM public.modulos_sistema
ON CONFLICT (rol,modulo) DO UPDATE SET nivel=EXCLUDED.nivel, actualizado_en=now();

-- Roles operativos.
INSERT INTO public.roles_permisos (rol,modulo,nivel) VALUES
('Control','inicio','ver'),('Control','control','editar'),('Control','clientes','editar'),('Control','ordenes','editar'),('Control','productos','ver'),
('Carnicería','inicio','ver'),('Carnicería','carniceria','editar'),('Carnicería','ordenes','ver'),('Carnicería','productos','ver'),
('Facturación','inicio','ver'),('Facturación','facturacion','editar'),('Facturación','ordenes','ver'),('Facturación','productos','ver'),
('Validación','inicio','ver'),('Validación','validacion','editar'),('Validación','ordenes','ver'),('Validación','delivery','ver'),
('Delivery','inicio','ver'),('Delivery','delivery','editar'),
('Liquidación','inicio','ver'),('Liquidación','liquidacion','editar'),('Liquidación','ordenes','ver'),
('Supervisor','inicio','ver'),('Supervisor','control','ver'),('Supervisor','clientes','ver'),('Supervisor','ordenes','editar'),('Supervisor','carniceria','editar'),('Supervisor','facturacion','editar'),('Supervisor','validacion','editar'),('Supervisor','delivery','ver'),('Supervisor','liquidacion','ver'),('Supervisor','productos','ver')
ON CONFLICT (rol,modulo) DO UPDATE SET nivel=EXCLUDED.nivel, actualizado_en=now();

-- 4) Permisos personalizados por usuario.
CREATE TABLE IF NOT EXISTS public.usuario_modulos (
  usuario_id uuid NOT NULL,
  modulo text NOT NULL REFERENCES public.modulos_sistema(id) ON DELETE CASCADE,
  nivel text NOT NULL DEFAULT 'none' CHECK (nivel IN ('none','ver','editar')),
  actualizado_en timestamptz DEFAULT now(),
  PRIMARY KEY (usuario_id, modulo)
);

-- 5) RLS básica. El frontend usa sesión del usuario; las reglas permiten leer configuración y actualizar perfil/permisos a gerentes.
ALTER TABLE public.modulos_sistema ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles_permisos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuario_modulos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS modulos_sistema_select ON public.modulos_sistema;
CREATE POLICY modulos_sistema_select ON public.modulos_sistema FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS roles_permisos_select ON public.roles_permisos;
CREATE POLICY roles_permisos_select ON public.roles_permisos FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS usuario_modulos_select ON public.usuario_modulos;
CREATE POLICY usuario_modulos_select ON public.usuario_modulos FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS usuario_modulos_admin_all ON public.usuario_modulos;
CREATE POLICY usuario_modulos_admin_all ON public.usuario_modulos FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.perfiles p WHERE p.id = auth.uid() AND p.rol IN ('Gerente','Supervisor') AND COALESCE(p.activo,true)=true))
WITH CHECK (EXISTS (SELECT 1 FROM public.perfiles p WHERE p.id = auth.uid() AND p.rol IN ('Gerente','Supervisor') AND COALESCE(p.activo,true)=true));

-- 6) RLS de perfiles: leer perfiles para configurar usuarios; editar solo gerente/supervisor.
ALTER TABLE IF EXISTS public.perfiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS perfiles_select_auth ON public.perfiles;
CREATE POLICY perfiles_select_auth ON public.perfiles FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS perfiles_update_admin ON public.perfiles;
CREATE POLICY perfiles_update_admin ON public.perfiles FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.perfiles p WHERE p.id = auth.uid() AND p.rol IN ('Gerente','Supervisor') AND COALESCE(p.activo,true)=true))
WITH CHECK (EXISTS (SELECT 1 FROM public.perfiles p WHERE p.id = auth.uid() AND p.rol IN ('Gerente','Supervisor') AND COALESCE(p.activo,true)=true));

-- Nota:
-- Crear usuarios nuevos en Supabase Auth se hará en V5.6 mediante función segura.
-- En V5.5, crea el login en Supabase Auth y luego asigna perfil/módulos en la app.

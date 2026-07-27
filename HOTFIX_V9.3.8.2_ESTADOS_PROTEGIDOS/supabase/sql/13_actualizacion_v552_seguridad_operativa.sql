-- Productos César - V5.5.1
-- Mapeo completo de roles, módulos y permisos de datos dependientes.
-- Corrige casos como Carnicería viendo "Cliente" en vez del nombre real por falta de SELECT a clientes.
-- Ejecutar completo en Supabase SQL Editor. No borra datos.


-- 0) Compatibilidad si alguna instalación aún tiene roles como enum rol_usuario.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typname='rol_usuario') THEN
    ALTER TYPE public.rol_usuario ADD VALUE IF NOT EXISTS 'Control';
    ALTER TYPE public.rol_usuario ADD VALUE IF NOT EXISTS 'Carnicería';
    ALTER TYPE public.rol_usuario ADD VALUE IF NOT EXISTS 'Facturación';
    ALTER TYPE public.rol_usuario ADD VALUE IF NOT EXISTS 'Validación';
    ALTER TYPE public.rol_usuario ADD VALUE IF NOT EXISTS 'Delivery';
    ALTER TYPE public.rol_usuario ADD VALUE IF NOT EXISTS 'Liquidación';
    ALTER TYPE public.rol_usuario ADD VALUE IF NOT EXISTS 'Supervisor';
    ALTER TYPE public.rol_usuario ADD VALUE IF NOT EXISTS 'Sin perfil';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='roles_permisos' AND column_name='rol' AND udt_name='rol_usuario'
  ) THEN
    ALTER TABLE public.roles_permisos ALTER COLUMN rol TYPE text USING rol::text;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='perfiles' AND column_name='rol' AND udt_name='rol_usuario'
  ) THEN
    ALTER TABLE public.perfiles ALTER COLUMN rol DROP DEFAULT;
    ALTER TABLE public.perfiles ALTER COLUMN rol TYPE text USING rol::text;
    ALTER TABLE public.perfiles ALTER COLUMN rol SET DEFAULT 'Sin perfil';
  END IF;
END $$;


CREATE OR REPLACE FUNCTION public.mi_rol()
RETURNS public.rol_usuario
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r text;
  salida public.rol_usuario;
BEGIN
  SELECT p.rol::text INTO r
  FROM public.perfiles p
  WHERE p.id = auth.uid()
  LIMIT 1;

  IF r IS NULL OR length(trim(r)) = 0 THEN
    RETURN NULL;
  END IF;

  IF r = ANY (enum_range(NULL::public.rol_usuario)::text[]) THEN
    EXECUTE 'SELECT $1::public.rol_usuario' INTO salida USING r;
    RETURN salida;
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.mi_rol_text()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.rol::text
  FROM public.perfiles p
  WHERE p.id = auth.uid()
  LIMIT 1;
$$;

-- 1) Funciones de permiso por módulo.
CREATE OR REPLACE FUNCTION public.modulo_nivel_actual(p_modulo text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rol text;
  v_override text;
  v_base text;
BEGIN
  SELECT p.rol::text
    INTO v_rol
  FROM public.perfiles p
  WHERE p.id = auth.uid()
    AND COALESCE(p.activo,true) = true
  LIMIT 1;

  IF v_rol IS NULL OR length(trim(v_rol)) = 0 THEN
    RETURN 'none';
  END IF;

  IF v_rol = 'Gerente' THEN
    RETURN 'editar';
  END IF;

  SELECT um.nivel
    INTO v_override
  FROM public.usuario_modulos um
  WHERE um.usuario_id = auth.uid()
    AND um.modulo = p_modulo
  LIMIT 1;

  IF v_override IS NOT NULL THEN
    RETURN COALESCE(v_override,'none');
  END IF;

  SELECT rp.nivel
    INTO v_base
  FROM public.roles_permisos rp
  WHERE rp.rol = v_rol
    AND rp.modulo = p_modulo
  LIMIT 1;

  RETURN COALESCE(v_base,'none');
END;
$$;

CREATE OR REPLACE FUNCTION public.tiene_modulo(p_modulo text, p_requerido text DEFAULT 'ver')
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nivel text;
BEGIN
  v_nivel := public.modulo_nivel_actual(p_modulo);

  IF p_requerido = 'editar' THEN
    RETURN v_nivel = 'editar';
  END IF;

  RETURN v_nivel IN ('ver','editar');
END;
$$;

CREATE OR REPLACE FUNCTION public.tiene_algun_modulo(p_modulos text[], p_requerido text DEFAULT 'ver')
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM unnest(p_modulos) AS m
    WHERE public.tiene_modulo(m, p_requerido)
  );
$$;

-- 2) Asegurar módulos base.
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

-- 3) Asegurar tabla y mapa base de permisos por rol.
CREATE TABLE IF NOT EXISTS public.roles_permisos (
  rol text NOT NULL,
  modulo text NOT NULL REFERENCES public.modulos_sistema(id) ON DELETE CASCADE,
  nivel text NOT NULL DEFAULT 'none' CHECK (nivel IN ('none','ver','editar')),
  actualizado_en timestamptz DEFAULT now(),
  PRIMARY KEY (rol, modulo)
);

ALTER TABLE public.roles_permisos
  ADD COLUMN IF NOT EXISTS actualizado_en timestamptz DEFAULT now();

ALTER TABLE public.roles_permisos
  ADD COLUMN IF NOT EXISTS nivel text DEFAULT 'none';

INSERT INTO public.roles_permisos (rol,modulo,nivel)
SELECT 'Gerente', id, 'editar' FROM public.modulos_sistema
ON CONFLICT (rol,modulo) DO UPDATE SET nivel=EXCLUDED.nivel, actualizado_en=now();

INSERT INTO public.roles_permisos (rol,modulo,nivel) VALUES
-- Control / ventas internas
('Control','inicio','ver'),
('Control','control','editar'),
('Control','clientes','editar'),
('Control','ordenes','editar'),
('Control','productos','ver'),

-- Carnicería / despacho: solo ve su módulo, pero el SQL abre datos dependientes de orden/cliente/producto.
('Carnicería','inicio','ver'),
('Carnicería','carniceria','editar'),
('Carnicería','ordenes','ver'),
('Carnicería','productos','ver'),

-- Facturación
('Facturación','inicio','ver'),
('Facturación','facturacion','editar'),
('Facturación','ordenes','ver'),
('Facturación','productos','ver'),

-- Validación y entrega a delivery
('Validación','inicio','ver'),
('Validación','validacion','editar'),
('Validación','ordenes','ver'),
('Validación','delivery','ver'),

-- Delivery
('Delivery','inicio','ver'),
('Delivery','delivery','editar'),

-- Liquidación / CXC
('Liquidación','inicio','ver'),
('Liquidación','liquidacion','editar'),
('Liquidación','ordenes','ver'),

-- Supervisor operativo
('Supervisor','inicio','ver'),
('Supervisor','control','ver'),
('Supervisor','clientes','ver'),
('Supervisor','ordenes','editar'),
('Supervisor','carniceria','editar'),
('Supervisor','facturacion','editar'),
('Supervisor','validacion','editar'),
('Supervisor','delivery','ver'),
('Supervisor','liquidacion','ver'),
('Supervisor','productos','ver'),

-- Compatibilidad con roles viejos del CRM
('Vendedor','inicio','ver'),
('Vendedor','control','editar'),
('Vendedor','clientes','editar'),
('Vendedor','ordenes','editar'),
('Vendedor','productos','ver'),
('Cobrador','inicio','ver'),
('Cobrador','delivery','ver'),
('Cobrador','liquidacion','editar'),
('Cobrador','ordenes','ver'),
('Cobrador','clientes','ver')
ON CONFLICT (rol,modulo) DO UPDATE SET nivel=EXCLUDED.nivel, actualizado_en=now();

-- 4) Permisos personalizados por usuario.
CREATE TABLE IF NOT EXISTS public.usuario_modulos (
  usuario_id uuid NOT NULL,
  modulo text NOT NULL REFERENCES public.modulos_sistema(id) ON DELETE CASCADE,
  nivel text NOT NULL DEFAULT 'none' CHECK (nivel IN ('none','ver','editar')),
  actualizado_en timestamptz DEFAULT now(),
  PRIMARY KEY (usuario_id, modulo)
);

ALTER TABLE public.usuario_modulos
  ADD COLUMN IF NOT EXISTS actualizado_en timestamptz DEFAULT now();

ALTER TABLE public.usuario_modulos
  ADD COLUMN IF NOT EXISTS nivel text DEFAULT 'none';

-- 5) RLS de configuración.
ALTER TABLE public.modulos_sistema ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles_permisos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuario_modulos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS v551_modulos_select ON public.modulos_sistema;
CREATE POLICY v551_modulos_select ON public.modulos_sistema FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS v551_roles_select ON public.roles_permisos;
CREATE POLICY v551_roles_select ON public.roles_permisos FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS v551_usuario_modulos_select ON public.usuario_modulos;
CREATE POLICY v551_usuario_modulos_select ON public.usuario_modulos FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS v551_usuario_modulos_admin ON public.usuario_modulos;
CREATE POLICY v551_usuario_modulos_admin ON public.usuario_modulos FOR ALL TO authenticated
USING (public.tiene_modulo('config','editar'))
WITH CHECK (public.tiene_modulo('config','editar'));

ALTER TABLE IF EXISTS public.perfiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS v551_perfiles_select ON public.perfiles;
CREATE POLICY v551_perfiles_select ON public.perfiles FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS v551_perfiles_update_config ON public.perfiles;
CREATE POLICY v551_perfiles_update_config ON public.perfiles FOR UPDATE TO authenticated
USING (public.tiene_modulo('config','editar'))
WITH CHECK (public.tiene_modulo('config','editar'));

-- 6) Políticas de datos dependientes por módulo.
-- Nota: las políticas son permisivas por rol/módulo. No muestran módulos en pantalla;
-- solo permiten leer los datos necesarios para que cada módulo funcione completo.

DO $$
BEGIN
  -- CLIENTES: lectura para cualquier módulo que necesite nombre/teléfono/sector de cliente.
  IF to_regclass('public.clientes') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS v551_clientes_select_operativo ON public.clientes';
    EXECUTE 'CREATE POLICY v551_clientes_select_operativo ON public.clientes FOR SELECT TO authenticated USING (public.tiene_algun_modulo(ARRAY[''clientes'',''control'',''ordenes'',''carniceria'',''facturacion'',''validacion'',''delivery'',''liquidacion''], ''ver''))';
    EXECUTE 'DROP POLICY IF EXISTS v551_clientes_write_operativo ON public.clientes';
    EXECUTE 'CREATE POLICY v551_clientes_write_operativo ON public.clientes FOR ALL TO authenticated USING (public.tiene_algun_modulo(ARRAY[''clientes'',''control''], ''editar'')) WITH CHECK (public.tiene_algun_modulo(ARRAY[''clientes'',''control''], ''editar''))';
  END IF;

  -- LLAMADAS / GESTIONES.
  IF to_regclass('public.llamadas') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.llamadas ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS v551_llamadas_select_operativo ON public.llamadas';
    EXECUTE 'CREATE POLICY v551_llamadas_select_operativo ON public.llamadas FOR SELECT TO authenticated USING (public.tiene_algun_modulo(ARRAY[''control'',''clientes'',''ordenes''], ''ver''))';
    EXECUTE 'DROP POLICY IF EXISTS v551_llamadas_write_operativo ON public.llamadas';
    EXECUTE 'CREATE POLICY v551_llamadas_write_operativo ON public.llamadas FOR ALL TO authenticated USING (public.tiene_modulo(''control'', ''editar'')) WITH CHECK (public.tiene_modulo(''control'', ''editar''))';
  END IF;

  -- PRODUCTOS.
  IF to_regclass('public.productos_despacho') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.productos_despacho ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS v551_productos_select_operativo ON public.productos_despacho';
    EXECUTE 'CREATE POLICY v551_productos_select_operativo ON public.productos_despacho FOR SELECT TO authenticated USING (public.tiene_algun_modulo(ARRAY[''productos'',''control'',''ordenes'',''carniceria'',''facturacion'',''validacion''], ''ver''))';
    EXECUTE 'DROP POLICY IF EXISTS v551_productos_write_operativo ON public.productos_despacho';
    EXECUTE 'CREATE POLICY v551_productos_write_operativo ON public.productos_despacho FOR ALL TO authenticated USING (public.tiene_modulo(''productos'', ''editar'')) WITH CHECK (public.tiene_modulo(''productos'', ''editar''))';
  END IF;

  -- ÓRDENES.
  IF to_regclass('public.ordenes') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.ordenes ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS v551_ordenes_select_operativo ON public.ordenes';
    EXECUTE 'CREATE POLICY v551_ordenes_select_operativo ON public.ordenes FOR SELECT TO authenticated USING (public.tiene_algun_modulo(ARRAY[''ordenes'',''control'',''carniceria'',''facturacion'',''validacion'',''delivery'',''liquidacion''], ''ver''))';
    EXECUTE 'DROP POLICY IF EXISTS v551_ordenes_write_operativo ON public.ordenes';
    EXECUTE 'CREATE POLICY v551_ordenes_write_operativo ON public.ordenes FOR ALL TO authenticated USING (public.tiene_algun_modulo(ARRAY[''ordenes'',''control'',''carniceria'',''facturacion'',''validacion'',''delivery'',''liquidacion''], ''editar'')) WITH CHECK (public.tiene_algun_modulo(ARRAY[''ordenes'',''control'',''carniceria'',''facturacion'',''validacion'',''delivery'',''liquidacion''], ''editar''))';
  END IF;

  -- DETALLE DE ÓRDENES.
  IF to_regclass('public.orden_detalle') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.orden_detalle ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS v551_orden_detalle_select_operativo ON public.orden_detalle';
    EXECUTE 'CREATE POLICY v551_orden_detalle_select_operativo ON public.orden_detalle FOR SELECT TO authenticated USING (public.tiene_algun_modulo(ARRAY[''ordenes'',''control'',''carniceria'',''facturacion'',''validacion'',''delivery'',''liquidacion''], ''ver''))';
    EXECUTE 'DROP POLICY IF EXISTS v551_orden_detalle_write_operativo ON public.orden_detalle';
    EXECUTE 'CREATE POLICY v551_orden_detalle_write_operativo ON public.orden_detalle FOR ALL TO authenticated USING (public.tiene_algun_modulo(ARRAY[''ordenes'',''control'',''carniceria'',''facturacion''], ''editar'')) WITH CHECK (public.tiene_algun_modulo(ARRAY[''ordenes'',''control'',''carniceria'',''facturacion''], ''editar''))';
  END IF;

  -- PESOS / PREPARACIÓN / VALIDACIÓN.
  IF to_regclass('public.orden_pesos') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.orden_pesos ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS v551_orden_pesos_select_operativo ON public.orden_pesos';
    EXECUTE 'CREATE POLICY v551_orden_pesos_select_operativo ON public.orden_pesos FOR SELECT TO authenticated USING (public.tiene_algun_modulo(ARRAY[''ordenes'',''carniceria'',''facturacion'',''validacion'',''liquidacion''], ''ver''))';
    EXECUTE 'DROP POLICY IF EXISTS v551_orden_pesos_write_operativo ON public.orden_pesos';
    EXECUTE 'CREATE POLICY v551_orden_pesos_write_operativo ON public.orden_pesos FOR ALL TO authenticated USING (public.tiene_algun_modulo(ARRAY[''carniceria'',''facturacion'',''validacion''], ''editar'')) WITH CHECK (public.tiene_algun_modulo(ARRAY[''carniceria'',''facturacion'',''validacion''], ''editar''))';
  END IF;

  -- ENTREGAS / DELIVERY.
  IF to_regclass('public.orden_entregas') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.orden_entregas ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS v551_orden_entregas_select_operativo ON public.orden_entregas';
    EXECUTE 'CREATE POLICY v551_orden_entregas_select_operativo ON public.orden_entregas FOR SELECT TO authenticated USING (public.tiene_algun_modulo(ARRAY[''validacion'',''delivery'',''liquidacion'',''ordenes''], ''ver''))';
    EXECUTE 'DROP POLICY IF EXISTS v551_orden_entregas_write_operativo ON public.orden_entregas';
    EXECUTE 'CREATE POLICY v551_orden_entregas_write_operativo ON public.orden_entregas FOR ALL TO authenticated USING (public.tiene_algun_modulo(ARRAY[''validacion'',''delivery'',''liquidacion''], ''editar'')) WITH CHECK (public.tiene_algun_modulo(ARRAY[''validacion'',''delivery'',''liquidacion''], ''editar''))';
  END IF;

  -- PAGOS / LIQUIDACIÓN.
  IF to_regclass('public.orden_pagos') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.orden_pagos ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS v551_orden_pagos_select_operativo ON public.orden_pagos';
    EXECUTE 'CREATE POLICY v551_orden_pagos_select_operativo ON public.orden_pagos FOR SELECT TO authenticated USING (public.tiene_algun_modulo(ARRAY[''liquidacion'',''ordenes''], ''ver''))';
    EXECUTE 'DROP POLICY IF EXISTS v551_orden_pagos_write_operativo ON public.orden_pagos';
    EXECUTE 'CREATE POLICY v551_orden_pagos_write_operativo ON public.orden_pagos FOR ALL TO authenticated USING (public.tiene_modulo(''liquidacion'', ''editar'')) WITH CHECK (public.tiene_modulo(''liquidacion'', ''editar''))';
  END IF;

  -- HISTORIAL DE ESTADOS.
  IF to_regclass('public.orden_estados_historial') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.orden_estados_historial ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS v551_historial_select_operativo ON public.orden_estados_historial';
    EXECUTE 'CREATE POLICY v551_historial_select_operativo ON public.orden_estados_historial FOR SELECT TO authenticated USING (public.tiene_algun_modulo(ARRAY[''ordenes'',''control'',''carniceria'',''facturacion'',''validacion'',''delivery'',''liquidacion''], ''ver''))';
    EXECUTE 'DROP POLICY IF EXISTS v551_historial_write_operativo ON public.orden_estados_historial';
    EXECUTE 'CREATE POLICY v551_historial_write_operativo ON public.orden_estados_historial FOR ALL TO authenticated USING (public.tiene_algun_modulo(ARRAY[''ordenes'',''control'',''carniceria'',''facturacion'',''validacion'',''delivery'',''liquidacion''], ''editar'')) WITH CHECK (public.tiene_algun_modulo(ARRAY[''ordenes'',''control'',''carniceria'',''facturacion'',''validacion'',''delivery'',''liquidacion''], ''editar''))';
  END IF;

  -- DELIVERYS CONFIG.
  IF to_regclass('public.deliverys_config') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.deliverys_config ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS v551_deliverys_select_operativo ON public.deliverys_config';
    EXECUTE 'CREATE POLICY v551_deliverys_select_operativo ON public.deliverys_config FOR SELECT TO authenticated USING (public.tiene_algun_modulo(ARRAY[''validacion'',''delivery'',''liquidacion'',''config''], ''ver''))';
    EXECUTE 'DROP POLICY IF EXISTS v551_deliverys_write_config ON public.deliverys_config';
    EXECUTE 'CREATE POLICY v551_deliverys_write_config ON public.deliverys_config FOR ALL TO authenticated USING (public.tiene_modulo(''config'', ''editar'')) WITH CHECK (public.tiene_modulo(''config'', ''editar''))';
  END IF;

  -- EMPLEADOS OPERATIVOS.
  IF to_regclass('public.empleados_operativos') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.empleados_operativos ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS v551_empleados_select_operativo ON public.empleados_operativos';
    EXECUTE 'CREATE POLICY v551_empleados_select_operativo ON public.empleados_operativos FOR SELECT TO authenticated USING (public.tiene_algun_modulo(ARRAY[''carniceria'',''facturacion'',''validacion'',''liquidacion'',''config''], ''ver''))';
    EXECUTE 'DROP POLICY IF EXISTS v551_empleados_write_config ON public.empleados_operativos';
    EXECUTE 'CREATE POLICY v551_empleados_write_config ON public.empleados_operativos FOR ALL TO authenticated USING (public.tiene_modulo(''config'', ''editar'')) WITH CHECK (public.tiene_modulo(''config'', ''editar''))';
  END IF;

  -- COBRANZA / CXC.
  IF to_regclass('public.cobranza') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.cobranza ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS v551_cobranza_select_operativo ON public.cobranza';
    EXECUTE 'CREATE POLICY v551_cobranza_select_operativo ON public.cobranza FOR SELECT TO authenticated USING (public.tiene_algun_modulo(ARRAY[''liquidacion'',''control'',''clientes''], ''ver''))';
    EXECUTE 'DROP POLICY IF EXISTS v551_cobranza_write_operativo ON public.cobranza';
    EXECUTE 'CREATE POLICY v551_cobranza_write_operativo ON public.cobranza FOR ALL TO authenticated USING (public.tiene_algun_modulo(ARRAY[''liquidacion'',''control''], ''editar'')) WITH CHECK (public.tiene_algun_modulo(ARRAY[''liquidacion'',''control''], ''editar''))';
  END IF;

  -- CONFIGURACIÓN GENERAL.
  IF to_regclass('public.catalogos') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.catalogos ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS v551_catalogos_select_operativo ON public.catalogos';
    EXECUTE 'CREATE POLICY v551_catalogos_select_operativo ON public.catalogos FOR SELECT TO authenticated USING (true)';
    EXECUTE 'DROP POLICY IF EXISTS v551_catalogos_write_config ON public.catalogos';
    EXECUTE 'CREATE POLICY v551_catalogos_write_config ON public.catalogos FOR ALL TO authenticated USING (public.tiene_modulo(''config'', ''editar'')) WITH CHECK (public.tiene_modulo(''config'', ''editar''))';
  END IF;

  IF to_regclass('public.catalogo_items') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.catalogo_items ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS v551_catalogo_items_select_operativo ON public.catalogo_items';
    EXECUTE 'CREATE POLICY v551_catalogo_items_select_operativo ON public.catalogo_items FOR SELECT TO authenticated USING (true)';
    EXECUTE 'DROP POLICY IF EXISTS v551_catalogo_items_write_config ON public.catalogo_items';
    EXECUTE 'CREATE POLICY v551_catalogo_items_write_config ON public.catalogo_items FOR ALL TO authenticated USING (public.tiene_modulo(''config'', ''editar'')) WITH CHECK (public.tiene_modulo(''config'', ''editar''))';
  END IF;

  IF to_regclass('public.plantillas_whatsapp') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.plantillas_whatsapp ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS v551_plantillas_select_operativo ON public.plantillas_whatsapp';
    EXECUTE 'CREATE POLICY v551_plantillas_select_operativo ON public.plantillas_whatsapp FOR SELECT TO authenticated USING (public.tiene_algun_modulo(ARRAY[''control'',''clientes'',''config''], ''ver''))';
    EXECUTE 'DROP POLICY IF EXISTS v551_plantillas_write_config ON public.plantillas_whatsapp';
    EXECUTE 'CREATE POLICY v551_plantillas_write_config ON public.plantillas_whatsapp FOR ALL TO authenticated USING (public.tiene_modulo(''config'', ''editar'')) WITH CHECK (public.tiene_modulo(''config'', ''editar''))';
  END IF;
END $$;

-- 7) Marcar perfiles sin datos como activos/visibles si ya existen.
UPDATE public.perfiles
SET nombre = COALESCE(NULLIF(nombre,''), id::text),
    activo = COALESCE(activo,true)
WHERE nombre IS NULL OR nombre = '' OR activo IS NULL;

-- Fin V5.5.1.


-- Productos César - V5.5.2
-- Seguridad operativa: los roles operativos pueden actualizar lo necesario de su módulo,
-- pero SOLO Gerente/Administrador/Configuración puede eliminar/anular físicamente registros desde la base.

CREATE OR REPLACE FUNCTION public.es_admin_operativo()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.mi_rol_text() IN ('Gerente','Administrador') OR public.tiene_modulo('config','editar'), false);
$$;

DO $$
BEGIN
  IF to_regclass('public.ordenes') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.ordenes ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS v551_ordenes_write_operativo ON public.ordenes';
    EXECUTE 'DROP POLICY IF EXISTS v552_ordenes_insert_operativo ON public.ordenes';
    EXECUTE 'DROP POLICY IF EXISTS v552_ordenes_update_operativo ON public.ordenes';
    EXECUTE 'DROP POLICY IF EXISTS v552_ordenes_delete_admin ON public.ordenes';
    EXECUTE 'CREATE POLICY v552_ordenes_insert_operativo ON public.ordenes FOR INSERT TO authenticated WITH CHECK (public.tiene_algun_modulo(ARRAY[''ordenes'',''control''], ''editar''))';
    EXECUTE 'CREATE POLICY v552_ordenes_update_operativo ON public.ordenes FOR UPDATE TO authenticated USING (public.tiene_algun_modulo(ARRAY[''ordenes'',''control'',''carniceria'',''facturacion'',''validacion'',''delivery'',''liquidacion''], ''editar'')) WITH CHECK (public.tiene_algun_modulo(ARRAY[''ordenes'',''control'',''carniceria'',''facturacion'',''validacion'',''delivery'',''liquidacion''], ''editar''))';
    EXECUTE 'CREATE POLICY v552_ordenes_delete_admin ON public.ordenes FOR DELETE TO authenticated USING (public.es_admin_operativo())';
  END IF;

  IF to_regclass('public.orden_detalle') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.orden_detalle ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS v551_orden_detalle_write_operativo ON public.orden_detalle';
    EXECUTE 'DROP POLICY IF EXISTS v552_orden_detalle_insert_operativo ON public.orden_detalle';
    EXECUTE 'DROP POLICY IF EXISTS v552_orden_detalle_update_operativo ON public.orden_detalle';
    EXECUTE 'DROP POLICY IF EXISTS v552_orden_detalle_delete_admin ON public.orden_detalle';
    EXECUTE 'CREATE POLICY v552_orden_detalle_insert_operativo ON public.orden_detalle FOR INSERT TO authenticated WITH CHECK (public.tiene_algun_modulo(ARRAY[''ordenes'',''control''], ''editar''))';
    EXECUTE 'CREATE POLICY v552_orden_detalle_update_operativo ON public.orden_detalle FOR UPDATE TO authenticated USING (public.tiene_algun_modulo(ARRAY[''ordenes'',''control'',''carniceria'',''facturacion''], ''editar'')) WITH CHECK (public.tiene_algun_modulo(ARRAY[''ordenes'',''control'',''carniceria'',''facturacion''], ''editar''))';
    EXECUTE 'CREATE POLICY v552_orden_detalle_delete_admin ON public.orden_detalle FOR DELETE TO authenticated USING (public.es_admin_operativo())';
  END IF;

  IF to_regclass('public.orden_pesos') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.orden_pesos ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS v551_orden_pesos_write_operativo ON public.orden_pesos';
    EXECUTE 'DROP POLICY IF EXISTS v552_orden_pesos_insert_operativo ON public.orden_pesos';
    EXECUTE 'DROP POLICY IF EXISTS v552_orden_pesos_update_operativo ON public.orden_pesos';
    EXECUTE 'DROP POLICY IF EXISTS v552_orden_pesos_delete_admin ON public.orden_pesos';
    EXECUTE 'CREATE POLICY v552_orden_pesos_insert_operativo ON public.orden_pesos FOR INSERT TO authenticated WITH CHECK (public.tiene_algun_modulo(ARRAY[''carniceria'',''facturacion'',''validacion''], ''editar''))';
    EXECUTE 'CREATE POLICY v552_orden_pesos_update_operativo ON public.orden_pesos FOR UPDATE TO authenticated USING (public.tiene_algun_modulo(ARRAY[''carniceria'',''facturacion'',''validacion''], ''editar'')) WITH CHECK (public.tiene_algun_modulo(ARRAY[''carniceria'',''facturacion'',''validacion''], ''editar''))';
    EXECUTE 'CREATE POLICY v552_orden_pesos_delete_admin ON public.orden_pesos FOR DELETE TO authenticated USING (public.es_admin_operativo())';
  END IF;

  IF to_regclass('public.orden_estados_historial') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.orden_estados_historial ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS v551_historial_write_operativo ON public.orden_estados_historial';
    EXECUTE 'DROP POLICY IF EXISTS v552_historial_insert_operativo ON public.orden_estados_historial';
    EXECUTE 'DROP POLICY IF EXISTS v552_historial_update_admin ON public.orden_estados_historial';
    EXECUTE 'DROP POLICY IF EXISTS v552_historial_delete_admin ON public.orden_estados_historial';
    EXECUTE 'CREATE POLICY v552_historial_insert_operativo ON public.orden_estados_historial FOR INSERT TO authenticated WITH CHECK (public.tiene_algun_modulo(ARRAY[''ordenes'',''control'',''carniceria'',''facturacion'',''validacion'',''delivery'',''liquidacion''], ''editar''))';
    EXECUTE 'CREATE POLICY v552_historial_update_admin ON public.orden_estados_historial FOR UPDATE TO authenticated USING (public.es_admin_operativo()) WITH CHECK (public.es_admin_operativo())';
    EXECUTE 'CREATE POLICY v552_historial_delete_admin ON public.orden_estados_historial FOR DELETE TO authenticated USING (public.es_admin_operativo())';
  END IF;

  IF to_regclass('public.orden_entregas') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.orden_entregas ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS v551_orden_entregas_write_operativo ON public.orden_entregas';
    EXECUTE 'DROP POLICY IF EXISTS v552_orden_entregas_insert_operativo ON public.orden_entregas';
    EXECUTE 'DROP POLICY IF EXISTS v552_orden_entregas_update_operativo ON public.orden_entregas';
    EXECUTE 'DROP POLICY IF EXISTS v552_orden_entregas_delete_admin ON public.orden_entregas';
    EXECUTE 'CREATE POLICY v552_orden_entregas_insert_operativo ON public.orden_entregas FOR INSERT TO authenticated WITH CHECK (public.tiene_algun_modulo(ARRAY[''validacion'',''delivery'',''liquidacion''], ''editar''))';
    EXECUTE 'CREATE POLICY v552_orden_entregas_update_operativo ON public.orden_entregas FOR UPDATE TO authenticated USING (public.tiene_algun_modulo(ARRAY[''validacion'',''delivery'',''liquidacion''], ''editar'')) WITH CHECK (public.tiene_algun_modulo(ARRAY[''validacion'',''delivery'',''liquidacion''], ''editar''))';
    EXECUTE 'CREATE POLICY v552_orden_entregas_delete_admin ON public.orden_entregas FOR DELETE TO authenticated USING (public.es_admin_operativo())';
  END IF;

  IF to_regclass('public.orden_pagos') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.orden_pagos ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS v551_orden_pagos_write_operativo ON public.orden_pagos';
    EXECUTE 'DROP POLICY IF EXISTS v552_orden_pagos_insert_operativo ON public.orden_pagos';
    EXECUTE 'DROP POLICY IF EXISTS v552_orden_pagos_update_operativo ON public.orden_pagos';
    EXECUTE 'DROP POLICY IF EXISTS v552_orden_pagos_delete_admin ON public.orden_pagos';
    EXECUTE 'CREATE POLICY v552_orden_pagos_insert_operativo ON public.orden_pagos FOR INSERT TO authenticated WITH CHECK (public.tiene_modulo(''liquidacion'', ''editar''))';
    EXECUTE 'CREATE POLICY v552_orden_pagos_update_operativo ON public.orden_pagos FOR UPDATE TO authenticated USING (public.tiene_modulo(''liquidacion'', ''editar'')) WITH CHECK (public.tiene_modulo(''liquidacion'', ''editar''))';
    EXECUTE 'CREATE POLICY v552_orden_pagos_delete_admin ON public.orden_pagos FOR DELETE TO authenticated USING (public.es_admin_operativo())';
  END IF;
END $$;

-- Fin V5.5.2.

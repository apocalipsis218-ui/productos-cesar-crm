BEGIN;

-- =========================================================
-- 27 - V9.3.3 RETIROS EN NEGOCIO Y VENTAS INTERNAS
-- Productos César CRM
--
-- Objetivos:
--   1. Separar tipo de orden de modalidad de entrega.
--   2. Permitir ventas internas sin crear una ficha de cliente.
--   3. Exigir un nombre visible en toda orden.
--   4. Evitar que los retiros lleguen a Delivery/Liquidación.
--   5. Registrar quién retira y quién entrega en el negocio.
-- =========================================================

ALTER TABLE public.ordenes
  ADD COLUMN IF NOT EXISTS modalidad_entrega text,
  ADD COLUMN IF NOT EXISTS tipo_cliente_orden text,
  ADD COLUMN IF NOT EXISTS cliente_nombre_orden text,
  ADD COLUMN IF NOT EXISTS cliente_telefono_orden text,
  ADD COLUMN IF NOT EXISTS cliente_sector_orden text,
  ADD COLUMN IF NOT EXISTS retirado_por text,
  ADD COLUMN IF NOT EXISTS entregado_mostrador_por text,
  ADD COLUMN IF NOT EXISTS entregado_mostrador_en timestamptz,
  ADD COLUMN IF NOT EXISTS notas_retiro text;

-- Una venta interna no necesita una fila en public.clientes.
ALTER TABLE public.ordenes
  ALTER COLUMN cliente_id DROP NOT NULL;

-- Copia histórica del cliente registrado. La orden conserva estos datos
-- aunque más adelante se edite la ficha del cliente.
UPDATE public.ordenes AS o
SET cliente_nombre_orden = COALESCE(NULLIF(BTRIM(o.cliente_nombre_orden), ''), NULLIF(BTRIM(c.negocio), ''), 'Cliente histórico'),
    cliente_telefono_orden = COALESCE(NULLIF(BTRIM(o.cliente_telefono_orden), ''), NULLIF(BTRIM(c.telefono), '')),
    cliente_sector_orden = COALESCE(NULLIF(BTRIM(o.cliente_sector_orden), ''), NULLIF(BTRIM(c.sector), '')),
    tipo_cliente_orden = 'Registrado'
FROM public.clientes AS c
WHERE o.cliente_id = c.id;

-- Clasificación segura de órdenes anteriores.
UPDATE public.ordenes
SET modalidad_entrega = CASE
      WHEN COALESCE(requiere_delivery, true) THEN 'Delivery'
      ELSE 'No aplica'
    END
WHERE modalidad_entrega IS NULL
   OR BTRIM(modalidad_entrega) = ''
   OR modalidad_entrega NOT IN ('Delivery', 'Retiro en negocio', 'No aplica');

-- Casos históricos sin cliente: se conservan como venta interna de mostrador.
UPDATE public.ordenes
SET tipo_cliente_orden = 'Venta interna',
    cliente_nombre_orden = COALESCE(NULLIF(BTRIM(cliente_nombre_orden), ''), 'Venta interna histórica'),
    cliente_sector_orden = COALESCE(NULLIF(BTRIM(cliente_sector_orden), ''), 'Mostrador'),
    modalidad_entrega = 'Retiro en negocio',
    condicion_pago = 'Contado',
    requiere_delivery = false,
    delivery_nombre = NULL
WHERE cliente_id IS NULL;

-- Garantía final para nombres heredados con datos incompletos.
UPDATE public.ordenes
SET cliente_nombre_orden = COALESCE(NULLIF(BTRIM(cliente_nombre_orden), ''), 'Cliente histórico')
WHERE cliente_nombre_orden IS NULL OR BTRIM(cliente_nombre_orden) = '';

-- Normaliza reglas de entrega antes de validar las restricciones.
UPDATE public.ordenes
SET requiere_delivery = false,
    delivery_nombre = NULL
WHERE modalidad_entrega IN ('Retiro en negocio', 'No aplica');

UPDATE public.ordenes
SET requiere_delivery = true
WHERE modalidad_entrega = 'Delivery'
  AND COALESCE(requiere_delivery, false) = false;

ALTER TABLE public.ordenes
  ALTER COLUMN modalidad_entrega SET DEFAULT 'Delivery',
  ALTER COLUMN modalidad_entrega SET NOT NULL,
  ALTER COLUMN tipo_cliente_orden SET DEFAULT 'Registrado',
  ALTER COLUMN tipo_cliente_orden SET NOT NULL;

ALTER TABLE public.ordenes DROP CONSTRAINT IF EXISTS ordenes_modalidad_entrega_chk;
ALTER TABLE public.ordenes DROP CONSTRAINT IF EXISTS ordenes_tipo_cliente_orden_chk;
ALTER TABLE public.ordenes DROP CONSTRAINT IF EXISTS ordenes_cliente_nombre_obligatorio_chk;
ALTER TABLE public.ordenes DROP CONSTRAINT IF EXISTS ordenes_cliente_registrado_chk;
ALTER TABLE public.ordenes DROP CONSTRAINT IF EXISTS ordenes_venta_interna_chk;
ALTER TABLE public.ordenes DROP CONSTRAINT IF EXISTS ordenes_retiro_sin_delivery_chk;
ALTER TABLE public.ordenes DROP CONSTRAINT IF EXISTS ordenes_delivery_activo_chk;

ALTER TABLE public.ordenes
  ADD CONSTRAINT ordenes_modalidad_entrega_chk
    CHECK (modalidad_entrega IN ('Delivery', 'Retiro en negocio', 'No aplica')),
  ADD CONSTRAINT ordenes_tipo_cliente_orden_chk
    CHECK (tipo_cliente_orden IN ('Registrado', 'Venta interna')),
  ADD CONSTRAINT ordenes_cliente_nombre_obligatorio_chk
    CHECK (cliente_nombre_orden IS NOT NULL AND BTRIM(cliente_nombre_orden) <> ''),
  ADD CONSTRAINT ordenes_cliente_registrado_chk
    CHECK (tipo_cliente_orden <> 'Registrado' OR cliente_id IS NOT NULL),
  ADD CONSTRAINT ordenes_venta_interna_chk
    CHECK (
      tipo_cliente_orden <> 'Venta interna'
      OR (
        cliente_id IS NULL
        AND modalidad_entrega = 'Retiro en negocio'
        AND condicion_pago = 'Contado'
        AND requiere_delivery = false
      )
    ),
  ADD CONSTRAINT ordenes_retiro_sin_delivery_chk
    CHECK (
      modalidad_entrega NOT IN ('Retiro en negocio', 'No aplica')
      OR (requiere_delivery = false AND delivery_nombre IS NULL)
    ),
  ADD CONSTRAINT ordenes_delivery_activo_chk
    CHECK (modalidad_entrega <> 'Delivery' OR requiere_delivery = true);

CREATE OR REPLACE FUNCTION public.pc_normalizar_flujo_orden_v933()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_negocio text;
  v_telefono text;
  v_sector text;
BEGIN
  NEW.tipo_cliente_orden := COALESCE(NULLIF(BTRIM(NEW.tipo_cliente_orden), ''), 'Registrado');
  NEW.modalidad_entrega := COALESCE(NULLIF(BTRIM(NEW.modalidad_entrega), ''), 'Delivery');

  IF NEW.tipo_cliente_orden NOT IN ('Registrado', 'Venta interna') THEN
    RAISE EXCEPTION 'Tipo de cliente de orden no válido: %', NEW.tipo_cliente_orden;
  END IF;

  IF NEW.modalidad_entrega NOT IN ('Delivery', 'Retiro en negocio', 'No aplica') THEN
    RAISE EXCEPTION 'Modalidad de entrega no válida: %', NEW.modalidad_entrega;
  END IF;

  IF NEW.tipo_cliente_orden = 'Registrado' THEN
    IF NEW.cliente_id IS NULL THEN
      RAISE EXCEPTION 'Una orden de cliente registrado requiere cliente_id.';
    END IF;

    IF TG_OP = 'INSERT' THEN
      SELECT c.negocio, c.telefono, c.sector
      INTO v_negocio, v_telefono, v_sector
      FROM public.clientes AS c
      WHERE c.id = NEW.cliente_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'No existe el cliente registrado con id %.', NEW.cliente_id;
      END IF;

      NEW.cliente_nombre_orden := COALESCE(NULLIF(BTRIM(NEW.cliente_nombre_orden), ''), NULLIF(BTRIM(v_negocio), ''));
      NEW.cliente_telefono_orden := COALESCE(NULLIF(BTRIM(NEW.cliente_telefono_orden), ''), NULLIF(BTRIM(v_telefono), ''));
      NEW.cliente_sector_orden := COALESCE(NULLIF(BTRIM(NEW.cliente_sector_orden), ''), NULLIF(BTRIM(v_sector), ''));
    ELSIF NEW.cliente_id IS DISTINCT FROM OLD.cliente_id
       OR NEW.cliente_nombre_orden IS NULL
       OR BTRIM(NEW.cliente_nombre_orden) = '' THEN
      SELECT c.negocio, c.telefono, c.sector
      INTO v_negocio, v_telefono, v_sector
      FROM public.clientes AS c
      WHERE c.id = NEW.cliente_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'No existe el cliente registrado con id %.', NEW.cliente_id;
      END IF;

      NEW.cliente_nombre_orden := NULLIF(BTRIM(v_negocio), '');
      NEW.cliente_telefono_orden := NULLIF(BTRIM(v_telefono), '');
      NEW.cliente_sector_orden := NULLIF(BTRIM(v_sector), '');
    END IF;
  ELSE
    -- Venta interna: no crea cliente, siempre contado y retiro en mostrador.
    NEW.cliente_id := NULL;
    NEW.modalidad_entrega := 'Retiro en negocio';
    NEW.condicion_pago := 'Contado';
    NEW.requiere_delivery := false;
    NEW.delivery_nombre := NULL;
    NEW.cliente_sector_orden := COALESCE(NULLIF(BTRIM(NEW.cliente_sector_orden), ''), 'Mostrador');
  END IF;

  NEW.cliente_nombre_orden := NULLIF(BTRIM(NEW.cliente_nombre_orden), '');
  NEW.cliente_telefono_orden := NULLIF(BTRIM(NEW.cliente_telefono_orden), '');
  NEW.cliente_sector_orden := NULLIF(BTRIM(NEW.cliente_sector_orden), '');

  IF NEW.cliente_nombre_orden IS NULL THEN
    RAISE EXCEPTION 'El nombre del cliente o comprador es obligatorio.';
  END IF;

  IF NEW.modalidad_entrega IN ('Retiro en negocio', 'No aplica') THEN
    NEW.requiere_delivery := false;
    NEW.delivery_nombre := NULL;
  ELSE
    NEW.requiere_delivery := true;
  END IF;

  IF NEW.tipo_cliente_orden = 'Venta interna' AND NEW.modalidad_entrega <> 'Retiro en negocio' THEN
    RAISE EXCEPTION 'Las ventas internas solo pueden retirarse en el negocio.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pc_normalizar_flujo_orden_v933 ON public.ordenes;
CREATE TRIGGER trg_pc_normalizar_flujo_orden_v933
BEFORE INSERT OR UPDATE OF
  cliente_id,
  tipo_cliente_orden,
  cliente_nombre_orden,
  cliente_telefono_orden,
  cliente_sector_orden,
  modalidad_entrega,
  condicion_pago,
  requiere_delivery,
  delivery_nombre
ON public.ordenes
FOR EACH ROW
EXECUTE FUNCTION public.pc_normalizar_flujo_orden_v933();

CREATE INDEX IF NOT EXISTS idx_ordenes_modalidad_estado_v933
  ON public.ordenes(modalidad_entrega, estado);
CREATE INDEX IF NOT EXISTS idx_ordenes_tipo_cliente_fecha_v933
  ON public.ordenes(tipo_cliente_orden, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_ordenes_retiro_entregado_v933
  ON public.ordenes(entregado_mostrador_en DESC)
  WHERE modalidad_entrega = 'Retiro en negocio';

COMMENT ON COLUMN public.ordenes.modalidad_entrega IS 'Delivery, Retiro en negocio o No aplica. Es independiente del tipo de orden.';
COMMENT ON COLUMN public.ordenes.tipo_cliente_orden IS 'Registrado o Venta interna. La venta interna no crea ficha en clientes.';
COMMENT ON COLUMN public.ordenes.cliente_nombre_orden IS 'Copia histórica obligatoria del nombre del cliente/comprador al crear la orden.';
COMMENT ON COLUMN public.ordenes.retirado_por IS 'Nombre de la persona que retiró la mercancía en el negocio.';
COMMENT ON COLUMN public.ordenes.entregado_mostrador_por IS 'Empleado o usuario que entregó la mercancía en el mostrador.';
COMMENT ON COLUMN public.ordenes.entregado_mostrador_en IS 'Fecha y hora de confirmación de la entrega en el negocio.';
COMMENT ON COLUMN public.ordenes.notas_retiro IS 'Observación de la entrega en mostrador: autorización, cédula, vehículo u otro detalle.';

COMMIT;

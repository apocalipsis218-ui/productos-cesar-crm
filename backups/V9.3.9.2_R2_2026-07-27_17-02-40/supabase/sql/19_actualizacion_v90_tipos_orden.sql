-- V9.0 - Tipos de orden: pedidos, devoluciones, cambios e incidencias
-- Ejecutar una sola vez en Supabase SQL Editor antes de usar la V9.0.

ALTER TABLE public.ordenes
  ADD COLUMN IF NOT EXISTS tipo_orden text NOT NULL DEFAULT 'Pedido normal',
  ADD COLUMN IF NOT EXISTS requiere_preparacion boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS requiere_facturacion boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS requiere_delivery boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS accion_operativa text;

UPDATE public.ordenes
SET tipo_orden = COALESCE(NULLIF(tipo_orden,''),'Pedido normal'),
    requiere_preparacion = COALESCE(requiere_preparacion,true),
    requiere_facturacion = COALESCE(requiere_facturacion,true),
    requiere_delivery = COALESCE(requiere_delivery,true)
WHERE tipo_orden IS NULL OR tipo_orden = '';

CREATE INDEX IF NOT EXISTS idx_ordenes_tipo_orden ON public.ordenes(tipo_orden);
CREATE INDEX IF NOT EXISTS idx_ordenes_tipo_estado ON public.ordenes(tipo_orden, estado);

COMMENT ON COLUMN public.ordenes.tipo_orden IS 'Pedido normal, Devolución / recogida, Cambio / sustitución o Incidente / reclamo.';
COMMENT ON COLUMN public.ordenes.requiere_preparacion IS 'Indica si la orden debe aparecer en Carnicería.';
COMMENT ON COLUMN public.ordenes.requiere_facturacion IS 'Indica si la orden debe pasar por Facturación.';
COMMENT ON COLUMN public.ordenes.requiere_delivery IS 'Indica si requiere asignación a delivery o ruta.';
COMMENT ON COLUMN public.ordenes.accion_operativa IS 'Nota corta para casos especiales: recoger, cambiar, revisar reclamo, etc.';

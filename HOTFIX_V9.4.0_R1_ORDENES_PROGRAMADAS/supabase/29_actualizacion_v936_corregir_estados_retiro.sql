BEGIN;

-- =========================================================
-- 29 - V9.3.6 CORREGIR ESTADOS DE RETIRO EN NEGOCIO
-- Productos César CRM
--
-- Corrige el error:
--   new row for relation "ordenes" violates check constraint
--   "chk_orden_estado"
--
-- Causa:
--   El frontend usa los estados "Lista para retiro" y
--   "Entregada en negocio", pero la restricción histórica
--   chk_orden_estado no los incluía.
-- =========================================================

ALTER TABLE public.ordenes
  DROP CONSTRAINT IF EXISTS chk_orden_estado;

ALTER TABLE public.ordenes
  ADD CONSTRAINT chk_orden_estado
  CHECK (
    estado IN (
      'Programada',
      'Pedido recibido',
      'En preparación',
      'Preparado',
      'Lista para facturar',
      'Impresa para facturar',
      'Facturada',
      'Lista para validar',
      'Validada para ruta',
      'Validada para delivery',
      'Lista para retiro',
      'Entregada en negocio',
      'Asignada a delivery',
      'En ruta',
      'Entregado',
      'Entregado a crédito',
      'Cobrado',
      'No entregado',
      'Devuelto parcial',
      'Cerrado',
      'Anulado'
    )
  );

-- Mantener los nuevos estados disponibles en el catálogo visual.
INSERT INTO public.catalogo_items (catalogo_id, valor, orden, activo)
SELECT 'estado_orden', 'Lista para retiro', 55, true
WHERE NOT EXISTS (
  SELECT 1
  FROM public.catalogo_items
  WHERE catalogo_id = 'estado_orden'
    AND valor = 'Lista para retiro'
);

INSERT INTO public.catalogo_items (catalogo_id, valor, orden, activo)
SELECT 'estado_orden', 'Entregada en negocio', 58, true
WHERE NOT EXISTS (
  SELECT 1
  FROM public.catalogo_items
  WHERE catalogo_id = 'estado_orden'
    AND valor = 'Entregada en negocio'
);

COMMIT;

-- Verificación: debe mostrar ambos estados dentro de la definición.
SELECT
  conname AS restriccion,
  pg_get_constraintdef(oid) AS definicion
FROM pg_constraint
WHERE conrelid = 'public.ordenes'::regclass
  AND conname = 'chk_orden_estado';

SELECT
  EXISTS (
    SELECT 1 FROM public.catalogo_items
    WHERE catalogo_id = 'estado_orden'
      AND valor = 'Lista para retiro'
      AND activo = true
  ) AS lista_para_retiro_activo,
  EXISTS (
    SELECT 1 FROM public.catalogo_items
    WHERE catalogo_id = 'estado_orden'
      AND valor = 'Entregada en negocio'
      AND activo = true
  ) AS entregada_en_negocio_activo;

-- Productos César V6.1
-- Órdenes en vivo y notificaciones operativas
-- Ejecutar una sola vez en Supabase SQL Editor.
-- Habilita las tablas operativas en la publicación de Realtime.

DO $$
DECLARE
  t text;
  tablas text[] := ARRAY[
    'ordenes',
    'orden_detalle',
    'orden_pesos',
    'orden_entregas',
    'orden_pagos',
    'orden_estados_historial'
  ];
BEGIN
  FOREACH t IN ARRAY tablas LOOP
    IF to_regclass('public.' || quote_ident(t)) IS NOT NULL THEN
      -- Permite que Realtime entregue datos suficientes en UPDATE/DELETE.
      EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);

      -- Agrega la tabla a la publicación de Supabase Realtime si aún no está.
      IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = t
      ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
      END IF;
    END IF;
  END LOOP;
END $$;

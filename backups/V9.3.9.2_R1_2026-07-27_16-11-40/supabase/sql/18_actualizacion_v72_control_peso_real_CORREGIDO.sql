-- V7.2 - Peso real obligatorio y tolerancia configurable
-- CORREGIDO: convierte mi_rol() a text para evitar error de enum rol_usuario con 'Administrador'.
-- Crea configuración global de control de peso y agrega peso calculado de referencia.

ALTER TABLE public.ordenes
ADD COLUMN IF NOT EXISTS peso_calculado_preparado numeric DEFAULT NULL;

CREATE TABLE IF NOT EXISTS public.sistema_configuracion (
  clave text PRIMARY KEY,
  valor jsonb NOT NULL DEFAULT '{}'::jsonb,
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_por uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.sistema_configuracion ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sistema_configuracion_select ON public.sistema_configuracion;
DROP POLICY IF EXISTS sistema_configuracion_insert ON public.sistema_configuracion;
DROP POLICY IF EXISTS sistema_configuracion_update ON public.sistema_configuracion;
DROP POLICY IF EXISTS sistema_configuracion_delete ON public.sistema_configuracion;

CREATE POLICY sistema_configuracion_select
ON public.sistema_configuracion
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY sistema_configuracion_insert
ON public.sistema_configuracion
FOR INSERT
TO authenticated
WITH CHECK (public.mi_rol()::text IN ('Gerente','Administrador','Supervisor'));

CREATE POLICY sistema_configuracion_update
ON public.sistema_configuracion
FOR UPDATE
TO authenticated
USING (public.mi_rol()::text IN ('Gerente','Administrador','Supervisor'))
WITH CHECK (public.mi_rol()::text IN ('Gerente','Administrador','Supervisor'));

CREATE POLICY sistema_configuracion_delete
ON public.sistema_configuracion
FOR DELETE
TO authenticated
USING (public.mi_rol()::text IN ('Gerente','Administrador'));

INSERT INTO public.sistema_configuracion (clave, valor, actualizado_en)
VALUES (
  'control_peso',
  jsonb_build_object(
    'exigirPesoReal', true,
    'avisoLb', 0.50,
    'avisoPct', 2,
    'maxLb', 3,
    'maxPct', 8,
    'metodo', 'mayor'
  ),
  now()
)
ON CONFLICT (clave) DO NOTHING;

-- Opcional para notificar cambios de configuración en tiempo real si el proyecto usa Realtime.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname='supabase_realtime'
         AND schemaname='public'
         AND tablename='sistema_configuracion'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.sistema_configuracion;
  END IF;
EXCEPTION WHEN others THEN
  -- No bloquear la actualización si la publicación no está disponible.
  NULL;
END $$;

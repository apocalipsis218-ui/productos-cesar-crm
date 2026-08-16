# Pruebas sintéticas V9.4.2

Este paquete es exclusivo del proyecto de staging `odlwbuagtrgmfpdohors`. No es una migración y no debe copiarse a producción.

## Contenido

- 7 usuarios ficticios por rol.
- 7 empleados operativos ficticios.
- 2 clientes y 3 productos sintéticos.
- 6 órdenes en etapas distintas del flujo.
- Detalles, pesajes, facturas y un lote de entrega.
- Verificación de completitud y limpieza limitada al prefijo `STG942`.

## Barreras

- La URL debe resolver exactamente al proyecto de staging aprobado.
- La clave administrativa y la contraseña nunca se guardan en archivos.
- `seed` y `cleanup` requieren `--execute` y confirmación por variable de entorno.
- `cleanup` exige además `--confirm-delete=STG942`.
- La herramienta no modifica migraciones, RLS, funciones ni Realtime.

## Preparación local

```bash
npm run staging:plan
node tests/auditoria_fixtures_staging_v942.mjs
node --check scripts/staging/fixtures_v942.mjs
```

No ejecutes `seed` hasta recibir autorización específica. Cuando se autorice, configura las variables en la terminal sin agregarlas a `.env` ni imprimirlas:

```bash
export SUPABASE_URL="https://odlwbuagtrgmfpdohors.supabase.co"
export SUPABASE_PUBLISHABLE_KEY="<clave pública exclusiva de staging>"
export SUPABASE_SECRET_KEY="<clave secreta exclusiva de staging>"
export STAGING_TEST_PASSWORD="<contraseña temporal de 14+ caracteres>"
export CONFIRM_STAGING_PROJECT="odlwbuagtrgmfpdohors"

npm run staging:seed -- --execute
npm run staging:verify
```

## Limpieza

```bash
npm run staging:cleanup -- --execute --confirm-delete=STG942
```

Después de limpiar, vuelve a ejecutar `staging:verify`: debe fallar indicando que el conjunto está incompleto. Esa falla es la confirmación esperada de que no quedan fixtures.

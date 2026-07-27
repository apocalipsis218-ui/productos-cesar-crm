# Aplicar V9.3.7.2

1. Ejecutar primero `supabase/32_actualizacion_v9372_credito_cero_lote_manual.sql` en Supabase SQL Editor.
2. Aplicar el HOTFIX local.
3. Ejecutar `npm.cmd test` y `npm.cmd run build`.
4. Probar en localhost la creación de un lote con responsable manual y el cotejo de una venta a crédito.
5. Publicar con `npx.cmd wrangler deploy` solo cuando ambas pruebas sean correctas.

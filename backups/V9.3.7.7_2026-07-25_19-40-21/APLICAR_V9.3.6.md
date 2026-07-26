# Aplicar V9.3.6

1. Ejecutar `supabase/28_actualizacion_v936_correccion_lotes.sql` en Supabase.
2. Aplicar el HOTFIX sobre `C:\proyectos\productos-cesar-crm`.
3. Ejecutar `npm.cmd test` y `npm.cmd run build`.
4. Probar en localhost Validación, Delivery y Liquidación.
5. No publicar hasta aprobar la prueba operativa consolidada.
6. Publicación final: `npx.cmd wrangler deploy`.

# Aplicar V9.3.7 — Delivery consultivo y Liquidación centralizada

## Orden obligatorio

1. Ejecutar `supabase/30_actualizacion_v937_delivery_consultivo_liquidacion_central.sql` en Supabase SQL Editor.
2. Confirmar que la fila final muestre `true` en: `tabla_eventos`, `rpc_recibir_orden`, `rpc_recibir_lote`, `rpc_consolidar` y `unicidad_lote`.
3. Aplicar el HOTFIX sobre `C:\proyectos\productos-cesar-crm`.
4. Ejecutar `npm.cmd test` y `npm.cmd run build` mediante el instalador.
5. Probar en localhost Delivery, Liquidación y el historial duplicado.
6. Publicar con `npx.cmd wrangler deploy`.
7. Guardar en GitHub con el commit `V9.3.7 - Delivery consultivo y Liquidación centralizada`.

## Verificación operativa mínima

- Delivery solamente muestra `Ver` y no permite reportar resultados.
- Liquidación muestra el panel de deliverys con viajes pendientes.
- Recibir un cliente lo elimina de Pendientes.
- Recibir el último cliente cierra el lote y lo mueve al Historial.
- Un lote duplicado aparece una sola vez y sus KPIs no se multiplican.
- No se puede crear una segunda liquidación formal para el mismo lote.

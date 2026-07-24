# Productos César CRM V9.3.7.1 PWA

## V9.3.7.1 — Responsables conectados y transferencias individuales

Esta revisión conserva el flujo central de V9.3.7 y agrega:

- responsable formal del viaje;
- delivery registrado, otro empleado o persona manual/externa;
- creación transaccional de lotes desde Validación;
- validación individual conectada a un lote formal;
- responsables manuales visibles en Delivery y Liquidación;
- transferencia de un pedido ya asignado hacia otro responsable;
- lote de transferencia `TRF-...`;
- recálculo automático del lote de origen;
- auditoría completa de la transferencia;
- corrección completa de lote sincronizada con el responsable formal;
- filtros sin duplicar nombres por diferencias de mayúsculas y minúsculas.

Delivery continúa como módulo consultivo. Liquidación/CXC registra cobros, créditos, devoluciones, no entregas y cierres.

## Instalación

1. Ejecutar `supabase/31_actualizacion_v9371_responsables_transferencias.sql`.
2. Aplicar el HOTFIX.
3. Ejecutar `npm.cmd test`.
4. Ejecutar `npm.cmd run build`.
5. Probar en localhost.
6. Publicar con Wrangler.

Consulta:

- `APLICAR_V9.3.7.1.md`
- `MAPEO_RESPONSABLES_TRANSFERENCIAS_V9371.md`

## Base acumulada

Conserva PWA, barra lateral plegable, retiros en negocio, ventas internas, historiales compactos, facturación rápida, monto editable en Validación, lotes plegables, corrección segura de lotes, Delivery consultivo y Liquidación centralizada.

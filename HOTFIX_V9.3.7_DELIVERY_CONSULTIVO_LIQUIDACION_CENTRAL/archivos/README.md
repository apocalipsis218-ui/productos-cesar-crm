# Productos César CRM V9.3.7 PWA

## V9.3.7 — Delivery consultivo y Liquidación centralizada

- Delivery queda como módulo de consulta, sin botones para ruta, cobro o resultados.
- Liquidación/CXC recibe directamente cada cliente o todo el lote.
- El cliente desaparece de Pendientes al ser recibido.
- El último cliente cierra automáticamente el viaje.
- Mini panel superior con deliverys, viajes, clientes y montos pendientes.
- Lotes plegables en Delivery y Liquidación.
- Prevención transaccional de liquidaciones duplicadas.
- Consolidación automática y administrativa de duplicados históricos.
- Historial y KPIs protegidos contra multiplicación por duplicados.
- Título, PWA y versión interna sincronizados en V9.3.7.

## Instalación

Consulta `APLICAR_V9.3.7.md`. La migración requerida es:

`supabase/30_actualizacion_v937_delivery_consultivo_liquidacion_central.sql`

## Base acumulada

Conserva las funciones de V9.3.0 a V9.3.6: PWA, barra lateral plegable, retiros en negocio, venta interna, historiales compactos, facturación rápida, monto editable en Validación y corrección segura de lotes.

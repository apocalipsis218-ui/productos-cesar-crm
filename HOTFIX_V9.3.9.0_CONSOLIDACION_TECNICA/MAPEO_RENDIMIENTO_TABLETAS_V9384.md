# V9.3.8.4 — Rendimiento y carga incremental

## Comparación

| Acción | Antes | V9.3.8.4 |
| --- | ---: | ---: |
| Evento Realtime operativo | Hasta 28 consultas | 6 consultas base |
| Carnicería/Facturación | Carga completa | Órdenes y datos operativos |
| Validación/Delivery/Liquidación | Carga completa | Operación + lotes |
| Órdenes/Alertas/Kanban | Carga completa | Operación + casos |
| Administración/Reportes | Carga completa | Se mantiene completa |

## Protección de información

- Conserva las órdenes recientes y todas las pendientes históricas.
- Fusiona resultados por ID sin duplicar tarjetas.
- No limita CXC pendiente a las últimas 500 órdenes.
- No cambia reglas de estados, pesajes, lotes o auditoría.

## Optimización SQL

- Índices parciales de órdenes activas y recientes.
- Índices por fecha de despacho y cliente.
- Índices de relación para detalle, pesajes, entregas, pagos e historial.
- Índices para composición de lotes.

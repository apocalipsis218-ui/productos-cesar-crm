# V9.3.7 — Mapeo técnico: Delivery consultivo y Liquidación centralizada

## Flujo operativo

`Validación crea lote → Delivery consulta → Liquidación/CXC recibe → Historial formal`

## Delivery

- Vista de solo lectura.
- Agrupación plegable por lote/viaje.
- Muestra cliente, teléfono, sector, artículos, monto y tiempo del viaje.
- Elimina acciones de ruta, cobro, crédito, devolución y edición de resultado.

## Liquidación / CXC

- No depende de acciones realizadas por Delivery.
- Mini panel de deliverys con viajes abiertos, clientes pendientes, monto por cotejar y antigüedad.
- Recepción individual o por lote completo.
- El cliente recibido desaparece de Pendientes.
- El último cliente recibido cierra automáticamente el lote.
- El historial utiliza una sola liquidación formal por lote.

## Prevención de duplicados

- Limpieza de encabezados y detalles repetidos existentes.
- Índice único por `lote_id`.
- Índice único por código formal del lote.
- Índice único por orden dentro de cada lote y liquidación.
- RPC transaccionales para recepción individual y completa.
- Consolidación administrativa auditada para duplicados detectados.
- Defensa visual para que KPIs e historial no se multipliquen antes de la limpieza SQL.

## Auditoría

La tabla `liquidacion_lote_eventos` registra consolidaciones y cierres con usuario, fecha, motivo y metadatos.

## Reglas

- Un lote revertido no puede recibirse.
- Un cliente ya recibido no puede registrarse nuevamente.
- Un lote completo debe incluir todos sus clientes pendientes, sin omisiones ni repeticiones.
- `Devuelto parcial` se clasifica como devolución/no entregado, no como crédito.
- Las RPC verifican permisos de edición en Liquidación.

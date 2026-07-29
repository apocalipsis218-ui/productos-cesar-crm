# Mapeo CXC y cobros posteriores V9.4.0

| Riesgo o necesidad | Control implementado |
|---|---|
| El crédito quedaba sin cierre posterior | RPC `registrar_cobro_cxc_v940` aplica el cobro a órdenes específicas. |
| Un pago podía exceder la deuda | Frontend y Supabase validan saldo por factura y saldo total del cliente. |
| No había recibo formal | `cxc_cobros.numero_recibo` genera recibos `CXC-AAAAMMDD-######`. |
| No se sabía cómo distribuir el dinero | Aplicación manual o automática a las facturas más antiguas. |
| Faltaba trazabilidad del saldo | Cada aplicación conserva `saldo_antes`, `monto_aplicado` y `saldo_despues`. |
| Las transferencias podían quedar sin evidencia | Transferencia y Mixto exigen referencia. |
| Una corrección podía borrar movimientos | La reversión marca el recibo como `Reversado` y restituye saldos sin eliminar registros. |
| Cualquier usuario podía intentar corregir caja | La reversión se valida en Supabase para Administración/Gerencia. |
| La cartera no tenía vencimiento ni antigüedad | Vista `cxc_saldos_v940` calcula Al día, 1–30, 31–60 y +60 días. |
| Créditos históricos cargaban el flujo operativo | La consulta operativa usa una lista explícita de estados activos; CXC usa una vista ligera separada. |

## Integridad contable

- `monto_cobrado` continúa representando lo recibido durante la liquidación
  del delivery; los cobros posteriores no alteran ese cierre.
- `monto_pendiente` representa el saldo vivo de la factura.
- `orden_pagos` conserva cada entrada de dinero y enlaza los cobros posteriores
  con `cxc_cobros`.
- Los recibos y aplicaciones no tienen permisos directos de inserción,
  actualización o eliminación para usuarios autenticados; las mutaciones se
  realizan mediante RPC transaccionales.

## Compatibilidad

La V9.4.0 requiere SQL 50 aplicado. No modifica el significado de lotes,
devoluciones, no entregados ni liquidaciones históricas.

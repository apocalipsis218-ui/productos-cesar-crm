# V9.3.6 — Mejoras operativas consolidadas

## Incluye
1. Monto final editable en Validación por lote e individual (base V9.3.5.1).
2. Corrección transaccional del delivery de un lote abierto.
3. Reversión segura de un lote completo antes de ruta, resultado o liquidación.
4. Auditoría formal e inmutable de correcciones.
5. Lotes plegables en Historial de Validación.
6. Pedidos activos de Delivery agrupados y plegables por lote.
7. Lotes pendientes de Liquidación plegables.
8. Expandir todos / Ocultar todos con preferencia por dispositivo.
9. Las órdenes sin lote se mantienen separadas por orden en Delivery activo.

## Reglas de seguridad
- No se corrige un lote en ruta, con resultado, recibido o liquidado.
- Revertir conserva monto y peso, devuelve las órdenes a Facturada y marca el lote Revertido.
- Ningún lote ni auditoría se elimina.
- Requiere SQL 28 antes de usar Corregir asignación.

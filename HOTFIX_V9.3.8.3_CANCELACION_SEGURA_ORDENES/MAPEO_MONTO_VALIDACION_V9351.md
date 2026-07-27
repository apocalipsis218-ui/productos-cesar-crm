# V9.3.5.1 — Monto final editable en Validación

## Flujo por lote
1. Validación confirma o corrige el monto de cada factura.
2. El monto queda en borrador local mientras se prepara el lote.
3. Al crear el lote, el monto se guarda en `ordenes.total_factura`.
4. El mismo monto alimenta snapshot, detalle de lote, Delivery, Liquidación, reportes y recibos.

## Flujo individual
El modal incluye `Monto final de factura` como campo obligatorio. Al validar, actualiza `ordenes.total_factura` antes de pasar a Delivery.

## Controles
- Monto mayor que cero.
- Dos decimales.
- Total del lote recalculado al escribir.
- El monto previo no se elimina hasta confirmar la operación en Supabase.
- No requiere SQL nuevo.

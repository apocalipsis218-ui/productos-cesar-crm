# V9.3.8.3 — Cancelación segura de órdenes

## Decisión operativa

| Situación | Acción | Resultado |
| --- | --- | --- |
| Orden reciente sin avance | Archivar | Sale de los módulos; conserva datos y evidencia |
| Orden con preparación o facturación | Anular | Estado Anulado; conserva todo el historial |
| Orden dentro de lote activo | Bloquear | Primero debe corregirse o revertirse el lote |
| Orden con entrega o pago | Bloquear | Primero debe corregirse desde Liquidación |

## Evidencia preservada

- Cabecera original de la orden.
- Líneas de productos.
- Pesajes.
- Entregas.
- Pagos.
- Estado anterior, usuario, fecha y motivo.
- Registro crítico en Auditoría privada.

## Seguridad

- RPC transaccional `cancelar_orden_v9383`.
- Solo Gerente/Administrador.
- Validación del estado visto en pantalla.
- Triggers que bloquean el borrado físico.
- Historial operativo no eliminable.
- Reversión de gestiones adaptada al archivado lógico.

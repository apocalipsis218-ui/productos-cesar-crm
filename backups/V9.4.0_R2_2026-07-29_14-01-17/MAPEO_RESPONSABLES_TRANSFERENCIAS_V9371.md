# Mapeo V9.3.7.1 — Responsables del viaje y transferencias

## Objetivo

Conectar completamente los viajes llevados por:

- deliverys registrados;
- otros empleados de Productos César;
- personas manuales o externas;

y permitir mover un pedido individual de un lote abierto a otro responsable sin duplicar la orden.

## Flujo de responsable manual

1. Validación selecciona `Otro / manual` y escribe el nombre.
2. Debe seleccionar al menos una orden, confirmar monto y peso.
3. La RPC `crear_lote_entrega_v9371` crea en una sola transacción:
   - lote formal;
   - detalle de órdenes;
   - pesos;
   - historial de estado;
   - asignación del responsable.
4. El responsable aparece automáticamente en:
   - Delivery consultivo;
   - panel y filtro de Liquidación/CXC;
   - Historial de Validación;
   - impresiones y constancias.
5. No se crea un usuario ni un empleado ficticio.

## Tipos de responsable

| Código interno | Uso |
|---|---|
| `delivery_registrado` | Empleado activo del área Delivery |
| `otro_empleado` | Empleado activo de otra área |
| `manual_externo` | Persona escrita manualmente o externa |

## Transferencia individual

La acción está en:

`Validación → Historial de delivery → abrir lote → Transferir pedido`

Al confirmar:

- bloquea lote y orden durante la operación;
- valida que CXC no haya recibido la orden;
- crea un lote de transferencia `TRF-...`;
- mueve el detalle existente, no copia la orden;
- cambia el responsable de la orden;
- descuenta monto, peso y cantidad del lote de origen;
- registra responsable anterior, nuevo, motivo, usuario y fecha;
- actualiza Delivery y Liquidación al recargar.

Si el lote original queda sin pedidos, pasa a `Transferido totalmente`.

## Bloqueos

No se permite transferir cuando:

- el lote está Cerrado, Revertido o Transferido totalmente;
- existe una liquidación formal del lote;
- la orden ya fue recibida por CXC;
- la orden tiene resultado final;
- el nuevo responsable es igual al actual;
- falta un motivo de al menos cinco caracteres.

## Corrección completa de lote

La RPC histórica `corregir_lote_entrega_v936` mantiene su firma, pero V9.3.7.1 también sincroniza:

- `delivery_nombre`;
- `responsable_nombre`;
- `responsable_tipo`;
- `responsable_empleado_id`;
- snapshot de hoja de ruta;
- órdenes vinculadas.

Esto evita que el lote diga un responsable y los filtros muestren otro.

## Tablas y funciones

### Columnas nuevas en `entrega_lotes`

- `responsable_nombre`
- `responsable_tipo`
- `responsable_empleado_id`
- `es_transferencia`
- `lote_origen_id`
- `codigo_lote_origen`

### Tabla nueva

`entrega_pedido_transferencias`

### RPC

- `crear_lote_entrega_v9371`
- `transferir_orden_lote_v9371`
- `corregir_lote_entrega_v936` actualizada

## Pruebas obligatorias en localhost

1. Crear lote con delivery registrado.
2. Crear lote con otro empleado.
3. Crear lote con responsable manual.
4. Confirmar que cada responsable aparece en Delivery y Liquidación.
5. Transferir un pedido a otro delivery.
6. Transferir un pedido a una persona manual.
7. Verificar que la orden desaparece del lote original.
8. Verificar que monto y peso del origen se recalculan.
9. Recibir en CXC el pedido transferido.
10. Confirmar que una orden recibida ya no admite transferencia.

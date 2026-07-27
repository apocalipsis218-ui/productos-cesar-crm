# V9.3.9.1 · Faltantes y liquidación de clientes ocasionales

## Liquidación

- `orden_pagos.cliente_id` admite `null` cuando la orden corresponde a un cliente ocasional.
- Cada pago conserva nombre, teléfono y tipo de cliente como snapshot.
- El cierre sigue usando la RPC transaccional y el bloqueo de la orden.
- El usuario que recibe la liquidación se registra mediante `auth.uid()` y no se confunde con el cliente.

## Sin existencia

- Carnicería detecta únicamente líneas marcadas `Sin existencia`.
- Antes de finalizar pregunta si se creará seguimiento.
- La creación de la orden pendiente y el guardado final de preparación ocurren en una sola transacción.
- La orden pendiente copia cliente, modalidad, cantidades faltantes, precios y trazabilidad.
- Un índice único evita generar dos pendientes activos desde la misma orden.
- `Pendiente por existencia` permanece en Órdenes y no entra a Carnicería.
- `Liberar a Carnicería` cambia el estado a `Pedido recibido` cuando se confirma disponibilidad.

## Compatibilidad

- No crea clientes ficticios.
- No modifica órdenes, pagos ni lotes existentes.
- No duplica importes ya facturados o entregados.
- Conserva clientes registrados, ocasionales y ventas internas.

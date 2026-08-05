# V9.3.9.2 R2 — Devolución integrada al lote

## Flujo

1. CXC abre **Recibir lote por cotejo**.
2. Selecciona **Devuelto parcial** para una orden.
3. **Detallar artículos** abre una ficha bloqueada en ese resultado.
4. Cada producto muestra un solo campo: peso para venta por libra o cantidad para unidades.
5. Monto devuelto, total neto, peso devuelto, peso neto y efectivo esperado se recalculan al escribir.
6. **Guardar devolución y volver al lote** conserva un borrador local y no escribe en la base.
7. CXC continúa cotejando los demás clientes.
8. **Cerrar lote y generar recibo** envía todos los resultados al RPC R2.

## Integridad

- El SQL 46 procesa el lote en una única transacción.
- Una devolución sin artículos no puede cerrar.
- La factura y el peso originales se conservan.
- La orden registra monto y peso netos, detalle por producto e historial.
- Una devolución no crea crédito.
- No se permiten órdenes repetidas, ajenas al lote o ya recibidas.
- El CRM no realiza movimientos contables de inventario; solo registra el destino declarado.

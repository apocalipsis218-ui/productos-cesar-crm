# V9.3.7.2 — CXC crédito y lote manual

## Correcciones

- Al seleccionar `Crédito / abono`, el efectivo se coloca automáticamente en cero.
- El campo continúa editable para registrar un abono real después de iniciar en cero.
- `Cobrado completo` completa el total de la factura.
- `No entregado` coloca el efectivo en cero.
- La RPC de creación de lotes ya no consulta columnas inexistentes de `clientes`.
- La referencia operativa del detalle usa `ordenes.zona`, `ordenes.cliente_sector_orden` o `clientes.sector`.

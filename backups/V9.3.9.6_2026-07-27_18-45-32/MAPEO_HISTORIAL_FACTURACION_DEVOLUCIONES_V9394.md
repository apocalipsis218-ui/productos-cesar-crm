# Auditoría V9.3.9.4

## Facturación

- Se separan las vistas `Pendientes` e `Historial`.
- El historial utiliza órdenes ya cargadas, sin borrar ni duplicar datos.
- Filtros: fecha desde/hasta, estado, facturado por y búsqueda por cliente, orden o factura.
- Acciones históricas: reimpresión y trazabilidad.

## Liquidación por lote

- `Detallar artículos` no se crea en el DOM salvo que el resultado sea `Devuelto parcial`.
- El cálculo monetario se ejecuta con la medida devuelta aunque el motivo todavía esté pendiente.
- El motivo continúa siendo obligatorio únicamente para guardar.
- Los errores aparecen dentro de la ficha y enfocan el campo faltante.
- Guardar conserva el borrador dentro del lote; no recibe al cliente por separado.

## Datos preservados

- Factura y pesaje originales.
- Valor y peso devueltos.
- Total y peso netos.
- Lote, usuario, motivo, destino y trazabilidad.
- Cierre transaccional de SQL 46/47.

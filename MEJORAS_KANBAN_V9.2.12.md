# Productos César CRM — Mejoras Kanban V9.2.12

## Problema corregido
La columna **Cerradas** acumulaba tarjetas sin límite vertical, alargando la página y reduciendo la velocidad y claridad del tablero.

## Cambios aplicados
- Vista previa de **10 órdenes cerradas** por defecto.
- Botón **Mostrar 10 más** y opción para volver a las primeras 10.
- Botón **Ocultar/mostrar cerradas** sin perder el conteo total.
- Historial completo en modal independiente.
- Búsqueda por orden, cliente, factura, delivery y producto.
- Filtros rápidos: hoy, últimos 7 días, este mes y todos.
- Filtro por estado final y rango personalizado de fechas.
- Paginación de 25 o 50 registros.
- KPI de cantidad, monto facturado, efectivo y crédito.
- Tarjetas cerradas compactas.
- Desplazamiento vertical interno en cada columna del Kanban.
- KPI superiores del tablero: activas, preparación, en ruta y cerradas hoy.

## Seguridad y base de datos
No requiere ejecutar SQL ni modificar tablas de Supabase. Usa las órdenes que ya carga la aplicación y limita el renderizado del DOM para mejorar el rendimiento.

## Pruebas recomendadas
1. Abrir Kanban con más de 10 órdenes cerradas.
2. Confirmar que solo se muestren 10.
3. Pulsar Mostrar 10 más.
4. Ocultar y volver a mostrar la columna.
5. Abrir Historial completo y probar búsqueda, fechas, estado y paginación.
6. Pulsar Ver en una orden cerrada y confirmar que abra la ficha.

# Mejoras V9.2.13 — Reportes gerenciales

## Alcance aplicado

1. Se eliminó la etiqueta antigua “V8.5 · Reportes”.
2. Se agregó un filtro general con Hoy, Ayer, Esta semana, Este mes, Mes anterior y rango personalizado.
3. Se agregó filtro de estado: Todos, Activas, Cerradas, Cobrado, Crédito y Programadas.
4. Los KPI muestran comparación contra un período anterior de igual duración.
5. Las tarjetas y barras abren el detalle de las órdenes que originan el indicador.
6. “Facturado” prioriza `total_factura` y solo usa `total_estimado` en estados facturados o posteriores.
7. “Órdenes activas” incluye Programadas y Pedido recibido y excluye estados finales.
8. Los tiempos por etapa usan solo registros con entrada y salida completas.
9. Liquidación ya no muestra un guion ambiguo: indica “Sin datos cerrados” cuando no hay base de cálculo.
10. Productos se agrupan por producto y unidad para no mezclar libras con unidades o paquetes.
11. Se agregó un control de calidad de datos para montos, productos e historial.

## Pendiente para V9.2.14

- Tiempo laborable según horario real, almuerzo, domingos y feriados.
- SLA configurable por etapa.
- Cuellos de botella y órdenes detenidas.
- Reaperturas y análisis de extremos.

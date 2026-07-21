# Productos César CRM — V9.3.0 R5

## Historial de entregas dentro de Validación

La actualización divide el módulo Validación en dos pestañas:

1. **Pendientes de entregar**: conserva la selección por lote, peso final, vista previa y asignación al delivery.
2. **Historial de entregas**: inicia en la fecha actual y permite consultar, reimprimir y documentar los lotes ya entregados.

## Funciones integradas

- Filtros por fecha, delivery, lote, orden, factura y cliente.
- Accesos rápidos: Hoy, Ayer y Esta semana.
- KPI de lotes, órdenes, facturación, peso entregado y lotes sin liquidar.
- Reimpresión de la hoja de ruta con marca **COPIA / REIMPRESIÓN**.
- Conservación de la fecha original y registro de la fecha de reimpresión.
- Constancia individual de entrega al delivery.
- Reporte diario consolidado y agrupado por delivery.
- Detalle del lote con estados actuales de las órdenes.
- Auditoría documental de original, reimpresiones y reportes.
- Snapshot JSON de los datos originales usados en la hoja de ruta.
- Compatibilidad con lotes anteriores mediante reconstrucción.

## Protección operativa

Consultar o reimprimir no cambia estados, no modifica `validado_en`, no modifica `asignado_delivery_en` y no registra transiciones en `orden_estados_historial`. Por tanto, no reinicia los relojes R4.

## Base de datos

Ejecutar:

`supabase/25_actualizacion_v930r5_historial_validacion.sql`

El SQL no elimina información. Amplía `entrega_lotes`, conserva datos históricos en `entrega_lote_detalle` y crea `entrega_documentos_historial` con RLS vinculado al permiso del módulo Validación.

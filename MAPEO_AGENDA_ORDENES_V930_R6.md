# Productos César CRM — V9.3.0 R6

## Integración Agenda, Gestiones y Órdenes

### Regla central
Un cliente se considera gestionado en una fecha cuando existe al menos una de estas actividades:

1. llamada o gestión registrada en esa fecha;
2. pedido normal creado directamente desde Órdenes en esa fecha;
3. pedido generado desde una gestión en esa fecha.

La fecha del pedido para la agenda es su fecha/hora real de creación (`creado_en`), no la fecha futura de despacho.

### Módulos corregidos
- Control → Gestiones: cronología unificada y sin duplicar pedidos vinculados a llamadas.
- Control → Agenda: estado Gestionado por llamada o pedido directo.
- Inicio: clientes gestionados, llamadas y pedidos directos separados.
- Alertas: pendientes calculados con la misma regla central.
- Actualización en vivo: los cambios de `ordenes` ya activan recarga mediante Realtime/polling.

### Reglas de seguridad
- No se crea una llamada falsa al guardar una orden directa.
- Devoluciones, cambios e incidencias no cumplen automáticamente la agenda comercial.
- Una orden anulada conserva la evidencia de que existió actividad comercial.
- El botón Revertir solo aparece en gestiones reales; los pedidos se anulan desde Órdenes.
- No requiere SQL ni cambia Supabase.

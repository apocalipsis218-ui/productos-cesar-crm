# V9.3.8.1 — Guardado transaccional

Antes, una edición podía borrar el detalle y fallar antes de reinsertarlo.
Carnicería también guardaba cada línea, encabezado, peso y estado por separado.

| Flujo | RPC | Elementos atómicos |
|---|---|---|
| Crear/editar orden | `guardar_orden_v9381` | Encabezado, detalle, historial y llamada |
| Guardar preparación | `guardar_preparacion_v9381` | Líneas, encabezado, peso, estado e historial |

## Controles

- Bloqueo de fila mediante `FOR UPDATE`.
- Validación de sesión y permiso.
- Comprobación del número de líneas.
- Rechazo si otra estación cambió la etapa.
- Reversión automática completa ante errores.
- Acceso a funciones limitado a usuarios autenticados.

## Compatibilidad y auditoría

- Conserva datos y estados existentes; no elimina tablas ni columnas.
- Requiere ejecutar el SQL 39 después de instalar.
- Incluye auditoría específica, suite histórica completa y compilación de producción.

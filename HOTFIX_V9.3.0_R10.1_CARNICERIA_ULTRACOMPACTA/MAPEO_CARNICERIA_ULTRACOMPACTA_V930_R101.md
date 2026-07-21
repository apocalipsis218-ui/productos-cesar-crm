# V9.3.0 R10.1 — Ajuste final ultracompacto de Carnicería

## Objetivo
Asegurar en tablets, incluso Android 8, que cada artículo use una sola línea operativa:

`Solicitado | Preparado | Estado | Faltante`

El nombre permanece arriba y la observación aparece debajo únicamente cuando existe.

## Cambios
- Flexbox sin salto como compatibilidad para navegadores antiguos.
- Controles de 30 px de alto.
- Faltante como texto compacto, sin celda larga.
- Productos por unidad muestran faltante en unidades, no en libras equivalentes.
- Sustituidos muestran “Sustituido”.
- Encabezado y observación general reducidos en tablet.
- Escritorio conserva la distribución amplia.

## Base de datos
No requiere SQL ni cambios en Supabase.

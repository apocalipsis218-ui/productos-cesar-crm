# V9.3.0 R8 — Despacho compacto para tablet

## Objetivo
Reducir al mínimo la altura del formulario de Carnicería en tablet sin perder información operativa.

## Diseño por artículo
1. Nombre del artículo.
2. Solicitado, Preparado y Estado en una sola fila.
3. Observación breve del cliente solo cuando existe.

## Cambios
- Se eliminaron textos repetidos de tipo de peso y explicaciones por artículo.
- El peso equivalente continúa calculándose internamente, pero no ocupa una fila visible.
- Sustitución aparece únicamente al elegir estado Sustituido.
- Se agregó Corte / observación por artículo en creación y edición de órdenes.
- La observación se guarda en `orden_detalle.notas`, columna ya existente; no requiere SQL.
- La observación se imprime en el ticket de preparación y se incluye en WhatsApp sin precios.
- Encabezado, campos de balanza, paquetes y botones fueron compactados para tablet.
- Guardar avance y Lista para facturar permanecen fijos al final del modal.

## Prueba
- Crear una orden con notas diferentes por artículo.
- Abrir en Carnicería desde tablet.
- Confirmar que cada artículo ocupa tres líneas como máximo.
- Guardar avance y reabrir.
- Confirmar que las notas permanecen.

# V9.3.5 — Facturación rápida y Validación operativa

## Objetivo
Reducir el tiempo operativo de Facturación sin interrumpir Validación, Retiros, Delivery, Liquidación, Kanban, Alertas ni Reportes.

## Facturación
- El botón **Marcar facturada** ya no abre el formulario de factura.
- Calcula el total según las cantidades preparadas en Carnicería.
- Excluye artículos marcados **Sin existencia**.
- Valora sustituciones según cantidad y precio del producto sustituto.
- Registra automáticamente usuario, fecha, hora, peso preparado y condición de pago vigente.
- Delivery pasa a **Facturada** y aparece en Validación.
- Retiro en negocio pasa a **Lista para retiro**.
- Venta interna queda en **Contado**.
- La tarjeta solo desaparece después de la confirmación de Supabase.
- La actualización se condiciona a que la orden siga en Lista/Impresa para facturar, evitando doble procesamiento entre equipos.

## Validación
- Nueva columna **Monto factura** entre Peso esperado y Peso entregado.
- El monto se elimina de la descripción secundaria para evitar duplicidad visual.
- Diseño responsive ajustado para computadora y tablet.

## Correcciones preventivas
- Corregidas referencias inválidas `x.orderClientName(...)` y `x.orderClientPhone(...)` en validación de lotes y hoja de ruta.
- La hoja de ruta usa las funciones centrales de nombre, teléfono y sector, incluyendo ventas internas y snapshots de la orden.

## Datos preservados
- No se inventa número de factura.
- El formulario avanzado anterior permanece en el código, pero deja de ser la acción principal.
- Reabrir facturación desde Validación continúa disponible.
- No requiere SQL nuevo.

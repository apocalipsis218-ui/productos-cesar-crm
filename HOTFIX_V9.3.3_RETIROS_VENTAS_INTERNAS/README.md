# Productos César CRM V9.3.3 PWA

Sistema operativo y comercial de Productos César, publicado como PWA mediante Cloudflare Workers y conectado a Supabase.

## Novedades V9.3.3

- Modalidad de entrega independiente: **Delivery**, **Retiro en negocio** o **No aplica**.
- Flujo de retiro: Carnicería → Facturación → Lista para retiro → Entregada en negocio.
- Los retiros no entran en Delivery, lotes de ruta ni Liquidación.
- Ventas internas sin crear ficha de cliente, con nombre obligatorio, contado y retiro en negocio.
- Copia histórica del nombre, teléfono y sector del comprador dentro de la orden.
- Pestaña **Retiros en negocio** en Validación, con constancia de quién retiró y quién entregó.
- Aviso grande de retiro en las impresiones de preparación y facturación.
- Tamaño configurable para títulos y detalle de artículos impresos.
- Identificación de retiros y ventas internas en Órdenes, Carnicería, Facturación, Validación, Kanban y paneles operativos.

## Orden de instalación

1. Ejecutar `supabase/27_actualizacion_v933_retiros_ventas_internas.sql` en Supabase SQL Editor.
2. Ejecutar `npm.cmd test`.
3. Ejecutar `npm.cmd run build`.
4. Publicar con `npx.cmd wrangler deploy`.
5. En cada PWA instalada, guardar el trabajo abierto y pulsar **Actualizar ahora**.

No se debe publicar el frontend V9.3.3 antes de que el SQL 27 termine sin errores.

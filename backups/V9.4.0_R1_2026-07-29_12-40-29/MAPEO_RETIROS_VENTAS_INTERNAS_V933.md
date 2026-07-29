# V9.3.3 — Retiros en negocio, ventas internas e impresión configurable

## Matriz operativa

| Identidad | Modalidad | Flujo |
|---|---|---|
| Cliente registrado | Delivery | Carnicería → Facturación → Validación → Delivery → Liquidación |
| Cliente registrado | Retiro en negocio | Carnicería → Facturación → Lista para retiro → Entregada en negocio |
| Venta interna / mostrador | Retiro en negocio | Carnicería → Facturación → Lista para retiro → Entregada en negocio |
| Venta interna / mostrador | Delivery | Bloqueado; requiere crear una ficha formal de cliente |

## Reglas integradas

- Toda orden conserva un nombre obligatorio en `cliente_nombre_orden`.
- Una venta interna no crea una fila en `clientes`; usa `cliente_id = NULL`.
- Las ventas internas quedan al contado y se retiran en el negocio.
- Los retiros no se asignan a delivery, no forman lotes, no aparecen en ruta y no llegan a Liquidación.
- Validación incorpora la pestaña **Retiros en negocio** para registrar quién retira y quién entrega.
- Las impresiones de preparación y facturación muestran una advertencia grande configurable.
- Configuración permite ajustar por separado el tamaño de títulos y el detalle de artículos.

## Orden correcto de instalación

1. Ejecutar `supabase/27_actualizacion_v933_retiros_ventas_internas.sql` en Supabase.
2. Aplicar el HOTFIX V9.3.3 al proyecto.
3. Ejecutar `npm.cmd test` y `npm.cmd run build`.
4. Publicar con `npx.cmd wrangler deploy`.
5. En cada PWA, guardar cualquier trabajo pendiente y pulsar **Actualizar ahora**.

# V9.3.7.3 — Mapeo técnico del módulo Órdenes

## Problemas encontrados

- La vista renderizaba todas las órdenes completas; en la captura eran 190 tarjetas.
- Estado, modalidad, responsable, tiempo, peso, monto y productos competían con la misma jerarquía.
- Los productos siempre estaban visibles y aumentaban innecesariamente la altura.
- Las cuatro acciones se repetían en cada tarjeta.
- El buscador indicaba cliente, aunque el motor también permite otros datos.
- No existía paginación ni prioridad visual para vencidas y urgentes.

## Solución aplicada

- Paginación de 25 órdenes.
- Orden automático: vencidas, urgentes/altas y luego las más recientes.
- Barra superior compacta de seis estados.
- Filtros y búsqueda en una sola zona.
- Tarjeta de tres niveles: identidad, resumen operativo y estado/tiempos.
- Productos y observaciones dentro de un desplegable.
- `Ver` permanece como acción principal; Editar, gestionar y anular pasan a `Más`.
- WhatsApp se reduce a `WA`.
- Diseño adaptable para escritorio, tablet y móvil.

## Integridad funcional

- No cambia tablas, RLS, RPC ni estados de Supabase.
- Conserva Ver, WhatsApp, Editar, Gestionar caso, Eliminar y Anular.
- Conserva relojes, peso, monto, responsable y estado.
- Mantiene completa la V9.3.7.2.
- Actualiza PWA, paquete y Wrangler a V9.3.7.3.

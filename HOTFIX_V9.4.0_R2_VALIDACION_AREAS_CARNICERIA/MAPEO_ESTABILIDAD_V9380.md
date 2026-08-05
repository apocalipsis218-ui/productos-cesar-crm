# V9.3.8.0 — Estabilidad, concurrencia y recuperabilidad

## Alcance aplicado

- Toma condicional de órdenes para impedir doble asignación entre tabletas.
- Consulta paginada de órdenes pendientes históricas y fusión sin duplicados.
- Registro de historial con detección de error, reintento y cola local.
- Polling utilizado solamente como respaldo cuando Realtime no está conectado.
- Restauración documental de los SQL 19–32 dentro de `supabase/sql`.
- Orden canónico de reconstrucción documentado.

## Compatibilidad

- No cambia tablas ni datos existentes.
- No agrega una migración nueva.
- No requiere ejecutar SQL en la base de producción.
- Conserva los módulos, estados, órdenes, clientes, lotes y liquidaciones.

## Controles realizados

- Comparación SHA-256 de las copias disponibles de los SQL 19–32.
- Pruebas reales de fusión y deduplicación de órdenes.
- Verificaciones de toma condicional, historial y polling.
- Suite histórica completa mediante `npm test`.
- Compilación de producción mediante `npm run build`.

## Pendiente para una etapa posterior

Esta versión no convierte todavía en RPC transaccional:

- creación y edición completa de órdenes;
- preparación y pesaje;
- anulación o eliminación de órdenes;
- máquina de estados y protección de columnas en Supabase.

Estas operaciones deben abordarse en una actualización separada para reducir
el riesgo operacional.

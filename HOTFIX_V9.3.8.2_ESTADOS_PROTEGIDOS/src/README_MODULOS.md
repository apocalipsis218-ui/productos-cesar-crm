# Estructura de módulos sugerida

Esta V8.1 mantiene la app funcional en `src/main.js` para no romper el sistema.
La próxima fase puede separar progresivamente:

- `src/modules/control/`
- `src/modules/clientes/`
- `src/modules/ordenes/`
- `src/modules/carniceria/`
- `src/modules/facturacion/`
- `src/modules/validacion/`
- `src/modules/delivery/`
- `src/modules/liquidacion/`
- `src/modules/configuracion/`
- `src/services/supabase.js`
- `src/services/realtime.js`
- `src/utils/formatters.js`
- `src/utils/weights.js`

La migración se hizo primero como proyecto Vite para poder usar VS Code, control de versiones y despliegue profesional.

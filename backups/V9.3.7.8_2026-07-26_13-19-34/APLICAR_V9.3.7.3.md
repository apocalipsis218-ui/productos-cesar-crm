# Aplicar V9.3.7.3

Esta actualización es solamente de interfaz y rendimiento. No requiere ejecutar un SQL nuevo.

1. Aplica el HOTFIX V9.3.7.3 sobre V9.3.7.2.
2. El instalador crea respaldo, copia cambios, ejecuta auditorías y compila.
3. Ejecuta `npm.cmd run dev`.
4. Prueba Órdenes: filtros, búsqueda, paginación, productos desplegables y menú Más.
5. Publica con `npx.cmd wrangler deploy`.

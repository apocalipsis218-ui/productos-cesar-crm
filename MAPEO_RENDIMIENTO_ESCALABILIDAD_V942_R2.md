# V9.4.2 R2 — Rendimiento incremental y escalabilidad

## Estado

R2 prepara la arquitectura del CRM para una prueba comercial de concurrencia. No certifica todavía 100 usuarios simultáneos: la certificación requiere staging, métricas posteriores a la migración y pruebas escalonadas.

## Línea base observada el 8 de agosto de 2026

- Base de datos: 34 MB.
- Órdenes: 698.
- Detalles de órdenes: 1,774.
- Historiales de estados: 4,739.
- Consulta anidada principal de órdenes: 30,399 llamadas, promedio 563.65 ms.
- Lecturas de `realtime.list_changes`: 2,028,457.
- `usuario_modulos`: 14 filas, pero 1,926,649,158 filas examinadas acumuladas.
- `perfiles`: 7 filas, pero 864,272,531 filas examinadas acumuladas.

Las cifras de `pg_stat_*` son acumuladas desde el último reinicio de estadísticas; se usan para identificar patrones, no como una medición aislada de un único día.

## Cambios de R2

### Carga por módulo

La entrada anterior abría aproximadamente 29 grupos de datos para todos los usuarios. R2 separa:

1. acceso y configuración esencial;
2. referencias comerciales;
3. catálogos;
4. operación;
5. administración y auditoría.

La pantalla Inicio pasa a un máximo aproximado de 18 solicitudes iniciales. Módulos como Carnicería o Productos requieren menos grupos y conservan los demás sin descargarlos hasta que se abren.

### Órdenes agrupadas

`cargar_ordenes_v942` devuelve en una llamada:

- órdenes pendientes, con límite de seguridad;
- hasta 500 órdenes recientes;
- cliente asociado;
- artículos de cada orden.

Para Realtime admite hasta 100 identificadores y devuelve únicamente las órdenes modificadas. La autorización se verifica una vez dentro del servidor y la RPC no está disponible para `anon`.

### Realtime incremental

- Cada página se suscribe solo a las tablas que consume.
- Productos y otras vistas no operativas dejan de suscribirse a todas las tablas de órdenes.
- Los eventos cercanos se agrupan durante 450 ms.
- Pesos, entregas, pagos e historiales se actualizan directamente en memoria.
- Un cambio de orden produce como máximo una carga agrupada de las órdenes afectadas, en vez de recargar entre 6 y 15 consultas.
- El sondeo de respaldo se pausa con la pestaña oculta y usa una variación de ±15 % para evitar consultas simultáneas de muchos equipos.

### RLS e índices

- Las políticas de lectura más utilizadas convierten las funciones de permisos en `initPlan` mediante `(select ...)`, evitando evaluarlas por cada fila.
- Las políticas SELECT duplicadas de `perfiles`, `usuario_modulos`, `roles_permisos` y `modulos_sistema` se consolidan sin ampliar el acceso vigente.
- Se agregan índices para los `ORDER BY creado_en DESC` de pesos, entregas, pagos e historial.

## Orden de aplicación futura

1. Mantener el PR #3 como borrador.
2. Crear un proyecto de staging con una copia sanitizada o representativa.
3. Aplicar primero R1 y después R2 en staging.
4. Ejecutar `npm test` y `npm run build`.
5. Probar manualmente Inicio, Órdenes, Carnicería, Facturación, Validación, Delivery, Liquidación/CXC, Clientes, Productos, Reportes, Auditoría y Configuración.
6. Medir consultas, errores, CPU, memoria, conexiones y latencia p50/p95/p99.
7. Ejecutar pruebas de 10, 25, 50 y 100 usuarios.
8. Solo después de aprobar staging, planificar la aplicación en producción.

## Criterios para certificar 100 usuarios

- 0 operaciones duplicadas o perdidas.
- 0 saltos de RLS entre roles.
- 0 errores sostenidos de Realtime o PostgREST.
- p95 de lectura operativa menor de 1 segundo bajo la carga acordada.
- p95 de escritura crítica menor de 1.5 segundos.
- tasa de error menor de 1 % y sin errores de integridad.
- recuperación correcta al desconectar y reconectar una tableta.
- órdenes simultáneas, toma de Carnicería, pesajes, facturación, lotes, CXC y liquidación validados.

Si alguno de estos criterios falla, la V9.4.2 continúa como candidata y no se declara comercialmente certificada.

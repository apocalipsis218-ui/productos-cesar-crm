# SQL del proyecto

Esta carpeta contiene la cadena histórica necesaria para reconstrucción y
recuperación. La V9.3.8.0 restauró aquí los SQL 19–32, que antes estaban
únicamente en la carpeta `supabase/` y en respaldos.

## Base nueva

1. Ejecutar `01_migracion_ordenes_crm.sql`.
2. Ejecutar los SQL 02–17 en orden numérico.
3. Para el paso 18 usar
   `18_actualizacion_v72_control_peso_real_CORREGIDO.sql`. Este reemplaza al
   SQL 18 original y evita incompatibilidad con enums antiguos de roles.
4. Continuar del SQL 19 al último disponible, en orden numérico.

`01_sql_completo_integrado_v2.sql` es una copia histórica integrada de los
pasos 01 y 02. No debe ejecutarse junto con `01_migracion_ordenes_crm.sql` y
`02_mejoras_config_clientes.sql` en una reconstrucción nueva.

## Producción existente

No se deben ejecutar nuevamente los SQL 01–38 solo porque estén reunidos en
esta carpeta. La restauración de 19–32 en V9.3.8.0 es documental y de
recuperabilidad; no representa una migración nueva para la base actual.

La V9.3.8.1 agrega el SQL 39. Este sí debe ejecutarse una vez, después del SQL
38, para habilitar el guardado transaccional de órdenes y preparación.

La V9.3.8.2 agrega el SQL 40, que debe ejecutarse una vez después del SQL 39.
Protege transiciones de estado, permisos operativos y campos críticos.

La V9.3.8.3 agrega el SQL 41, que debe ejecutarse una vez después del SQL 40.
Sustituye el borrado físico por anulación/archivado transaccional y protege
órdenes, snapshots e historial.

La V9.3.8.4 agrega el SQL 42, que debe ejecutarse una vez después del SQL 41.
Agrega índices de rendimiento para la carga incremental de módulos operativos
y tabletas, sin modificar datos existentes.

Los SQL 43–49 continúan la cadena de configuración global, faltantes,
devoluciones, no entregados y cancelación corregida. En una base de producción
actualizada no deben repetirse.

La V9.3.9.7 agrega el SQL 50. Debe ejecutarse una sola vez después del SQL 49.
Elimina políticas permisivas heredadas, protege la identidad de toma y
preparación, crea casos especiales de forma transaccional y retira el acceso
directo a RPC antiguas. El propio SQL 50 verifica que los SQL 45–49 estén
realmente aplicados antes de modificar las políticas.

Antes de reconstruir otro proyecto Supabase, comparar las funciones y columnas
de producción con la cadena conservada y realizar un respaldo completo.
# V9.3.9.0

Después del SQL 42, ejecutar una sola vez:

`43_actualizacion_v9390_configuracion_concurrencia.sql`

Agrega guardado global transaccional, revisión e historial privado de la configuración. No elimina datos.

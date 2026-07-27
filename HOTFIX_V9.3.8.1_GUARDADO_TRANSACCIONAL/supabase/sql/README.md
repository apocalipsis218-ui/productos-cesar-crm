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

Antes de reconstruir otro proyecto Supabase, comparar las funciones y columnas
de producción con la cadena conservada y realizar un respaldo completo.

# V9.3.9.0 — Consolidación técnica

## Alcance aplicado

- La conexión con Supabase depende únicamente del `.env`; se eliminaron valores de conexión incrustados.
- La configuración almacenada en Supabase es la fuente global autoritativa.
- El guardado de configuración es transaccional, administrativo, versionado y auditado.
- Los cambios de configuración se reciben en vivo en los demás equipos.
- Los avisos del navegador se muestran mediante un diálogo visual integrado.
- Fechas y horas operativas e impresas se normalizan a `America/Santo_Domingo`.
- Se eliminó el perfil Gerente inventado a partir de un correo específico.
- Se preservan la carga incremental y los índices de V9.3.8.4.

## Compatibilidad

No se eliminan clientes, órdenes, lotes, pagos, pesajes, configuraciones ni historiales.
El SQL 43 amplía `sistema_configuracion` y crea un historial privado de cambios.

## Dependencias

`xlsx` permanece porque importa y exporta clientes, productos, reportes y auditoría.
Eliminarla rompería funciones vigentes.

## Orden de base de datos

Ejecutar `43_actualizacion_v9390_configuracion_concurrencia.sql` después del SQL 42.

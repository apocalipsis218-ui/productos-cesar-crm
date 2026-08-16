# Productos César CRM V9.4.3 PWA

## V9.4.3 R2 — Progreso mensual de Carnicería

- muestra clientes únicos, pedidos, libras, tiempo promedio y preparados del día;
- calcula el mes completo en una RPC protegida, sin depender de la carga incremental;
- permite a estaciones elegir despachador y a administración consultar el equipo;
- corrige la cola visual de las cuentas compartidas para usar el empleado real;
- excluye del tiempo promedio duraciones negativas o mayores a ocho horas, sin retirar esos pedidos de los demás indicadores;
- informa cuántas duraciones atípicas fueron omitidas del promedio;
- conserva el flujo cuando la métrica no está disponible.

La migración está validada en staging. Producción requiere autorización y despliegue coordinado.

## V9.4.2 R1 — Preparación comercial y cierre de escrituras directas

Esta revisión inicia la preparación del CRM para una operación comercial con
mayor concurrencia. La R1 concentra cambios de seguridad y consistencia:

- elimina respaldos del navegador que podían saltarse las RPC vigentes;
- retira las escrituras directas del frontend sobre `ordenes`;
- retira las inserciones directas sobre `orden_estados_historial`;
- registra impresiones y seguimiento de casos en transacciones atómicas;
- aplica control de concurrencia al editar casos especiales;
- elimina la cola de historial sensible almacenada en `localStorage`;
- retira políticas heredadas que daban lectura o actualización amplia;
- exige permisos explícitos para nuevos objetos de la Data API;
- publica CSP y cabeceras defensivas para los activos estáticos de Cloudflare.

## Aplicación segura

1. Ejecutar `npm test`.
2. Ejecutar `npm run build`.
3. Aplicar en staging la migración
   `supabase/migrations/20260808004213_v942_r1_cierre_escrituras_directas.sql`.
4. Ejecutar la verificación incluida al final de la migración.
5. Probar Órdenes, WhatsApp, impresión de preparación, casos especiales,
   reverso de gestiones y permisos de usuarios.
6. Revisar los asesores de seguridad y rendimiento de Supabase.
7. Publicar el frontend únicamente después de aprobar staging.

No debe aplicarse el cierre de permisos a producción antes de desplegar el
frontend V9.4.2: ambos cambios forman una sola unidad de publicación.

## Base acumulada

Conserva el flujo operativo de V9.4.0 R3 y el endurecimiento de funciones de
V9.4.1, incluyendo órdenes programadas, guardado atómico desde llamadas,
roles por área, auditoría, lotes, delivery, liquidación y CXC.

# Productos César CRM V9.4.5 PWA

## V9.4.5.1 — Cotejo completo antes del desglose por lote

- El desglose de efectivo del lote permanece bloqueado hasta cotejar y validar todos sus clientes.
- El efectivo esperado se calcula después del cotejo completo y solo con contado/abonos confirmados.
- Si cambia el efectivo confirmado después de aplicar un desglose, el conteo anterior se invalida y debe rehacerse.
- Los lotes totalmente cotejados sin efectivo muestran `Sin efectivo` y no exigen abrir la ficha.

## V9.4.5 — Desglose físico de efectivo en Liquidación

- Agrega conteo compacto por denominaciones RD$2,000, 1,000, 500, 200, 100, 50, 25, 10, 5 y 1.
- Compara efectivo esperado, contado, ajuste de fracción y diferencia antes de cerrar el lote.
- Bloquea diferencias de RD$1 o más y valida nuevamente dentro de la RPC transaccional.
- Conserva el desglose en Supabase y lo incorpora al recibo y a sus reimpresiones.
- No cambia los resultados CXC por cliente ni redondea silenciosamente importes con centavos.

## V9.4.4.2 — Reasignación segura desde Validación

- agrupa las acciones del historial de Delivery en un menú de tres puntos;
- permite transferir un cliente a otro delivery sin duplicar la orden;
- permite quitarlo de un lote abierto y devolverlo a Lotes pendientes;
- conserva la trazabilidad de correcciones y transferencias;
- atribuye la productividad al delivery responsable del lote vigente;
- no requiere una migración adicional de Supabase.

## V9.4.4.1 — Productividad simplificada

- Consolida la vista principal en una sola fila por empleado.
- Conserva el desglose exacto por función bajo demanda.
- Separa las incidencias de identidad de la aprobación cotidiana.
- Sustituye el total ambiguo de operaciones por unidades incentivables.
- Aprovecha mejor el ancho disponible en pantallas administrativas.

## V9.4.4 R2 — Incentivos por despacho de cliente

- conserva clientes únicos como indicador analítico;
- cuenta cada preparación finalizada de Carnicería como una unidad de incentivo;
- cuenta cada orden entregada válidamente por Delivery como una unidad;
- reconoce dos pedidos del mismo cliente como dos despachos separados;
- excluye órdenes anuladas, canceladas, pendientes y no entregadas según el rol;
- muestra operaciones, unidades de incentivo y clientes únicos sin mezclarlos;
- mantiene Delivery y los demás módulos conectados mediante la RPC mensual.

R2 reemplaza únicamente la RPC de Productividad creada por R1 y no modifica
filas operativas. Debe aprobarse en staging antes de cualquier uso en producción.

## V9.4.4 R1 — Productividad integral por empleado y rol

- calcula el mes completo en Supabase y deja de depender del subconjunto cargado en el navegador;
- separa la actividad de un mismo empleado por rol productivo;
- conecta Carnicería, Delivery, Ventas, Facturación, Validación, Liquidación y Control;
- cuenta clientes únicos sin confundirlos con la cantidad de órdenes;
- atribuye facturación y cobros al mes de su fecha real y excluye pagos reversados;
- conserva empleados históricos inactivos y señala actividades sin identidad vinculada;
- aplica las reglas configuradas de incentivos en una RPC protegida;
- evita pagar devoluciones parciales salvo que la regla se active explícitamente.

La migración debe validarse primero en staging. Producción no debe modificarse
hasta aprobar las simulaciones, los permisos y la conciliación por módulo.

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

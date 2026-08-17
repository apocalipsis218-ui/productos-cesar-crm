# Mapeo técnico de Productividad V9.4.4 R2

## Objetivo

El módulo mide actividad mensual por empleado y por función productiva. Un
empleado puede aparecer en varias filas si trabaja en más de un módulo. Los
clientes únicos y los despachos son métricas distintas: tres pedidos del mismo
cliente cuentan como tres operaciones, tres unidades de incentivo y un cliente
único para esa persona y rol.

El cálculo se ejecuta en `resumen_productividad_mensual_v944`, sobre el mes
completo y con zona horaria `America/Santo_Domingo`. El navegador sólo presenta
el resultado y no vuelve a sumar el subconjunto incremental visible.

## Fuentes y atribución

| Rol productivo | Fuente principal | Fecha del período | Identidad | Métricas |
|---|---|---|---|---|
| Despachador | `ordenes` | `preparado_en` | `tomado_por_empleado_id`; nombre histórico sólo como respaldo | clientes únicos, preparaciones finalizadas, unidades de incentivo, libras, duración |
| Delivery | `entrega_lotes` + `entrega_lote_detalle` | `fecha_entrega` | `responsable_empleado_id`; nombre histórico sólo como respaldo | clientes únicos, entregas válidas, unidades de incentivo, viajes, cobro, crédito, no entregados |
| Vendedor | `ordenes` + `orden_pagos` | `facturado_en` y `orden_pagos.creado_en` | vendedor normalizado contra empleado | clientes, órdenes, facturado en el mes, cobrado en el mes |
| Facturación | `ordenes` | `facturado_en` | `facturado_por` | clientes, facturas y monto facturado |
| Validación | `ordenes` | `validado_en` | `validado_por` | clientes, validaciones y duración |
| Liquidación | `liquidaciones_lotes` + detalle | `fecha_liquidacion` | `recibido_por` | clientes, lotes, facturado, cobrado, crédito y diferencias |
| Control | `llamadas` | `fecha` | `vendedor` | clientes gestionados, llamadas y no contactados |

## Reglas de consistencia

- La clave preferida de cliente es `cliente_id`; para clientes ocasionales se
  usa el teléfono normalizado y, si tampoco existe, la orden.
- Los clientes se deduplican por empleado y rol únicamente para el KPI de
  clientes únicos. El total del equipo se deduplica nuevamente entre módulos.
- El incentivo no deduplica clientes: cada pedido preparado por Carnicería y
  cada orden entregada válidamente por Delivery constituyen una unidad. Si un
  cliente realiza dos pedidos separados el mismo día, genera dos unidades.
- Las órdenes anuladas o canceladas no generan productividad.
- Los pagos se contabilizan por su fecha real y los reversados se excluyen.
- Una factura se contabiliza por `facturado_en`, aunque el cobro ocurra en otro
  mes; un pago parcial posterior no vuelve a sumar la factura completa.
- Los empleados inactivos conservan su actividad histórica, pero se marcan como
  inactivos en la interfaz.
- Las actividades sin empleado reconocido aparecen en el control de calidad y
  no generan incentivo.
- Las devoluciones parciales de Delivery sólo cuentan si la regla
  `cuentaDevueltoParcial` se activa explícitamente.
- Las duraciones negativas o mayores de ocho horas se reportan como incidencia
  y se excluyen del promedio.

## Incentivos

Las reglas se leen de `sistema_configuracion.incentivos` y se aplican en la
misma RPC que produce los indicadores. Delivery, Despachador y Vendedor pueden
tener incentivo. Los demás roles se muestran como indicadores hasta que exista
una regla comercial aprobada para ellos.

- Despachador: cada preparación finalizada cuenta, siempre que la orden no esté
  anulada ni cancelada. El resultado posterior de Delivery no elimina el
  trabajo realizado en Carnicería.
- Delivery: cada `orden_id` con resultado Cobrado, Entregado o Entregado a
  crédito cuenta una vez. Pendientes y no entregados no generan incentivo; las
  devoluciones parciales dependen de la configuración explícita.
- `clientes_unicos` nunca se utiliza como multiplicador del incentivo. La base
  de cantidad queda registrada en `medida_incentivo` y se muestra como
  “Unidades incentivo”.

El panel presenta el incentivo como estimado. Antes del pago se deben revisar
las incidencias, las identidades no vinculadas y los totales por módulo.

## Seguridad y operación

- Sólo una sesión activa con rol Gerente, Administrador o Supervisor, acceso
  administrativo, o permiso de lectura en Productividad puede ejecutar la RPC.
- La función no está expuesta a `anon` y sólo concede ejecución a
  `authenticated`.
- La migración agrega índices parciales para las fechas utilizadas por el
  reporte; no elimina ni reescribe datos operativos.
- Si la RPC no está disponible, el panel muestra un error controlado y el resto
  del CRM continúa funcionando.

## Validación antes de producción

1. Aplicar la migración únicamente en staging.
2. Ejecutar la auditoría V9.4.4 R2 y las simulaciones virtuales, incluyendo un
   cliente con varios pedidos el mismo día y en fechas diferentes.
3. Comparar un mes cerrado contra consultas independientes de cada módulo.
4. Probar acceso de Gerencia, Supervisor, usuario con permiso Productividad y
   usuario sin permiso.
5. Revisar identidades sin vínculo y nombres duplicados.
6. Aprobar reglas de incentivo y probar crédito, devolución parcial, reversos y
   pagos parciales entre meses.
7. Publicar frontend y migración como una unidad coordinada.

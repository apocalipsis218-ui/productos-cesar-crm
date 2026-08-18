# Mapeo técnico — Validación, lotes, transferencias y Productividad V9.4.4.2

## Objetivo

Documentar el recorrido de una orden desde Validación hasta Delivery y Productividad, comprobar la atribución después de una transferencia y hacer visible el retorno de una orden a lotes pendientes.

## Flujo operativo

| Etapa | Fuente principal | Estado de la orden | Resultado |
|---|---|---|---|
| Pendiente de lote | `ordenes` | `Facturada` o `Validada para delivery` | Aparece en Validación → Pendientes |
| Asignación | `crear_lote_entrega_v9371` | `Asignada a delivery` | Crea `entrega_lotes` y `entrega_lote_detalle` |
| Transferencia | `transferir_orden_lote_v9371` | Conserva estado operativo | Mueve el detalle a un lote `TRF-*` y cambia el responsable |
| Retorno a pendientes | `editar_composicion_lote_v9379` | `Facturada` | Quita el detalle activo, limpia el delivery y vuelve a Pendientes |
| Retorno de lote unitario | `corregir_lote_entrega_v936` | `Facturada` | Marca el lote `Revertido`; Productividad lo excluye |
| Entrega válida | `entrega_lote_detalle.resultado_entrega` | Resultado final | Productividad cuenta la orden para el responsable del lote vigente |

## Cómo atribuye Productividad al delivery

La RPC `resumen_productividad_mensual_v944` toma el empleado desde `entrega_lotes.responsable_empleado_id` y une las órdenes mediante `entrega_lote_detalle.lote_id`. La transferencia mueve el mismo detalle al lote destino y guarda allí el nuevo empleado; por tanto, una entrega finalizada después de transferirse se atribuye al nuevo delivery.

Reglas verificadas:

- Una orden sin resultado válido todavía no genera incentivo de Delivery.
- Una orden transferida antes de finalizar se atribuye únicamente al responsable del lote destino.
- Una orden retirada a Pendientes deja de pertenecer a un lote activo y no genera productividad de Delivery.
- Una orden ya recibida, liquidada o con resultado final no puede transferirse ni retirarse.
- Productividad usa el mes de `entrega_lotes.fecha_entrega`; un traslado a otro mes queda en el mes del nuevo viaje.
- El panel de Productividad puede conservar datos en pantalla hasta pulsar `Actualizar` o hasta el siguiente refresco.

## Hallazgos

1. La capacidad de retirar órdenes ya existía dentro de `Editar lote`, pero no era visible por cliente.
2. El RPC de composición no permite dejar un lote vacío. Para un lote de una sola orden debe usarse la reversión completa, que conserva el detalle histórico y excluye el lote de Productividad.
3. La retirada de un lote con varias órdenes elimina la membresía activa, pero conserva trazabilidad en `orden_estados_historial` y `auditoria_excepciones`.
4. No existía una prueba que conectara transferencia, responsable del lote y atribución de Productividad.
5. Staging tenía las tres RPC requeridas y no presentaba órdenes duplicadas en `entrega_lote_detalle` durante la auditoría.

## Cambio V9.4.4.2

Cada cliente de un lote abierto muestra un menú `•••` con `Transferir delivery` y `Quitar del lote`, evitando sobrecargar la fila. La acción de retirar:

1. exige permiso de edición en Validación;
2. exige un motivo de al menos cinco caracteres;
3. bloquea lotes cerrados, recibidos, liquidados o con resultado final;
4. devuelve la orden a `Validación → Pendientes` sin delivery;
5. recalcula monto, peso, cantidad y snapshot del lote restante;
6. revierte de forma segura el lote completo cuando contiene una sola orden;
7. permite crear posteriormente otro lote y asignar otro delivery.

## Escenarios de aceptación

| Escenario | Resultado esperado |
|---|---|
| Transferir antes de entregar | La productividad final pertenece al delivery destino |
| Transferir después de resultado final | Operación bloqueada |
| Quitar una orden de un lote múltiple | Orden en Pendientes; lote recalculado |
| Quitar la única orden | Lote Revertido; orden en Pendientes |
| Reasignar una orden retirada | Nuevo lote activo y nuevo responsable |
| Consultar Productividad antes de resultado | Cero unidad de Delivery para esa orden |
| Consultar después de entrega válida | Una unidad para el responsable vigente |

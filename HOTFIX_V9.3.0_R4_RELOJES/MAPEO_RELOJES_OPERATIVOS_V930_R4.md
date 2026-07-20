# V9.3.0 R4 — Mapeo y corrección de relojes operativos

## Problema confirmado

El botón **Imprimir prep.** registraba en `orden_estados_historial` una fila con el mismo estado anterior y nuevo. El cálculo de tiempos tomaba la fila más reciente por nombre de estado, por lo que esa impresión parecía una nueva entrada a Carnicería y el reloj volvía a “ahora”.

La impresión no estaba borrando `tomado_en`; el error estaba en la interpretación del historial.

## Corrección aplicada

1. Los relojes usan únicamente cambios reales de estado.
2. Una acción con `estado_anterior = estado_nuevo` queda como trazabilidad, pero no inicia una etapa.
3. Los cambios internos dentro del mismo módulo no reinician el reloj.
4. Una reapertura desde otro módulo sí inicia un nuevo período de etapa.
5. `ultima_impresion` deja de utilizarse como inicio de Facturación.
6. Liquidación deja de comenzar en `En ruta`; comienza cuando se registra el resultado de entrega.

## Mapeo por módulo

| Módulo | Entrada real | Acciones que no reinician | Salida real |
|---|---|---|---|
| Carnicería | Pedido recibido o reapertura desde otro módulo | Tomar, soltar, guardar avance, imprimir preparación, actualizar pantalla | Lista para facturar |
| Facturación | Lista para facturar | Imprimir volante; pasar a Impresa para facturar | Facturada |
| Validación | Facturada | Validar peso y otras acciones internas | Asignada a delivery |
| Delivery | Asignada a delivery | Iniciar ruta o pasar a En ruta | Resultado de entrega |
| Liquidación | Entregado, Cobrado, crédito, no entregado o devolución | Imprimir, verificar, registrar pagos o notas | Cierre/resultado final |

## Total de la orden

Las impresiones posteriores a un cierre no extienden el tiempo total. Solo una transición real a un estado final determina la hora de cierre.

## No requiere SQL

La corrección se realiza en `src/main.js`. Los registros históricos existentes no necesitan eliminarse: el nuevo cálculo ignora automáticamente los eventos que no fueron transiciones reales.

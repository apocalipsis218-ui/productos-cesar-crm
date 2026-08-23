# Mapeo V9.4.5 — Desglose de efectivo en Liquidación

## Alcance

El desglose se exige en las dos rutas de recepción de CXC:

- **Por lote:** un conteo físico consolidado para todo el efectivo cotejado del viaje.
- **Individual:** un conteo físico por orden; si el último cliente cierra el lote, los conteos previos se vinculan a la liquidación formal.
- **Pago mixto individual:** el usuario declara cuánto del monto recibido corresponde a efectivo físico. Transferencia, crédito y otros componentes no entran al conteo.

## Flujo de interfaz

1. El formulario principal muestra únicamente el estado del conteo y el botón **Desglose de efectivo**.
2. El botón abre una ficha vertical compacta.
3. El foco comienza en RD$2,000.
4. `Enter` avanza por RD$1,000, RD$500, RD$200, RD$100, RD$50, RD$25, RD$10, RD$5 y RD$1 hasta **Aplicar desglose**.
5. Cada fila presenta `cantidad × denominación = subtotal`.
6. La ficha muestra efectivo esperado, contado, ajuste y diferencia.
7. Solo se puede aplicar un desglose cuadrado.

## Flujo transaccional

1. CXC coteja cada cliente y define su resultado final.
2. El panel determina el efectivo físico esperado para la recepción individual o suma el efectivo/abono esperado del lote.
3. CXC registra cantidades de las diez denominaciones autorizadas.
4. El navegador muestra contado, ajuste de fracción y diferencia.
5. Una diferencia de RD$1 o más bloquea el cierre.
6. `recibir_orden_cxc_v945` o `recibir_lote_cxc_v945` vuelve a calcular y validar todo en PostgreSQL.
7. El cierre, el conteo, el evento de auditoría y el recibo quedan en una sola transacción.

## Denominaciones

`2000, 1000, 500, 200, 100, 50, 25, 10, 5, 1`

Las cantidades son enteros no negativos. No se aceptan denominaciones repetidas, ausentes o no autorizadas.

## Fracciones

Las facturas existentes pueden terminar en centavos aunque las denominaciones configuradas sean pesos enteros. El sistema exige el peso entero más cercano (RD$0.50 redondea hacia arriba) y registra un ajuste automático menor de RD$1, visible en pantalla, evento y recibo. El ajuste no modifica el dinero contado, no admite dos redondeos distintos para un mismo total y no oculta faltantes o sobrantes.

Ejemplo: esperado RD$19,394.50, contado RD$19,395.00, ajuste RD$-0.50, conciliado RD$19,394.50, diferencia RD$0.00.

## Persistencia y seguridad

- Tabla: `public.liquidacion_efectivo_conteos_v945`.
- RPC por lote: `public.recibir_lote_cxc_v945`.
- RPC individual: `public.recibir_orden_cxc_v945`.
- La tabla admite lectura autenticada con permiso de Liquidación, pero no escritura directa.
- Ambas RPC exigen sesión y permiso `liquidacion/editar`, no se exponen a `anon` y fijan el `search_path`.
- La RPC vigente V9.3.9.3 permanece como núcleo de recepción y se ejecuta dentro de la misma transacción.
- La devolución parcial individual conserva sus líneas y el conteo dentro de la misma transacción.
- El desglose se vincula con la orden, el lote y, cuando existe, la liquidación; una consolidación histórica no borra los registros físicos.
- La consulta frontend solicita las columnas de R2 explícitamente. Si R2 no está aplicada, el módulo se marca como no disponible en vez de intentar una recepción incompleta.

## Casos de prueba

- Conteo exacto.
- Recepción individual en efectivo.
- Recepción individual por transferencia sin efectivo físico.
- Recepción individual mixta con efectivo físico menor que el total recibido.
- Devolución parcial individual con conteo transaccional.
- Varios conteos individuales enlazados al cierre del lote.
- Lote sin efectivo, completamente a crédito.
- Ajuste positivo y negativo menor de RD$1.
- Faltante o sobrante de RD$1 o más.
- Cantidad negativa o decimal.
- Denominación inválida, ausente o repetida.
- Manipulación del total enviado desde el navegador.
- Cierre duplicado o concurrente.
- Reimpresión histórica con desglose.
- Distribución compacta en escritorio, tableta y móvil.

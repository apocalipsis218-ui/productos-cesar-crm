# Mapeo V9.4.5 — Desglose de efectivo en Liquidación

## Flujo

1. CXC coteja cada cliente y define su resultado final.
2. El panel suma el efectivo/abono esperado del lote.
3. CXC registra cantidades de las diez denominaciones autorizadas.
4. El navegador muestra contado, ajuste de fracción y diferencia.
5. Una diferencia de RD$1 o más bloquea el cierre.
6. `recibir_lote_cxc_v945` vuelve a calcular y validar todo en PostgreSQL.
7. El cierre, el conteo, el evento de auditoría y el recibo quedan en una sola transacción.

## Denominaciones

`2000, 1000, 500, 200, 100, 50, 25, 10, 5, 1`

Las cantidades son enteros no negativos. No se aceptan denominaciones repetidas, ausentes o no autorizadas.

## Fracciones

Las facturas existentes pueden terminar en centavos aunque las denominaciones configuradas sean pesos enteros. El sistema exige el peso entero más cercano (RD$0.50 redondea hacia arriba) y registra un ajuste automático menor de RD$1, visible en pantalla, evento y recibo. El ajuste no modifica el dinero contado, no admite dos redondeos distintos para un mismo total y no oculta faltantes o sobrantes.

Ejemplo: esperado RD$19,394.50, contado RD$19,395.00, ajuste RD$-0.50, conciliado RD$19,394.50, diferencia RD$0.00.

## Persistencia y seguridad

- Tabla: `public.liquidacion_efectivo_conteos_v945`.
- RPC: `public.recibir_lote_cxc_v945`.
- La tabla admite lectura autenticada con permiso de Liquidación, pero no escritura directa.
- La RPC exige sesión y permiso `liquidacion/editar`.
- La RPC vigente V9.3.9.3 permanece como núcleo de recepción y se ejecuta dentro de la misma transacción.
- El desglose se vincula con la liquidación y el lote; una consolidación histórica no borra el registro físico.

## Casos de prueba

- Conteo exacto.
- Lote sin efectivo, completamente a crédito.
- Ajuste positivo y negativo menor de RD$1.
- Faltante o sobrante de RD$1 o más.
- Cantidad negativa o decimal.
- Denominación inválida, ausente o repetida.
- Manipulación del total enviado desde el navegador.
- Cierre duplicado o concurrente.
- Reimpresión histórica con desglose.
- Distribución compacta en escritorio, tableta y móvil.

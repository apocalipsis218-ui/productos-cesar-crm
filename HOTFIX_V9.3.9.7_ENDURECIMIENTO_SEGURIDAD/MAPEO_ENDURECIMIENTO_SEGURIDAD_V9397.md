# Mapeo de seguridad V9.3.9.7

## Alcance aplicado

| Riesgo | Corrección |
|---|---|
| `ordenes_all` anulaba las restricciones nuevas | Se eliminan las políticas permisivas heredadas y se separan lectura, creación y actualización. |
| Un usuario podía intentar insertar una orden en estado final | Trigger y RLS permiten como inicio normal solo `Programada` o `Pedido recibido`; el pendiente por existencia conserva su excepción controlada. |
| La identidad de preparación provenía de datos enviados por la pantalla | Supabase resuelve la cuenta personal o de estación, valida el empleado activo y registra usuario, hora y nombre del servidor. |
| Dos estaciones podían tomar la misma orden | La transición conserva bloqueo de fila y estado esperado; el servidor valida además responsable y límite de cola. |
| Otro usuario de Carnicería podía intentar editar preparación ajena | La orden y su detalle exigen la misma cuenta que tomó el pedido, salvo administración autorizada. |
| Casos especiales usaban `INSERT` directo | `crear_caso_especial_v9397` guarda orden e historiales en una transacción. |
| RPC antiguas seguían invocables desde el navegador | Se revoca `EXECUTE` a usuarios autenticados; se conservan para llamadas internas de compatibilidad. |
| Cadena SQL reciente difícil de verificar | SQL 50 comprueba la base transaccional de SQL 39–41, los pendientes del SQL 44 y las funciones/correcciones de SQL 45–49 antes de aplicar cambios. |

## Compatibilidad

- La interfaz V9.3.9.7 usa `tomar_orden_v9397`.
- Una tableta que todavía tenga V9.3.9.6 puede completar una toma mediante
  `cambiar_estado_orden_v9382`; el trigger V9.3.9.7 normaliza y valida esa
  identidad en el servidor.
- Las RPC `recibir_orden_cxc_v9393` y `recibir_lote_cxc_v9393` siguen siendo
  las rutas públicas vigentes.
- No se borran órdenes, artículos, pesajes, entregas, pagos ni historiales.

## Pruebas funcionales posteriores

1. Crear una orden normal y otra programada.
2. Tomar una orden desde una cuenta personal.
3. Tomar una orden desde una estación seleccionando un empleado activo.
4. Intentar abrir esa preparación desde otra cuenta y confirmar el bloqueo.
5. Guardar avance, finalizar preparación y verificar `preparado_por`.
6. Crear un caso especial y comprobar su historial.
7. Recibir una orden y un lote desde Liquidación usando las RPC V9.3.9.3.

## Fuera de alcance

- La migración de `xlsx` requiere sustituir la librería y validar importaciones y
  exportaciones; no se mezcló con este endurecimiento operativo.
- El cierre de cobros posteriores de clientes a crédito requiere primero definir
  el modelo contable.
- La optimización de históricos se abordará con métricas de volumen real.

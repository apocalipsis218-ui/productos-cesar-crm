# Auditoría del módulo Validación y entrega a delivery

**Proyecto revisado:** Productos César CRM V9.2.10  
**Versión corregida:** V9.2.11  
**Alcance:** interfaz, eventos, modales, selección de lote y flujo simulado sin escribir en la base real.

## Diagnóstico principal

El módulo dibujaba correctamente los botones **Ver**, **Reabrir**, **Reabrir facturación** y **Validar individual**, y las funciones correspondientes sí existían. El problema era que `renderValidacion()` solamente ejecutaba `bindValidationBatch(c, orders)`.

Los cuatro botones anteriores dependen del enlazador general `bindDynamic()`. Como ese enlazador no se ejecutaba al renderizar Validación, los botones aparecían en pantalla, pero no tenían evento `onclick`.

### Corrección aplicada

Después de dibujar y enlazar los controles del lote, el módulo ahora ejecuta:

```js
bindValidationBatch(c, orders);
bindDynamic();
```

No fue necesario cambiar tablas, políticas, funciones de Supabase ni ejecutar SQL.

## Mapa completo de controles

| Zona | Control | Función esperada | Estado V9.2.10 | Estado V9.2.11 |
|---|---|---|---|---|
| Barra superior en vivo | Actualizar ahora | Recargar datos con `refreshLiveData()` | Conectado | Conectado |
| Barra superior en vivo | Sonido activo | Activar/desactivar avisos sonoros | Conectado | Conectado |
| Barra superior en vivo | Limpiar avisos | Vaciar avisos y contador | Conectado | Conectado |
| Lote | Selector de delivery | Guardar delivery del borrador | Conectado | Conectado |
| Lote | Buscar cliente | Filtrar y volver a dibujar el módulo | Conectado | Conectado |
| Lote | Seleccionar visibles | Marcar las órdenes visibles | Conectado | Conectado |
| Lote | Limpiar | Desmarcar órdenes y limpiar pesos del borrador | Conectado | Conectado |
| Lote | Vista hoja de ruta | Generar vista imprimible sin guardar el lote | Conectado | Conectado |
| Lote | Crear lote y asignar | Guardar lote, pesos, delivery, estado e historial | Conectado | Conectado |
| Fila del lote | Cotejo | Habilitar el peso y sumar la selección | Conectado | Conectado |
| Fila del lote | Peso entregado | Validar diferencia y actualizar resumen | Conectado | Conectado |
| Fila del lote | Ver | Abrir trazabilidad de la orden | **Desconectado** | **Corregido** |
| Fila del lote | Reabrir | Devolver la orden a Facturación con motivo | **Desconectado** | **Corregido** |
| Validación individual | Reabrir facturación | Abrir modal de devolución a Facturación | **Desconectado** | **Corregido** |
| Validación individual | Validar individual | Abrir modal de peso, validador y delivery | **Desconectado** | **Corregido** |
| Validación individual | Ver | Abrir trazabilidad de la orden | **Desconectado** | **Corregido** |

## Simulación realizada

Se ejecutó una simulación en Chromium usando las funciones reales extraídas de `src/main.js`, con Supabase reemplazado por respuestas de prueba para evitar modificar información real.

### Resultado antes de la corrección

Al pulsar los cinco botones genéricos del módulo, se registraron **0 acciones**. Esto confirmó que estaban visibles pero sin conexión.

### Resultado después de la corrección

- **Ver:** 2 de 2 aperturas simuladas correctamente.
- **Reabrir / Reabrir facturación:** 2 de 2 aperturas simuladas correctamente.
- **Validar individual:** 1 de 1 apertura simulada correctamente.
- Todos los controles de lote recibieron sus eventos.
- La simulación de **Crear lote y asignar** ejecutó: guardar lote formal, actualizar orden, registrar historial, generar hoja de ruta, limpiar borrador, recargar y mostrar confirmación.

## Archivos modificados

- `src/main.js`: conexión de `bindDynamic()` dentro de `renderValidacion()` y actualización visible de versión.
- `package.json` y `package-lock.json`: versión 9.2.11.
- `index.html`: título actualizado a V9.2.11.
- `README.md` y `DEPLOY_CLOUDFLARE.md`: notas de versión.
- `tests/auditoria_validacion.mjs`: prueba estática repetible de conexiones.

## Validaciones técnicas

- Sintaxis de `src/main.js`: aprobada con `node --check`.
- Auditoría estática de selectores y eventos: aprobada.
- Simulación de clics en Chromium: aprobada.
- No se realizaron escrituras en la base de datos real.

## Prueba de aceptación recomendada

1. Entrar al módulo Validación.
2. Pulsar **Ver** en la tabla superior y cerrar el modal.
3. Pulsar **Reabrir** y comprobar que solicite un motivo; cancelar sin guardar durante la prueba.
4. Pulsar **Validar individual** y comprobar que abra el formulario.
5. Seleccionar una orden, introducir el peso cuando corresponda y usar **Vista hoja de ruta**.
6. Crear un lote real solamente cuando el delivery y los pesos estén confirmados.

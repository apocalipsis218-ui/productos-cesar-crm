# V9.3.8.2 — Estados y campos protegidos

## Objetivo

Mover la autoridad del flujo operativo desde el navegador hacia Supabase. Una
persona ya no puede saltar etapas válidas modificando directamente una
solicitud desde las herramientas del navegador.

## Controles

| Control | Implementación |
|---|---|
| Transiciones | Catálogo `orden_transiciones_v9382` |
| Concurrencia | Estado anterior obligatorio y bloqueo `FOR UPDATE` |
| Auditoría | Estado e historial dentro de la misma RPC |
| Identidad | Código, ID, creador y fecha de creación inmutables |
| Preparación | Campos restringidos por módulo |
| Facturación | Monto, factura y peso protegidos |
| Validación | Responsable y peso final protegidos |
| Liquidación | Resultado, cobrado y pendiente protegidos |

## Operaciones centralizadas

- `cambiar_estado_orden_v9382`
- `liberar_orden_v9382`
- Trigger `pc_validar_transicion_orden_v9382`

## Compatibilidad

Incluye estados normales, retiros en negocio, validación, delivery,
liquidación, reversiones de lote y edición auditada de composición. El SQL es
aditivo y no destruye información.

## Auditoría

- Prueba específica V9.3.8.2.
- Suite histórica completa.
- Validación sintáctica de JavaScript.
- Compilación de producción.

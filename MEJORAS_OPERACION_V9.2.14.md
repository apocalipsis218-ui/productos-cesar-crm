# Mejoras V9.2.14 — Operación y tiempos

## Alcance aplicado

1. Cálculo de tiempo laborable real para cronómetros y reportes.
2. Horario predeterminado de Productos César:
   - Lunes a sábado: 7:00–12:00 y 14:00–17:00.
   - Domingo: 7:00–12:00.
3. Descuento automático del almuerzo, horas cerradas y feriados configurados.
4. SLA configurable por etapa desde Configuración → Alertas:
   - Carnicería.
   - Facturación.
   - Validación.
   - Delivery.
   - Liquidación.
5. Los avisos amarillos aparecen al 70% del SLA y los rojos al superarlo.
6. Reporte de cumplimiento SLA por etapa con promedio, mediana, máximo y porcentaje de cumplimiento.
7. Detección de órdenes detenidas en su etapa actual.
8. Detección de reaperturas mediante retrocesos en el historial de estados o comentarios de reapertura.
9. Las reaperturas pueden excluirse del promedio principal para evitar distorsiones.
10. Detección de casos extremos combinando umbral estadístico y múltiplo configurable del SLA.
11. Identificación automática del principal cuello de botella.
12. Modales detallados con tiempo laborable, tiempo calendario, SLA y calidad de cada caso.

## Configuración

Abra **Configuración → Alertas** para cambiar horario, feriados, SLA y factor de caso extremo.

## Base de datos

No requiere SQL nuevo. La configuración se guarda en `sistema_configuracion` usando la clave existente `alertas` y también se conserva localmente como respaldo.

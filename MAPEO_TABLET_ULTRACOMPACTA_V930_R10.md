# Productos César CRM — V9.3.0 R10

## Objetivo
Reducir el desplazamiento y la altura de los formularios operativos en tablet sin cambiar la lógica del CRM ni la presentación amplia de computadora.

## Crear orden en tablet
- Programación distribuida en una cuadrícula compacta.
- Preparación, Facturación y estado automático permanecen en el DOM, pero la información redundante se oculta visualmente en tablet.
- Captura de producto en una fila compacta.
- Total reducido a una barra con cantidad de artículos y total.
- Cada producto agregado se presenta como:
  1. nombre del artículo;
  2. Cantidad / Precio / Subtotal / Quitar;
  3. Observación del artículo.
- Notas adicionales plegadas por defecto en tablet y abiertas en computadora.

## Carnicería en tablet
- Nombre del producto arriba.
- Una sola fila con Solicitado / Preparado / Estado / Faltante.
- Se elimina la línea independiente de “Faltan”.
- La observación aparece debajo solamente cuando existe.
- Sustitución se mantiene oculta hasta elegir el estado Sustituido.

## Alcance responsive
La compactación fuerte se activa automáticamente hasta 1024 px. En pantallas mayores se conserva una vista más espaciosa.

## Base de datos
R10 no requiere SQL nuevo. Conserva los cambios de Supabase instalados hasta R9.

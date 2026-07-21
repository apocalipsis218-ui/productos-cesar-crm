# Productos César CRM — V9.3.0 R7

## Confirmación de órdenes por WhatsApp

### Objetivo
Después de guardar un pedido normal, el sistema ofrece abrir WhatsApp con una confirmación preparada para el cliente. El CRM no envía el mensaje de forma silenciosa: el empleado revisa el contenido y pulsa Enviar dentro de WhatsApp.

### Información incluida
- contacto y negocio;
- código de orden;
- fecha de recepción;
- fecha y hora prevista de despacho;
- producto, cantidad y unidad;
- nota de programación autorizada para el cliente.

### Información excluida
- precio unitario;
- subtotal;
- total estimado o facturado;
- factura;
- crédito, límite o balance;
- notas internas.

### Configuración
En `Configuración → WhatsApp`:
- activar/desactivar la oferta después de guardar;
- activar/desactivar el botón manual de reenvío;
- editar la plantilla con variables permitidas;
- revisar una vista previa sin abrir WhatsApp.

### Flujo
1. La orden se guarda completamente en Supabase.
2. El CRM vuelve a cargar la orden con sus productos.
3. Si la función está activa y el cliente tiene teléfono, aparece una vista previa.
4. El empleado elige `Abrir WhatsApp` o `Ahora no`.
5. Al abrir WhatsApp se registra `WhatsApp preparado`, sin afirmar que fue enviado o entregado.

### Actualizaciones y reenvíos
- Una orden nueva usa confirmación normal.
- Una orden editada muestra `ACTUALIZACIÓN DE ORDEN`.
- Trazabilidad de orden incluye el botón `WhatsApp orden` para reenvío manual.

### Protección operativa
- No funciona con órdenes anuladas.
- Solo aplica a `Pedido normal`.
- No crea ni duplica órdenes.
- No cambia el estado operativo.
- La auditoría usa estado anterior = estado nuevo, por lo que no reinicia los relojes R4.
- No requiere SQL nuevo; usa la tabla existente `sistema_configuracion` para la clave `whatsapp`.

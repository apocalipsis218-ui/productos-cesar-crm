# Productos César CRM — V9.3.0 R9

## Vinculación de Usuarios con Empleados

### Problema resuelto
`perfiles` y `empleados_operativos` se administraban por separado. El nombre operativo era texto libre, por lo que dos registros con el mismo nombre no constituían una relación real.

### Diseño R9
- `perfiles.empleado_id` enlaza con `empleados_operativos.id`.
- Un empleado solo puede vincularse a un usuario.
- `tipo_cuenta = empleado` identifica accesos personales.
- `tipo_cuenta = estacion` identifica accesos compartidos.
- El nombre del usuario personal se sincroniza desde Empleados.
- Desactivar un empleado desactiva su acceso, sin borrar historial.
- Reactivar el empleado no reactiva automáticamente el usuario.

### Usuarios
- KPI de vinculados, personales sin empleado y estaciones.
- Filtro por estado de vinculación.
- Selector de empleado.
- Rol sugerido según área, sin imponerlo.
- Permisos personalizados conservados.

### Empleados
- Muestra el correo y rol del usuario vinculado.
- Botón Ver usuario.
- Botón Vincular usuario cuando no tiene acceso.
- Advertencia al desactivar un empleado con acceso activo.

### Seguridad
- Guardado transaccional mediante `actualizar_usuario_permisos_v930r9`.
- Prevención de vínculo duplicado.
- Protección contra autobloqueo administrativo.
- Historial antes/después en `usuarios_permisos_historial`.

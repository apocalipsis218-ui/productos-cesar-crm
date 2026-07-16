# Mapeo completo - Configuración > Usuarios
## Productos César CRM V9.2.13 revisado para V9.2.14

## 1. Diagnóstico principal

El botón **Editar** se renderiza y recibe un evento, pero ese evento llama a `openUserPerms(...)`. En la V9.2.13 y en el primer paquete V9.2.14 esa función no existe. El navegador produce un error JavaScript equivalente a:

```text
ReferenceError: openUserPerms is not defined
```

Por eso el botón se ve habilitado, pero no abre ninguna ventana ni guarda cambios.

## 2. Flujo actual del módulo

### Fuentes de datos

- `perfiles`: nombre, rol, vendedor/nombre operativo, activo e ID del usuario.
- `modulos_sistema`: catálogo de módulos disponibles.
- `roles_permisos`: acceso base por rol y módulo.
- `usuario_modulos`: excepciones personalizadas por usuario.
- `auth.users`: credencial, correo y contraseña; no debe consultarse directamente desde el navegador.

### Permiso de entrada

- El usuario debe poder ver Configuración para entrar al módulo.
- Para habilitar **Editar**, debe tener `Configuración = editar`.
- El rol Gerente recibe edición total en el frontend.

### Elementos visibles antes de la corrección

1. KPI de perfiles registrados.
2. KPI de usuarios activos.
3. KPI de usuarios inactivos.
4. Tabla de perfiles.
5. Resumen de acceso final.
6. Estado activo/inactivo.
7. Botón Editar.
8. Mapa base de roles.
9. Guía para crear login.

## 3. Fallas encontradas

### Crítica

- `openUserPerms` no existe: imposibilita editar cualquier perfil.

### Altas

- La pantalla conserva etiquetas antiguas `V8.4` y referencias a una futura `V5.6`.
- Los módulos nuevos `Alertas`, `Kanban`, `Productividad`, `Reportes` y `Auditoría` no estaban sembrados en los SQL antiguos de permisos.
- No existe una operación transaccional que actualice perfil y permisos como una sola unidad.
- No existe historial específico de cambios de rol/permisos.
- No existe protección contra desactivar el propio usuario administrador o quitarse Configuración = editar.
- El correo de otros usuarios no aparece porque `perfiles` no lo almacena y el frontend no debe leer `auth.users`.

### Medias

- No hay búsqueda ni filtros por rol/estado.
- El mapa base no incluye Vendedor ni Cobrador, aunque esos roles existen en instalaciones anteriores.
- No se diferencia claramente entre permiso heredado del rol y permiso personalizado.
- El ID UUID se muestra como identificación principal, poco amigable para administración.
- No hay contador de excepciones personalizadas por usuario.

## 4. Diseño corregido

### Pantalla principal

- KPI: perfiles registrados.
- KPI: usuarios activos.
- KPI: permisos personalizados.
- Búsqueda por nombre, correo, rol o ID.
- Filtro por rol.
- Filtro por estado.
- Botón Actualizar.
- Botón Guía crear login.
- Tabla con:
  - usuario;
  - rol;
  - acceso final;
  - cantidad de permisos personalizados;
  - estado;
  - acción Editar.

### Modal Editar usuario y módulos

- Nombre visible.
- Correo/identificación de solo lectura.
- Rol base.
- Nombre operativo relacionado.
- Estado activo/inactivo.
- Matriz de todos los módulos.
- Para cada módulo:
  - permiso base del rol;
  - permiso personalizado;
  - acceso final calculado.
- Opciones:
  - Heredar del rol.
  - Sin acceso.
  - Solo ver.
  - Editar.
- Botón para restablecer todo a Heredar.
- Protección contra autobloqueo.

## 5. Guardado y seguridad

La vía principal es la función RPC:

```text
actualizar_usuario_permisos_v9214
```

Esta función:

1. valida la sesión;
2. comprueba Configuración = editar;
3. valida usuario, rol, módulos y niveles;
4. evita autobloqueo;
5. actualiza el perfil;
6. reemplaza las excepciones personalizadas;
7. registra antes/después en `usuarios_permisos_historial`;
8. confirma todo dentro de una sola transacción.

El frontend conserva un guardado directo de respaldo para instalaciones donde la función RPC todavía no se ha ejecutado, pero se recomienda instalar el SQL para tener atomicidad e historial.

## 6. Qué no hace el módulo

- No crea contraseñas desde el navegador.
- No utiliza `service_role` en el frontend.
- No elimina credenciales de Supabase Auth.
- No cambia el correo de Authentication.

La creación inicial de una credencial sigue realizándose en Supabase Authentication. Luego se administra su perfil y sus módulos desde el CRM.

## 7. Pruebas incluidas

El archivo `tests/auditoria_usuarios_v9214.mjs` verifica:

- que el botón Editar tenga función real;
- que exista la matriz de permisos;
- que exista Heredar del rol;
- que exista guardado RPC;
- que exista guardado de respaldo;
- que exista protección contra autobloqueo;
- que el SQL incluya los 16 módulos;
- que exista historial de cambios.

El proyecto completo también pasó:

```text
npm test
npm run build
```

## 8. Recomendaciones siguientes

1. Crear usuarios mediante una Edge Function segura, no desde el HTML público.
2. Agregar envío de invitación o recuperación de contraseña por correo.
3. Relacionar cada perfil con `empleados_operativos` mediante un ID estable.
4. Agregar vista de historial de permisos dentro del CRM.
5. Mostrar último acceso usando una función segura y restringida.
6. Requerir confirmación adicional al cambiar un rol administrativo.

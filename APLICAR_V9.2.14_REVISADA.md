
## Corrección del diagnóstico

Use el archivo `DIAGNOSTICO_MODULO_USUARIOS_V9.2.14.sql` incluido en esta revisión V2.
La versión anterior consultaba `perfiles.correo` antes de crear esa columna y podía mostrar
el error `column p.correo does not exist`. Ese error era de solo lectura y no modificaba datos.

# Aplicar V9.2.14 revisada - Operación, tiempos y Usuarios

> No aplique el parche V9.2.14 anterior. Use solamente el parche revisado que incluye la corrección de Usuarios.

## A. Antes de reemplazar archivos

1. En GitHub Desktop pulse **Fetch origin** y, si aparece, **Pull origin**.
2. Confirme **No local changes**.
3. En Visual Studio Code guarde todo con `Ctrl + S`.
4. Detenga Vite con `Ctrl + C`.

## B. Actualizar Supabase

1. Abra Supabase.
2. Entre en **SQL Editor**.
3. Abra el archivo:

```text
supabase/DIAGNOSTICO_MODULO_USUARIOS_V9.2.14.sql
```

4. Ejecútelo y guarde los resultados si aparecen perfiles/credenciales faltantes.
5. Abra y ejecute completo:

```text
supabase/24_actualizacion_v9214_usuarios_permisos.sql
```

6. Al final debe devolver `modulos_v9214 = 16`.
7. Vuelva a ejecutar el diagnóstico. Las funciones `puede_configurar_usuarios_v9214` y `actualizar_usuario_permisos_v9214` deben aparecer.

## C. Reemplazar el código

1. Descomprima `PARCHE_V9.2.14_REVISADA_Usuarios_Operacion.zip`.
2. Copie todo dentro de:

```text
C:\Proyectos\productos-cesar-crm
```

3. Seleccione **Reemplazar los archivos en el destino**.
4. No borre `.git` ni `.env.local`.

## D. Instalar y probar

Ejecute:

```powershell
npm.cmd install
npm.cmd test
npm.cmd run dev
```

Compruebe:

1. Configuración > Usuarios abre correctamente.
2. El botón Editar abre el modal.
3. Cambiar el nombre de un usuario y guardar.
4. Cambiar un permiso a Solo ver y comprobar el acceso final.
5. Restablecer el permiso a Heredar.
6. Desactivar y reactivar un usuario de prueba.
7. Verificar que el propio Gerente no pueda desactivarse ni quitarse Configuración = editar.
8. Revisar Reportes y Configuración > Alertas para las mejoras de operación y SLA.

## E. Guardar en GitHub

En GitHub Desktop:

```text
Summary: V9.2.14 - Operación, tiempos y usuarios
```

Luego pulse:

```text
Commit to main
Push origin
```

## F. Si algo falla

- `openUserPerms is not defined`: no se reemplazó correctamente `src/main.js`.
- `Could not find function actualizar_usuario_permisos_v9214`: falta ejecutar el SQL 24 o refrescar el esquema de Supabase.
- `No tienes permiso`: confirme que el usuario actual tenga rol Gerente o Configuración = editar.
- El correo no aparece: ejecute nuevamente el SQL 24 para sincronizar `perfiles.correo` desde Auth.

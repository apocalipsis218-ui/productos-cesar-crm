# HOTFIX V9.3.0 R2 — Login y recuperación de contraseña

## Qué corrige

- Muestra el identificador del proyecto Supabase conectado.
- Aclara cuando Supabase rechaza el correo o la contraseña.
- Completa el flujo de recuperación de contraseña.
- Permite crear una contraseña nueva al abrir el enlace recibido por correo.
- No modifica órdenes, clientes, usuarios ni tablas de Supabase.

## Aplicación

1. Detenga Vite con `Ctrl + C`.
2. Copie el contenido de este hotfix dentro de:
   `C:\Proyectos\productos-cesar-crm`
3. Acepte reemplazar los archivos.
4. Ejecute:

```powershell
npm.cmd install
npm.cmd test
npm.cmd run dev
```

5. En el login, confirme que al pie aparezca:
   `Proyecto conectado: jmcbaduxjrzfnesbslmp`
6. Pruebe el acceso.
7. Si continúa rechazando la contraseña, pulse `Recuperar contraseña`.
8. Abra el correo recibido y establezca una contraseña nueva.

## Configuración necesaria en Supabase

En Authentication > URL Configuration > Redirect URLs, agregue:

- `http://localhost:5173/**`
- La dirección pública de Cloudflare, por ejemplo `https://SU-DOMINIO.pages.dev/**`

## Commit recomendado

`V9.3.0 R2 - Login y recuperación de contraseña`

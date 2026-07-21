# Productos César CRM · V9.3.1 PWA

Esta versión convierte el CRM V9.3.0 R10.1 en una aplicación web instalable.

## Qué incorpora

- Manifest de aplicación con nombre e iconos de Productos César.
- Apertura en modo `standalone`, sin la interfaz normal del navegador.
- Botón **Instalar aplicación** cuando el dispositivo lo permita.
- Aviso controlado cuando existe una nueva versión.
- Comprobación de actualización al abrir la app y cada hora.
- Estructura principal disponible ante una interrupción de internet.
- Bloqueo operativo cuando no hay conexión, para evitar movimientos sin confirmar en Supabase.
- Consultas de Supabase configuradas como `NetworkOnly`; no se guardan datos del negocio en caché.

## Instalación local

Desde `C:\proyectos\productos-cesar-crm`:

```powershell
npm.cmd install
npm.cmd test
npm.cmd run build
npm.cmd run dev
```

## Publicación

Sube el contenido generado dentro de `dist` a Cloudflare, igual que las versiones anteriores.

## Instalación en la tablet

1. Abre la URL publicada en Chrome.
2. Espera el botón **Instalar aplicación**, o abre el menú de Chrome.
3. Pulsa **Instalar aplicación** o **Añadir a pantalla de inicio**.
4. Abre **Productos César** desde su icono.

## Actualizaciones

Cuando Cloudflare tenga una compilación nueva, la aplicación mostrará:

`Nueva versión disponible` → **Actualizar ahora**.

## Nota operativa

La primera PWA no guarda órdenes sin internet. Cuando la conexión falla, bloquea la operación hasta restablecerla.

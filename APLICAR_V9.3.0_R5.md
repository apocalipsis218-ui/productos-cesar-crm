# Aplicación V9.3.0 R5

## Orden obligatorio

1. Confirmar en GitHub Desktop: `main` y `No local changes`.
2. Detener Vite con `Ctrl + C`.
3. Ejecutar en Supabase SQL Editor el archivo `supabase/25_actualizacion_v930r5_historial_validacion.sql`.
4. Aplicar el parche R5 dentro de `C:\proyectos\productos-cesar-crm`.
5. Ejecutar:

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run dev
```

## Pruebas manuales

- Abrir Validación → Historial de entregas.
- Confirmar que inicia en la fecha actual.
- Filtrar por delivery y buscar lote/orden/factura/cliente.
- Reimprimir una hoja de ruta y comprobar la marca COPIA / REIMPRESIÓN.
- Imprimir una constancia.
- Imprimir el reporte del día.
- Verificar que ninguna impresión cambie el estado ni reinicie los relojes.

## Commit recomendado

`V9.3.0 R5 - Historial de entregas y reimpresión en Validación`

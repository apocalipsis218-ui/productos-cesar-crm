# HOTFIX V9.2.14 R3 — Carga del módulo Reportes

## Problema corregido

El módulo Reportes podía mostrar:

`Cannot read properties of null (reading 'minutes')`

La causa era una orden activa con fecha de entrada a etapa ausente o inválida.
El cálculo generaba `null` y luego intentaba leer la propiedad `minutes`.

## Corrección aplicada

- Descarta filas nulas antes de evaluar el SLA.
- Descarta duraciones no numéricas.
- Mantiene las órdenes válidas en el análisis.
- Agrega una comprobación automática para evitar que el error reaparezca.

## No requiere

- No requiere SQL.
- No modifica Supabase.
- No modifica usuarios, órdenes ni historiales.
- No borra `.env.local` ni `.git`.

## Aplicación

1. Detener Vite con `Ctrl + C`.
2. Copiar las carpetas `src` y `tests` dentro del repositorio:
   `C:\Proyectos\productos-cesar-crm`
3. Aceptar reemplazar los dos archivos.
4. Ejecutar:

```powershell
npm.cmd test
npm.cmd run dev
```

5. Abrir Reportes y comprobar que cargue.

## Commit recomendado

`V9.2.14 R3 - Corrige carga del módulo Reportes`

# Aplicar V9.3.3

## 1. Base de datos

Ejecuta primero en Supabase SQL Editor:

`supabase/27_actualizacion_v933_retiros_ventas_internas.sql`

No publiques el frontend antes de que el SQL termine sin errores, porque la versión usa columnas nuevas de `ordenes`.

## 2. Validación local

```powershell
cd C:\proyectos\productos-cesar-crm
npm.cmd test
npm.cmd run build
```

La última línea de pruebas debe indicar:

`Auditoría Retiros, Ventas Internas e Impresión V9.3.3 aprobada.`

## 3. Publicación

```powershell
npx.cmd wrangler deploy
```

## 4. PWA

Guarda las órdenes abiertas y pulsa **Actualizar ahora**. No es necesario reinstalar la aplicación.

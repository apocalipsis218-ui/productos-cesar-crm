# Hotfix V9.3.0 R1 — módulos analíticos faltantes

## Error corregido

Vite mostraba:

`Failed to resolve import "./operationAnalytics.js" from "src/main.js"`

El parche original V9.3.0 no incluyó dos archivos que `main.js` necesita:

- `src/operationAnalytics.js`
- `src/salesAnalytics.js`

## Aplicación

1. Detenga Vite con `Ctrl + C`.
2. Copie la carpeta `src` de este hotfix dentro de:
   `C:\Proyectos\productos-cesar-crm`
3. Acepte reemplazar o combinar la carpeta.
4. Confirme que existan:
   - `src\operationAnalytics.js`
   - `src\salesAnalytics.js`
5. Ejecute:

```powershell
npm.cmd test
npm.cmd run dev
```

## No requiere

- No requiere SQL.
- No modifica Supabase.
- No altera `.env.local` ni `.git`.

## Commit recomendado

`V9.3.0 R1 - Agrega módulos analíticos faltantes`

# HOTFIX V9.3.7.1

Antes de ejecutar el instalador, corre en Supabase:

`SQL_31_V9.3.7.1_RESPONSABLES_TRANSFERENCIAS.sql`

Después coloca este HOTFIX dentro de:

`C:\proyectos\productos-cesar-crm`

y ejecuta:

```powershell
powershell -ExecutionPolicy Bypass -File ".\HOTFIX_V9.3.7.1_RESPONSABLES_TRANSFERENCIAS\APLICAR_V9371.ps1"
```

El instalador no publica automáticamente. Primero prueba en localhost.

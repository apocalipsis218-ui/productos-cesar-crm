# Aplicar V9.2.12 en el repositorio de GitHub

1. Detén Vite con `Ctrl + C`.
2. Verifica en GitHub Desktop que la V9.2.11 esté sincronizada.
3. Copia el contenido del parche dentro de `C:\Proyectos\productos-cesar-crm` y acepta reemplazar archivos.
4. No borres la carpeta `.git` ni tu archivo `.env.local`.
5. En Visual Studio Code ejecuta:

```powershell
npm.cmd run test
npm.cmd run dev
```

6. Prueba Kanban: últimas 10 cerradas, Mostrar 10 más, ocultar, historial, filtros y Ver.
7. En GitHub Desktop crea el commit:

`V9.2.12 - Kanban optimizado`

8. Pulsa `Push origin`.

No requiere ejecutar SQL en Supabase.

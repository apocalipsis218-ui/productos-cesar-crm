# V9.3.0 R3 — Corrección integral de interfaz móvil

## Correcciones principales

- La barra inferior reserva espacio y se oculta al abrir modales.
- El bloque En vivo es más compacto y usa acciones por iconos.
- Productos y Productividad usan fichas móviles en vez de tablas horizontales.
- Kanban elimina la altura fija y el scroll interno en celular.
- Crear orden ya no tiene el botón Guardar cubriendo campos.
- Configuración muestra cada ajuste en una fila separada.
- Encabezados ejecutivos y acciones se acomodan en dos columnas.
- Alertas corrige contraste y versión visible.
- Estados vacíos, KPI, campos y tarjetas usan menor altura.

## Aplicación

1. Detén Vite con `Ctrl + C`.
2. Copia el contenido del parche dentro de `C:\Proyectos\productos-cesar-crm`.
3. Acepta reemplazar archivos. No borres `.git` ni `.env.local`.
4. Ejecuta:

```powershell
npm.cmd install
npm.cmd test
npm.cmd run build
npm.cmd run dev
```

## Supabase

No requiere SQL ni cambios en Supabase.

## Commit recomendado

`V9.3.0 R3 - Corrección integral de interfaz móvil`

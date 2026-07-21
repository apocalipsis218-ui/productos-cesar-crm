# Aplicar V9.3.0 R6

1. Detenga Vite con `Ctrl + C`.
2. Descomprima el HOTFIX dentro del proyecto.
3. Ejecute:

```powershell
powershell -ExecutionPolicy Bypass -File ".\HOTFIX_V9.3.0_R6_AGENDA_ORDENES\APLICAR_V930_R6.ps1"
```

4. Pruebe:

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run dev
```

No requiere SQL. Prueba funcional: seleccione un cliente pendiente, cree una orden normal desde Órdenes y confirme que desaparezca de Pendientes y aparezca en Gestionados con el botón Ver pedido.

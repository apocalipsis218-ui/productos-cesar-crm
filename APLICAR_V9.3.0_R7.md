# Aplicar V9.3.0 R7

1. Detenga Vite con `Ctrl + C`.
2. Descomprima el HOTFIX dentro de `C:\proyectos\productos-cesar-crm`.
3. Ejecute:

```powershell
powershell -ExecutionPolicy Bypass -File ".\HOTFIX_V9.3.0_R7_WHATSAPP_ORDENES\APLICAR_V930_R7.ps1"
```

4. Pruebe:

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run dev
```

No requiere SQL.

Prueba funcional: en `Configuración → WhatsApp`, deje activa la confirmación. Cree una orden normal para un cliente con teléfono. Después de guardar debe aparecer la vista previa, sin precios ni monto. Pulse `Abrir WhatsApp`, revise el mensaje y envíelo manualmente.

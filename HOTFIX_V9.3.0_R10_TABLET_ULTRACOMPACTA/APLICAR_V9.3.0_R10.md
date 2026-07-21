# Aplicar V9.3.0 R10

1. Confirma que tu proyecto ya esté en V9.3.0 R9.
2. Detén Vite con `Ctrl + C`.
3. Descomprime el HOTFIX en la raíz del proyecto.
4. Ejecuta:

```powershell
powershell -ExecutionPolicy Bypass -File ".\HOTFIX_V9.3.0_R10_TABLET_ULTRACOMPACTA\APLICAR_V930_R10.ps1"
```

5. Valida:

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run dev
```

R10 no requiere SQL nuevo. El SQL 26 corregido de R9 debe haberse ejecutado para la vinculación de usuarios y empleados.

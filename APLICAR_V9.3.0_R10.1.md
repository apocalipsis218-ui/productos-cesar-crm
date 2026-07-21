# Aplicar V9.3.0 R10.1

1. Descomprima el HOTFIX dentro de `C:\proyectos\productos-cesar-crm`.
2. Ejecute:

```powershell
powershell -ExecutionPolicy Bypass -File ".\HOTFIX_V9.3.0_R10.1_CARNICERIA_ULTRACOMPACTA\APLICAR_V930_R10_1.ps1"
```

3. Valide:

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run dev
```

No requiere SQL nuevo.

# Aplicar V9.3.7.1

## Orden obligatorio

### 1. Ejecutar SQL 31 en Supabase

Archivo:

`supabase/31_actualizacion_v9371_responsables_transferencias.sql`

El resultado final debe mostrar en `true`:

- `responsable_formal`
- `tabla_transferencias`
- `rpc_crear_lote`
- `rpc_transferir`
- `rpc_corregir_sincronizado`

### 2. Aplicar el HOTFIX

Desde `C:\proyectos\productos-cesar-crm`:

```powershell
Expand-Archive `
  -Path ".\HOTFIX_V9.3.7.1_RESPONSABLES_TRANSFERENCIAS.zip" `
  -DestinationPath "." `
  -Force

powershell -ExecutionPolicy Bypass `
  -File ".\HOTFIX_V9.3.7.1_RESPONSABLES_TRANSFERENCIAS\APLICAR_V9371.ps1"
```

El instalador crea respaldo, revisa sintaxis, ejecuta todas las auditorías y compila producción.

### 3. Probar localmente

```powershell
npm.cmd run dev
```

Revisar:

- responsable manual en Validación;
- responsable manual visible en Delivery;
- responsable manual visible en Liquidación;
- transferencia individual desde Historial de Validación;
- recálculo del lote original;
- nuevo lote `TRF-...`;
- bloqueo de una orden ya recibida.

### 4. Publicar

```powershell
npx.cmd wrangler deploy
```

### 5. GitHub Desktop

Resumen recomendado:

`V9.3.7.1 - Responsables manuales y transferencias de pedidos`

No subir `.env.local`, `node_modules`, `dist`, respaldos ni ZIP de HOTFIX.

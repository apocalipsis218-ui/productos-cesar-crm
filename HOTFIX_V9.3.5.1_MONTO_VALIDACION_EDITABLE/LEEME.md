# HOTFIX V9.3.5.1

Corrige Validación para que el monto final de factura sea editable y obligatorio:

- Por lote: cada fila incluye un campo editable de monto.
- Individual: el modal incluye `Monto final de factura`.
- El monto confirmado actualiza `ordenes.total_factura`.
- Ese valor pasa a lote, Delivery, Liquidación, reportes y recibos.
- No requiere SQL.

## Aplicar

```powershell
Expand-Archive -Path ".\HOTFIX_V9.3.5.1_MONTO_VALIDACION_EDITABLE.zip" -DestinationPath "." -Force
powershell -ExecutionPolicy Bypass -File ".\HOTFIX_V9.3.5.1_MONTO_VALIDACION_EDITABLE\APLICAR_V9351.ps1"
```

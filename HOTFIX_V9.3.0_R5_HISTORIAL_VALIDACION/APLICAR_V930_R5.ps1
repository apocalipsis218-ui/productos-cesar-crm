$ErrorActionPreference = "Stop"
Write-Host ""
Write-Host "Productos Cesar CRM - V9.3.0 R5" -ForegroundColor Cyan
Write-Host "Historial de entregas y reimpresion en Validacion" -ForegroundColor Cyan
Write-Host ""
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
node "$scriptDir\aplicar_r5.mjs"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

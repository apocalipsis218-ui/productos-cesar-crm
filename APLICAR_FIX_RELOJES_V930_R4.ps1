$ErrorActionPreference = "Stop"

Write-Host "" 
Write-Host "Productos Cesar CRM - HOTFIX V9.3.0 R4" -ForegroundColor Cyan
Write-Host "Proteccion de relojes operativos" -ForegroundColor Cyan
Write-Host ""

$ProjectRoot = (Get-Location).Path
$MainFile = Join-Path $ProjectRoot "src\main.js"

if (-not (Test-Path $MainFile)) {
    Write-Host "ERROR: No se encontro src\main.js en:" -ForegroundColor Red
    Write-Host $ProjectRoot -ForegroundColor Yellow
    Write-Host "Abra PowerShell en C:\Proyectos\productos-cesar-crm y vuelva a ejecutar." -ForegroundColor Yellow
    exit 1
}

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$NodePatch = Join-Path $ScriptDir "aplicar_fix_relojes_v930_r4.mjs"

node $NodePatch $ProjectRoot
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "Ejecutando auditoria..." -ForegroundColor Cyan
node .\tests\auditoria_relojes_operativos_v930_r4.mjs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "Listo. Ahora ejecute:" -ForegroundColor Green
Write-Host "npm.cmd test"
Write-Host "npm.cmd run build"
Write-Host "npm.cmd run dev"

$ErrorActionPreference = 'Stop'
Write-Host ""
Write-Host "Productos Cesar CRM - V9.3.0 R10.1" -ForegroundColor Cyan
Write-Host "Ajuste final ultracompacto de Carniceria para tablet" -ForegroundColor Cyan
Write-Host ""

$projectRoot = Split-Path -Parent $PSScriptRoot
$mainPath = Join-Path $projectRoot 'src\main.js'
$stylesPath = Join-Path $projectRoot 'src\styles.css'
$packagePath = Join-Path $projectRoot 'package.json'
$lockPath = Join-Path $projectRoot 'package-lock.json'
$testR10 = Join-Path $projectRoot 'tests\auditoria_tablet_ultracompacta_v930r10.mjs'
$testR101 = Join-Path $projectRoot 'tests\auditoria_carniceria_ultracompacta_v930r101.mjs'

if (!(Test-Path $mainPath)) { throw "No se encontro src\main.js. Descomprima el HOTFIX dentro de C:\proyectos\productos-cesar-crm." }
if (!(Test-Path $stylesPath)) { throw "No se encontro src\styles.css." }
if (!(Test-Path $packagePath)) { throw "No se encontro package.json." }

$current = Get-Content $mainPath -Raw
if (($current -notmatch 'V9\.3\.0 R10') -and ($current -notmatch 'V9\.3\.0 R10\.1')) {
  throw "La base no parece ser V9.3.0 R10/R10.1. No se sobrescribio ningun archivo."
}

$stamp = Get-Date -Format 'yyyy-MM-dd_HH-mm-ss'
$backup = Join-Path $projectRoot ("respaldos\V9.3.0_R10.1_" + $stamp)
New-Item -ItemType Directory -Force -Path (Join-Path $backup 'src') | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $backup 'tests') | Out-Null
Copy-Item $mainPath (Join-Path $backup 'src\main.js') -Force
Copy-Item $stylesPath (Join-Path $backup 'src\styles.css') -Force
Copy-Item $packagePath (Join-Path $backup 'package.json') -Force
if (Test-Path $lockPath) { Copy-Item $lockPath (Join-Path $backup 'package-lock.json') -Force }
if (Test-Path $testR10) { Copy-Item $testR10 (Join-Path $backup 'tests\auditoria_tablet_ultracompacta_v930r10.mjs') -Force }
if (Test-Path $testR101) { Copy-Item $testR101 (Join-Path $backup 'tests\auditoria_carniceria_ultracompacta_v930r101.mjs') -Force }

Copy-Item (Join-Path $PSScriptRoot 'payload\src\main.js') $mainPath -Force
Copy-Item (Join-Path $PSScriptRoot 'payload\src\styles.css') $stylesPath -Force
Copy-Item (Join-Path $PSScriptRoot 'payload\package.json') $packagePath -Force
Copy-Item (Join-Path $PSScriptRoot 'payload\package-lock.json') $lockPath -Force
Copy-Item (Join-Path $PSScriptRoot 'payload\tests\auditoria_tablet_ultracompacta_v930r10.mjs') $testR10 -Force
Copy-Item (Join-Path $PSScriptRoot 'payload\tests\auditoria_carniceria_ultracompacta_v930r101.mjs') $testR101 -Force
Copy-Item (Join-Path $PSScriptRoot 'MAPEO_CARNICERIA_ULTRACOMPACTA_V930_R101.md') (Join-Path $projectRoot 'MAPEO_CARNICERIA_ULTRACOMPACTA_V930_R101.md') -Force
Copy-Item (Join-Path $PSScriptRoot 'APLICAR_V9.3.0_R10.1.md') (Join-Path $projectRoot 'APLICAR_V9.3.0_R10.1.md') -Force

Write-Host "OK: V9.3.0 R10.1 aplicada." -ForegroundColor Green
Write-Host "Respaldo: $backup" -ForegroundColor Yellow
Write-Host ""
Write-Host "No requiere SQL ni cambios en Supabase." -ForegroundColor Yellow
Write-Host "Ejecute ahora:" -ForegroundColor Cyan
Write-Host "  npm.cmd test"
Write-Host "  npm.cmd run build"
Write-Host "  npm.cmd run dev"
Write-Host ""

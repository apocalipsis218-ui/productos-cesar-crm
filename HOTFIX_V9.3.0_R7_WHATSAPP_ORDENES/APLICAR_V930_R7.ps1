$ErrorActionPreference = 'Stop'

Write-Host ''
Write-Host 'Productos Cesar CRM - V9.3.0 R7' -ForegroundColor Cyan
Write-Host 'Confirmacion de ordenes por WhatsApp sin precios ni montos' -ForegroundColor Cyan
Write-Host ''

$projectRoot = Split-Path -Parent $PSScriptRoot
$payload = Join-Path $PSScriptRoot 'payload'
$mainFile = Join-Path $projectRoot 'src\main.js'
$stylesFile = Join-Path $projectRoot 'src\styles.css'
$packageFile = Join-Path $projectRoot 'package.json'
$packageLockFile = Join-Path $projectRoot 'package-lock.json'
$testFile = Join-Path $projectRoot 'tests\auditoria_whatsapp_ordenes_v930r7.mjs'

if (-not (Test-Path $mainFile)) { throw "No se encontro src\main.js en: $projectRoot" }
if (-not (Test-Path $stylesFile)) { throw "No se encontro src\styles.css en: $projectRoot" }
if (-not (Test-Path $packageFile)) { throw "No se encontro package.json en: $projectRoot" }
if (-not (Test-Path (Join-Path $payload 'src\main.js'))) { throw 'El HOTFIX esta incompleto: falta payload\src\main.js' }

$current = Get-Content $mainFile -Raw
if ($current -match 'V9\.3\.0 R7.*Confirmaci[oó]n de [oó]rdenes por WhatsApp') {
  Write-Host 'La V9.3.0 R7 ya esta aplicada. No se realizaron cambios.' -ForegroundColor Yellow
  exit 0
}
if ($current -notmatch 'V9\.3\.0 R6 - agenda comercial unificada') {
  throw 'Este HOTFIX espera la base V9.3.0 R6. Actualice primero a R6 o revise la version del proyecto.'
}

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupRoot = Join-Path $projectRoot ("backups\V9.3.0_R7_" + $stamp)
New-Item -ItemType Directory -Path (Join-Path $backupRoot 'src') -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $backupRoot 'tests') -Force | Out-Null

Copy-Item $mainFile (Join-Path $backupRoot 'src\main.js') -Force
Copy-Item $stylesFile (Join-Path $backupRoot 'src\styles.css') -Force
Copy-Item $packageFile (Join-Path $backupRoot 'package.json') -Force
if (Test-Path $packageLockFile) { Copy-Item $packageLockFile (Join-Path $backupRoot 'package-lock.json') -Force }

try {
  Copy-Item (Join-Path $payload 'src\main.js') $mainFile -Force
  Copy-Item (Join-Path $payload 'src\styles.css') $stylesFile -Force
  Copy-Item (Join-Path $payload 'package.json') $packageFile -Force
  Copy-Item (Join-Path $payload 'package-lock.json') $packageLockFile -Force
  Copy-Item (Join-Path $payload 'tests\auditoria_whatsapp_ordenes_v930r7.mjs') $testFile -Force
  Copy-Item (Join-Path $payload 'MAPEO_WHATSAPP_ORDENES_V930_R7.md') (Join-Path $projectRoot 'MAPEO_WHATSAPP_ORDENES_V930_R7.md') -Force
  Copy-Item (Join-Path $payload 'APLICAR_V9.3.0_R7.md') (Join-Path $projectRoot 'APLICAR_V9.3.0_R7.md') -Force

  Push-Location $projectRoot
  try {
    node tests/auditoria_whatsapp_ordenes_v930r7.mjs
    if ($LASTEXITCODE -ne 0) { throw 'La auditoria R7 no aprobo.' }
  }
  finally { Pop-Location }
}
catch {
  Write-Host ''
  Write-Host 'Fallo la aplicacion. Restaurando respaldo...' -ForegroundColor Red
  Copy-Item (Join-Path $backupRoot 'src\main.js') $mainFile -Force
  Copy-Item (Join-Path $backupRoot 'src\styles.css') $stylesFile -Force
  Copy-Item (Join-Path $backupRoot 'package.json') $packageFile -Force
  if (Test-Path (Join-Path $backupRoot 'package-lock.json')) { Copy-Item (Join-Path $backupRoot 'package-lock.json') $packageLockFile -Force }
  throw
}

Write-Host ''
Write-Host 'V9.3.0 R7 aplicada correctamente.' -ForegroundColor Green
Write-Host "Proyecto: $projectRoot"
Write-Host "Respaldo: $backupRoot"
Write-Host ''
Write-Host 'No requiere SQL.' -ForegroundColor Yellow
Write-Host 'Ejecute ahora:'
Write-Host '  npm.cmd test'
Write-Host '  npm.cmd run build'
Write-Host '  npm.cmd run dev'

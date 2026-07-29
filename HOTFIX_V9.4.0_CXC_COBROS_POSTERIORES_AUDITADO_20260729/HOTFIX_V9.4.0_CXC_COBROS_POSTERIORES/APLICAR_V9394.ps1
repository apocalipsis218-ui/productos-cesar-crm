$ErrorActionPreference = 'Stop'

$hotfixDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectDir = Split-Path -Parent $hotfixDir
$timestamp = Get-Date -Format 'yyyy-MM-dd_HH-mm-ss'
$backupDir = Join-Path $projectDir "backups\V9.3.9.4_$timestamp"
$excludedNames = @('LEEME_V9.3.9.4.txt')

Write-Host 'Productos Cesar CRM - V9.3.9.4 AUDITADA' -ForegroundColor Cyan
Write-Host 'Historial de Facturacion y devoluciones parciales corregidas'

if (-not (Test-Path (Join-Path $projectDir 'package.json'))) {
  throw 'No encontre package.json en la carpeta superior. Extrae el ZIP dentro de C:\Proyectos\productos-cesar-crm.'
}
if (-not (Test-Path (Join-Path $hotfixDir 'supabase\sql\45_actualizacion_v9392_devolucion_parcial_articulos.sql'))) {
  throw 'Paquete incompleto: falta el SQL 45.'
}
if (-not (Test-Path (Join-Path $hotfixDir 'supabase\sql\46_actualizacion_v9392_r2_devolucion_integrada_lote.sql'))) {
  throw 'Paquete incompleto: falta el SQL 46 de la R2.'
}
if (-not (Test-Path (Join-Path $hotfixDir 'supabase\sql\47_actualizacion_v9393_no_entregados_a_validacion.sql'))) {
  throw 'Paquete incompleto: falta el SQL 47.'
}

$files = Get-ChildItem -Path $hotfixDir -Recurse -File | Where-Object {
  $relative = $_.FullName.Substring($hotfixDir.Length).TrimStart('\')
  $_.Name -notin $excludedNames -and
  $relative -notmatch '(^|\\)(node_modules|dist|backups|\.git)(\\|$)' -and
  $_.Name -ne '.env'
}
if ($files.Count -lt 100) {
  throw "Paquete incompleto: solo contiene $($files.Count) archivos sincronizables."
}

New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
foreach ($file in $files) {
  $relative = $file.FullName.Substring($hotfixDir.Length).TrimStart('\')
  $target = Join-Path $projectDir $relative
  if (Test-Path $target) {
    $backupTarget = Join-Path $backupDir $relative
    New-Item -ItemType Directory -Path (Split-Path -Parent $backupTarget) -Force | Out-Null
    Copy-Item $target $backupTarget -Force
  }
}
foreach ($file in $files) {
  $relative = $file.FullName.Substring($hotfixDir.Length).TrimStart('\')
  $target = Join-Path $projectDir $relative
  New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force | Out-Null
  Copy-Item $file.FullName $target -Force
}

Write-Host "Respaldo: $backupDir" -ForegroundColor Yellow
Write-Host "$($files.Count) archivos sincronizados por ruta exacta." -ForegroundColor Green
Write-Host 'El archivo .env no fue reemplazado.' -ForegroundColor Green

Push-Location $projectDir
try {
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js no esta disponible.' }
  node --check .\src\main.js
  if ($LASTEXITCODE -ne 0) { throw 'node --check termino con error.' }
  npm.cmd install
  if ($LASTEXITCODE -ne 0) { throw 'npm install termino con error.' }
  npm.cmd test
  if ($LASTEXITCODE -ne 0) { throw 'npm test termino con error.' }
  npm.cmd run build
  if ($LASTEXITCODE -ne 0) { throw 'npm run build termino con error.' }
}
finally {
  Pop-Location
}

Write-Host ''
Write-Host 'V9.3.9.4 aplicada, auditada y compilada correctamente.' -ForegroundColor Green
Write-Host 'No requiere SQL nuevo. Deben estar aplicados los SQL 45, 46 y 47.' -ForegroundColor Yellow

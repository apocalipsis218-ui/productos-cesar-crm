$ErrorActionPreference = 'Stop'

$hotfixDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectDir = Split-Path -Parent $hotfixDir
$timestamp = Get-Date -Format 'yyyy-MM-dd_HH-mm-ss'
$backupDir = Join-Path $projectDir "backups\V9.3.7.7_$timestamp"
$excludedNames = @('APLICAR_V9377.ps1', 'LEEME_V9.3.7.7.txt')

Write-Host ''
Write-Host 'Productos Cesar CRM - V9.3.7.7 AUDITADA' -ForegroundColor Cyan
Write-Host 'Correccion del flujo de edicion desde Facturacion'
Write-Host ''

if (-not (Test-Path (Join-Path $projectDir 'package.json'))) {
  throw 'No encontre package.json en la carpeta superior. Extrae el ZIP dentro de C:\Proyectos\productos-cesar-crm.'
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

New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
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
Write-Host "$($files.Count) archivos sincronizados." -ForegroundColor Green
Write-Host 'El archivo .env no fue reemplazado.' -ForegroundColor Green
Write-Host ''

Push-Location $projectDir
try {
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
Write-Host 'V9.3.7.7 aplicada, auditada y compilada correctamente.' -ForegroundColor Green
Write-Host 'IMPORTANTE: ejecuta en Supabase el SQL 35 incluido antes de probar la edicion.' -ForegroundColor Yellow
Write-Host 'Archivo: supabase\sql\35_actualizacion_v9377_edicion_detalle_facturacion.sql' -ForegroundColor Cyan

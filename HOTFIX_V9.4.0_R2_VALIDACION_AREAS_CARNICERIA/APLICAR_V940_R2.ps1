$ErrorActionPreference = 'Stop'

$hotfixDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectDir = Split-Path -Parent $hotfixDir
$packageName = Split-Path -Leaf $hotfixDir
$timestamp = Get-Date -Format 'yyyy-MM-dd_HH-mm-ss'
$backupDir = Join-Path $projectDir "backups\V9.4.0_R2_$timestamp"
$excludedNames = @('LEEME_V9.4.0_R2.txt')

Write-Host 'Productos Cesar CRM - V9.4.0 R2 AUDITADA' -ForegroundColor Cyan
Write-Host 'Validacion centralizada de areas operativas'

if (-not (Test-Path (Join-Path $projectDir 'package.json'))) {
  throw 'No encontre package.json en la carpeta superior. Extrae el ZIP directamente dentro de C:\Proyectos\productos-cesar-crm.'
}

$nestedPackage = Get-ChildItem -Path $hotfixDir -Directory -Recurse |
  Where-Object { $_.Name -eq $packageName } |
  Select-Object -First 1
if ($nestedPackage) {
  throw "El hotfix esta duplicado dentro de si mismo: $($nestedPackage.FullName). Extrae el ZIP en una carpeta limpia."
}

$requiredSql = 45..53 | ForEach-Object {
  Get-ChildItem -Path (Join-Path $hotfixDir 'supabase\sql') `
    -Filter "$($_)_*.sql" `
    -File
}
if ($requiredSql.Count -ne 9) {
  throw 'Paquete incompleto: deben existir exactamente los SQL 45, 46, 47, 48, 49, 50, 51, 52 y 53.'
}

$sql51 = Join-Path $hotfixDir `
  'supabase\sql\51_actualizacion_v940_cxc_cobros_posteriores.sql'
$sql52 = Join-Path $hotfixDir `
  'supabase\sql\52_actualizacion_v940_r1_ordenes_programadas.sql'
$sql53 = Join-Path $hotfixDir `
  'supabase\sql\53_actualizacion_v940_r2_validacion_areas_carniceria.sql'
$auditR1 = Join-Path $hotfixDir `
  'tests\auditoria_ordenes_programadas_v940_r1.mjs'
$auditR2 = Join-Path $hotfixDir `
  'tests\auditoria_validacion_areas_v940_r2.mjs'

if (-not (Test-Path $sql51)) {
  throw 'Paquete incompleto: falta el SQL 51 integrado.'
}
if (Select-String -Path $sql51 -Pattern 'create temporary table' -Quiet) {
  throw 'El SQL 51 no contiene la correccion final compatible con SQL Editor.'
}
if (-not (Test-Path $sql52)) {
  throw 'Paquete incompleto: falta 52_actualizacion_v940_r1_ordenes_programadas.sql.'
}
if (-not (Test-Path $auditR1)) {
  throw 'Paquete incompleto: falta la auditoria de ordenes programadas V9.4.0 R1.'
}
if (-not (Test-Path $sql53)) {
  throw 'Paquete incompleto: falta 53_actualizacion_v940_r2_validacion_areas_carniceria.sql.'
}
if (-not (Test-Path $auditR2)) {
  throw 'Paquete incompleto: falta la auditoria de areas V9.4.0 R2.'
}
if (-not (Select-String `
  -Path $sql53 `
  -Pattern 'empleado_habilitado_area_v940r2' `
  -Quiet)) {
  throw 'El SQL 53 no contiene la validacion centralizada de areas.'
}

$files = @(Get-ChildItem -Path $hotfixDir -Recurse -File | Where-Object {
  $relative = $_.FullName.Substring($hotfixDir.Length).TrimStart('\')
  $_.Name -notin $excludedNames -and
  $relative -notmatch '(^|\\)(node_modules|dist|backups|\.git)(\\|$)' -and
  $_.Name -ne '.env'
})

if ($files.Count -lt 100) {
  throw "Paquete incompleto: solo contiene $($files.Count) archivos sincronizables."
}

New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
foreach ($file in $files) {
  $relative = $file.FullName.Substring($hotfixDir.Length).TrimStart('\')
  $target = Join-Path $projectDir $relative
  if (Test-Path $target) {
    $backupTarget = Join-Path $backupDir $relative
    New-Item -ItemType Directory `
      -Path (Split-Path -Parent $backupTarget) `
      -Force | Out-Null
    Copy-Item $target $backupTarget -Force
  }
}

foreach ($file in $files) {
  $relative = $file.FullName.Substring($hotfixDir.Length).TrimStart('\')
  $target = Join-Path $projectDir $relative
  New-Item -ItemType Directory `
    -Path (Split-Path -Parent $target) `
    -Force | Out-Null
  Copy-Item $file.FullName $target -Force
}

Write-Host "Respaldo: $backupDir" -ForegroundColor Yellow
Write-Host "$($files.Count) archivos sincronizados por ruta exacta." `
  -ForegroundColor Green
Write-Host 'El archivo .env no fue reemplazado.' -ForegroundColor Green

Push-Location $projectDir
try {
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw 'Node.js no esta disponible.'
  }

  node --check .\src\main.js
  if ($LASTEXITCODE -ne 0) {
    throw 'node --check termino con error.'
  }

  node --check .\src\cxcV940.js
  if ($LASTEXITCODE -ne 0) {
    throw 'node --check de CXC termino con error.'
  }

  npm.cmd install
  if ($LASTEXITCODE -ne 0) {
    throw 'npm install termino con error.'
  }

  npm.cmd test
  if ($LASTEXITCODE -ne 0) {
    throw 'npm test termino con error.'
  }

  npm.cmd run build
  if ($LASTEXITCODE -ne 0) {
    throw 'npm run build termino con error.'
  }
}
finally {
  Pop-Location
}

Write-Host ''
Write-Host 'V9.4.0 R2 aplicada, auditada y compilada correctamente.' `
  -ForegroundColor Green
Write-Host 'Ahora ejecuta el SQL 53 en Supabase. No publiques antes de aplicarlo.' `
  -ForegroundColor Yellow

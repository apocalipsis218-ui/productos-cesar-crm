$ErrorActionPreference = 'Stop'

$hotfixDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectDir = Split-Path -Parent $hotfixDir
$packageName = Split-Path -Leaf $hotfixDir
$timestamp = Get-Date -Format 'yyyy-MM-dd_HH-mm-ss'
$backupDir = Join-Path $projectDir "backups\V9.4.0_R3_$timestamp"
$excludedNames = @('LEEME_V9.4.0_R3.txt')

Write-Host 'Productos Cesar CRM - V9.4.0 R3 AUDITADA' -ForegroundColor Cyan
Write-Host 'Guardado atomico desde llamadas y programacion protegida'

if (-not (Test-Path (Join-Path $projectDir 'package.json'))) {
  throw 'No encontre package.json en la carpeta superior.'
}

$nestedPackage = Get-ChildItem -Path $hotfixDir -Directory -Recurse | Where-Object { $_.Name -eq $packageName } | Select-Object -First 1
if ($nestedPackage) {
  throw "El hotfix esta duplicado dentro de si mismo: $($nestedPackage.FullName)."
}

$requiredSql = @(45..54 | ForEach-Object { Get-ChildItem -Path (Join-Path $hotfixDir 'supabase\sql') -Filter "$($_)_*.sql" -File })
if ($requiredSql.Count -ne 10) {
  throw 'Paquete incompleto: deben existir exactamente los SQL 45 al 54.'
}

$sql54 = Join-Path $hotfixDir 'supabase\sql\54_actualizacion_v940_r3_guardado_atomico_programacion.sql'
$auditR3 = Join-Path $hotfixDir 'tests\auditoria_ordenes_programadas_v940_r3.mjs'
if (-not (Test-Path $sql54)) { throw 'Falta el SQL 54 de la V9.4.0 R3.' }
if (-not (Test-Path $auditR3)) { throw 'Falta la auditoria R3.' }
if (-not (Select-String -Path $sql54 -Pattern 'guardar_orden_desde_llamada_v940r3' -Quiet)) {
  throw 'El SQL 54 no contiene la RPC atomica esperada.'
}

$files = @(Get-ChildItem -Path $hotfixDir -Recurse -File | Where-Object {
  $relative = $_.FullName.Substring($hotfixDir.Length).TrimStart('\')
  $_.Name -notin $excludedNames -and
  $relative -notmatch '(^|\\)(node_modules|dist|backups|\.git)(\\|$)' -and
  $_.Name -ne '.env'
})
if ($files.Count -lt 100) { throw "Paquete incompleto: solo contiene $($files.Count) archivos." }

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

Push-Location $projectDir
try {
  node --check .\src\main.js
  if ($LASTEXITCODE -ne 0) { throw 'node --check termino con error.' }
  npm.cmd test
  if ($LASTEXITCODE -ne 0) { throw 'npm test termino con error.' }
  npm.cmd run build
  if ($LASTEXITCODE -ne 0) { throw 'npm run build termino con error.' }
}
finally { Pop-Location }

Write-Host 'V9.4.0 R3 aplicada, auditada y compilada correctamente.' -ForegroundColor Green
Write-Host 'Ejecuta solamente SQL 54. No repitas SQL 50 al 53.' -ForegroundColor Yellow

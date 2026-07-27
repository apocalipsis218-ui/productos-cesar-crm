$ErrorActionPreference = 'Stop'

$patchDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectDir = Split-Path -Parent $patchDir
$timestamp = Get-Date -Format 'yyyy-MM-dd_HH-mm-ss'
$backupDir = Join-Path $projectDir "backups\V9.3.9.0_$timestamp"
$excludedNames = @('APLICAR_V9390.ps1', 'LEEME_V9.3.9.0.txt')

Write-Host 'Productos Cesar CRM - V9.3.9.0 AUDITADA' -ForegroundColor Cyan
Write-Host 'Consolidacion tecnica, configuracion global, concurrencia y hora RD'

if (-not (Test-Path (Join-Path $projectDir 'package.json'))) {
  throw "No se encontro package.json en $projectDir"
}

New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
$backupTargets = @('src','public','tests','supabase','package.json','package-lock.json','index.html','vite.config.js','wrangler.jsonc')
foreach ($target in $backupTargets) {
  $source = Join-Path $projectDir $target
  if (Test-Path $source) {
    Copy-Item $source (Join-Path $backupDir $target) -Recurse -Force
  }
}
Write-Host "Respaldo: $backupDir" -ForegroundColor Yellow

Get-ChildItem -Path $patchDir -Force | ForEach-Object {
  if ($excludedNames -notcontains $_.Name -and $_.Name -ne '.env') {
    Copy-Item $_.FullName (Join-Path $projectDir $_.Name) -Recurse -Force
  }
}
Write-Host 'Archivos sincronizados. El archivo .env no fue reemplazado.'

Push-Location $projectDir
try {
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw 'Node.js no esta disponible.'
  }
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
Write-Host 'V9.3.9.0 aplicada, auditada y compilada correctamente.' -ForegroundColor Green
Write-Host 'IMPORTANTE: ejecuta en Supabase el SQL 43 despues del SQL 42:'
Write-Host 'supabase\sql\43_actualizacion_v9390_configuracion_concurrencia.sql' -ForegroundColor Yellow

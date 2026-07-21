$ErrorActionPreference = 'Stop'

Write-Host ''
Write-Host 'Productos Cesar CRM - HOTFIX V9.3.3.1' -ForegroundColor Cyan
Write-Host 'Correccion de modulos: initialCustomerType fuera de alcance' -ForegroundColor Cyan
Write-Host ''

$hotfixDir = $PSScriptRoot
$projectDir = Split-Path -Parent $hotfixDir
$mainPath = Join-Path $projectDir 'src\main.js'
$testPath = Join-Path $projectDir 'tests\auditoria_retiros_ventas_internas_v933.mjs'
$pkgPath = Join-Path $projectDir 'package.json'

if (-not (Test-Path $pkgPath)) { throw "No se encontro package.json en $projectDir" }
if (-not (Test-Path $mainPath)) { throw "No se encontro src\main.js en $projectDir" }
if (-not (Test-Path $testPath)) { throw "No se encontro la auditoria V9.3.3 en $projectDir" }

$pkg = Get-Content $pkgPath -Raw | ConvertFrom-Json
if ([string]$pkg.version -ne '9.3.3') {
  throw "Este HOTFIX requiere V9.3.3. Version encontrada: $($pkg.version)"
}

$stamp = Get-Date -Format 'yyyy-MM-dd_HH-mm-ss'
$backupDir = Join-Path $projectDir "backups\V9.3.3.1_FIX_MODULOS_$stamp"
New-Item -ItemType Directory -Path (Join-Path $backupDir 'src') -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $backupDir 'tests') -Force | Out-Null
Copy-Item $mainPath (Join-Path $backupDir 'src\main.js') -Force
Copy-Item $testPath (Join-Path $backupDir 'tests\auditoria_retiros_ventas_internas_v933.mjs') -Force

Copy-Item (Join-Path $hotfixDir 'archivos\src\main.js') $mainPath -Force
Copy-Item (Join-Path $hotfixDir 'archivos\tests\auditoria_retiros_ventas_internas_v933.mjs') $testPath -Force

$main = Get-Content $mainPath -Raw
if ($main -notmatch "function\s+isInternalSale\s*\(o\)\s*\{\s*return\s+orderCustomerType\(o\)===['\"]Venta interna['\"]") {
  throw 'La correccion no quedo aplicada en src\main.js.'
}
if ($main -match "function\s+isInternalSale\s*\(o\)\s*\{[^}]*initialCustomerType") {
  throw 'Todavia existe la referencia defectuosa a initialCustomerType.'
}

Write-Host "OK: correccion aplicada." -ForegroundColor Green
Write-Host "Respaldo: $backupDir" -ForegroundColor Green
Write-Host ''
Write-Host 'Ejecutando auditorias...' -ForegroundColor Cyan
Push-Location $projectDir
try {
  & npm.cmd test
  if ($LASTEXITCODE -ne 0) { throw 'npm test termino con error.' }

  Write-Host ''
  Write-Host 'Compilando produccion...' -ForegroundColor Cyan
  & npm.cmd run build
  if ($LASTEXITCODE -ne 0) { throw 'npm run build termino con error.' }
}
finally {
  Pop-Location
}

Write-Host ''
Write-Host 'HOTFIX V9.3.3.1 completado correctamente.' -ForegroundColor Green
Write-Host 'Publique ahora con:' -ForegroundColor Yellow
Write-Host '  npx.cmd wrangler deploy' -ForegroundColor White

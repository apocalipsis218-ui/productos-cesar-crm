$ErrorActionPreference = 'Stop'

Write-Host ""
Write-Host "Productos Cesar CRM - Completar auditorias V9.3.0 R4" -ForegroundColor Cyan
Write-Host ""

$projectRoot = Split-Path -Parent $PSScriptRoot
$packagePath = Join-Path $projectRoot 'package.json'
$testsPath = Join-Path $projectRoot 'tests'
$sourceAudit = Join-Path $PSScriptRoot 'tests\auditoria_comercial_v9215.mjs'
$targetAudit = Join-Path $testsPath 'auditoria_comercial_v9215.mjs'

if (-not (Test-Path $packagePath)) {
  throw "No se encontro package.json en: $projectRoot"
}
if (-not (Test-Path $sourceAudit)) {
  throw "El parche no contiene auditoria_comercial_v9215.mjs"
}
if (-not (Test-Path $testsPath)) {
  New-Item -ItemType Directory -Path $testsPath | Out-Null
}

$stamp = Get-Date -Format 'yyyy-MM-dd-HH-mm-ss'
Copy-Item $packagePath (Join-Path $projectRoot "package.json.respaldo-pruebas-$stamp") -Force
Copy-Item $sourceAudit $targetAudit -Force

$pkg = Get-Content $packagePath -Raw | ConvertFrom-Json
$r4Command = 'node tests/auditoria_relojes_operativos_v930_r4.mjs'
$currentTest = [string]$pkg.scripts.test
if ([string]::IsNullOrWhiteSpace($currentTest)) {
  throw 'package.json no contiene scripts.test'
}
if ($currentTest -notlike "*$r4Command*") {
  $pkg.scripts.test = "$currentTest && $r4Command"
}

$json = $pkg | ConvertTo-Json -Depth 100
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($packagePath, $json + [Environment]::NewLine, $utf8NoBom)

Write-Host "OK: auditoria comercial restaurada." -ForegroundColor Green
Write-Host "OK: auditoria R4 agregada a npm test." -ForegroundColor Green
Write-Host ""
Write-Host "Ejecute ahora:" -ForegroundColor Yellow
Write-Host "  npm.cmd test"
Write-Host "  npm.cmd run build"

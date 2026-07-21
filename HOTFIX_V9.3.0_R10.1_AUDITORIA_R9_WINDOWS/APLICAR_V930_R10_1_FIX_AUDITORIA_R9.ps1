$ErrorActionPreference = 'Stop'

Write-Host ''
Write-Host 'Productos Cesar CRM - HOTFIX V9.3.0 R10.1' -ForegroundColor Cyan
Write-Host 'Correccion de auditoria R9 para Windows' -ForegroundColor Cyan
Write-Host ''

$hotfixDir = $PSScriptRoot
$projectRoot = Split-Path -Parent $hotfixDir
$sourceFile = Join-Path $hotfixDir 'tests\auditoria_usuarios_empleados_v930r9.mjs'
$targetFile = Join-Path $projectRoot 'tests\auditoria_usuarios_empleados_v930r9.mjs'

if (-not (Test-Path (Join-Path $projectRoot 'package.json'))) {
    throw "No se encontro package.json en: $projectRoot. Descomprima el HOTFIX dentro de la carpeta raiz del proyecto."
}
if (-not (Test-Path $sourceFile)) {
    throw "No se encontro el archivo corregido dentro del HOTFIX: $sourceFile"
}
if (-not (Test-Path $targetFile)) {
    throw "No se encontro la auditoria original en: $targetFile"
}

$stamp = Get-Date -Format 'yyyy-MM-dd_HH-mm-ss'
$backup = "$targetFile.respaldo-$stamp"
Copy-Item $targetFile $backup -Force
Copy-Item $sourceFile $targetFile -Force

Write-Host "OK: auditoria R9 corregida para rutas Windows." -ForegroundColor Green
Write-Host "Respaldo: $backup" -ForegroundColor DarkGray
Write-Host ''
Write-Host 'Ejecutando prueba especifica...' -ForegroundColor Yellow
Push-Location $projectRoot
try {
    node .\tests\auditoria_usuarios_empleados_v930r9.mjs
    if ($LASTEXITCODE -ne 0) { throw 'La auditoria R9 no aprobo.' }
}
finally {
    Pop-Location
}

Write-Host ''
Write-Host 'Correccion aplicada. Ejecute ahora:' -ForegroundColor Green
Write-Host '  npm.cmd test'
Write-Host '  npm.cmd run build'

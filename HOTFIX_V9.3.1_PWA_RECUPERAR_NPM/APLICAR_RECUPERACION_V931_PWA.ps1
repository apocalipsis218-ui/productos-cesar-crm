$ErrorActionPreference = "Stop"

$FixDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectDir = Split-Path -Parent $FixDir
$PayloadDir = Join-Path $FixDir "payload"
$Timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$PublicRegistry = "https://registry.npmjs.org/"
$LockFile = Join-Path $ProjectDir "package-lock.json"
$NpmrcFile = Join-Path $ProjectDir ".npmrc"

Write-Host ""
Write-Host "Productos Cesar CRM - Recuperacion instalacion PWA" -ForegroundColor Cyan
Write-Host "Corrige el registro npm interno y continua V9.3.1" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Path (Join-Path $ProjectDir "package.json"))) {
  throw "No se encontro package.json. Coloque esta carpeta dentro de la raiz del proyecto."
}

if (Test-Path $LockFile) {
  Copy-Item -Force $LockFile "$LockFile.respaldo-$Timestamp"
}
if (Test-Path $NpmrcFile) {
  Copy-Item -Force $NpmrcFile "$NpmrcFile.respaldo-$Timestamp"
}

Copy-Item -Force (Join-Path $PayloadDir "package-lock.json") $LockFile
Copy-Item -Force (Join-Path $PayloadDir ".npmrc") $NpmrcFile

Set-Location $ProjectDir
$LockText = Get-Content $LockFile -Raw
if ($LockText -match "internal\.api\.openai\.org|applied-caas-gateway") {
  throw "La correccion no pudo eliminar la direccion interna del package-lock."
}

if (Test-Path ".\node_modules\.package-lock.json") {
  Remove-Item -Force ".\node_modules\.package-lock.json"
}

$env:NPM_CONFIG_REGISTRY = $PublicRegistry
$env:NPM_CONFIG_AUDIT = "false"
$env:NPM_CONFIG_FUND = "false"

Write-Host "OK: package-lock y .npmrc corregidos." -ForegroundColor Green
Write-Host "Registro npm: $PublicRegistry" -ForegroundColor DarkGray
Write-Host ""
Write-Host "Instalando vite-plugin-pwa y sus dependencias..." -ForegroundColor Yellow
& npm.cmd install --registry=$PublicRegistry --prefer-online --no-audit --no-fund --fetch-retries=5 --fetch-retry-mintimeout=20000 --fetch-retry-maxtimeout=120000 --fetch-timeout=300000
if ($LASTEXITCODE -ne 0) { throw "npm install termino con error. Revise acceso a registry.npmjs.org." }

Write-Host ""
Write-Host "Ejecutando auditorias..." -ForegroundColor Yellow
& npm.cmd test
if ($LASTEXITCODE -ne 0) { throw "Las auditorias terminaron con error." }

Write-Host ""
Write-Host "Compilando produccion..." -ForegroundColor Yellow
& npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw "La compilacion termino con error." }

Write-Host ""
Write-Host "Recuperacion completada. V9.3.1 PWA quedo instalada y compilada." -ForegroundColor Green
Write-Host "Ejecute npm.cmd run dev para probarla localmente." -ForegroundColor Cyan

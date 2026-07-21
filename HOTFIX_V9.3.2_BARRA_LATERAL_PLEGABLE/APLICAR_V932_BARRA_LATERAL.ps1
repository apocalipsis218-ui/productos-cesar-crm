$ErrorActionPreference = "Stop"

Write-Host "" 
Write-Host "Productos Cesar CRM - V9.3.2" -ForegroundColor Cyan
Write-Host "Barra lateral plegable" -ForegroundColor Cyan
Write-Host ""

$project = (Get-Location).Path
$packagePath = Join-Path $project "package.json"
if (-not (Test-Path $packagePath)) {
  throw "Ejecute este instalador dentro de C:\proyectos\productos-cesar-crm"
}

$package = Get-Content $packagePath -Raw | ConvertFrom-Json
if ($package.name -ne "productos-cesar-crm-v930") {
  throw "La carpeta actual no parece ser el proyecto Productos Cesar CRM."
}

$sourceRoot = Join-Path $PSScriptRoot "files"
$stamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$backupRoot = Join-Path $project "backups\V9.3.2_BARRA_LATERAL_$stamp"
New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null

$targets = @(
  "src\main.js",
  "src\styles.css",
  "src\pwa.js",
  "index.html",
  "package.json",
  "package-lock.json",
  "APLICAR_V9.3.2.md",
  "tests\auditoria_tablet_ultracompacta_v930r10.mjs",
  "tests\auditoria_carniceria_ultracompacta_v930r101.mjs",
  "tests\auditoria_pwa_v931.mjs",
  "tests\auditoria_sidebar_plegable_v932.mjs"
)

foreach ($relative in $targets) {
  $current = Join-Path $project $relative
  $incoming = Join-Path $sourceRoot $relative
  $backup = Join-Path $backupRoot $relative

  if (-not (Test-Path $incoming)) {
    throw "Falta un archivo del HOTFIX: $relative"
  }

  if (Test-Path $current) {
    New-Item -ItemType Directory -Path (Split-Path $backup -Parent) -Force | Out-Null
    Copy-Item $current $backup -Force
  }

  New-Item -ItemType Directory -Path (Split-Path $current -Parent) -Force | Out-Null
  Copy-Item $incoming $current -Force
}

$wranglerPath = Join-Path $project "wrangler.jsonc"
if (-not (Test-Path $wranglerPath)) {
  Copy-Item (Join-Path $sourceRoot "wrangler.jsonc.template") $wranglerPath -Force
  Write-Host "OK: se creo wrangler.jsonc para publicar dist." -ForegroundColor Green
}

Write-Host "OK: archivos V9.3.2 aplicados." -ForegroundColor Green
Write-Host "Respaldo: $backupRoot" -ForegroundColor Yellow
Write-Host ""
Write-Host "Ejecutando auditorias..." -ForegroundColor Cyan
& npm.cmd test
if ($LASTEXITCODE -ne 0) { throw "npm test termino con error." }

Write-Host ""
Write-Host "Compilando produccion..." -ForegroundColor Cyan
& npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw "npm run build termino con error." }

Write-Host ""
Write-Host "V9.3.2 aplicada y compilada correctamente." -ForegroundColor Green
Write-Host "Para publicar ejecute:" -ForegroundColor Cyan
Write-Host "  npx.cmd wrangler deploy" -ForegroundColor White

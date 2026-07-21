$ErrorActionPreference = "Stop"

$HotfixDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectDir = Split-Path -Parent $HotfixDir
$PayloadDir = Join-Path $HotfixDir "payload"
$Timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$BackupDir = Join-Path $ProjectDir "backups\V9.3.1_PWA_$Timestamp"
$BackupMarker = Join-Path $HotfixDir ".ultimo_respaldo_v931.txt"

Write-Host ""
Write-Host "Productos Cesar CRM - V9.3.1 PWA" -ForegroundColor Cyan
Write-Host "Aplicacion instalable, control de actualizaciones y proteccion sin conexion" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Path (Join-Path $ProjectDir "package.json"))) {
  throw "No se encontro package.json en $ProjectDir. Coloque la carpeta HOTFIX dentro de la raiz del proyecto."
}
if (-not (Test-Path $PayloadDir)) {
  throw "No se encontro la carpeta payload del HOTFIX."
}

$Files = @(
  "index.html",
  "package.json",
  "package-lock.json",
  "vite.config.js",
  "APLICAR_V9.3.1_PWA.md",
  "src\main.js",
  "src\styles.css",
  "src\pwa.js",
  "tests\auditoria_tablet_ultracompacta_v930r10.mjs",
  "tests\auditoria_carniceria_ultracompacta_v930r101.mjs",
  "tests\auditoria_pwa_v931.mjs",
  "public\favicon.svg",
  "public\apple-touch-icon.png",
  "public\pwa-192x192.png",
  "public\pwa-512x512.png",
  "public\pwa-maskable-512x512.png"
)

New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
foreach ($RelativePath in $Files) {
  $CurrentFile = Join-Path $ProjectDir $RelativePath
  if (Test-Path $CurrentFile) {
    $BackupFile = Join-Path $BackupDir $RelativePath
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $BackupFile) | Out-Null
    Copy-Item -Force $CurrentFile $BackupFile
  }
}
Set-Content -Path $BackupMarker -Value $BackupDir -Encoding UTF8

foreach ($RelativePath in $Files) {
  $SourceFile = Join-Path $PayloadDir $RelativePath
  if (-not (Test-Path $SourceFile)) {
    throw "Falta un archivo del HOTFIX: $RelativePath"
  }
  $DestinationFile = Join-Path $ProjectDir $RelativePath
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $DestinationFile) | Out-Null
  Copy-Item -Force $SourceFile $DestinationFile
}

Set-Location $ProjectDir
Write-Host "OK: archivos V9.3.1 PWA copiados." -ForegroundColor Green
Write-Host "Respaldo: $BackupDir" -ForegroundColor DarkGray
Write-Host ""
Write-Host "Instalando dependencia PWA..." -ForegroundColor Yellow
& npm.cmd install
if ($LASTEXITCODE -ne 0) { throw "npm install termino con error." }

Write-Host ""
Write-Host "Ejecutando auditorias..." -ForegroundColor Yellow
& npm.cmd test
if ($LASTEXITCODE -ne 0) { throw "Las auditorias terminaron con error." }

Write-Host ""
Write-Host "Compilando produccion..." -ForegroundColor Yellow
& npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw "La compilacion termino con error." }

Write-Host ""
Write-Host "V9.3.1 PWA aplicada y compilada correctamente." -ForegroundColor Green
Write-Host "Siguiente paso: probar localmente con npm.cmd run dev y luego publicar la carpeta dist en Cloudflare." -ForegroundColor Cyan

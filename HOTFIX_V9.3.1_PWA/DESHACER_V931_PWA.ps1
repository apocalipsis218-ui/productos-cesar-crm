$ErrorActionPreference = "Stop"
$HotfixDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectDir = Split-Path -Parent $HotfixDir
$BackupMarker = Join-Path $HotfixDir ".ultimo_respaldo_v931.txt"

if (-not (Test-Path $BackupMarker)) {
  throw "No se encontro el marcador del ultimo respaldo."
}
$BackupDir = (Get-Content $BackupMarker -Raw).Trim()
if (-not (Test-Path $BackupDir)) {
  throw "No existe el respaldo: $BackupDir"
}

Get-ChildItem -Path $BackupDir -Recurse -File | ForEach-Object {
  $Relative = $_.FullName.Substring($BackupDir.Length).TrimStart('\')
  $Destination = Join-Path $ProjectDir $Relative
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Destination) | Out-Null
  Copy-Item -Force $_.FullName $Destination
}

$NewFiles = @(
  "vite.config.js",
  "APLICAR_V9.3.1_PWA.md",
  "src\pwa.js",
  "tests\auditoria_pwa_v931.mjs",
  "public\favicon.svg",
  "public\apple-touch-icon.png",
  "public\pwa-192x192.png",
  "public\pwa-512x512.png",
  "public\pwa-maskable-512x512.png"
)
foreach ($RelativePath in $NewFiles) {
  $WasPresent = Test-Path (Join-Path $BackupDir $RelativePath)
  if (-not $WasPresent) {
    $Current = Join-Path $ProjectDir $RelativePath
    if (Test-Path $Current) { Remove-Item -Force $Current }
  }
}

Set-Location $ProjectDir
& npm.cmd install
Write-Host "V9.3.1 PWA deshecha usando: $BackupDir" -ForegroundColor Green

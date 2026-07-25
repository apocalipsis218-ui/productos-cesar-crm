$ErrorActionPreference = 'Stop'

Write-Host ''
Write-Host 'Productos Cesar CRM - V9.3.7.2' -ForegroundColor Cyan
Write-Host 'CXC credito en cero y creacion de lotes manuales' -ForegroundColor Cyan
Write-Host ''

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$FilesRoot = Join-Path $PSScriptRoot 'files'
$MainFile = Join-Path $ProjectRoot 'src\main.js'

if (-not (Test-Path $MainFile)) {
    throw "No se encontro el proyecto en: $ProjectRoot"
}

$Stamp = Get-Date -Format 'yyyy-MM-dd_HH-mm-ss'
$BackupRoot = Join-Path $ProjectRoot "backups\V9.3.7.2_$Stamp"
New-Item -ItemType Directory -Path $BackupRoot -Force | Out-Null

$RelativeFiles = @(
    'src\main.js',
    'src\centralLiquidationV937.js',
    'src\pwa.js',
    'src\styles.css',
    'index.html',
    'package.json',
    'package-lock.json',
    'supabase\31_actualizacion_v9371_responsables_transferencias.sql',
    'supabase\32_actualizacion_v9372_credito_cero_lote_manual.sql',
    'tests\auditoria_tablet_ultracompacta_v930r10.mjs',
    'tests\auditoria_carniceria_ultracompacta_v930r101.mjs',
    'tests\auditoria_pwa_v931.mjs',
    'tests\auditoria_retiros_ventas_internas_v933.mjs',
    'tests\auditoria_historiales_compactos_v934.mjs',
    'tests\auditoria_facturacion_rapida_v935.mjs',
    'tests\auditoria_monto_validacion_v9351.mjs',
    'tests\auditoria_mejoras_operativas_v936.mjs',
    'tests\auditoria_delivery_consultivo_liquidacion_v937.mjs',
    'tests\auditoria_responsables_transferencias_v9371.mjs',
    'tests\auditoria_cxc_credito_lote_manual_v9372.mjs'
)

foreach ($Relative in $RelativeFiles) {
    $Source = Join-Path $FilesRoot $Relative
    $Target = Join-Path $ProjectRoot $Relative
    if (-not (Test-Path $Source)) { throw "Falta archivo del HOTFIX: $Relative" }

    if (Test-Path $Target) {
        $Backup = Join-Path $BackupRoot $Relative
        New-Item -ItemType Directory -Path (Split-Path $Backup -Parent) -Force | Out-Null
        Copy-Item $Target $Backup -Force
    }

    New-Item -ItemType Directory -Path (Split-Path $Target -Parent) -Force | Out-Null
    Copy-Item $Source $Target -Force
}

Write-Host "Respaldo: $BackupRoot" -ForegroundColor DarkCyan
Write-Host 'Archivos copiados.' -ForegroundColor Green

Push-Location $ProjectRoot
try {
    node --check .\src\main.js
    if ($LASTEXITCODE -ne 0) { throw 'Error de sintaxis en src\main.js.' }

    node --check .\src\centralLiquidationV937.js
    if ($LASTEXITCODE -ne 0) { throw 'Error de sintaxis en centralLiquidationV937.js.' }

    node --check .\tests\auditoria_cxc_credito_lote_manual_v9372.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Error de sintaxis en la auditoria V9.3.7.2.' }

    npm.cmd test
    if ($LASTEXITCODE -ne 0) { throw 'npm test termino con error.' }

    npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'npm run build termino con error.' }
}
finally {
    Pop-Location
}

Write-Host ''
Write-Host 'V9.3.7.2 aplicada, auditada y compilada correctamente.' -ForegroundColor Green
Write-Host 'Ejecuta npm.cmd run dev para probar antes de publicar.' -ForegroundColor White

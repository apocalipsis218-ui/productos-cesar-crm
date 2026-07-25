$ErrorActionPreference = 'Stop'

Write-Host ''
Write-Host 'Productos Cesar CRM - V9.3.7.1' -ForegroundColor Cyan
Write-Host 'Responsables manuales y transferencias de pedidos' -ForegroundColor Cyan
Write-Host ''

$HotfixRoot = $PSScriptRoot
$ProjectRoot = Split-Path -Parent $HotfixRoot
$FilesRoot = Join-Path $HotfixRoot 'archivos'

if (-not (Test-Path (Join-Path $ProjectRoot 'package.json'))) {
    throw "No se encontro package.json en: $ProjectRoot"
}
if (-not (Test-Path (Join-Path $ProjectRoot 'src\main.js'))) {
    throw "No se encontro src\main.js en: $ProjectRoot"
}

$timestamp = Get-Date -Format 'yyyy-MM-dd_HH-mm-ss'
$backupRoot = Join-Path $ProjectRoot "backups\V9.3.7.1_$timestamp"
New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null

$relativeFiles = @(
    'README.md',
    'index.html',
    'package.json',
    'APLICAR_V9.3.7.1.md',
    'MAPEO_RESPONSABLES_TRANSFERENCIAS_V9371.md',
    'src\main.js',
    'src\styles.css',
    'src\pwa.js',
    'src\centralLiquidationV937.js',
    'src\tripResponsibilityV9371.js',
    'supabase\31_actualizacion_v9371_responsables_transferencias.sql',
    'tests\auditoria_retiros_ventas_internas_v933.mjs',
    'tests\auditoria_historiales_compactos_v934.mjs',
    'tests\auditoria_facturacion_rapida_v935.mjs',
    'tests\auditoria_monto_validacion_v9351.mjs',
    'tests\auditoria_mejoras_operativas_v936.mjs',
    'tests\auditoria_delivery_consultivo_liquidacion_v937.mjs',
    'tests\auditoria_responsables_transferencias_v9371.mjs'
)

foreach ($relative in $relativeFiles) {
    $source = Join-Path $FilesRoot $relative
    $destination = Join-Path $ProjectRoot $relative

    if (-not (Test-Path -LiteralPath $source)) {
        throw "Falta archivo del HOTFIX: $relative"
    }

    if (Test-Path -LiteralPath $destination) {
        $backup = Join-Path $backupRoot $relative
        $backupParent = Split-Path -Parent $backup
        New-Item -ItemType Directory -Path $backupParent -Force | Out-Null
        Copy-Item -LiteralPath $destination -Destination $backup -Force
    }

    $destinationParent = Split-Path -Parent $destination
    New-Item -ItemType Directory -Path $destinationParent -Force | Out-Null
    Copy-Item -LiteralPath $source -Destination $destination -Force
    Write-Host "OK: $relative" -ForegroundColor Green
}

Write-Host ''
Write-Host "Respaldo: $backupRoot" -ForegroundColor Yellow
Write-Host ''

Push-Location $ProjectRoot
try {
    Write-Host 'Revisando sintaxis JavaScript...' -ForegroundColor Cyan
    node --check .\src\main.js
    if ($LASTEXITCODE -ne 0) { throw 'Fallo la sintaxis de src\main.js.' }
    node --check .\src\tripResponsibilityV9371.js
    if ($LASTEXITCODE -ne 0) { throw 'Fallo la sintaxis de tripResponsibilityV9371.js.' }
    node --check .\src\centralLiquidationV937.js
    if ($LASTEXITCODE -ne 0) { throw 'Fallo la sintaxis de centralLiquidationV937.js.' }

    Write-Host ''
    Write-Host 'Ejecutando auditorias...' -ForegroundColor Cyan
    npm.cmd test
    if ($LASTEXITCODE -ne 0) { throw 'Las auditorias terminaron con error.' }

    Write-Host ''
    Write-Host 'Compilando produccion...' -ForegroundColor Cyan
    npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'La compilacion termino con error.' }
}
finally {
    Pop-Location
}

Write-Host ''
Write-Host 'V9.3.7.1 aplicada, auditada y compilada correctamente.' -ForegroundColor Green
Write-Host 'Prueba primero con: npm.cmd run dev' -ForegroundColor White
Write-Host 'Publica luego con: npx.cmd wrangler deploy' -ForegroundColor White
Write-Host ''

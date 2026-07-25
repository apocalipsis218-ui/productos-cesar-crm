$ErrorActionPreference = 'Stop'

Write-Host ''
Write-Host 'Productos Cesar CRM - V9.3.5.1' -ForegroundColor Cyan
Write-Host 'Monto final editable en Validacion por lote e individual' -ForegroundColor Cyan
Write-Host ''

$hotfix = $PSScriptRoot
$project = Split-Path -Parent $hotfix
$packagePath = Join-Path $project 'package.json'

if (-not (Test-Path $packagePath)) {
    throw "No se encontro package.json. Coloca este HOTFIX dentro de C:\proyectos\productos-cesar-crm"
}

$package = Get-Content $packagePath -Raw | ConvertFrom-Json
if ($package.version -ne '9.3.5') {
    Write-Warning "La base detectada es $($package.version). Este HOTFIX fue preparado para V9.3.5."
}

$stamp = Get-Date -Format 'yyyy-MM-dd_HH-mm-ss'
$backup = Join-Path $project "backups\V9.3.5.1_$stamp"
New-Item -ItemType Directory -Path $backup -Force | Out-Null

$files = @(
    'README.md',
    'index.html',
    'package.json',
    'APLICAR_V9.3.5.1.md',
    'MAPEO_MONTO_VALIDACION_V9351.md',
    'src\main.js',
    'src\pwa.js',
    'src\styles.css',
    'src\validationInvoice.js',
    'tests\auditoria_facturacion_rapida_v935.mjs',
    'tests\auditoria_historiales_compactos_v934.mjs',
    'tests\auditoria_pwa_v931.mjs',
    'tests\auditoria_retiros_ventas_internas_v933.mjs',
    'tests\auditoria_sidebar_plegable_v932.mjs',
    'tests\auditoria_monto_validacion_v9351.mjs'
)

foreach ($relative in $files) {
    $source = Join-Path (Join-Path $hotfix 'archivos') $relative
    $target = Join-Path $project $relative
    if (-not (Test-Path $source)) { throw "Falta archivo del HOTFIX: $relative" }

    if (Test-Path $target) {
        $backupTarget = Join-Path $backup $relative
        New-Item -ItemType Directory -Path (Split-Path -Parent $backupTarget) -Force | Out-Null
        Copy-Item $target $backupTarget -Force
    }

    New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force | Out-Null
    Copy-Item $source $target -Force
}

Write-Host "Respaldo: $backup" -ForegroundColor Green
Write-Host 'Archivos V9.3.5.1 copiados.' -ForegroundColor Green
Write-Host ''

Push-Location $project
try {
    Write-Host 'Ejecutando auditorias...' -ForegroundColor Cyan
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
Write-Host 'V9.3.5.1 aplicada y compilada correctamente.' -ForegroundColor Green
Write-Host 'Prueba localmente y luego ejecuta: npx.cmd wrangler deploy' -ForegroundColor White

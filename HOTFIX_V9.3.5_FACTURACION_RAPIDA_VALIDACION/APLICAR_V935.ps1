$ErrorActionPreference = 'Stop'

Write-Host ''
Write-Host 'Productos Cesar CRM - V9.3.5' -ForegroundColor Cyan
Write-Host 'Facturacion rapida y Validacion operativa' -ForegroundColor Cyan
Write-Host ''

$hotfixRoot = $PSScriptRoot
$projectRoot = Split-Path -Parent $hotfixRoot

if (-not (Test-Path (Join-Path $projectRoot 'package.json'))) {
    throw 'No se encontro package.json. Coloque y descomprima el HOTFIX dentro de C:\proyectos\productos-cesar-crm.'
}
if (-not (Test-Path (Join-Path $projectRoot 'src\main.js'))) {
    throw 'No se encontro src\main.js en el proyecto.'
}

$stamp = Get-Date -Format 'yyyy-MM-dd_HH-mm-ss'
$backupRoot = Join-Path $projectRoot (Join-Path 'backups' ('V9.3.5_' + $stamp))
New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null

$files = @(
    'index.html',
    'package.json',
    'package-lock.json',
    'README.md',
    'APLICAR_V9.3.5.md',
    'MAPEO_FACTURACION_RAPIDA_V935.md',
    'src\main.js',
    'src\styles.css',
    'src\pwa.js',
    'src\invoiceQuick.js',
    'tests\auditoria_tablet_ultracompacta_v930r10.mjs',
    'tests\auditoria_carniceria_ultracompacta_v930r101.mjs',
    'tests\auditoria_pwa_v931.mjs',
    'tests\auditoria_retiros_ventas_internas_v933.mjs',
    'tests\auditoria_historiales_compactos_v934.mjs',
    'tests\auditoria_facturacion_rapida_v935.mjs'
)

foreach ($relative in $files) {
    $source = Join-Path $hotfixRoot $relative
    if (-not (Test-Path $source)) {
        throw ('Falta un archivo del HOTFIX: ' + $relative)
    }

    $target = Join-Path $projectRoot $relative
    if (Test-Path $target) {
        $backupFile = Join-Path $backupRoot $relative
        $backupDir = Split-Path -Parent $backupFile
        New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
        Copy-Item -Path $target -Destination $backupFile -Force
    }

    $targetDir = Split-Path -Parent $target
    New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
    Copy-Item -Path $source -Destination $target -Force
}

Write-Host ('Respaldo: ' + $backupRoot) -ForegroundColor Green
Write-Host 'Archivos V9.3.5 copiados.' -ForegroundColor Green
Write-Host ''

Push-Location $projectRoot
try {
    Write-Host 'Ejecutando auditorias...' -ForegroundColor Cyan
    & npm.cmd test
    if ($LASTEXITCODE -ne 0) {
        throw 'npm test termino con error.'
    }

    Write-Host ''
    Write-Host 'Compilando produccion...' -ForegroundColor Cyan
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) {
        throw 'npm run build termino con error.'
    }
}
finally {
    Pop-Location
}

Write-Host ''
Write-Host 'V9.3.5 aplicada y compilada correctamente.' -ForegroundColor Green
Write-Host 'Siguiente paso: probar localmente y luego ejecutar npx.cmd wrangler deploy.' -ForegroundColor White

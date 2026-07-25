$ErrorActionPreference = 'Stop'

Write-Host ''
Write-Host 'Productos Cesar CRM - V9.3.4' -ForegroundColor Cyan
Write-Host 'Historiales compactos, fechas dominicanas y lotes plegables' -ForegroundColor Cyan
Write-Host ''

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$SourceRoot = Join-Path $PSScriptRoot 'files'
$PackageFile = Join-Path $ProjectRoot 'package.json'

if (-not (Test-Path $PackageFile)) {
    throw "No se encontro package.json en $ProjectRoot. Coloca el HOTFIX dentro de C:\proyectos\productos-cesar-crm."
}

$backupStamp = Get-Date -Format 'yyyy-MM-dd_HH-mm-ss'
$backupRoot = Join-Path $ProjectRoot "backups\V9.3.4_HISTORIALES_$backupStamp"
New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null

$relativeFiles = @(
    'src\main.js',
    'src\styles.css',
    'src\pwa.js',
    'tests\auditoria_carniceria_ultracompacta_v930r101.mjs',
    'tests\auditoria_pwa_v931.mjs',
    'tests\auditoria_retiros_ventas_internas_v933.mjs',
    'tests\auditoria_tablet_ultracompacta_v930r10.mjs',
    'tests\auditoria_historiales_compactos_v934.mjs',
    'index.html',
    'package.json',
    'package-lock.json',
    'README.md',
    'APLICAR_V9.3.4.md',
    'MAPEO_HISTORIALES_COMPACTOS_V934.md'
)

foreach ($relative in $relativeFiles) {
    $target = Join-Path $ProjectRoot $relative
    $source = Join-Path $SourceRoot $relative

    if (-not (Test-Path $source)) {
        throw "Falta un archivo del HOTFIX: $source"
    }

    if (Test-Path $target) {
        $backup = Join-Path $backupRoot $relative
        $backupDir = Split-Path -Parent $backup
        New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
        Copy-Item $target $backup -Force
    }

    $targetDir = Split-Path -Parent $target
    New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
    Copy-Item $source $target -Force
}

Write-Host "Respaldo: $backupRoot" -ForegroundColor Yellow
Write-Host 'Archivos V9.3.4 copiados correctamente.' -ForegroundColor Green
Write-Host ''

Push-Location $ProjectRoot
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
Write-Host 'V9.3.4 aplicada y compilada correctamente.' -ForegroundColor Green
Write-Host 'No requiere SQL nuevo.' -ForegroundColor Green
Write-Host 'Publica ahora con:' -ForegroundColor White
Write-Host '  npx.cmd wrangler deploy' -ForegroundColor White

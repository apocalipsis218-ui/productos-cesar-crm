$ErrorActionPreference = 'Stop'

Write-Host ''
Write-Host 'Productos Cesar CRM - V9.3.3' -ForegroundColor Cyan
Write-Host 'Retiros en negocio, ventas internas e impresion configurable' -ForegroundColor Cyan
Write-Host ''

$proyecto = (Get-Location).Path
$nombreCarpeta = Split-Path $proyecto -Leaf

if (-not (Test-Path (Join-Path $proyecto 'package.json'))) {
    throw 'Ejecute este instalador dentro de C:\proyectos\productos-cesar-crm.'
}

if (-not (Test-Path (Join-Path $proyecto 'src\main.js'))) {
    throw 'No se encontro src\main.js. Verifique la carpeta del proyecto.'
}

Write-Host 'IMPORTANTE: el SQL 27 debe haberse ejecutado primero en Supabase sin errores.' -ForegroundColor Yellow
Write-Host 'Archivo: supabase\27_actualizacion_v933_retiros_ventas_internas.sql' -ForegroundColor Yellow
Write-Host ''

$marcaTiempo = Get-Date -Format 'yyyy-MM-dd_HH-mm-ss'
$respaldo = Join-Path $proyecto "backups\V9.3.3_$marcaTiempo"
New-Item -ItemType Directory -Path $respaldo -Force | Out-Null

$archivos = @(
    'src/main.js',
    'src/styles.css',
    'src/pwa.js',
    'index.html',
    'package.json',
    'package-lock.json',
    'README.md',
    'APLICAR_V9.3.3.md',
    'MAPEO_RETIROS_VENTAS_INTERNAS_V933.md',
    'tests/auditoria_validacion_historial_v930r5.mjs',
    'tests/auditoria_tablet_ultracompacta_v930r10.mjs',
    'tests/auditoria_carniceria_ultracompacta_v930r101.mjs',
    'tests/auditoria_pwa_v931.mjs',
    'tests/auditoria_sidebar_plegable_v932.mjs',
    'tests/auditoria_retiros_ventas_internas_v933.mjs',
    'supabase/27_actualizacion_v933_retiros_ventas_internas.sql'
)

foreach ($relativoOriginal in $archivos) {
    $relativo = $relativoOriginal -replace '/', [IO.Path]::DirectorySeparatorChar
    $origen = Join-Path $PSScriptRoot $relativo
    $destino = Join-Path $proyecto $relativo
    $destinoRespaldo = Join-Path $respaldo $relativo

    if (-not (Test-Path $origen)) {
        throw "Falta un archivo del HOTFIX: $relativoOriginal"
    }

    if (Test-Path $destino) {
        $carpetaRespaldo = Split-Path $destinoRespaldo -Parent
        New-Item -ItemType Directory -Path $carpetaRespaldo -Force | Out-Null
        Copy-Item $destino $destinoRespaldo -Force
    }

    $carpetaDestino = Split-Path $destino -Parent
    New-Item -ItemType Directory -Path $carpetaDestino -Force | Out-Null
    Copy-Item $origen $destino -Force
}

Write-Host "Respaldo creado: $respaldo" -ForegroundColor Green
Write-Host 'Archivos V9.3.3 copiados correctamente.' -ForegroundColor Green
Write-Host ''

Write-Host 'Ejecutando auditorias...' -ForegroundColor Cyan
& npm.cmd test
if ($LASTEXITCODE -ne 0) {
    throw 'Las auditorias terminaron con error. No publique esta version.'
}

Write-Host ''
Write-Host 'Compilando produccion...' -ForegroundColor Cyan
& npm.cmd run build
if ($LASTEXITCODE -ne 0) {
    throw 'La compilacion termino con error. No publique esta version.'
}

Write-Host ''
Write-Host 'V9.3.3 aplicada, auditada y compilada correctamente.' -ForegroundColor Green
Write-Host 'Siguiente comando para publicar:' -ForegroundColor Cyan
Write-Host '  npx.cmd wrangler deploy' -ForegroundColor White
Write-Host ''
Write-Host 'En las PWA instaladas, guarde el trabajo pendiente y pulse Actualizar ahora.' -ForegroundColor Yellow

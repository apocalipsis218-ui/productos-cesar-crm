$ErrorActionPreference = 'Stop'

Write-Host ''
Write-Host 'Productos Cesar CRM - V9.3.7.3 AUDITADA' -ForegroundColor Cyan
Write-Host 'Modulo de Ordenes compacto, paginado y priorizado' -ForegroundColor Cyan
Write-Host ''

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$FilesRoot = Join-Path $PSScriptRoot 'files'
$MainFile = Join-Path $ProjectRoot 'src\main.js'

if (-not (Test-Path $MainFile)) {
    throw "No se encontro el proyecto en: $ProjectRoot"
}
if (-not (Test-Path (Join-Path $FilesRoot 'package.json'))) {
    throw 'El HOTFIX esta incompleto: falta files\package.json.'
}
if (Test-Path (Join-Path $FilesRoot '.env')) {
    throw 'Proteccion activada: el HOTFIX no puede contener ni reemplazar .env.'
}

$Stamp = Get-Date -Format 'yyyy-MM-dd_HH-mm-ss'
$BackupRoot = Join-Path $ProjectRoot "backups\V9.3.7.3_$Stamp"
New-Item -ItemType Directory -Path $BackupRoot -Force | Out-Null

$SourceFiles = Get-ChildItem $FilesRoot -Recurse -File
if ($SourceFiles.Count -lt 100) {
    throw "El HOTFIX esta incompleto: solo contiene $($SourceFiles.Count) archivos."
}

foreach ($Source in $SourceFiles) {
    $Relative = $Source.FullName.Substring($FilesRoot.Length).TrimStart('\')
    if ($Relative -eq '.env' -or $Relative.StartsWith('node_modules\') -or $Relative.StartsWith('dist\')) {
        throw "Archivo no permitido dentro del HOTFIX: $Relative"
    }

    $Target = Join-Path $ProjectRoot $Relative
    if (Test-Path $Target) {
        $Backup = Join-Path $BackupRoot $Relative
        New-Item -ItemType Directory -Path (Split-Path $Backup -Parent) -Force | Out-Null
        Copy-Item $Target $Backup -Force
    }

    New-Item -ItemType Directory -Path (Split-Path $Target -Parent) -Force | Out-Null
    Copy-Item $Source.FullName $Target -Force
}

Write-Host "Respaldo: $BackupRoot" -ForegroundColor DarkCyan
Write-Host "$($SourceFiles.Count) archivos sincronizados." -ForegroundColor Green

Push-Location $ProjectRoot
try {
    node --check .\src\main.js
    if ($LASTEXITCODE -ne 0) { throw 'Error de sintaxis en src\main.js.' }

    node --check .\tests\auditoria_ordenes_compactas_v9373.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Error de sintaxis en la auditoria V9.3.7.3.' }

    npm.cmd test
    if ($LASTEXITCODE -ne 0) { throw 'npm test termino con error.' }

    npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'npm run build termino con error.' }
}
finally {
    Pop-Location
}

Write-Host ''
Write-Host 'V9.3.7.3 aplicada, auditada y compilada correctamente.' -ForegroundColor Green
Write-Host 'Wrangler actualizado. Ejecuta npm.cmd run dev para probar antes de publicar.' -ForegroundColor White

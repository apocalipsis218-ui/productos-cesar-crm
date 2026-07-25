$ErrorActionPreference = 'Stop'

Write-Host ''
Write-Host 'Productos Cesar CRM - V9.3.7' -ForegroundColor Cyan
Write-Host 'Delivery consultivo y Liquidacion centralizada' -ForegroundColor Cyan
Write-Host ''

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$PayloadRoot = Join-Path $PSScriptRoot 'archivos'

if (-not (Test-Path (Join-Path $ProjectRoot 'package.json'))) {
    throw 'No se encontro package.json. Extrae el HOTFIX dentro de C:\proyectos\productos-cesar-crm.'
}
if (-not (Test-Path (Join-Path $ProjectRoot 'src\main.js'))) {
    throw 'No se encontro src\main.js. Verifica la carpeta del proyecto.'
}
if (-not (Test-Path $PayloadRoot)) {
    throw 'No se encontro la carpeta archivos del HOTFIX.'
}

$Stamp = Get-Date -Format 'yyyy-MM-dd_HH-mm-ss'
$BackupRoot = Join-Path $ProjectRoot "backups\V9.3.7_$Stamp"
New-Item -ItemType Directory -Path $BackupRoot -Force | Out-Null

$Files = Get-ChildItem -Path $PayloadRoot -File -Recurse
foreach ($File in $Files) {
    $Relative = $File.FullName.Substring($PayloadRoot.Length).TrimStart('\','/')
    $Target = Join-Path $ProjectRoot $Relative
    $TargetDirectory = Split-Path $Target -Parent

    if (-not (Test-Path $TargetDirectory)) {
        New-Item -ItemType Directory -Path $TargetDirectory -Force | Out-Null
    }

    if (Test-Path $Target) {
        $BackupTarget = Join-Path $BackupRoot $Relative
        $BackupDirectory = Split-Path $BackupTarget -Parent
        if (-not (Test-Path $BackupDirectory)) {
            New-Item -ItemType Directory -Path $BackupDirectory -Force | Out-Null
        }
        Copy-Item $Target $BackupTarget -Force
    }

    Copy-Item $File.FullName $Target -Force
}

$Package = Get-Content (Join-Path $ProjectRoot 'package.json') -Raw | ConvertFrom-Json
if ($Package.version -ne '9.3.7') {
    throw "La version aplicada no es V9.3.7. Version encontrada: $($Package.version)"
}

Write-Host "Archivos aplicados. Respaldo: $BackupRoot" -ForegroundColor Green
Write-Host ''
Write-Host 'Ejecutando auditorias...' -ForegroundColor Cyan

Push-Location $ProjectRoot
try {
    & npm.cmd test
    if ($LASTEXITCODE -ne 0) {
        throw 'Las auditorias terminaron con error.'
    }

    Write-Host ''
    Write-Host 'Compilando produccion...' -ForegroundColor Cyan
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) {
        throw 'La compilacion termino con error.'
    }
}
finally {
    Pop-Location
}

Write-Host ''
Write-Host 'V9.3.7 aplicada, auditada y compilada correctamente.' -ForegroundColor Green
Write-Host 'Prueba Delivery y Liquidacion en localhost antes de publicar.' -ForegroundColor Yellow
Write-Host 'Cuando la prueba sea correcta, publica con:' -ForegroundColor White
Write-Host '  npx.cmd wrangler deploy' -ForegroundColor White

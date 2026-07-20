$ErrorActionPreference = "Stop"
$ProjectRoot = (Get-Location).Path
$MainFile = Join-Path $ProjectRoot "src\main.js"
$Backups = Get-ChildItem "$MainFile.respaldo-*" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending

if (-not $Backups -or $Backups.Count -eq 0) {
    Write-Host "No se encontro un respaldo automatico de src\main.js." -ForegroundColor Red
    exit 1
}

$Backup = $Backups[0]
Copy-Item $Backup.FullName $MainFile -Force
Write-Host "Se restauro:" -ForegroundColor Green
Write-Host $Backup.FullName
Write-Host "como:" 
Write-Host $MainFile

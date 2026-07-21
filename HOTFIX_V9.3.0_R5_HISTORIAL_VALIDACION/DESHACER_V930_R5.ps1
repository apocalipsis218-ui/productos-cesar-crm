$ErrorActionPreference = "Stop"
$project = (Get-Location).Path
$backup = Get-ChildItem -Path $project -Directory -Filter "respaldo_v930_r5_*" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $backup) { throw "No se encontro un respaldo_v930_r5_* en el proyecto." }
Write-Host "Restaurando desde: $($backup.FullName)" -ForegroundColor Yellow
Get-ChildItem -Path $backup.FullName -File -Recurse | ForEach-Object {
  $rel = $_.FullName.Substring($backup.FullName.Length + 1)
  $dst = Join-Path $project $rel
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $dst) | Out-Null
  Copy-Item $_.FullName $dst -Force
}
Write-Host "R5 deshecho. Revise los cambios antes de continuar." -ForegroundColor Green

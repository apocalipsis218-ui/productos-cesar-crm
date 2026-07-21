$ErrorActionPreference = 'Stop'
Write-Host ""
Write-Host "Productos Cesar CRM - V9.3.0 R10" -ForegroundColor Cyan
Write-Host "Crear orden y despacho ultracompactos para tablet" -ForegroundColor Cyan
Write-Host ""

$projectRoot = Split-Path -Parent $PSScriptRoot
$mainPath = Join-Path $projectRoot 'src\main.js'
$stylesPath = Join-Path $projectRoot 'src\styles.css'
$packagePath = Join-Path $projectRoot 'package.json'
$lockPath = Join-Path $projectRoot 'package-lock.json'

if (!(Test-Path $mainPath)) { throw "No se encontro src\main.js. Descomprima el HOTFIX dentro de C:\proyectos\productos-cesar-crm." }
if (!(Test-Path $stylesPath)) { throw "No se encontro src\styles.css." }
if (!(Test-Path $packagePath)) { throw "No se encontro package.json." }

$current = Get-Content $mainPath -Raw
if (($current -notmatch 'V9\.3\.0 R9') -and ($current -notmatch 'V9\.3\.0 R10')) {
  throw "La base no parece ser V9.3.0 R9/R10. No se sobrescribio ningun archivo."
}

$stamp = Get-Date -Format 'yyyy-MM-dd_HH-mm-ss'
$backup = Join-Path $projectRoot ("respaldos\V9.3.0_R10_" + $stamp)
New-Item -ItemType Directory -Force -Path (Join-Path $backup 'src') | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $backup 'tests') | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $backup 'supabase') | Out-Null
Copy-Item $mainPath (Join-Path $backup 'src\main.js') -Force
Copy-Item $stylesPath (Join-Path $backup 'src\styles.css') -Force
Copy-Item $packagePath (Join-Path $backup 'package.json') -Force
if (Test-Path $lockPath) { Copy-Item $lockPath (Join-Path $backup 'package-lock.json') -Force }
foreach($f in @('auditoria_despacho_compacto_v930r8.mjs','auditoria_usuarios_empleados_v930r9.mjs','auditoria_tablet_ultracompacta_v930r10.mjs')){
  $src=Join-Path $projectRoot ('tests\'+$f)
  if(Test-Path $src){ Copy-Item $src (Join-Path $backup ('tests\'+$f)) -Force }
}
$oldSql=Join-Path $projectRoot 'supabase\26_actualizacion_v930r9_vincular_usuarios_empleados.sql'
if(Test-Path $oldSql){ Copy-Item $oldSql (Join-Path $backup 'supabase\26_actualizacion_v930r9_vincular_usuarios_empleados.sql') -Force }

Copy-Item (Join-Path $PSScriptRoot 'payload\src\main.js') $mainPath -Force
Copy-Item (Join-Path $PSScriptRoot 'payload\src\styles.css') $stylesPath -Force
Copy-Item (Join-Path $PSScriptRoot 'payload\package.json') $packagePath -Force
Copy-Item (Join-Path $PSScriptRoot 'payload\package-lock.json') $lockPath -Force
Copy-Item (Join-Path $PSScriptRoot 'payload\tests\auditoria_despacho_compacto_v930r8.mjs') (Join-Path $projectRoot 'tests\auditoria_despacho_compacto_v930r8.mjs') -Force
Copy-Item (Join-Path $PSScriptRoot 'payload\tests\auditoria_usuarios_empleados_v930r9.mjs') (Join-Path $projectRoot 'tests\auditoria_usuarios_empleados_v930r9.mjs') -Force
Copy-Item (Join-Path $PSScriptRoot 'payload\tests\auditoria_tablet_ultracompacta_v930r10.mjs') (Join-Path $projectRoot 'tests\auditoria_tablet_ultracompacta_v930r10.mjs') -Force
Copy-Item (Join-Path $PSScriptRoot 'payload\supabase\26_actualizacion_v930r9_vincular_usuarios_empleados.sql') (Join-Path $projectRoot 'supabase\26_actualizacion_v930r9_vincular_usuarios_empleados.sql') -Force
Copy-Item (Join-Path $PSScriptRoot 'MAPEO_TABLET_ULTRACOMPACTA_V930_R10.md') (Join-Path $projectRoot 'MAPEO_TABLET_ULTRACOMPACTA_V930_R10.md') -Force
Copy-Item (Join-Path $PSScriptRoot 'APLICAR_V9.3.0_R10.md') (Join-Path $projectRoot 'APLICAR_V9.3.0_R10.md') -Force

Write-Host "OK: V9.3.0 R10 aplicada." -ForegroundColor Green
Write-Host "Respaldo: $backup" -ForegroundColor Yellow
Write-Host ""
Write-Host "R10 no requiere SQL nuevo." -ForegroundColor Yellow
Write-Host "Ejecute ahora:" -ForegroundColor Cyan
Write-Host "  npm.cmd test"
Write-Host "  npm.cmd run build"
Write-Host "  npm.cmd run dev"
Write-Host ""

import fs from 'node:fs';
import process from 'node:process';

const main=fs.readFileSync('src/main.js','utf8');
const css=fs.readFileSync('src/styles.css','utf8');
const sql=fs.readFileSync('supabase/sql/43_actualizacion_v9390_configuracion_concurrencia.sql','utf8');
const installer=fs.readFileSync('APLICAR_V9390.ps1','utf8');
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));

const checks=[
  ['versión V9.3.9.0 o superior sincronizada',/^(?:9\.3\.9\.[0-9]+|9\.4\.0)$/.test(pkg.version)&&main.includes(`V${pkg.version} PWA`)],
  ['conexión solo desde variables de entorno',/VITE_SUPABASE_URL/.test(main)&&/VITE_SUPABASE_ANON_KEY/.test(main)&&!main.includes('jmcbaduxjrzfnesbslmp.supabase.co')&&!main.includes('sb_publishable_')],
  ['configuración incompleta se bloquea',main.includes('Configuración incompleta: define VITE_SUPABASE_URL')],
  ['configuración remota es autoritativa',/normalizeSystemConfig\(cfgPatch\)/.test(main)],
  ['guardado global usa RPC transaccional',main.includes("sb.rpc('guardar_configuracion_v9390'")],
  ['fallo no conserva cambio local',main.includes('Ningún cambio local fue aplicado')],
  ['configuración se sincroniza por Realtime',main.includes("table:'sistema_configuracion'")&&main.includes('refreshSystemConfigV9390')],
  ['diálogo integrado reemplaza alertas nativas',main.includes('window.alert=appAlert')&&css.includes('.app-alert-card-v9390')],
  ['zona horaria dominicana centralizada',main.includes("BUSINESS_TIME_ZONE = 'America/Santo_Domingo'")&&main.includes('function businessDateTime')&&main.includes('function businessTime')],
  ['perfil administrativo no se inventa por correo',!main.includes("email==='apocalipsis218@gmail.com'")],
  ['SQL agrega revisión de configuración',/add column if not exists revision bigint/.test(sql)],
  ['SQL guarda historial inmutable',/sistema_configuracion_historial_v9390/.test(sql)&&/revoke all/.test(sql)],
  ['SQL bloquea guardado a no administradores',/es_admin_operativo\(\)/.test(sql)],
  ['SQL serializa escrituras concurrentes',/for update/.test(sql)],
  ['SQL expone RPC autenticada',/grant execute on function public\.guardar_configuracion_v9390/.test(sql)],
  ['SQL no destruye datos',!/\b(drop table|truncate|delete from)\b/i.test(sql)],
  ['instalador enumera archivos recursivamente',/Get-ChildItem -Path \$hotfixDir -Recurse -File/.test(installer)],
  ['instalador reemplaza cada ruta exacta',/Substring\(\$hotfixDir\.Length\)/.test(installer)&&/Copy-Item \$file\.FullName \$target -Force/.test(installer)],
  ['instalador rechaza paquetes incompletos',/if \(\$files\.Count -lt 100\)/.test(installer)],
  ['instalador valida sintaxis antes de probar',/node --check \.\\src\\main\.js/.test(installer)],
  ['instalador no usa copia defectuosa por directorio',!/Get-ChildItem -Path \$patchDir -Force \| ForEach-Object/.test(installer)]
];

let failed=0;
for(const [name,ok] of checks){
  console.log(`${ok?'OK':'ERROR'} - ${name}`);
  if(!ok) failed++;
}
if(failed){
  console.error(`Auditoría V9.3.9.0 falló con ${failed} control(es).`);
  process.exit(1);
}
console.log('Auditoría Consolidación Técnica V9.3.9.0 aprobada.');

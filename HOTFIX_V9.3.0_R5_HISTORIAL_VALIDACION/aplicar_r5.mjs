import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const patchDir=path.dirname(fileURLToPath(import.meta.url));
const project=process.cwd();
const source=path.join(patchDir,'archivos');
const required=path.join(project,'src','main.js');
if(!fs.existsSync(required)){
  console.error('ERROR: ejecuta este instalador desde la carpeta raíz de productos-cesar-crm.');
  process.exit(1);
}
const current=fs.readFileSync(required,'utf8');
if(!current.includes('V9.3.0 R4') && !current.includes('V9.3.0 R5')){
  console.error('ERROR: no encontré la base V9.3.0 R4/R5 esperada en src/main.js. No se modificó nada.');
  process.exit(1);
}
const stamp=new Date().toISOString().replace(/[:.]/g,'-');
const backup=path.join(project,`respaldo_v930_r5_${stamp}`);
fs.mkdirSync(backup,{recursive:true});
const files=[
  'src/main.js','src/styles.css','package.json','package-lock.json',
  'tests/auditoria_validacion.mjs','tests/auditoria_validacion_historial_v930r5.mjs',
  'supabase/25_actualizacion_v930r5_historial_validacion.sql'
];
for(const rel of files){
  const dst=path.join(project,rel); const src=path.join(source,rel);
  if(fs.existsSync(dst)){
    const b=path.join(backup,rel); fs.mkdirSync(path.dirname(b),{recursive:true}); fs.copyFileSync(dst,b);
  }
  fs.mkdirSync(path.dirname(dst),{recursive:true}); fs.copyFileSync(src,dst);
}
for(const name of ['APLICAR_V9.3.0_R5.md','MAPEO_VALIDACION_HISTORIAL_V930_R5.md']){
  fs.copyFileSync(path.join(patchDir,name),path.join(project,name));
}
console.log('\nProductos César CRM - V9.3.0 R5 aplicado.');
console.log('Respaldo:',backup);
console.log('Ejecutando auditoría R5...\n');
const audit=spawnSync(process.execPath,['tests/auditoria_validacion_historial_v930r5.mjs'],{cwd:project,stdio:'inherit'});
if(audit.status!==0){
  console.error('\nERROR: la auditoría R5 no aprobó. Usa el respaldo indicado.');
  process.exit(audit.status||1);
}
console.log('\nSiguiente paso:');
console.log('  1) Ejecutar SQL 25 en Supabase, si todavía no se ejecutó.');
console.log('  2) npm.cmd test');
console.log('  3) npm.cmd run build');
console.log('  4) npm.cmd run dev');

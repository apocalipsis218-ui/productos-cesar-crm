import fs from 'node:fs';
const code=fs.readFileSync(new URL('../src/main.js', import.meta.url),'utf8');
const checks=[
  ['formulario de recuperación', code.includes('function renderPasswordRecovery')],
  ['evento PASSWORD_RECOVERY', code.includes("event==='PASSWORD_RECOVERY'")],
  ['actualización de contraseña', code.includes('sb.auth.updateUser({password:a})')],
  ['proyecto visible', code.includes('SUPABASE_PROJECT_REF')],
  ['mensaje de login mejorado', code.includes('Supabase rechazó el correo o la contraseña')],
];
let failed=0;
for(const [name,ok] of checks){ console.log(`${ok?'OK':'FAIL'} - ${name}`); if(!ok) failed++; }
if(failed) process.exit(1);
console.log('Auditoría recuperación V9.3.0 R2 completada.');

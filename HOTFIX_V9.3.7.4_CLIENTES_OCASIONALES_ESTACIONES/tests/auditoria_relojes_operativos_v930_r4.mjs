import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(process.cwd());
const p=path.join(root,'src','main.js');
const s=fs.readFileSync(p,'utf8');
const checks=[
  ['marcador R4',s.includes('// V9.3.0 R4 - relojes operativos protegidos contra acciones sin transición')],
  ['entrada por transición real',s.includes('function stageTransitionTimeFor(o,stage)')],
  ['ignora eventos sin cambio',s.includes('function isRealStateTransition(h)')],
  ['proceso usa etapa estable',s.includes('stageEntryAt(o,stage) || createdAtOf(o)')],
  ['impresión no inicia Facturación',!s.includes("|| o.ultima_impresion || null;")],
  ['Liquidación no inicia En ruta',!s.includes("histTimeFor(o,['En ruta','Entregado'")],
];
let failed=0;
for(const [name,ok] of checks){ console.log((ok?'OK  ':'FALLO ') + name); if(!ok) failed++; }
if(failed) process.exit(1);
console.log('\nAuditoría de relojes aprobada.');

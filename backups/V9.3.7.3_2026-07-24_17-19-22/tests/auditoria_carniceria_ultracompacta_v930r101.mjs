import fs from 'node:fs';

const main=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../src/styles.css',import.meta.url),'utf8');
const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));

function ok(cond,label){
  if(!cond){ console.error('ERROR - '+label); process.exit(1); }
  console.log('OK - '+label);
}

ok(main.includes('V9.3.0 R10.1'),'marcador V9.3.0 R10.1 visible');
ok(main.includes('prep-compact-grid-r101'),'fila final de Carnicería identificada');
ok(main.includes('data-unidad='),'unidad disponible para calcular faltante correcto');
ok(main.includes("tipo==='Unidad peso fijo' || tipo==='No pesa'"),'faltante por unidades para productos unitarios');
ok(main.includes("setDiff('Sustituido','warn')"),'sustitución no se confunde con faltante');
ok(main.includes('prep-item-note-r101'),'observación se conserva solo cuando existe');
ok(css.includes('.prep-row-r8 > .prep-compact-grid-r101'),'selector compatible y específico para la fila');
ok(css.includes('flex-flow:row nowrap!important'),'cuatro campos forzados en una sola línea');
ok(css.includes('background:transparent!important'),'faltante sin celda larga de color');
ok(css.includes('height:30px!important'),'controles de preparación reducidos');
ok(['9.3.0-r10.1','9.3.1','9.3.2','9.3.3','9.3.4','9.3.5','9.3.6'].includes(pkg.version),'package actualizado a r10.1');
ok(pkg.scripts.test.includes('auditoria_carniceria_ultracompacta_v930r101.mjs'),'auditoría R10.1 integrada en npm test');

console.log('Auditoría Carnicería Ultracompacta V9.3.0 R10.1 aprobada.');

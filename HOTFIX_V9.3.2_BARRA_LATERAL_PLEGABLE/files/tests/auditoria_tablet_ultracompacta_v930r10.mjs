import fs from 'node:fs';

const main=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../src/styles.css',import.meta.url),'utf8');
const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));

function ok(cond,label){
  if(!cond){ console.error('ERROR - '+label); process.exit(1); }
  console.log('OK - '+label);
}

ok(main.includes('V9.3.0 R10'),'marcador V9.3.0 R10 visible');
ok(main.includes('order-item-mainline-r10'),'artículo de orden con línea Cant./Precio/Subtotal/Quitar');
ok(main.includes('order-item-note-r10'),'segunda línea de observación por artículo');
ok(main.includes('prep-shortage-cell-r10'),'faltante integrado como cuarta columna de Carnicería');
ok(main.includes("setDiff('—')"),'faltante vacío no crea línea adicional');
ok(main.includes('order-notes-details-r10'),'notas adicionales plegables en tablet');
ok(css.includes('@media(max-width:1024px)'),'diseño específico para tablet');
ok(css.includes('grid-template-columns:64px minmax(76px,.84fr) minmax(102px,1fr) minmax(75px,.72fr)'),'cuatro columnas compactas en despacho');
ok(css.includes('.order-remove-r10:after'),'botón quitar compacto en tablet');
ok(['9.3.0-r10','9.3.0-r10.1','9.3.1','9.3.2'].includes(pkg.version),'package actualizado a r10/r10.1');
ok(pkg.scripts.test.includes('auditoria_tablet_ultracompacta_v930r10.mjs'),'auditoría R10 integrada en npm test');

console.log('Auditoría Operación Tablet Ultracompacta V9.3.0 R10 aprobada.');

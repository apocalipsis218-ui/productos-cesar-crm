import fs from 'node:fs';
const main=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../src/styles.css',import.meta.url),'utf8');
const checks=[
  ['productos en fichas móviles',main.includes('product-mobile-list')&&css.includes('.product-mobile-card')],
  ['productividad en fichas móviles',main.includes('productivity-mobile-list')&&css.includes('.productivity-mobile-card')],
  ['kanban sin altura fija móvil',css.includes('.kanban-col{height:auto!important;min-height:0!important')],
  ['guardar orden no cubre campos',css.includes('.order-modal .save-order-btn{position:static!important')],
  ['barra inferior oculta en modal',main.includes("document.body.classList.add('modal-open')")&&css.includes('body.modal-open .bottom-nav')],
  ['configuración con filas separadas',css.includes('.config-overview')&&css.includes('.config-status')],
  ['versión R3 visible',main.includes('V9.3.0 R3')]
];
const failed=checks.filter(([,ok])=>!ok);
for(const [name,ok] of checks) console.log(`${ok?'✓':'✗'} ${name}`);
if(failed.length) process.exit(1);
console.log('Auditoría móvil V9.3.0 R3 completada.');

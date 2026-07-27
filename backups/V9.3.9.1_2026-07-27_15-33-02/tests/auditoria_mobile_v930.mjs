import fs from 'node:fs';
const js=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../src/styles.css',import.meta.url),'utf8');
const checks=[
  ['versión V9.3.0',js.includes('V9.3.0 Mobile First')],
  ['navegación móvil priorizada',js.includes('function mobilePrimaryPages')&&js.includes('data-mobile-more')],
  ['menú Más móvil',js.includes('function openMobileMoreMenu')&&css.includes('.mobile-more-sheet')],
  ['etiquetas compactas',js.includes('MOBILE_BUTTON_LABELS')&&js.includes('applyMobileLabels')],
  ['kanban por etapas',js.includes('kanban-mobile-tabs')&&js.includes('data-kanban-mobile-stage')],
  ['safe area inferior',css.includes('env(safe-area-inset-bottom')],
  ['tarjetas KPI dos columnas',css.includes('report-v9215-kpis')&&css.includes('repeat(2,minmax(0,1fr))')],
  ['modal tipo hoja inferior',css.includes('.mobile-sheet-handle')&&css.includes('align-items:flex-end')],
  ['botones táctiles compactos',css.includes('min-height:40px')],
  ['interfaz escritorio preservada',css.includes('@media(min-width:821px)')]
];
let failed=0;for(const [name,ok] of checks){console.log(`${ok?'OK':'ERROR'} - ${name}`);if(!ok)failed++;}
if(failed){console.error(`Fallaron ${failed} comprobaciones móviles.`);process.exit(1);}console.log('Auditoría Mobile First V9.3.0 completada.');

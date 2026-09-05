import fs from 'node:fs';
import assert from 'node:assert/strict';

const main=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../src/styles.css',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const readme=fs.readFileSync(new URL('../README.md',import.meta.url),'utf8');
const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));

function functionBody(name,next='function '){
  const start=main.indexOf(`function ${name}`);
  assert.ok(start>=0,`No se encontró ${name}`);
  const end=main.indexOf(next,start+12);
  return main.slice(start,end<0?main.length:end);
}

const scheduler=functionBody('scheduleSearchRenderV9456');
const patcher=functionBody('patchSearchNodeV9456');
const enhancer=functionBody('enhanceSearchFieldsV9456');
const live=functionBody('renderLiveSafelyV9456');
const expectedHandlers=[
  'callSearch','clientSearch','specialSearch','orderSearch','productSearch','alertSearch',
  'kanbanHistorySearch','kanbanSearch','auditExceptionSearch','auditSearch','userSearch',
  'carniceriaSearch','facturacionHistorySearch','validationHistorySearch','pickupSearch',
  'validacionSearch','deliverySearch','cxcSearch','cxcHistorySearch','liquidacionSearch'
];

const checks=[
  ['espera breve para escritura rápida',
    main.includes('const SEARCH_RENDER_DELAY_V9456=150') &&
    scheduler.includes('setTimeout') && scheduler.includes('clearTimeout')],
  ['el input activo se conserva físicamente',
    patcher.includes('if(current===active)') &&
    patcher.includes('syncElementAttributesV9456(current,incoming,true)')],
  ['cursor y selección permanecen en su posición',
    main.includes('input.selectionStart') && main.includes('input.selectionEnd') &&
    main.includes('input.setSelectionRange(pos,end)')],
  ['teclado predictivo y composición protegidos',
    enhancer.includes('compositionstart') && enhancer.includes('compositionend') &&
    scheduler.includes("input.dataset.searchComposing==='1'")],
  ['atributos táctiles y botón nativo de limpiar',
    enhancer.includes("setAttribute('type','search')") &&
    enhancer.includes("setAttribute('inputmode','search')") &&
    enhancer.includes("setAttribute('enterkeyhint','search')") &&
    css.includes('::-webkit-search-cancel-button')],
  ['mejora aplicada a páginas y ventanas de búsqueda',
    main.includes('enhanceSearchFieldsV9456(c);') &&
    main.includes('enhanceSearchFieldsV9456(m);') &&
    (main.match(/placeholder="Buscar/gi)||[]).length>=10],
  ['tipografía mínima evita zoom en tablet',
    /input\[data-stable-search="v9456"\]\{font-size:16px!important/.test(css)],
  ['actualización en vivo no interrumpe una búsqueda',
    live.includes('activeSearchFieldV9456()') &&
    live.includes('deferredLiveRenderV9456=true') &&
    main.includes('bindDeferredSearchRenderV9456()')],
  ['todos los buscadores principales usan la capa estable',
    expectedHandlers.every(key=>{
      const i=main.indexOf(`state.${key}=e.target.value`);
      const lineEnd=main.indexOf('\n',i);
      return i>=0 && main.slice(i,lineEnd<0?main.length:lineEnd).includes('scheduleSearchRenderV9456');
    })],
  ['los historiales dinámicos también usan la capa estable',
    main.includes('state[keys.search]=e.target.value') &&
    /state\[keys\.search\]=e\.target\.value;[^\n]*scheduleSearchRenderV9456/.test(main)],
  ['el panel operativo genérico también usa la capa estable',
    /state\[searchKey\]=e\.target\.value;[^\n]*scheduleSearchRenderV9456/.test(main)],
  ['no queda el patrón antiguo de reenfoque por cada tecla',
    !/oninput=e=>\{[^\n]{0,260}render(?:Ordenes|Productos|Clientes|Carniceria|Validacion|Delivery|Liquidacion)[^\n]{0,180}focusAfterRender/.test(main)],
  ['versión V9.4.5.6 sincronizada e integrada en pruebas',
    main.includes('V9.4.5.6 PWA') &&
    html.includes('revisión funcional V9.4.5.6') &&
    readme.includes('V9.4.5.6 — Búsquedas estables en PC y tablet') &&
    pkg.scripts.pretest.includes('auditoria_busquedas_estables_v9456.mjs')]
];

for(const [name,ok] of checks){
  assert.equal(Boolean(ok),true,`FALLO: ${name}`);
  console.log(`OK - ${name}`);
}

console.log('Auditoría V9.4.5.6 aprobada: búsquedas estables en PC, tablet y actualizaciones en vivo.');

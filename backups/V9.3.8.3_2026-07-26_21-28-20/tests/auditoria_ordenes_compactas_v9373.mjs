import fs from 'node:fs';
import assert from 'node:assert/strict';

const main=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../src/styles.css',import.meta.url),'utf8');
const pwa=fs.readFileSync(new URL('../src/pwa.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));
const wrangler=JSON.parse(fs.readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8'));

const checks=[
  ['versión V9.3.7.3 sincronizada',main.includes('V9.3.8.2')&&pwa.includes("APP_VERSION = 'V9.3.8.2 PWA'")&&html.includes('V9.3.8.2 PWA')&&pkg.version==='9.3.8.2'],
  ['Wrangler conserva publicación SPA',wrangler.name==='crm-productoscesar'&&wrangler.assets?.directory==='./dist'&&wrangler.assets?.not_found_handling==='single-page-application'],
  ['Wrangler actualizado',wrangler.compatibility_date==='2026-07-24'],
  ['paginación limita 25 órdenes',main.includes('const pageSize=25')&&main.includes('pageRows=rows.slice')&&main.includes('orderPrev')&&main.includes('orderNext')],
  ['prioriza vencidas y urgentes',main.includes('late(b)-late(a)')&&main.includes('priority(b)-priority(a)')],
  ['tarjeta compacta activa',main.includes('order-compact-card')&&css.includes('.order-compact-card')],
  ['productos plegados por orden',main.includes('<details class="order-compact-detail">')&&main.includes('Ver productos y observaciones')],
  ['acciones secundarias agrupadas',main.includes('<details class="order-more">')&&css.includes('.order-more-menu')],
  ['barra de estados compacta',main.includes('orders-flow-strip')&&css.includes('.orders-flow-strip')],
  ['búsqueda ampliada',main.includes('Cliente, orden, teléfono o producto...')],
  ['diseño adaptable',css.includes('@media(max-width:700px)')&&css.includes('.order-compact-card{grid-template-columns:1fr}')],
  ['corrección V9.3.7.2 conservada',fs.existsSync(new URL('../supabase/32_actualizacion_v9372_credito_cero_lote_manual.sql',import.meta.url))]
];

for(const [name,ok] of checks){
  assert.equal(Boolean(ok),true,`FALLO: ${name}`);
  console.log(`OK - ${name}`);
}
console.log('Auditoría Órdenes Compactas V9.3.7.3 aprobada.');

import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(process.argv[2] || process.cwd());
const mainPath = path.join(projectRoot, 'src', 'main.js');

function fail(message) {
  console.error(`\nERROR: ${message}\n`);
  process.exit(1);
}

if (!fs.existsSync(mainPath)) {
  fail(`No encontré ${mainPath}. Ejecuta este archivo desde la carpeta raíz de productos-cesar-crm.`);
}

let source = fs.readFileSync(mainPath, 'utf8');
const marker = '// V9.3.0 R4 - relojes operativos protegidos contra acciones sin transición';

if (source.includes(marker)) {
  console.log('El HOTFIX V9.3.0 R4 ya está aplicado. No se hicieron cambios.');
  process.exit(0);
}

function replaceBetween(text, startMarker, endMarker, replacement, label) {
  const start = text.indexOf(startMarker);
  if (start < 0) fail(`No encontré el inicio de ${label}: ${startMarker}`);
  const end = text.indexOf(endMarker, start + startMarker.length);
  if (end < 0) fail(`No encontré el final de ${label}: ${endMarker}`);
  return text.slice(0, start) + replacement + '\n' + text.slice(end);
}

const orderProcessReplacement = `${marker}
function orderProcessStartedAt(o){
  const stage=currentModuleOfOrder(o);
  return stage ? (stageEntryAt(o,stage) || createdAtOf(o)) : createdAtOf(o);
}`;

source = replaceBetween(
  source,
  'function orderProcessStartedAt(o){',
  'function processClockBadge(o){',
  orderProcessReplacement,
  'orderProcessStartedAt'
);

const historyReplacement = `function orderHistoryFor(o){
  return (state.historialEstados||[]).filter(h=>Number(h.orden_id)===Number(o?.id));
}
function stateStageName(value){
  const st=String(value||'').trim();
  if(['Pedido recibido','En preparación'].includes(st)) return 'carniceria';
  if(['Lista para facturar','Impresa para facturar'].includes(st)) return 'facturacion';
  if(['Facturada','Validada para delivery'].includes(st)) return 'validacion';
  if(['Asignada a delivery','En ruta'].includes(st)) return 'delivery';
  if(['Entregado','Cobrado','Entregado a crédito','No entregado','Devuelto parcial','Cerrado'].includes(st)) return 'liquidacion';
  return '';
}
function isRealStateTransition(h){
  const before=String(h?.estado_anterior||'').trim();
  const after=String(h?.estado_nuevo||'').trim();
  return !!after && before!==after;
}
function historyTransitionsFor(o){
  return orderHistoryFor(o).filter(isRealStateTransition);
}
function histTimeFor(o, estados, {transitionsOnly=true}={}){
  const names=Array.isArray(estados)?estados:[estados];
  const sourceRows=transitionsOnly ? historyTransitionsFor(o) : orderHistoryFor(o);
  const rows=sourceRows
    .filter(h=>names.includes(h.estado_nuevo))
    .sort((a,b)=>new Date(b.creado_en)-new Date(a.creado_en));
  return rows[0]?.creado_en || null;
}
function stageTransitionTimeFor(o,stage){
  const rows=historyTransitionsFor(o)
    .filter(h=>stateStageName(h.estado_nuevo)===stage && stateStageName(h.estado_anterior)!==stage)
    .sort((a,b)=>new Date(b.creado_en)-new Date(a.creado_en));
  return rows[0]?.creado_en || null;
}
function closedAtOf(o){
  return histTimeFor(o,['Cobrado','Entregado a crédito','No entregado','Devuelto parcial','Cerrado','Anulado']);
}`;

source = replaceBetween(
  source,
  'function orderHistoryFor(o){',
  'function totalOrderClockBadge(o){',
  historyReplacement,
  'historial y cálculo de transiciones'
);

const stageEntryReplacement = `function stageEntryAt(o,stage){
  if(!o) return null;
  const transitionAt=stageTransitionTimeFor(o,stage);
  if(transitionAt) return transitionAt;
  if(stage==='carniceria') return createdAtOf(o);
  if(stage==='facturacion') return o.preparado_en || null;
  if(stage==='validacion') return o.facturado_en || null;
  if(stage==='delivery') return o.asignado_delivery_en || o.en_ruta_en || null;
  if(stage==='liquidacion') return o.recibido_en || null;
  return null;
}`;

source = replaceBetween(
  source,
  'function stageEntryAt(o,stage){',
  'function stageExitAt(o,stage){',
  stageEntryReplacement,
  'stageEntryAt'
);

const validations = [
  [source.includes(marker), 'No quedó instalado el marcador del hotfix.'],
  [source.includes('function stageTransitionTimeFor(o,stage)'), 'No quedó instalada la detección de entrada real a etapa.'],
  [source.includes("if(stage==='liquidacion') return o.recibido_en || null;"), 'Liquidación no quedó separada correctamente de En ruta.'],
  [!source.includes("if(stage==='facturacion') return histTimeFor"), 'Persistió el cálculo antiguo de Facturación.'],
  [!source.includes("|| o.ultima_impresion || null;"), 'Persistió ultima_impresion como inicio de etapa.'],
];
for (const [ok, message] of validations) if (!ok) fail(message);

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = `${mainPath}.respaldo-${stamp}`;
fs.copyFileSync(mainPath, backupPath);
fs.writeFileSync(mainPath, source, 'utf8');

const testsDir = path.join(projectRoot, 'tests');
fs.mkdirSync(testsDir, { recursive: true });
const auditPath = path.join(testsDir, 'auditoria_relojes_operativos_v930_r4.mjs');
const auditSource = `import fs from 'node:fs';\nimport path from 'node:path';\nconst root=path.resolve(process.cwd());\nconst p=path.join(root,'src','main.js');\nconst s=fs.readFileSync(p,'utf8');\nconst checks=[\n  ['marcador R4',s.includes('${marker}')],\n  ['entrada por transición real',s.includes('function stageTransitionTimeFor(o,stage)')],\n  ['ignora eventos sin cambio',s.includes('function isRealStateTransition(h)')],\n  ['proceso usa etapa estable',s.includes('stageEntryAt(o,stage) || createdAtOf(o)')],\n  ['impresión no inicia Facturación',!s.includes("|| o.ultima_impresion || null;")],\n  ['Liquidación no inicia En ruta',!s.includes("histTimeFor(o,['En ruta','Entregado'")],\n];\nlet failed=0;\nfor(const [name,ok] of checks){ console.log((ok?'OK  ':'FALLO ') + name); if(!ok) failed++; }\nif(failed) process.exit(1);\nconsole.log('\\nAuditoría de relojes aprobada.');\n`;
fs.writeFileSync(auditPath, auditSource, 'utf8');

console.log('\nHOTFIX V9.3.0 R4 aplicado correctamente.');
console.log(`Archivo modificado: ${mainPath}`);
console.log(`Respaldo creado:   ${backupPath}`);
console.log(`Auditoría creada:  ${auditPath}`);
console.log('\nSiguiente paso:');
console.log('  node tests/auditoria_relojes_operativos_v930_r4.mjs');
console.log('  npm.cmd test');
console.log('  npm.cmd run build');
console.log('  npm.cmd run dev');

import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  CASH_DENOMINATIONS_V945,
  cashBreakdownFromCountsV945,
  cashBreakdownNonZeroV945,
  normalizeCashBreakdownV945,
  reconcileCashBreakdownV945
} from '../src/cashBreakdownV945.js';

const read=path=>fs.readFileSync(new URL(path,import.meta.url),'utf8').replace(/\r\n/g,'\n');
const main=read('../src/main.js');
const css=read('../src/styles.css');
const sql=read('../supabase/migrations/20260823143000_v945_desglose_efectivo_liquidacion.sql');
const sqlR2=read('../supabase/migrations/20260823193000_v945_r2_desglose_individual.sql');
const pkg=JSON.parse(read('../package.json'));

assert.deepEqual(CASH_DENOMINATIONS_V945,[2000,1000,500,200,100,50,25,10,5,1]);

const exact=reconcileCashBreakdownV945(cashBreakdownFromCountsV945({2000:9,1000:1,200:1,100:1,50:1,25:1,10:1,5:1,1:4}),19394);
assert.equal(exact.counted,19394);
assert.equal(exact.adjustment,0);
assert.equal(exact.difference,0);
assert.equal(exact.canClose,true);

const fractionUp=reconcileCashBreakdownV945(cashBreakdownFromCountsV945({2000:9,1000:1,200:1,100:1,50:1,25:1,10:1,5:1,1:5}),19394.5);
assert.equal(fractionUp.counted,19395);
assert.equal(fractionUp.adjustment,-0.5);
assert.equal(fractionUp.difference,0);
assert.equal(fractionUp.canClose,true);

const fractionDown=reconcileCashBreakdownV945(cashBreakdownFromCountsV945({2000:9,1000:1,200:1,100:1,50:1,25:1,10:1,5:1,1:4}),19394.5);
assert.equal(fractionDown.adjustment,0);
assert.equal(fractionDown.canClose,false);

const shortage=reconcileCashBreakdownV945(cashBreakdownFromCountsV945({1000:19}),19394.5);
assert.equal(shortage.adjustment,0);
assert.equal(shortage.canClose,false);
assert.equal(shortage.rawDifference,-394.5);

const creditOnly=reconcileCashBreakdownV945(cashBreakdownFromCountsV945({}),0);
assert.equal(creditOnly.counted,0);
assert.equal(creditOnly.canClose,true);

assert.throws(()=>normalizeCashBreakdownV945([{denominacion:2000,cantidad:-1}]),/entero/);
assert.throws(()=>normalizeCashBreakdownV945([{denominacion:2000,cantidad:1.5}]),/entero/);
assert.throws(()=>normalizeCashBreakdownV945([{denominacion:250,cantidad:1}]),/no permitida/);
assert.throws(()=>normalizeCashBreakdownV945([{denominacion:2000,cantidad:1},{denominacion:2000,cantidad:2}]),/repetida/);
assert.deepEqual(cashBreakdownNonZeroV945(cashBreakdownFromCountsV945({500:2,25:3})),[
  {denominacion:500,cantidad:2,subtotal:1000},
  {denominacion:25,cantidad:3,subtotal:75}
]);

const checks=[
  ['versión V9.4.5 sincronizada',pkg.version==='9.4.5'&&/V9\.4\.5 PWA/.test(main)],
  ['helpers usados por la interfaz están importados',/import \{[\s\S]*cashBreakdownFromCountsV945,[\s\S]*normalizeCashBreakdownV945,[\s\S]*reconcileCashBreakdownV945[\s\S]*\} from '\.\/cashBreakdownV945\.js';/.test(main)],
  ['ficha usa las diez denominaciones',/CASH_DENOMINATIONS_V945/.test(main)&&/data-cash-sheet-denomination/.test(main)],
  ['botón compacto se usa en lote e individual',(main.match(/cashBreakdownTriggerHtmlV945\(/g)||[]).length>=3&&/Desglose de efectivo/.test(main)],
  ['ficha vertical muestra cantidad por denominación y subtotal',/cash-sheet-row/.test(main)&&/×/.test(main)&&/data-cash-sheet-subtotal/.test(main)],
  ['Enter recorre desde RD$2,000 hasta aplicar',/bindEnterFlow\(\[\.\.\.inputs,apply\]\)/.test(main)&&/focusAndSelect\(inputs\[0\]\)/.test(main)],
  ['ficha muestra esperado, contado, ajuste y diferencia',/cash-sheet-expected/.test(main)&&/cashSheetCounted/.test(main)&&/cashSheetAdjustment/.test(main)&&/cashSheetDifference/.test(main)],
  ['diferencia bloquea cierre',/!summaryNow\.cashBreakdown\.canClose/.test(main)],
  ['diferencia bloquea recepción individual',/!x\.cashBreakdown\.canClose/.test(main)],
  ['pago mixto separa efectivo físico',/liqMixedPhysical/.test(main)&&/El efectivo físico no puede superar el monto total recibido/.test(main)],
  ['carga exige columnas R2 antes de habilitar la función',/select\('id,liquidacion_id,lote_id,orden_id,tipo_recepcion,codigo_lote,metodo,monto_recibido_total/.test(main)&&/state\.liquidacionEfectivoSchemaOk=!conteosEfectivo\.error/.test(main)],
  ['recibo imprime el conteo',/cashBreakdownReceiptHtml/.test(main)&&/Conteo físico de efectivo/.test(main)],
  ['historial consolida conteos individuales',/cashCountForLiquidation/.test(main)&&/individual_consolidado/.test(main)&&/cashBreakdownFromCountsV945\(counts\)/.test(main)],
  ['diseño vertical compacto y adaptable',/cash-breakdown-sheet-modal/.test(css)&&/cash-sheet-row/.test(css)&&/width:min\(470px,100%\)/.test(css)],
  ['tabla conserva el snapshot',/create table if not exists public\.liquidacion_efectivo_conteos_v945/.test(sql)&&/desglose jsonb not null/.test(sql)],
  ['RPC es transaccional y reutiliza cierre vigente',/function public\.recibir_lote_cxc_v945/.test(sql)&&/public\.recibir_lote_cxc_v9393/.test(sql)],
  ['R2 vincula cada conteo individual con orden y lote',/add column if not exists orden_id bigint/.test(sqlR2)&&/tipo_recepcion text not null default 'lote'/.test(sqlR2)&&/uq_liquidacion_efectivo_v945_orden/.test(sqlR2)],
  ['R2 recibe resultado normal o devolución parcial en una transacción',/function public\.recibir_orden_cxc_v945/.test(sqlR2)&&/public\.recibir_orden_cxc_v9393/.test(sqlR2)&&/public\.registrar_devolucion_parcial_v9392/.test(sqlR2)],
  ['R2 vincula conteos previos cuando cierra el lote',/set liquidacion_id=v_liquidacion_id[\s\S]*tipo_recepcion='individual' and liquidacion_id is null/.test(sqlR2)],
  ['R2 valida método, efectivo físico y diez denominaciones',/v_metodo not in\('Efectivo','Transferencia','Mixto','Crédito','No aplica'\)/.test(sqlR2)&&/En pago mixto/.test(sqlR2)&&/exactamente las diez denominaciones/.test(sqlR2)],
  ['servidor valida denominaciones',/exactamente las diez denominaciones/.test(sql)&&/2000,1000,500,200,100,50,25,10,5,1/.test(sql)],
  ['servidor valida total canónico',/select codigo_lote,round\(efectivo_recibido,2\)/.test(sql)&&/v_contado<>round\(v_esperado,0\)/.test(sql)&&/El efectivo físico no cuadra/.test(sql)],
  ['ajuste se limita a menos de un peso',/check\(abs\(ajuste_fraccion\)<1\)/.test(sql)&&/if abs\(v_ajuste\)>=1/.test(sql)],
  ['escritura directa permanece cerrada',/revoke all on table public\.liquidacion_efectivo_conteos_v945 from public,anon,authenticated/.test(sql)],
  ['RPC no se expone a anónimo',/revoke execute on function public\.recibir_lote_cxc_v945[\s\S]*from public,anon/.test(sql)&&/grant execute on function public\.recibir_lote_cxc_v945[\s\S]*to authenticated/.test(sql)],
  ['RPC individual no se expone a anónimo',/revoke execute on function public\.recibir_orden_cxc_v945[\s\S]*from public,anon/.test(sqlR2)&&/grant execute on function public\.recibir_orden_cxc_v945[\s\S]*to authenticated/.test(sqlR2)],
  ['índices cubren orden y autor',/idx_liquidacion_efectivo_v945_orden/.test(sqlR2)&&/idx_liquidacion_efectivo_v945_creado_por/.test(sqlR2)],
  ['auditoría está integrada',pkg.scripts.pretest.includes('auditoria_liquidacion_efectivo_v945.mjs')]
];
for(const [name,ok] of checks){assert.equal(Boolean(ok),true,`FALLO: ${name}`);console.log('OK - '+name);}

console.log('Auditoría Desglose de Efectivo en Liquidación V9.4.5 aprobada.');

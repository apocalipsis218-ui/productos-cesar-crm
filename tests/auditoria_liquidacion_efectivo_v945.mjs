import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  CASH_DENOMINATIONS_V945,
  batchCashBreakdownReadinessV945,
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
const sqlR3=read('../supabase/migrations/20260824170000_v9452_sobrantes_visibles_autorizacion.sql');
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
assert.equal(fractionDown.hasShortage,true);
assert.equal(fractionDown.canApply,false);

const shortage=reconcileCashBreakdownV945(cashBreakdownFromCountsV945({1000:19}),19394.5);
assert.equal(shortage.adjustment,0);
assert.equal(shortage.canClose,false);
assert.equal(shortage.hasShortage,true);
assert.equal(shortage.canApply,false);
assert.equal(shortage.rawDifference,-394.5);

const surplus=reconcileCashBreakdownV945(cashBreakdownFromCountsV945({2000:1,1000:1,500:1}),3450);
assert.equal(surplus.counted,3500);
assert.equal(surplus.difference,50);
assert.equal(surplus.hasSurplus,true);
assert.equal(surplus.requiresAuthorization,true);
assert.equal(surplus.canApply,true);
assert.equal(surplus.canClose,false);

const creditOnly=reconcileCashBreakdownV945(cashBreakdownFromCountsV945({}),0);
assert.equal(creditOnly.counted,0);
assert.equal(creditOnly.canClose,true);

const partialBatch=batchCashBreakdownReadinessV945({totalClients:5,checkedClients:1,errorCount:0,expectedCash:2324});
assert.equal(partialBatch.pendingClients,4);
assert.equal(partialBatch.allReviewed,false);
assert.equal(partialBatch.canOpen,false);

const invalidBatch=batchCashBreakdownReadinessV945({totalClients:5,checkedClients:5,errorCount:1,expectedCash:2324});
assert.equal(invalidBatch.allReviewed,true);
assert.equal(invalidBatch.valid,false);
assert.equal(invalidBatch.canOpen,false);

const cashBatch=batchCashBreakdownReadinessV945({totalClients:5,checkedClients:5,errorCount:0,expectedCash:8658});
assert.equal(cashBatch.valid,true);
assert.equal(cashBatch.requiresBreakdown,true);
assert.equal(cashBatch.canOpen,true);

const noCashBatch=batchCashBreakdownReadinessV945({totalClients:5,checkedClients:5,errorCount:0,expectedCash:0});
assert.equal(noCashBatch.requiresBreakdown,false);
assert.equal(noCashBatch.canOpen,false);
assert.equal(noCashBatch.canCloseWithoutBreakdown,true);

assert.throws(()=>normalizeCashBreakdownV945([{denominacion:2000,cantidad:-1}]),/entero/);
assert.throws(()=>normalizeCashBreakdownV945([{denominacion:2000,cantidad:1.5}]),/entero/);
assert.throws(()=>normalizeCashBreakdownV945([{denominacion:250,cantidad:1}]),/no permitida/);
assert.throws(()=>normalizeCashBreakdownV945([{denominacion:2000,cantidad:1},{denominacion:2000,cantidad:2}]),/repetida/);
assert.deepEqual(cashBreakdownNonZeroV945(cashBreakdownFromCountsV945({500:2,25:3})),[
  {denominacion:500,cantidad:2,subtotal:1000},
  {denominacion:25,cantidad:3,subtotal:75}
]);

const checks=[
  ['versión V9.4.5 sincronizada',pkg.version==='9.4.5'&&/V9\.4\.5(?:\.2)? PWA/.test(main)],
  ['revisión funcional V9.4.5.1 documentada',/V9\.4\.5\.1 PWA/.test(main)&&/V9\.4\.5\.1 — Cotejo completo/.test(read('../README.md'))],
  ['revisión funcional V9.4.5.2 sincronizada',/V9\.4\.5\.2 PWA/.test(main)&&/V9\.4\.5\.2 — Sobrantes visibles/.test(read('../README.md'))],
  ['helpers usados por la interfaz están importados',/import \{[\s\S]*cashBreakdownFromCountsV945,[\s\S]*normalizeCashBreakdownV945,[\s\S]*reconcileCashBreakdownV945[\s\S]*\} from '\.\/cashBreakdownV945\.js';/.test(main)],
  ['ficha usa las diez denominaciones',/CASH_DENOMINATIONS_V945/.test(main)&&/data-cash-sheet-denomination/.test(main)],
  ['botón compacto se usa en lote e individual',(main.match(/cashBreakdownTriggerHtmlV945\(/g)||[]).length>=3&&/Desglose de efectivo/.test(main)],
  ['desglose por lote exige cotejo completo',/batchCashBreakdownReadinessV945/.test(main)&&/Primero coteja todos los clientes del lote/.test(main)&&/button\.disabled=options\.disabled===true/.test(main)&&/cash-breakdown-trigger \.btn:disabled/.test(css)],
  ['filas inválidas también bloquean el desglose',/current\.breakdownReadiness\.errorCount/.test(main)&&/Corrige los errores del cotejo antes de desglosar el efectivo/.test(main)],
  ['lote sin efectivo no abre una ficha innecesaria',/canCloseWithoutBreakdown/.test(main)&&/El lote cotejado no contiene efectivo físico para desglosar/.test(main)],
  ['cambio posterior invalida el desglose aplicado',/batchCashBreakdownExpected!==null/.test(main)&&/batchCashBreakdown=emptyCashBreakdownV945\(\)/.test(main)&&/batchCashSurplusAuthorization=''/.test(main)],
  ['ficha vertical muestra cantidad por denominación y subtotal',/cash-sheet-row/.test(main)&&/×/.test(main)&&/data-cash-sheet-subtotal/.test(main)],
  ['Enter recorre desde RD$2,000 hasta aplicar',/bindEnterFlow\(\[\.\.\.inputs,apply\]\)/.test(main)&&/focusAndSelect\(inputs\[0\]\)/.test(main)],
  ['ficha muestra esperado, contado, ajuste y diferencia',/cash-sheet-expected/.test(main)&&/cashSheetCounted/.test(main)&&/cashSheetAdjustment/.test(main)&&/cashSheetDifference/.test(main)],
  ['faltante bloquea cierre por lote',/summaryNow\.cashBreakdown\.hasShortage/.test(main)&&/No se puede cerrar el lote: falta/.test(main)],
  ['faltante bloquea recepción individual',/x\.cashBreakdown\.hasShortage/.test(main)&&/No se puede recibir el cliente: falta/.test(main)],
  ['sobrante exige autorización dentro de la ficha',/cashSheetSurplusAuthorization/.test(main)&&/Autorizar sobrante de efectivo/.test(main)&&/Sobrante no autorizado\. El desglose permanece abierto/.test(main)],
  ['ficha reemplaza confirmación nativa',/canAuthorizeCashSurplusV9452/.test(main)&&!/Se detectó un sobrante de .*¿Autorizas aplicar/.test(main)],
  ['frontend limita autorización a Gerencia y Administración',/\['Gerente','Administrador'\]\.includes\(String\(state\.profile\?\.rol/.test(main)&&/Solo Gerencia o Administración puede autorizarlo/.test(main)],
  ['autorización queda vinculada al conteo exacto',/cashBreakdownSurplusAuthorizationKeyV945/.test(main)&&/individualCashSurplusAuthorization/.test(main)&&/batchCashSurplusAuthorization/.test(main)],
  ['recepción rechaza sobrante no autorizado',(main.match(/todavía no está autorizado/g)||[]).length===2&&(main.match(/surplusAuthorized/g)||[]).length>=8],
  ['RPC recibe autorización explícita en ambas rutas',(main.match(/p_autorizar_sobrante:payload\.authorizeSurplus===true/g)||[]).length===2],
  ['pago mixto separa efectivo físico',/liqMixedPhysical/.test(main)&&/El efectivo físico no puede superar el monto total recibido/.test(main)],
  ['carga exige columnas R2 antes de habilitar la función',/select\('id,liquidacion_id,lote_id,orden_id,tipo_recepcion,codigo_lote,metodo,monto_recibido_total/.test(main)&&/state\.liquidacionEfectivoSchemaOk=!conteosEfectivo\.error/.test(main)],
  ['recibo imprime el conteo',/cashBreakdownReceiptHtml/.test(main)&&/Conteo físico de efectivo/.test(main)],
  ['historial consolida conteos individuales',/cashCountForLiquidation/.test(main)&&/individual_consolidado/.test(main)&&/cashBreakdownFromCountsV945\(counts\)/.test(main)],
  ['administración puede abrir el efectivo histórico',/data-cash-history-key/.test(main)&&/openLiquidationCashHistoryV945/.test(main)&&/Detalle del efectivo recibido/.test(main)],
  ['historial distingue cuadrado, sobrante y faltante',/cashHistoryStatusBadgeV9452/.test(main)&&/Sobrante autorizado/.test(main)&&/Faltante/.test(main)&&/Cuadrado/.test(main)],
  ['historial resume sobrantes del período',/history-surplus-alert-v9452/.test(main)&&/cierre\(s\) con sobrante autorizado/.test(main)&&/Total del período/.test(main)],
  ['etiquetas distinguen esperado de físico',/Efectivo esperado/.test(main)&&/Físico contado/.test(main)&&/físico contado/.test(main)],
  ['reimpresión conserva la fecha histórica',/fecha_cierre:l\.fecha_liquidacion\|\|l\.creado_en/.test(main)&&/recibo\.fecha_cierre\|\|new Date\(\)/.test(main)],
  ['diseño vertical compacto y adaptable',/cash-breakdown-sheet-modal/.test(css)&&/cash-sheet-row/.test(css)&&/width:min\(470px,100%\)/.test(css)],
  ['tabla conserva el snapshot',/create table if not exists public\.liquidacion_efectivo_conteos_v945/.test(sql)&&/desglose jsonb not null/.test(sql)],
  ['RPC es transaccional y reutiliza cierre vigente',/function public\.recibir_lote_cxc_v945/.test(sql)&&/public\.recibir_lote_cxc_v9393/.test(sql)],
  ['R2 vincula cada conteo individual con orden y lote',/add column if not exists orden_id bigint/.test(sqlR2)&&/tipo_recepcion text not null default 'lote'/.test(sqlR2)&&/uq_liquidacion_efectivo_v945_orden/.test(sqlR2)],
  ['R2 recibe resultado normal o devolución parcial en una transacción',/function public\.recibir_orden_cxc_v945_r2/.test(sqlR2)&&/public\.recibir_orden_cxc_v9393/.test(sqlR2)&&/public\.registrar_devolucion_parcial_v9392/.test(sqlR2)],
  ['R2 usa nombres RPC únicos para lote e individual',/function public\.recibir_orden_cxc_v945_r2/.test(sqlR2)&&/function public\.recibir_lote_cxc_v945_r2/.test(sqlR2)],
  ['R2 vincula conteos previos cuando cierra el lote',/set liquidacion_id=v_liquidacion_id[\s\S]*tipo_recepcion='individual' and liquidacion_id is null/.test(sqlR2)],
  ['R2 valida método, efectivo físico y diez denominaciones',/v_metodo not in\('Efectivo','Transferencia','Mixto','Crédito','No aplica'\)/.test(sqlR2)&&/En pago mixto/.test(sqlR2)&&/exactamente las diez denominaciones/.test(sqlR2)],
  ['servidor valida denominaciones',/exactamente las diez denominaciones/.test(sql)&&/2000,1000,500,200,100,50,25,10,5,1/.test(sql)],
  ['servidor valida total canónico',/select codigo_lote,round\(efectivo_recibido,2\)/.test(sqlR2)&&/v_conciliado-v_esperado/.test(sqlR2)],
  ['servidor bloquea todo faltante',(sqlR2.match(/bloquead[oa] por faltante/gi)||[]).length===2],
  ['servidor autoriza únicamente sobrantes',(sqlR2.match(/if coalesce\(p_autorizar_sobrante,false\) is not true/g)||[]).length===2&&(sqlR2.match(/v_diferencia>0\.009/g)||[]).length===2],
  ['sobrante conserva usuario fecha y monto',/sobrante_autorizado_por uuid references auth\.users/.test(sqlR2)&&/sobrante_autorizado_en timestamptz/.test(sqlR2)&&/sobrante_monto numeric\(14,2\)/.test(sqlR2)],
  ['ajuste se limita a menos de un peso',/check\(abs\(ajuste_fraccion\)<1\)/.test(sql)&&/if abs\(v_ajuste\)>=1/.test(sql)],
  ['escritura directa permanece cerrada',/revoke all on table public\.liquidacion_efectivo_conteos_v945 from public,anon,authenticated/.test(sql)],
  ['RPC no se expone a anónimo',/revoke execute on function public\.recibir_lote_cxc_v945[\s\S]*from public,anon/.test(sql)&&/grant execute on function public\.recibir_lote_cxc_v945[\s\S]*to authenticated/.test(sql)],
  ['RPC R2 no se exponen a anónimo',/revoke execute on function public\.recibir_orden_cxc_v945_r2[\s\S]*from public,anon/.test(sqlR2)&&/revoke execute on function public\.recibir_lote_cxc_v945_r2[\s\S]*from public,anon/.test(sqlR2)&&/grant execute on function public\.recibir_lote_cxc_v945_r2[\s\S]*to authenticated/.test(sqlR2)],
  ['recibo identifica sobrante autorizado',/Sobrante autorizado:/.test(main)&&/sobrante_autorizado_por_nombre/.test(main)],
  ['índices cubren orden y autor',/idx_liquidacion_efectivo_v945_orden/.test(sqlR2)&&/idx_liquidacion_efectivo_v945_creado_por/.test(sqlR2)],
  ['servidor restringe sobrantes por rol',/validar_autorizacion_sobrante_v9452/.test(sqlR3)&&/not in\('gerente','administrador'\)/.test(sqlR3)&&/Solo Gerencia o Administración puede autorizar/.test(sqlR3)],
  ['autorización histórica no se reasigna al vincular',/actualización posterior que solo vincula el conteo/.test(sqlR3)&&/if not v_autorizacion_nueva then/.test(sqlR3)],
  ['diferencia individual se consolida en el lote',/sincronizar_diferencia_individual_v9452/.test(sqlR3)&&/set diferencia=coalesce/.test(sqlR3)&&/tipo_recepcion='individual'/.test(sqlR3)],
  ['migración V9.4.5.2 no elimina datos',!/(drop table|delete from|truncate table)/i.test(sqlR3)],
  ['funciones auxiliares V9.4.5.2 no son ejecutables por clientes',(sqlR3.match(/revoke all on function public\./g)||[]).length===2&&/from public,anon,authenticated/.test(sqlR3)],
  ['auditoría está integrada',pkg.scripts.pretest.includes('auditoria_liquidacion_efectivo_v945.mjs')]
];
for(const [name,ok] of checks){assert.equal(Boolean(ok),true,`FALLO: ${name}`);console.log('OK - '+name);}

console.log('Auditoría Desglose de Efectivo en Liquidación V9.4.5 aprobada.');

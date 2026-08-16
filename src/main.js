import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import './styles.css';
import { workingMinutesBetween as calculateWorkingMinutes, durationOutlierThreshold, isReopeningTransition } from './operationAnalytics.js';
import { initPwa } from './pwa.js';
import { percentageChange, buildDailySeries, aggregateProducts, aggregateClients, aggregateCrm } from './salesAnalytics.js';
import { calculatePreparedInvoiceAmount, buildQuickInvoiceTransition, QUICK_INVOICE_ALLOWED_STATES } from './invoiceQuick.js';
import { normalizeValidationInvoiceAmount, requireValidationInvoiceAmount } from './validationInvoice.js';
import { buildOperationalLotGroups, evaluateLotCorrection, lotUiKey } from './lotOperationsV936.js';
import { calculateCentralReceipt, cashValueAfterCxcResultChange, consolidateFormalLiquidations, buildPendingDeliveryPanel, deliveryReadOnlyMetrics } from './centralLiquidationV937.js';
import { RESPONSIBLE_TYPES, normalizeResponsibleName, responsibleTypeLabel, inferResponsibleType, mergeResponsibleNames, canTransferOrder } from './tripResponsibilityV9371.js';
import { orderCompositionChange, orderEditPreparationPatch } from './orderWeightRevisionV9376.js';
import { isAuditAdministrator, normalizeExceptionPayload, exceptionSummary } from './auditExceptionsV9378.js';
import { mergeRecentAndPendingOrders, shouldRunFallbackPolling } from './stabilityV9380.js';
import { calculatePartialReturn, deliveredQuantity, netDeliveredWeight, partialReturnMeasure, returnedWeightForMeasure } from './partialReturnsV9392.js';
import { allocateCxcOldest, normalizeManualCxcApplications, cxcApplicationsTotal, groupCxcAccounts, cxcPortfolioSummary } from './cxcV940.js';
import { auxTablesForPageV942, boundedOrderIdsV942, changedOrderIdV942, isOperationalPageV942, realtimeTablesForPageV942, removeRowByIdV942, upsertRowByIdV942 } from './runtimeDataV942.js';
// Compatibilidad de auditoría: V9.2.15 permanece integrada en la V9.3.0 Mobile First.
// Compatibilidad histórica de auditorías: V9.2.14 · Operación y tiempos | V9.2.15 · Ventas, clientes, productos y CRM.
// V9.3.9.7 · Endurecimiento de seguridad operativa.
// V9.4.0 · CXC formal, cobros posteriores, recibos numerados y cartera ligera.
// V9.4.0 R1 · Toma segura de órdenes programadas cuando llega su fecha.
// V9.4.0 R2 · Validación centralizada del área operativa del despachador.
// V9.4.0 R3 · Guardado atómico desde llamadas y programación protegida.
// V9.4.2 PWA · R1: escrituras críticas cerradas y trazabilidad atómica en servidor.
// V9.4.2 PWA · R2: carga por módulo, RLS eficiente y Realtime incremental.
// V9.4.3 PWA · R1: progreso mensual confiable y cola por empleado en Carnicería.
// Conserva factura, pesaje e historial del intento fallido.
// Control conservado: Pulsa “Detallar artículos” para registrar producto, cantidad y peso.
// V9.3.9.1 · Faltantes con seguimiento y liquidación segura de clientes ocasionales.
// V9.3.7.2 · Crédito inicia en cero y creación de lotes compatible con el catálogo real de clientes.
// V9.3.7.1 · Responsables manuales conectados y transferencia individual de pedidos.
// V9.3.7 · Delivery consultivo y Liquidación centralizada, transaccional y sin duplicados.
// V9.3.6 · Corrección segura de lotes y vistas operativas plegables.
// V9.3.5.1 · Monto final editable y obligatorio en Validación por lote e individual.
// V9.3.5 · Facturación rápida y monto visible en Validación.
// V9.3.4 · Historiales compactos, fechas dominicanas y lotes plegables.
// V9.3.3 · Retiros en negocio, ventas internas e impresión configurable.
// V9.3.2 · Navegación lateral plegable por dispositivo.
// V9.3.0 R10.1 · Ajuste final de Carnicería ultracompacta para tablet.
// V9.3.0 R7 · Confirmación de órdenes por WhatsApp sin precios ni montos.
// Conserva la confirmación de órdenes por WhatsApp incorporada en R7.

window.XLSX = XLSX;

const SUPABASE_URL = String(import.meta.env.VITE_SUPABASE_URL||'').trim();
const SUPABASE_KEY = String(import.meta.env.VITE_SUPABASE_ANON_KEY||'').trim();
if(!SUPABASE_URL || !SUPABASE_KEY){
  throw new Error('Configuración incompleta: define VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en el archivo .env.');
}
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
const SUPABASE_PROJECT_REF = (()=>{ try{return new URL(SUPABASE_URL).hostname.split('.')[0]||'desconocido';}catch(e){return 'desconocido';} })();
const $ = (s,el=document)=>el.querySelector(s);
const $$ = (s,el=document)=>Array.from(el.querySelectorAll(s));
const root = $('#root');
const money = n => (appCfg('empresa.moneda','RD$') + ' ' + (Number(n)||0).toLocaleString('es-DO',{maximumFractionDigits:2}));
const BUSINESS_TIME_ZONE = 'America/Santo_Domingo';
function localIsoDate(d=new Date()){
  const x = new Date(d.getTime() - d.getTimezoneOffset()*60000);
  return x.toISOString().slice(0,10);
}
function businessDateKey(value=new Date()){
  if(value===null || value===undefined || value==='') return '';
  const dt=value instanceof Date?value:new Date(value);
  if(isNaN(dt.getTime())) return String(value).slice(0,10);
  try{
    const parts=new Intl.DateTimeFormat('en-US',{timeZone:BUSINESS_TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(dt);
    const get=t=>parts.find(p=>p.type===t)?.value||'';
    return `${get('year')}-${get('month')}-${get('day')}`;
  }catch(e){ return localIsoDate(dt); }
}
function businessDateTime(value,opts={}){
  if(!value) return '—';
  const dt=value instanceof Date?value:new Date(value);
  if(isNaN(dt.getTime())) return String(value);
  return new Intl.DateTimeFormat('es-DO',{timeZone:BUSINESS_TIME_ZONE,day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',...opts}).format(dt);
}
function businessTime(value=new Date()){
  const dt=value instanceof Date?value:new Date(value);
  if(isNaN(dt.getTime())) return '—';
  return new Intl.DateTimeFormat('es-DO',{timeZone:BUSINESS_TIME_ZONE,hour:'2-digit',minute:'2-digit'}).format(dt);
}
const today = () => businessDateKey(new Date());
const esc = v => String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const norm = v => String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const onlyNum = v => String(v||'').replace(/\D/g,'');
const shortDate = iso => iso ? new Date(String(iso).slice(0,10)+'T12:00:00').toLocaleDateString('es-DO',{day:'2-digit',month:'short',year:'numeric'}) : '—';
const dayName = iso => ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'][new Date(String(iso||today()).slice(0,10)+'T12:00:00').getDay()] || '';
const callTime = l => { const raw=l?.hora || l?.creado_en || l?.created_at; if(!raw) return ''; try{ return String(raw).includes('T')?businessTime(raw):String(raw).slice(0,5); }catch(e){ return String(raw).slice(0,5); } };
function loadUi(){ const def={theme:'red',density:'normal',font:'normal',radius:'normal',menuStyle:'executive',menuSubtitles:true,layoutWidth:'wide',panelStyle:'executive'}; try{return {...def,...(JSON.parse(localStorage.getItem('pc_ui_v32')||'{}'))};}catch(e){return def;} }
function applyUi(){ if(!document.body) return; document.body.className=document.body.className.replace(/\b(theme|density|font|radius|menu|layout|panel)-\S+/g,'').trim(); document.body.classList.add('theme-'+state.ui.theme,'density-'+state.ui.density,'font-'+state.ui.font,'radius-'+state.ui.radius,'menu-'+(state.ui.menuStyle||'executive'),'layout-'+(state.ui.layoutWidth||'wide'),'panel-'+(state.ui.panelStyle||'executive')); }
function saveUi(){ localStorage.setItem('pc_ui_v32',JSON.stringify(state.ui)); applyUi(); toast('Estilo actualizado'); }
const SIDEBAR_PREF_KEY = 'pc_sidebar_collapsed_v932';
function loadSidebarCollapsed(){
  try{return localStorage.getItem(SIDEBAR_PREF_KEY)==='1';}catch(e){return false;}
}
function saveSidebarCollapsed(collapsed){
  try{localStorage.setItem(SIDEBAR_PREF_KEY,collapsed?'1':'0');}catch(e){}
}
function applySidebarCollapsed(collapsed, persist=true){
  const shell=$('.shell');
  const sidebar=$('#appSidebar');
  const toggle=$('#sidebarToggle');
  if(!shell || !toggle) return;
  shell.classList.toggle('sidebar-collapsed',Boolean(collapsed));
  if(sidebar) sidebar.setAttribute('aria-hidden',collapsed?'true':'false');
  toggle.dataset.collapsed=collapsed?'1':'0';
  toggle.setAttribute('aria-expanded',collapsed?'false':'true');
  toggle.setAttribute('aria-label',collapsed?'Mostrar menú lateral':'Ocultar menú lateral');
  toggle.title=collapsed?'Mostrar menú lateral':'Ocultar menú lateral';
  toggle.innerHTML=`<span aria-hidden="true">${collapsed?'›':'‹'}</span>`;
  if(persist) saveSidebarCollapsed(Boolean(collapsed));
}
function bindSidebarToggle(){
  const toggle=$('#sidebarToggle');
  if(!toggle) return;
  toggle.onclick=()=>applySidebarCollapsed(toggle.dataset.collapsed!=='1');
}

function defaultWeightConfig(){ return {exigirPesoReal:true,avisoLb:0.5,avisoPct:2,maxLb:3,maxPct:8,metodo:'mayor'}; }
function normalizeWeightConfig(cfg={}){ const d=defaultWeightConfig(); return {exigirPesoReal:cfg.exigirPesoReal!==false,avisoLb:Number(cfg.avisoLb??d.avisoLb)||d.avisoLb,avisoPct:Number(cfg.avisoPct??d.avisoPct)||d.avisoPct,maxLb:Number(cfg.maxLb??d.maxLb)||d.maxLb,maxPct:Number(cfg.maxPct??d.maxPct)||d.maxPct,metodo:cfg.metodo||d.metodo}; }
function loadWeightConfigLocal(){ try{return normalizeWeightConfig(JSON.parse(localStorage.getItem('pc_weight_config_v72')||'{}'));}catch(e){return defaultWeightConfig();} }
function saveWeightConfigLocal(cfg){ localStorage.setItem('pc_weight_config_v72',JSON.stringify(normalizeWeightConfig(cfg))); }

function defaultSystemConfig(){ return {
  empresa:{nombre:'Productos César',telefono:'',direccion:'',correo:'',rnc:'',moneda:'RD$',logoTexto:'PC',logoUrl:'',subtitulo:'CRM · Despacho · CXC'},
  menu:{mostrarIconos:true,mostrarSubtitulos:true,menuCompacto:false,modulosActivos:{}},
  alertas:{sonidoDefault:false,parpadeoNuevas:true,revisionSegundos:30,carniceriaMaxMin:45,facturacionMaxMin:30,validacionMaxMin:30,deliveryMaxMin:120,liquidacionMaxMin:60,usarTiempoLaborable:true,horarioLaboral:{lunesSabado:[['07:00','12:00'],['14:00','17:00']],domingo:[['07:00','12:00']]},feriados:[],excluirReaperturasPromedio:true,extremoFactor:3},
  impresion:{mostrarLogo:true,mostrarTelefono:true,mostrarDireccion:true,ticketCarniceria:'80mm',ticketFacturacion:'80mm',pieTicket:'Documento interno de trabajo',tamanoTituloPx:18,tamanoDetallePx:12,mostrarAvisoRetiro:true,textoAvisoRetiro:'RETIRO EN NEGOCIO · NO ENVIAR A DELIVERY'},
  flujos:{modalidadPredeterminada:'Delivery',permitirVentasInternas:true,ventaInternaSoloRetiro:true,ventaInternaContado:true,exigirNombreCliente:true,confirmarRetiro:true},
  recibos:{tituloOrden:'Orden para facturar',tituloRuta:'Hoja de ruta / lote de entrega',tituloLiquidacion:'Recibo de liquidación',tituloHistorial:'Historial de liquidaciones',mostrarLogo:true,mostrarTelefono:true,mostrarDireccion:true,mostrarRnc:false,mostrarCorreo:false,mostrarFecha:true,pie:'Documento interno de Productos César',firmaDelivery:'Firma delivery',firmaRecibido:'Firma recibido por',firmaValidacion:'Entregado por validación',firmaFacturacion:'Facturado por'},
  respaldo:{recordatorioActivo:true,frecuencia:'Semanal',incluirCatalogos:true,incluirOrdenes:true,incluirClientes:true,incluirConfiguracion:true,ultimoManual:''},
  atajos:{activos:true,nuevaOrden:'Ctrl+Alt+O',clientes:'Ctrl+Alt+C',liquidacion:'Ctrl+Alt+L',productividad:'Ctrl+Alt+P',buscar:'Ctrl+Alt+F',guardar:'Ctrl+S',cerrar:'Esc'},
  facturacion:{avisoMonto:100,avisoPct:2,maxMonto:1000,maxPct:10,metodo:'mayor',exigirPesoFacturado:true,avisoPesoLb:0.5,avisoPesoPct:2,maxPesoLb:3,maxPesoPct:8,metodoPeso:'mayor'},
  seguridad:{soloAdminEliminar:true,confirmarAnular:true,bloquearOperativos:true,mostrarBotonEliminarSoloReciente:true},
  whatsapp:{ofrecerAlGuardar:true,botonManual:true,plantilla:'Hola {contacto},\n\n{encabezado}\n\nOrden: {codigo_orden}\nFecha de recepción: {fecha_orden}\nFecha prevista de despacho: {fecha_despacho}{hora_despacho}\n\nDETALLE:\n{detalle_sin_precio}{observacion_cliente}\n\nEste mensaje confirma la recepción de su solicitud. La disponibilidad y las cantidades finales serán verificadas durante la preparación.\n\nGracias por preferir Productos César.'}
}; }
function deepMerge(a,b){ const out={...(a||{})}; Object.entries(b||{}).forEach(([k,v])=>{ if(v===undefined || v===null) return; out[k]=(v&&typeof v==='object'&&!Array.isArray(v))?deepMerge(out[k]||{},v):v; }); return out; }
function normalizeSystemConfig(cfg={}){ return deepMerge(defaultSystemConfig(),cfg||{}); }
function loadSystemConfigLocal(){ try{return normalizeSystemConfig(JSON.parse(localStorage.getItem('pc_system_config_v84')||'{}'));}catch(e){return defaultSystemConfig();} }
function saveSystemConfigLocal(cfg){ localStorage.setItem('pc_system_config_v84',JSON.stringify(normalizeSystemConfig(cfg))); }
function appCfg(path, fallback){ const parts=String(path||'').split('.'); let obj=state?.systemConfig; for(const k of parts){ if(obj && Object.prototype.hasOwnProperty.call(obj,k)) obj=obj[k]; else return fallback; } return obj ?? fallback; }

function printCompanyHeader(title='', subtitle=''){
  const emp=normalizeSystemConfig(state.systemConfig||{}).empresa||{};
  const rec=normalizeSystemConfig(state.systemConfig||{}).recibos||{};
  const logo=rec.mostrarLogo!==false ? (emp.logoUrl?`<img src="${esc(emp.logoUrl)}" style="max-height:46px;max-width:120px;object-fit:contain;margin-bottom:4px">`:`<div style="font-weight:900;font-size:20px;letter-spacing:.5px">${esc(emp.logoTexto||'PC')}</div>`) : '';
  const lines=[];
  if(rec.mostrarTelefono!==false && emp.telefono) lines.push(`Tel: ${esc(emp.telefono)}`);
  if(rec.mostrarDireccion!==false && emp.direccion) lines.push(esc(emp.direccion));
  if(rec.mostrarRnc && emp.rnc) lines.push(`RNC: ${esc(emp.rnc)}`);
  if(rec.mostrarCorreo && emp.correo) lines.push(esc(emp.correo));
  return `<div class="print-company-header" style="text-align:center;margin-bottom:10px">${logo}<h1 style="font-size:20px;margin:0 0 4px">${esc(title||emp.nombre||'Productos César')}</h1><div style="font-weight:800">${esc(emp.nombre||'Productos César')}</div>${subtitle?`<div>${esc(subtitle)}</div>`:''}${lines.length?`<div style="font-size:11px;color:#334155;margin-top:3px">${lines.join(' · ')}</div>`:''}</div>`;
}
function printFooterHtml(){ const rec=normalizeSystemConfig(state.systemConfig||{}).recibos||{}; return rec.pie?`<div style="text-align:center;margin-top:14px;font-size:10px;color:#64748b">${esc(rec.pie)}</div>`:''; }
function signatureHtml(label){ return `<div class="sign">${esc(label||'Firma')}</div>`; }
function exportBackup(){
  const cfg=normalizeSystemConfig(state.systemConfig||{});
  const payload={fecha:new Date().toISOString(),version:'V9.4.3 PWA',empresa:cfg.empresa,configuracion:cfg,clientes:state.clientes||[],ordenes:(state.ordenes||[]).map(o=>({codigo:o.codigo,fecha:o.fecha,estado:o.estado,cliente:orderClientName(o),total:o.total_factura||o.total_estimado,delivery:o.delivery_nombre,lote:o.lote_codigo})),productos:state.productos||[],empleados:state.empleadosOperativos||[],usuarios:state.usuarios||[],liquidaciones:state.liquidacionesLotes||[],cxc:state.cxcSaldos||[],cobrosCxc:state.cxcCobros||[]};
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`backup-productos-cesar-${today()}.json`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),5000); toast('Copia de seguridad descargada');
}
function setupKeyboardShortcuts(){
  if(window.__pcShortcutsBound) return; window.__pcShortcutsBound=true;
  document.addEventListener('keydown',e=>{
    const cfg=normalizeSystemConfig(state.systemConfig||{}).atajos||{}; if(cfg.activos===false) return;
    const tag=(document.activeElement?.tagName||'').toLowerCase();
    if(e.key==='Escape'){ const m=document.querySelector('.modal-backdrop:last-child'); if(m){ e.preventDefault(); m.remove(); return; } }
    if(e.ctrlKey && e.key.toLowerCase()==='s'){ const m=document.querySelector('.modal-backdrop:last-child'); const btn=m?.querySelector('.btn:not(.gray):not(.dark), button.btn:not(.gray):not(.dark)'); if(btn){ e.preventDefault(); btn.click(); return; } }
    if(!e.ctrlKey || !e.altKey) return;
    const k=e.key.toLowerCase();
    const go=p=>{ e.preventDefault(); navigateToPageV942(p); };
    if(k==='o') return go('ordenes');
    if(k==='c') return go('clientes');
    if(k==='l') return go('liquidacion');
    if(k==='p') return go('productividad');
    if(k==='f'){ e.preventDefault(); const input=document.querySelector('input[type="search"], input[placeholder*="Buscar"], #globalSearch, #search, #validacionSearch'); input?.focus(); input?.select?.(); }
  });
}

function pollSeconds(){ const n=Number(appCfg('alertas.revisionSegundos',30)); return Math.max(10, Math.min(300, n||30)); }
function moduleEnabled(id){ const map=appCfg('menu.modulosActivos',{}); return map && Object.prototype.hasOwnProperty.call(map,id) ? map[id]!==false : true; }

const HISTORY_UI_KEY='pc_history_ui_v934';
function loadHistoryUi(){
  const def={delivery:{},liquidacion:{},validationLots:{},deliveryActive:{},liquidacionPending:{}};
  try{
    const raw=JSON.parse(localStorage.getItem(HISTORY_UI_KEY)||'{}');
    return Object.fromEntries(Object.keys(def).map(k=>[k,{...(raw[k]||{})}]));
  }catch(e){ return def; }
}
function saveHistoryUi(){ try{localStorage.setItem(HISTORY_UI_KEY,JSON.stringify(state.historyUi||{}));}catch(e){} }
function historyRowKey(l){
  return String(l?.history_key || (l?.id?`LIQ-${l.id}`:`${l?.codigo_lote||'SIN-LOTE'}-${l?.fecha_liquidacion||l?.creado_en||''}`));
}
function historyIsOpen(scope,key){ return Boolean(state.historyUi?.[scope]?.[String(key)]); }
function setHistoryOpen(scope,key,open){
  state.historyUi=state.historyUi||{delivery:{},liquidacion:{},validationLots:{},deliveryActive:{},liquidacionPending:{}};
  state.historyUi[scope]=state.historyUi[scope]||{};
  state.historyUi[scope][String(key)]=Boolean(open);
  saveHistoryUi();
}
function setHistoryRowsOpen(scope,rows,open){ (rows||[]).forEach(l=>setHistoryOpen(scope,historyRowKey(l),open)); }
function historyHasPreference(scope,key){ return Object.prototype.hasOwnProperty.call(state.historyUi?.[scope]||{},String(key)); }
function operationalLotOpen(scope,key,index=0,forceOpen=false){
  if(forceOpen) return true;
  return historyHasPreference(scope,key) ? historyIsOpen(scope,key) : index===0;
}
function setOperationalKeysOpen(scope,keys,open){ (keys||[]).forEach(key=>setHistoryOpen(scope,key,open)); }


const VALIDATION_BATCH_DRAFT_KEY='pc_validacion_lote_draft_v9081';
function emptyValidationBatchDraft(){ return {date:today(),deliveryValue:'',deliveryName:'',manual:'',responsibleType:RESPONSIBLE_TYPES.DELIVERY,rows:{}}; }
function loadValidationBatchDraftLocal(){
  try{
    const d=JSON.parse(localStorage.getItem(VALIDATION_BATCH_DRAFT_KEY)||'{}');
    if(!d || d.date!==today()) return emptyValidationBatchDraft();
    return {...emptyValidationBatchDraft(),...d,rows:d.rows||{}};
  }catch(e){ return emptyValidationBatchDraft(); }
}
function saveValidationBatchDraftLocal(){ try{ localStorage.setItem(VALIDATION_BATCH_DRAFT_KEY,JSON.stringify(state.validationBatchDraft||emptyValidationBatchDraft())); }catch(e){} }
function ensureValidationBatchDraft(){
  if(!state.validationBatchDraft || state.validationBatchDraft.date!==today()) state.validationBatchDraft=emptyValidationBatchDraft();
  if(!state.validationBatchDraft.rows) state.validationBatchDraft.rows={};
  return state.validationBatchDraft;
}
function batchDraftRow(id){ const d=ensureValidationBatchDraft(); return d.rows[String(id)] || null; }
function saveBatchDeliveryDraft(container){
  const d=ensureValidationBatchDraft();
  const sel=$('#batchDelivery',container), man=$('#batchDeliveryManual',container);
  d.deliveryValue=sel?.value||'';
  d.manual=String(man?.value||'').trim();
  d.deliveryName=(d.deliveryValue==='__manual__'?d.manual:d.deliveryValue)||'';
  const selectedOption=sel?.selectedOptions?.[0];
  d.responsibleType=d.deliveryValue==='__manual__'?RESPONSIBLE_TYPES.MANUAL:(selectedOption?.dataset?.responsibleType||inferResponsibleType(d.deliveryName,state.empleados,deliveryEmployeeNames()));
  saveValidationBatchDraftLocal();
}
function saveBatchRowDraft(row){
  if(!row) return;
  const d=ensureValidationBatchDraft();
  const id=String(row.dataset.batchRow||'');
  if(!id) return;
  const checked=!!$('[data-batch-check]',row)?.checked;
  const weight=String($('[data-batch-weight]',row)?.value||'').trim();
  const amount=String($('[data-batch-amount]',row)?.value||'').trim();
  const amountChanged=normalizeValidationInvoiceAmount(amount)!==normalizeValidationInvoiceAmount(row.dataset.originalAmount||0);
  if(checked || weight || amountChanged){ d.rows[id]={checked,weight,amount,updatedAt:new Date().toISOString()}; }
  else { delete d.rows[id]; }
  saveValidationBatchDraftLocal();
}
function clearValidationBatchDraft(){ state.validationBatchDraft=emptyValidationBatchDraft(); saveValidationBatchDraftLocal(); }

const state = {session:null,user:null,profile:null,page:'inicio',clientes:[],llamadas:[],productos:[],ordenes:[],cobranza:[],plantillas:[],catalogos:{},deliverys:[],empleados:[],pesos:[],entregas:[],pagos:[],historialEstados:[],auditExceptions:[],auditExceptionsSchemaOk:false,entregaLotes:[],entregaLoteDetalle:[],entregaDocumentosHistorial:[],liquidacionesLotes:[],liquidacionLoteDetalle:[],casosHistorial:[],deliveryLotCorrections:[],liquidacionLotEvents:[],deliveryTransfers:[],liquidacionSchemaOk:false,validacionR5SchemaOk:false,v936SchemaOk:false,v937SchemaOk:false,v9371SchemaOk:false,cxcSaldos:[],cxcCobros:[],cxcAplicaciones:[],cxcSchemaOk:false,cxcLoadedAt:0,cxcLoading:null,cxcSearch:'',cxcStatusFilter:'Pendientes',cxcAgingFilter:'Todas',cxcHistorySearch:'',cxcHistoryLimit:20,specialSearch:'',specialStatusFilter:'Todos',specialTypeFilter:'Todos',modulos:[],permisos:[],usuarios:[],usuarioModulos:[],errors:[],loadedScopes:{},moduleLoading:null,filter:'Todos',clientSearch:'',productSearch:'',productFilter:'Todos',productCategoryFilter:'Todas',productUnitFilter:'Todas',productWeightFilter:'Todos',modal:null,configTab:'general',controlTab:'gestiones',controlDate:today(),agendaDate:today(),callSearch:'',followPage:0,followSize:8,deliveryFiltro:'',orderSearch:'',carniceriaSearch:'',carniceriaProgress:null,carniceriaProgressEmployeeId:null,carniceriaProgressLoading:false,carniceriaProgressError:'',carniceriaProgressSchemaOk:false,carniceriaProgressLoadedAt:0,facturacionSearch:'',facturacionTab:'pendientes',facturacionHistorySearch:'',facturacionHistoryFrom:today().slice(0,8)+'01',facturacionHistoryTo:today(),facturacionHistoryStatus:'Todos',facturacionHistoryWorker:'Todos',validacionSearch:'',validacionTab:'pendientes',validationHistoryFrom:today(),validationHistoryTo:today(),validationHistoryDelivery:'',validationHistorySearch:'',pickupSearch:'',pickupHistorySearch:'',deliverySearch:'',deliveryTab:'activos',deliveryHistorySearch:'',deliveryHistoryLimit:10,liquidacionDeliveryFilter:'',liquidacionSearch:'',liqHistorySearch:'',liquidacionHistoryLimit:10,liquidacionTab:'pendientes',liqHistFrom:today(),liqHistTo:today(),deliveryHistoryFrom:today(),deliveryHistoryTo:today(),historyUi:loadHistoryUi(),orderView:'recientes',carniceriaTab:'libres',ui:loadUi(),weightConfig:loadWeightConfigLocal(),systemConfig:loadSystemConfigLocal(),liveStatus:'inactivo',liveLastRefresh:null,liveNotices:[],liveUnread:0,liveSound:localStorage.getItem('pc_live_sound_v61')==='1',liveLoading:false,liveFlashOrders:{},reportTab:'resumen',reportPreset:'mes',reportFrom:today().slice(0,8)+'01',reportTo:today(),reportStatus:'Todos',reportSeller:'Todos',reportZone:'Todas',reportClient:'Todos',reportProduct:'Todos',reportPayment:'Todas',prodMonth:String(new Date().getMonth()+1),prodYear:String(new Date().getFullYear()),prodRole:'Todos',auditSearch:'',auditType:'todos',auditExceptionSearch:'',auditExceptionStatus:'Todos',auditExceptionSeverity:'Todas',auditExceptionFrom:today().slice(0,8)+'01',auditExceptionTo:today(),alertSearch:'',alertLevel:'todos',kanbanSearch:'',kanbanClosedLimit:10,kanbanClosedHidden:false,kanbanHistorySearch:'',kanbanHistoryPeriod:'todos',kanbanHistoryStatus:'Todos',kanbanHistoryFrom:'',kanbanHistoryTo:'',kanbanHistoryPage:0,kanbanHistoryPageSize:25,userSearch:'',userRoleFilter:'Todos',userStatusFilter:'Todos',userLinkFilter:'Todos',kanbanMobileStage:'recibido',mobileMoreOpen:false,validationBatchDraft:loadValidationBatchDraftLocal()};
const navItems = [
  ['inicio','Inicio','Resumen general'],['control','Control','Llamadas y gestiones'],['clientes','Clientes','Ficha y WhatsApp'],['ordenes','Órdenes','Panel completo'],
  ['carniceria','Carnicería','Preparar y pesar'],['facturacion','Facturación','Imprimir y facturar'],['validacion','Validación','Asignar responsables'],['delivery','Delivery','Mis pedidos'],['liquidacion','Liquidación','Cobros y CXC'],['alertas','Alertas','Centro operativo'],['kanban','Kanban','Tablero de órdenes'],
  ['productos','Productos','Catálogo'],['productividad','Productividad','Incentivos y KPIs'],['reportes','Reportes','Indicadores y análisis'],['auditoria','Auditoría','Trazabilidad de acciones'],['config','Configuración','Sistema']
];

function navIcon(id){ if(appCfg('menu.mostrarIconos',true)===false) return ''; return {inicio:'⌂',control:'☎',clientes:'👥',ordenes:'▦',carniceria:'🥩',facturacion:'▣',validacion:'✓',delivery:'🛵',liquidacion:'$',productos:'🏷',productividad:'🏆',alertas:'🚨',kanban:'▥',reportes:'📊',auditoria:'🕒',config:'⚙'}[id] || '•'; }
function navGroup(id){
  if(id==='inicio') return 'General';
  if(['control','clientes','ordenes'].includes(id)) return 'Ventas / CRM';
  if(['carniceria','facturacion','validacion','delivery','liquidacion','alertas','kanban'].includes(id)) return 'Operación';
  return 'Administración';
}
function renderSideNav(items){
  let html='', last='';
  for(const [id,n,d] of items){
    const group=navGroup(id);
    if(group!==last){ html += `<div class="nav-group-label">${esc(group)}</div>`; last=group; }
    html += `<button data-page="${id}" class="${state.page===id?'active':''}"><span class="nav-icon">${navIcon(id)}</span><span class="nav-text"><span class="nav-title">${n}</span>${(state.ui.menuSubtitles===false || appCfg('menu.mostrarSubtitulos',true)===false)?'':`<span class="nav-sub">${d}</span>`}</span></button>`;
  }
  return html;
}
function mobilePrimaryPages(items){
  const ids=items.map(x=>x[0]);
  const wanted=['inicio','ordenes','kanban','delivery'];
  const selected=wanted.filter(id=>ids.includes(id));
  const fallback=['control','clientes','carniceria','facturacion','validacion','liquidacion','alertas','reportes','productos','config'];
  for(const id of fallback){ if(selected.length>=4) break; if(ids.includes(id)&&!selected.includes(id)) selected.push(id); }
  return selected.map(id=>items.find(x=>x[0]===id)).filter(Boolean);
}
function renderBottomNav(items){
  const primary=mobilePrimaryPages(items);
  const buttons=primary.map(([id,n])=>`<button type="button" data-page="${id}" class="${state.page===id?'active':''}" aria-label="${esc(n)}"><span class="bottom-icon">${navIcon(id)}</span><span class="bottom-label">${esc(n)}</span></button>`).join('');
  return buttons+`<button type="button" data-mobile-more class="${primary.some(x=>x[0]===state.page)?'':'active'}" aria-label="Más módulos"><span class="bottom-icon">•••</span><span class="bottom-label">Más</span></button>`;
}
function isMobileViewport(){ return !!window.matchMedia && window.matchMedia('(max-width:820px)').matches; }
const MOBILE_BUTTON_LABELS={
  'Reabrir facturación':'Reabrir','Validar individual':'Validar','Actualizar ahora':'Actualizar','Limpiar avisos':'Limpiar',
  'Crear lote y asignar':'Crear lote','Vista hoja de ruta':'Hoja ruta','Historial completo':'Historial','Historial cerradas':'Historial',
  'Centro de alertas':'Alertas','Lista de órdenes':'Órdenes','Imprimir resumen general':'Imprimir','Verificar ruta completa':'Verificar',
  'Cerrar lote y generar recibo':'Cerrar lote','Vista recibo':'Recibo','Cambiar mi contraseña':'Contraseña','Guardar nueva contraseña':'Guardar',
  'Seleccionar visibles':'Seleccionar','Mostrar 10 más':'Más 10','Mostrar solo 10':'Solo 10','Ver historial':'Historial',
  'Ir al módulo':'Abrir','Ver orden':'Ver','Actualizar':'Sync','Mi acceso':'Perfil'
};
function applyMobileLabels(scope=document){
  const compact=isMobileViewport();
  $$('button',scope).forEach(btn=>{
    if(btn.closest('.bottom-nav') || btn.hasAttribute('data-no-mobile-label')) return;
    const current=String(btn.textContent||'').replace(/\s+/g,' ').trim();
    if(!btn.dataset.desktopLabel && current) btn.dataset.desktopLabel=current;
    const full=btn.dataset.desktopLabel||current;
    const short=MOBILE_BUTTON_LABELS[full];
    if(compact && short){ btn.textContent=short; btn.title=full; btn.setAttribute('aria-label',full); btn.classList.add('mobile-short-label'); }
    else if(!compact && btn.classList.contains('mobile-short-label')){ btn.textContent=full; btn.classList.remove('mobile-short-label'); }
  });
}
function closeMobileMore(){ const x=$('.mobile-more-overlay'); if(x) x.remove(); state.mobileMoreOpen=false; }
function openMobileMoreMenu(items){
  closeMobileMore(); state.mobileMoreOpen=true;
  const primaryIds=new Set(mobilePrimaryPages(items).map(x=>x[0]));
  const groups=['General','Ventas / CRM','Operación','Administración'];
  const modules=groups.map(group=>{
    const rows=items.filter(([id])=>navGroup(id)===group && !primaryIds.has(id));
    if(!rows.length) return '';
    return `<section class="mobile-more-group"><h4>${esc(group)}</h4><div class="mobile-more-grid">${rows.map(([id,n,d])=>`<button type="button" data-mobile-page="${id}" class="${state.page===id?'active':''}"><span>${navIcon(id)}</span><b>${esc(n)}</b><small>${esc(d)}</small></button>`).join('')}</div></section>`;
  }).join('');
  const overlay=document.createElement('div'); overlay.className='mobile-more-overlay';
  overlay.innerHTML=`<div class="mobile-more-backdrop" data-mobile-close></div><div class="mobile-more-sheet"><div class="mobile-sheet-handle"></div><div class="mobile-more-head"><div><b>Más opciones</b><span>${esc(currentWorkerName())} · ${esc(state.profile?.rol||'')}</span></div><button type="button" class="close" data-mobile-close aria-label="Cerrar">×</button></div><div class="mobile-more-scroll">${modules||'<div class="empty compact">No hay otros módulos disponibles.</div>'}</div><div class="mobile-account-actions"><button type="button" class="btn gray" data-mobile-profile>Perfil</button><button type="button" class="btn gray" data-mobile-refresh>Actualizar</button><button type="button" class="btn dark" data-mobile-logout>Salir</button></div></div>`;
  document.body.appendChild(overlay);
  $$('[data-mobile-close]',overlay).forEach(b=>b.onclick=closeMobileMore);
  $$('[data-mobile-page]',overlay).forEach(b=>b.onclick=()=>{const page=b.dataset.mobilePage;closeMobileMore();navigateToPageV942(page);});
  $('[data-mobile-profile]',overlay).onclick=()=>{closeMobileMore();openMyAccess();};
  $('[data-mobile-refresh]',overlay).onclick=async()=>{await refreshVisibleModuleV9384();state.liveLastRefresh=new Date().toISOString();closeMobileMore();render();toast('Datos actualizados');};
  $('[data-mobile-logout]',overlay).onclick=async()=>{await sb.auth.signOut();teardownLiveUpdates();state.session=null;state.user=null;closeMobileMore();renderLogin();};
}
let mobileResizeBound=false;
function setupMobileUi(){
  if(mobileResizeBound) return; mobileResizeBound=true;
  let last=isMobileViewport();
  window.addEventListener('resize',()=>{ const now=isMobileViewport(); if(now!==last){last=now;closeMobileMore();render();} else applyMobileLabels(document); },{passive:true});
}

function toast(t){ const d=document.createElement('div'); d.className='toast'; d.textContent=t; document.body.appendChild(d); setTimeout(()=>d.remove(),3600); }
function appAlert(message,title='Aviso del sistema'){
  const old=document.querySelector('.app-alert-v9390');
  if(old) old.remove();
  const m=document.createElement('div');
  m.className='modal app-alert-v9390';
  m.innerHTML=`<div class="modal-card app-alert-card-v9390"><div class="modal-head"><div><div class="modal-title">${esc(title)}</div><div class="hint">Productos César CRM</div></div><button class="close" data-app-alert-close aria-label="Cerrar">×</button></div><div class="modal-body"><div class="app-alert-message-v9390">${esc(String(message||'')).replace(/\n/g,'<br>')}</div><div class="actions"><button class="btn" data-app-alert-accept>Aceptar</button></div></div></div>`;
  document.body.appendChild(m);
  const close=()=>m.remove();
  $('[data-app-alert-close]',m).onclick=close;
  $('[data-app-alert-accept]',m).onclick=close;
  m.onclick=e=>{if(e.target===m) close();};
  setTimeout(()=>$('[data-app-alert-accept]',m)?.focus(),40);
}
window.alert=appAlert;
function responsibilityDecisionDialog({title='Continuar bajo responsabilidad',message='',rows=[]}={}){
  return new Promise(resolve=>{
    const m=document.createElement('div'); m.className='modal';
    m.innerHTML=`<div class="modal-card" style="max-width:720px"><div class="modal-head"><div><div class="modal-title">${esc(title)}</div><div class="hint">Esta decisión quedará registrada en la auditoría privada.</div></div><button class="close" data-close>×</button></div><div class="modal-body"><div class="weight-alert"><strong>${esc(message)}</strong>${rows.length?`<div class="grid2" style="margin-top:12px">${rows.map(([k,v])=>`<div class="kv"><b>${esc(k)}</b><span>${esc(v)}</span></div>`).join('')}</div>`:''}</div><div class="field"><label>Motivo obligatorio</label><textarea data-audit-reason maxlength="500" placeholder="Explica por qué decides continuar..."></textarea><div class="hint">Mínimo 5 caracteres. El motivo no podrá ser eliminado por el empleado.</div></div><div data-audit-error></div><div class="actions"><button class="btn gray" data-review>Volver a revisar</button><button class="btn danger" data-continue>Continuar bajo responsabilidad</button></div></div></div>`;
    document.body.appendChild(m);
    const close=value=>{m.remove();resolve(value);};
    $('[data-close]',m).onclick=()=>close(null);
    $('[data-review]',m).onclick=()=>close(null);
    $('[data-continue]',m).onclick=()=>{
      const reason=String($('[data-audit-reason]',m).value||'').trim();
      if(reason.length<5){ $('[data-audit-error]',m).innerHTML='<div class="error">Escribe un motivo de al menos 5 caracteres.</div>'; return; }
      close(reason);
    };
    setTimeout(()=>$('[data-audit-reason]',m)?.focus(),80);
  });
}
async function recordAuditException(input={}){
  const linked=linkedEmployeeForUser(state.profile);
  const payload=normalizeExceptionPayload({
    ...input,
    usuario_nombre:currentWorkerName(),
    empleado_id:input.empleado_id||linked?.id||state.profile?.empleado_id||null,
    empleado_nombre:input.empleado_nombre||linked?.nombre||currentWorkerName(),
    cuenta_estacion:isStationAccount()?currentUserEmail():null,
    dispositivo:String(navigator.userAgent||'').slice(0,500)
  });
  if(payload.motivo.length<5){ alert('No se puede continuar sin registrar el motivo de auditoría.'); return false; }
  const {error}=await sb.rpc('registrar_excepcion_v9378',{p_evento:payload});
  if(error){
    alert('No se pudo registrar la aceptación en Auditoría. La operación fue detenida.\n\n'+error.message+'\n\nVerifica que el SQL 36 de V9.3.7.9 esté aplicado.');
    return false;
  }
  return true;
}
function auditOrderFields(o={}){
  return {orden_id:o.id||null,orden_codigo:o.codigo||null,cliente_nombre:orderClientName(o)};
}
function nivelModulo(id){
  if(!state.profile || state.profile.activo===false) return 'none';
  if(id==='auditoria' && !isAuditAdministrator(state.profile?.rol)) return 'none';
  if(state.profile.rol==='Gerente') return 'editar';
  const um = state.usuarioModulos.find(x=>x.usuario_id===state.user?.id && x.modulo===id);
  if(um) return um.nivel || 'none';
  const rp = state.permisos.find(x=>x.rol===state.profile.rol && x.modulo===id);
  return rp?.nivel || 'none';
}
function puede(id,edit=false){ const n=nivelModulo(id); return edit ? n==='editar' : n==='ver'||n==='editar'; }
function modName(id){ return (navItems.find(x=>x[0]===id)||[])[1] || id; }
function permisosActuales(){ return navItems.map(([id,n])=>({id,n,nivel:nivelModulo(id)})); }
function firstAllowedPage(){ const p=navItems.find(([id])=>puede(id)); return p?.[0] || null; }
function isGerente(){ return state.profile?.rol==='Gerente'; }
async function safe(promise, label){ const {data,error,count}=await promise; if(error){ state.errors.push(label+': '+error.message); return {data:[],count:0,error}; } return {data:data||[],count}; }
async function optionalSafe(promise, label){ const {data,error,count}=await promise; if(error){ console.warn('Opcional '+label+':', error.message); return {data:[],count:0,error}; } return {data:data||[],count}; }
async function loadCxcDataV940(force=false){
  const fresh=Date.now()-Number(state.cxcLoadedAt||0)<60000;
  if(!force && fresh && state.cxcSchemaOk) return true;
  if(state.cxcLoading) return state.cxcLoading;
  state.cxcLoading=(async()=>{
    const [saldos,cobros,aplicaciones]=await Promise.all([
      optionalSafe(
        sb.from('cxc_saldos_v940').select('*').order('cxc_vencimiento',{ascending:true}).limit(5000),
        'cartera CXC V9.4.0'
      ),
      optionalSafe(
        sb.from('cxc_cobros').select('*').order('fecha_cobro',{ascending:false}).limit(1000),
        'recibos CXC V9.4.0'
      ),
      optionalSafe(
        sb.from('cxc_cobro_aplicaciones').select('*').order('id',{ascending:false}).limit(5000),
        'aplicaciones CXC V9.4.0'
      )
    ]);
    state.cxcSaldos=saldos.data||[];
    state.cxcCobros=cobros.data||[];
    state.cxcAplicaciones=aplicaciones.data||[];
    state.cxcSchemaOk=!saldos.error&&!cobros.error&&!aplicaciones.error;
    state.cxcLoadedAt=Date.now();
    return state.cxcSchemaOk;
  })();
  try{return await state.cxcLoading;}finally{state.cxcLoading=null;}
}
async function ensureCxcDataV940(force=false){
  const ok=await loadCxcDataV940(force);
  if(!ok && state.page==='liquidacion'){
    toast('Para usar Cuentas por cobrar, aplica primero el SQL 51 de la V9.4.0.');
  }
  return ok;
}

let liveChannel=null, livePollTimer=null, liveRefreshTimer=null;
let liveSubscribedSignature='', liveChangedOrderIds=new Set();
function liveStatusText(){
  const s=state.liveStatus||'inactivo';
  if(s==='en vivo') return 'En vivo';
  if(s==='polling') return 'Actualización automática';
  if(s==='conectando') return 'Conectando en vivo';
  if(s==='reconectando') return 'Reconectando';
  if(s==='error') return 'Sin conexión en vivo';
  return 'Inactivo';
}
function liveStatusClass(){
  const s=state.liveStatus||'';
  if(s==='en vivo') return 'on';
  if(s==='polling'||s==='conectando'||s==='reconectando') return 'warn';
  if(s==='error') return 'bad';
  return '';
}
function liveTimeTxt(){
  if(!state.liveLastRefresh) return '—';
  try{return new Date(state.liveLastRefresh).toLocaleTimeString('es-DO',{hour:'2-digit',minute:'2-digit'});}catch(e){return '—';}
}
function liveTargetFromOrderRow(row={}){
  const estado=String(row.estado||'');
  const d=dateOnly(row.fecha_despacho || row.fecha || today());
  const future=d && d>today();
  const tipo=row.tipo_orden||'Pedido normal';
  const rule=orderTypeRule(tipo);
  if(estado==='Anulado') return 'ordenes';
  if(estado==='Pendiente por existencia') return 'ordenes';
  if(future || estado==='Programada') return 'ordenes';
  if(!rule.prep && estado==='Pedido recibido') return rule.delivery ? 'validacion' : 'ordenes';
  if(['Pedido recibido','En preparación'].includes(estado)) return 'carniceria';
  if(['Lista para facturar','Impresa para facturar'].includes(estado)) return rule.invoice ? 'facturacion' : 'validacion';
  if(['Lista para retiro','Entregada en negocio'].includes(estado) || (isStorePickup(row) && estado==='Facturada')) return 'validacion';
  if(['Facturada','Validada para delivery'].includes(estado)) return 'validacion';
  if(['Asignada a delivery','En ruta'].includes(estado)) return 'delivery';
  if(['Entregado','Cobrado','Entregado a crédito','No entregado','Devuelto parcial','Cerrado'].includes(estado)) return 'liquidacion';
  return 'ordenes';
}
function liveTargetName(target){ return {ordenes:'Órdenes',carniceria:'Carnicería',facturacion:'Facturación',validacion:'Validación',delivery:'Delivery',liquidacion:'Liquidación',control:'Control'}[target]||'Sistema'; }
function canReceiveLiveTarget(target){ return !target || puede(target) || isGerente(); }
function liveOrderLabel(row={}){ return row.codigo || (row.id ? 'ORD-'+row.id : 'Orden'); }
function pushLiveNotice(title,msg,target='ordenes'){
  if(target && !canReceiveLiveTarget(target)) return;
  const notice={id:Date.now()+Math.random(),title,msg,target,at:new Date().toISOString()};
  state.liveNotices=[notice,...(state.liveNotices||[])].slice(0,6);
  state.liveUnread=(state.liveUnread||0)+1;
  updateLiveDom();
  toast(title+' · '+msg);
  playLiveSound();
}
function playLiveSound(){
  if(!state.liveSound) return;
  try{
    const Ctx=window.AudioContext||window.webkitAudioContext;
    if(!Ctx) return;
    const ctx=new Ctx();
    const tones=[720,920,720];
    tones.forEach((freq,idx)=>{
      const osc=ctx.createOscillator();
      const gain=ctx.createGain();
      const start=ctx.currentTime+(idx*.18);
      osc.type='sine'; osc.frequency.value=freq;
      gain.gain.setValueAtTime(0.001,start);
      gain.gain.exponentialRampToValueAtTime(0.09,start+0.025);
      gain.gain.exponentialRampToValueAtTime(0.001,start+0.14);
      osc.connect(gain); gain.connect(ctx.destination); osc.start(start); osc.stop(start+0.16);
    });
    setTimeout(()=>ctx.close&&ctx.close(),900);
  }catch(e){}
}
function markLiveFlashOrder(row,target){
  if(!row || !row.id) return;
  state.liveFlashOrders = state.liveFlashOrders || {};
  state.liveFlashOrders[String(row.id)] = {target:target||liveTargetFromOrderRow(row), at:Date.now()};
}
function clearLiveFlashOrder(id){
  if(!id || !state.liveFlashOrders) return;
  delete state.liveFlashOrders[String(id)];
}
function isLiveFlashOrder(o,target=''){
  const rec=state.liveFlashOrders?.[String(o?.id||'')];
  if(appCfg('alertas.parpadeoNuevas',true)===false) return false;
  if(!rec) return false;
  if(Date.now()-Number(rec.at||0)>180000){ delete state.liveFlashOrders[String(o?.id||'')]; return false; }
  if(!target || target==='ordenes') return true;
  return !rec.target || rec.target===target || rec.target==='ordenes';
}
function newOrderClass(o,target=''){ return isLiveFlashOrder(o,target) ? 'blink-new' : ''; }
function newOrderBadge(o,target=''){ return isLiveFlashOrder(o,target) ? '<span class="badge pulse">🔔 Nueva orden</span>' : ''; }
function setupLiveUpdates(){
  teardownLiveUpdates();
  if(!state.user) return;
  state.liveStatus='conectando';
  state.liveLastRefresh=new Date().toISOString();
  const tables=realtimeTablesForPageV942(state.page,state.liquidacionTab);
  liveSubscribedSignature=`${state.page}|${state.liquidacionTab||''}|${tables.join(',')}`;
  try{
    let channel=sb.channel('pc_v942_'+state.user.id+'_'+simpleHash(liveSubscribedSignature));
    tables.forEach(table=>{
      const callback=table==='ordenes' ? handleLiveOrderChange
        : table==='sistema_configuracion' ? ()=>refreshSystemConfigV9390()
        : payload=>handleLiveAuxChange(payload,table);
      channel=channel.on('postgres_changes',{event:'*',schema:'public',table},callback);
    });
    liveChannel=channel.subscribe(status=>{
        if(status==='SUBSCRIBED') state.liveStatus='en vivo';
        else if(['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(status)) state.liveStatus='polling';
        else state.liveStatus='conectando';
        updateLiveDom();
      });
  }catch(e){ state.liveStatus='polling'; }
  startLivePolling();
}
function teardownLiveUpdates(){
  if(liveChannel){ try{ sb.removeChannel(liveChannel); }catch(e){} liveChannel=null; }
  if(livePollTimer){ clearTimeout(livePollTimer); livePollTimer=null; }
  if(liveRefreshTimer){ clearTimeout(liveRefreshTimer); liveRefreshTimer=null; }
  liveChangedOrderIds.clear();
  liveSubscribedSignature='';
  state.liveStatus='inactivo';
}
function startLivePolling(){
  if(livePollTimer) clearTimeout(livePollTimer);
  const schedule=()=>{
    const jitter=.85+(Math.random()*.30);
    livePollTimer=setTimeout(async()=>{
      if(document.visibilityState!=='hidden' && shouldRunFallbackPolling({hasUser:Boolean(state.user),liveStatus:state.liveStatus})){
        await refreshLiveData('Revisión automática',false);
      }
      if(state.user) schedule();
    },Math.round(pollSeconds()*1000*jitter));
  };
  schedule();
}
function handleLiveOrderChange(payload){
  const row=payload.new || payload.old || {};
  const target=liveTargetFromOrderRow(row);
  const event=payload.eventType || '';
  const oldState=payload.old?.estado;
  const newState=row.estado;
  let title='Orden actualizada', msg=liveOrderLabel(row)+' · '+liveTargetName(target);
  if(event==='INSERT'){
    markLiveFlashOrder(row,target);
    title = target==='carniceria' ? 'Nueva orden para carnicería' : 'Nueva orden registrada';
    msg = liveOrderLabel(row)+' · '+(newState||'Pedido recibido');
  }else if(event==='UPDATE' && oldState && newState && oldState!==newState){
    const oldTarget = liveTargetFromOrderRow(payload.old||{});
    const sameOperationalModule = oldTarget && target && oldTarget===target;
    if(!sameOperationalModule) markLiveFlashOrder(row,target);
    title = sameOperationalModule ? 'Orden actualizada' : 'Orden entró a '+liveTargetName(target);
    msg = liveOrderLabel(row)+' · '+oldState+' → '+newState;
  }else if(event==='DELETE'){
    title='Orden eliminada/anulada'; msg=liveOrderLabel(row);
    state.ordenes=removeRowByIdV942(state.ordenes,row.id);
  }
  pushLiveNotice(title,msg,target);
  if(event!=='DELETE') scheduleLiveOrderRefreshV942(row.id);
  else if(!document.querySelector('.modal')) render();
}
function handleLiveAuxChange(payload,table){
  const event=payload.eventType||'';
  const row=payload.new||payload.old||{};
  const map={orden_pesos:'pesos',orden_entregas:'entregas',orden_pagos:'pagos',orden_estados_historial:'historialEstados',cxc_cobros:'cxcCobros',cxc_cobro_aplicaciones:'cxcAplicaciones'};
  const stateKey=map[table];
  if(stateKey){
    state[stateKey]=event==='DELETE'
      ? removeRowByIdV942(state[stateKey],row.id)
      : upsertRowByIdV942(state[stateKey],row);
    const limits={pesos:1500,entregas:1500,pagos:1500,historialEstados:2000,cxcCobros:1000,cxcAplicaciones:5000};
    state[stateKey]=state[stateKey].slice(0,limits[stateKey]||2000);
  }
  if(table==='cxc_cobros'||table==='cxc_cobro_aplicaciones'){
    state.cxcLoadedAt=0;
    if(state.page==='liquidacion'&&['cxc','cxc_historial'].includes(state.liquidacionTab)){
      loadCxcDataV940(true).then(()=>{
        if(state.page==='liquidacion'&&['cxc','cxc_historial'].includes(state.liquidacionTab)&&!document.querySelector('.modal')) render();
      });
    }
  }
  const orderId=changedOrderIdV942(table,payload,state.ordenes);
  if(orderId) scheduleLiveOrderRefreshV942(orderId);
  else if(!document.querySelector('.modal')) render();
}
function scheduleLiveOrderRefreshV942(orderId){
  const ids=boundedOrderIdsV942([orderId]);
  ids.forEach(id=>liveChangedOrderIds.add(id));
  if(!ids.length) return;
  if(liveRefreshTimer) clearTimeout(liveRefreshTimer);
  liveRefreshTimer=setTimeout(flushLiveOrderRefreshV942,450);
}
async function flushLiveOrderRefreshV942(){
  liveRefreshTimer=null;
  if(!state.user || state.liveLoading) return;
  const ids=boundedOrderIdsV942([...liveChangedOrderIds]);
  liveChangedOrderIds.clear();
  if(!ids.length) return;
  state.liveLoading=true;
  try{
    const result=await loadOrdersSnapshotV942(state.page,ids);
    const requested=new Set(ids.map(String));
    const unchanged=(state.ordenes||[]).filter(row=>!requested.has(String(row?.id)));
    state.ordenes=[...(result.data||[]),...unchanged].sort((a,b)=>Number(b?.id||0)-Number(a?.id||0));
    state.liveLastRefresh=new Date().toISOString();
    if(!document.querySelector('.modal')) render(); else updateLiveDom();
  }catch(e){
    state.liveStatus='polling'; updateLiveDom();
  }finally{state.liveLoading=false;}
}
async function refreshLiveData(reason='Actualización',fromRealtime=false){
  if(!state.user || state.liveLoading) return;
  state.liveLoading=true;
  try{
    await refreshVisibleModuleV9384();
    state.liveLastRefresh=new Date().toISOString();
    if(!document.querySelector('.modal')) render();
    else updateLiveDom();
  }catch(e){
    state.liveStatus='polling'; updateLiveDom();
  }finally{ state.liveLoading=false; }
}
function liveStatusHtml(){
  if(!state.user) return '';
  const latest=(state.liveNotices||[])[0];
  const unread=Number(state.liveUnread||0);
  const unreadText=unread===1?'1 nueva':`${unread} nuevas`;
  return `<div class="live-bar"><div class="live-left"><span class="live-dot ${liveStatusClass()}" id="liveDot"></span><div class="live-copy"><div class="live-title"><span id="liveStatusText">${esc(liveStatusText())}</span>${unread?` · <span class="badge info" id="liveUnread">${unreadText}</span>`:''}</div><div class="live-sub">Actualizado <span id="liveTime">${esc(liveTimeTxt())}</span> · cada ${pollSeconds()} s</div></div>${latest?`<button type="button" class="live-notice" id="liveNoticeOpen" title="Abrir aviso"><b>${esc(latest.title)}</b><span>${esc(latest.msg)}</span></button>`:''}</div><div class="live-actions"><button class="btn small gray" id="liveRefreshNow" aria-label="Actualizar ahora" title="Actualizar ahora">Actualizar ahora</button><button class="btn small ${state.liveSound?'green':'gray'}" id="liveSoundBtn" aria-label="${state.liveSound?'Desactivar sonido':'Activar sonido'}" title="${state.liveSound?'Sonido activo':'Activar sonido'}">${state.liveSound?'Sonido activo':'Activar sonido'}</button>${state.liveNotices?.length?'<button class="btn small gray" id="liveClearBtn" aria-label="Limpiar avisos" title="Limpiar avisos">Limpiar avisos</button>':''}</div></div>`;
}
function bindLiveBar(){
  const r=$('#liveRefreshNow'); if(r) r.onclick=async()=>{ await refreshLiveData('Actualización manual'); toast('Datos actualizados'); };
  const s=$('#liveSoundBtn'); if(s) s.onclick=()=>{ state.liveSound=!state.liveSound; localStorage.setItem('pc_live_sound_v61',state.liveSound?'1':'0'); if(state.liveSound) playLiveSound(); render(); };
  const c=$('#liveClearBtn'); if(c) c.onclick=()=>{ state.liveNotices=[]; state.liveUnread=0; render(); };
}
function updateLiveDom(){
  const txt=$('#liveStatusText'); if(txt) txt.textContent=liveStatusText();
  const t=$('#liveTime'); if(t) t.textContent=liveTimeTxt();
  const d=$('#liveDot'); if(d) d.className='live-dot '+liveStatusClass();
}

async function init(){
  setupMobileUi();
  const {data:{session}} = await sb.auth.getSession(); state.session=session; state.user=session?.user||null;
  const hashParams=new URLSearchParams(String(location.hash||'').replace(/^#/,''));
  const recoveryFromUrl=hashParams.get('type')==='recovery';
  if(recoveryFromUrl && session) return renderPasswordRecovery();
  if(!session) return renderLogin();
  await loadAll(); setupLiveUpdates(); render();
}
const OPERATIONAL_PENDING_STATES_V940=Object.freeze([
  'Programada','Pendiente por existencia','Pedido recibido','En preparación',
  'Lista para facturar','Impresa para facturar','Facturada','Lista para retiro',
  'Validada para delivery','Asignada a delivery','En ruta','Entregado'
]);
async function fetchPendingOrdersV9380(orderSelect){
  const rows=[];
  const pageSize=1000;
  for(let from=0;from<20000;from+=pageSize){
    const {data,error}=await sb.from('ordenes')
      .select(orderSelect)
      .eq('archivada',false)
      .in('estado',OPERATIONAL_PENDING_STATES_V940)
      .order('id',{ascending:false})
      .range(from,from+pageSize-1);
    if(error) return {data:rows,error};
    rows.push(...(data||[]));
    if((data||[]).length<pageSize) return {data:rows,error:null};
  }
  return {data:rows,error:new Error('La consulta de órdenes operativas pendientes superó 20,000 filas.')};
}
const SYSTEM_CONFIG_KEYS_V942=['control_peso','empresa','menu','alertas','impresion','recibos','respaldo','atajos','facturacion','seguridad','incentivos','whatsapp','flujos'];
const ORDER_SELECT_V942='*, cliente:clientes(id,codigo,negocio,contacto,telefono,sector,direccion,referencia,tipo,vendedor,estado,ultimo_pedido,credito,limite_credito), items:orden_detalle(*)';
function scopeFreshV942(name,maxAge=60000){ return Date.now()-Number(state.loadedScopes?.[name]||0)<maxAge; }
function markScopeV942(name){ state.loadedScopes=state.loadedScopes||{}; state.loadedScopes[name]=Date.now(); }
function applySystemConfigRowsV942(rows=[]){
  if(!rows.length) return;
  const byKey=Object.fromEntries(rows.map(r=>[r.clave,r.valor]));
  if(byKey.control_peso) state.weightConfig=normalizeWeightConfig(byKey.control_peso);
  const patch={};
  SYSTEM_CONFIG_KEYS_V942.filter(k=>k!=='control_peso').forEach(k=>{if(byKey[k]!==undefined&&byKey[k]!==null) patch[k]=byKey[k];});
  state.systemConfig=normalizeSystemConfig(patch);
  saveWeightConfigLocal(state.weightConfig); saveSystemConfigLocal(state.systemConfig);
  if(state.systemConfig.alertas?.sonidoDefault===true && localStorage.getItem('pc_live_sound_v61')===null) state.liveSound=true;
}
async function loadOrdersSnapshotV942(page=state.page,ids=null){
  const cleanIds=boundedOrderIdsV942(ids||[]);
  const rpc=await sb.rpc('cargar_ordenes_v942',{
    p_modulo:page,
    p_ids:cleanIds.length?cleanIds:null,
    p_limite_recientes:250
  });
  if(!rpc.error) return {data:Array.isArray(rpc.data)?rpc.data:[],error:null};
  if(!['PGRST202','42883'].includes(String(rpc.error.code||''))) return {data:[],error:rpc.error};
  if(cleanIds.length){
    return sb.from('ordenes').select(ORDER_SELECT_V942).in('id',cleanIds).eq('archivada',false).order('id',{ascending:false});
  }
  const [recent,pending]=await Promise.all([
    sb.from('ordenes').select(ORDER_SELECT_V942).eq('archivada',false).order('id',{ascending:false}).limit(500),
    fetchPendingOrdersV9380(ORDER_SELECT_V942)
  ]);
  return {data:mergeRecentAndPendingOrders(recent.data||[],pending.data||[]),error:recent.error||pending.error||null};
}
async function loadCoreAccessV942(force=false){
  if(!force&&scopeFreshV942('core')) return;
  const [mods,perms,ums,deliverys,empleados,config]=await Promise.all([
    safe(sb.from('modulos_sistema').select('*').order('orden'),'módulos'),
    safe(sb.from('roles_permisos').select('*'),'permisos'),
    safe(sb.from('usuario_modulos').select('*'),'permisos usuario'),
    safe(sb.from('deliverys_config').select('*').order('nombre'),'deliverys'),
    safe(sb.from('empleados_operativos').select('*').order('area').order('nombre'),'empleados operativos'),
    safe(sb.from('sistema_configuracion').select('*').in('clave',SYSTEM_CONFIG_KEYS_V942),'configuración sistema')
  ]);
  state.modulos=mods.data; state.permisos=perms.data; state.usuarioModulos=ums.data;
  state.deliverys=deliverys.data; state.empleados=empleados.data;
  applySystemConfigRowsV942(config.data||[]); markScopeV942('core');
}
async function loadReferenceDataV942(force=false){
  if(!force&&scopeFreshV942('references')) return;
  const [clientes,llamadas,productos]=await Promise.all([
    safe(sb.from('clientes').select('*').eq('archivado',false).order('codigo',{ascending:true}).limit(2000),'clientes'),
    safe(sb.from('llamadas').select('*, cliente:clientes(id,codigo,negocio,contacto,telefono,sector,tipo,vendedor)').order('id',{ascending:false}).limit(1000),'llamadas'),
    safe(sb.from('productos_despacho').select('*').order('nombre').limit(1000),'productos')
  ]);
  state.clientes=clientes.data; state.llamadas=llamadas.data; state.productos=productos.data;
  markScopeV942('references');
}
async function loadCatalogDataV942(force=false){
  if(!force&&scopeFreshV942('catalogs',300000)) return;
  const [cats,items,plantillas]=await Promise.all([
    safe(sb.from('catalogos').select('*').eq('activo',true).order('orden'),'catálogos'),
    safe(sb.from('catalogo_items').select('*').eq('activo',true).order('orden'),'items catálogo'),
    safe(sb.from('plantillas_whatsapp').select('*').order('orden'),'plantillas')
  ]);
  state.plantillas=plantillas.data; state.catalogos={};
  cats.data.forEach(c=>state.catalogos[c.id]=[]);
  items.data.forEach(i=>{if(!state.catalogos[i.catalogo_id]) state.catalogos[i.catalogo_id]=[];state.catalogos[i.catalogo_id].push(i);});
  markScopeV942('catalogs');
}
async function loadAdminDataV942(force=false){
  if(!force&&scopeFreshV942('admin')) return;
  const [usuarios,cobranza]=await Promise.all([
    safe(sb.from('perfiles').select('*').order('nombre'),'usuarios'),
    safe(sb.from('cobranza').select('*').order('id',{ascending:false}).limit(1000),'cobranza')
  ]);
  state.usuarios=usuarios.data; state.cobranza=cobranza.data; markScopeV942('admin');
}
async function loadAuditDataV942(force=false){
  if(!isAuditAdministrator(state.profile?.rol)){state.auditExceptions=[];state.auditExceptionsSchemaOk=false;return;}
  if(!force&&scopeFreshV942('audit')) return;
  const rows=await optionalSafe(sb.from('auditoria_excepciones').select('*').order('creado_en',{ascending:false}).limit(2000),'auditoria_excepciones');
  state.auditExceptions=rows.data||[]; state.auditExceptionsSchemaOk=!rows.error; markScopeV942('audit');
}
async function loadAll(){
  state.errors=[]; state.loadedScopes={};
  const uid=state.user.id;
  const prof=await safe(sb.from('perfiles').select('*').eq('id',uid).maybeSingle(),'perfil');
  state.profile=prof.data||{id:uid,nombre:state.user.email,rol:'Sin perfil',vendedor:null,activo:false};
  await loadCoreAccessV942(true);
  if(!puede(state.page)) state.page=firstAllowedPage()||'inicio';
  await loadModuleDataV942(state.page,true);
}
async function refreshSystemConfigV9390(){
  if(!state.user) return;
  const keys=['control_peso','empresa','menu','alertas','impresion','recibos','respaldo','atajos','facturacion','seguridad','incentivos','whatsapp','flujos'];
  const {data,error}=await sb.from('sistema_configuracion').select('*').in('clave',keys);
  if(error) return console.warn('No se pudo sincronizar configuración:',error.message);
  const byKey=Object.fromEntries((data||[]).map(r=>[r.clave,r.valor]));
  if(byKey.control_peso) state.weightConfig=normalizeWeightConfig(byKey.control_peso);
  const cfgPatch={};
  keys.filter(k=>k!=='control_peso').forEach(k=>{if(byKey[k]!==undefined&&byKey[k]!==null) cfgPatch[k]=byKey[k];});
  state.systemConfig=normalizeSystemConfig(cfgPatch);
  saveWeightConfigLocal(state.weightConfig);
  saveSystemConfigLocal(state.systemConfig);
  if(!document.querySelector('.modal')) render();
  else toast('Configuración global actualizada');
}
async function loadOperationalDataV9384(page=state.page){
  const includeLots=['validacion','delivery','liquidacion','auditoria'].includes(page);
  const includeCases=['ordenes','alertas','kanban','auditoria'].includes(page);
  const started=performance.now();
  const aux=auxTablesForPageV942(page).filter(t=>t!=='orden_detalle');
  const jobs=[safe(loadOrdersSnapshotV942(page),'órdenes V9.4.2 R2')];
  aux.forEach(table=>{
    const limits={orden_pesos:1500,orden_entregas:1500,orden_pagos:1500,orden_estados_historial:2000};
    jobs.push(safe(sb.from(table).select('*').order('creado_en',{ascending:false}).limit(limits[table]||1500),table));
  });
  const [ordenes,...auxResults]=await Promise.all(jobs);
  state.ordenes=ordenes.data||[];
  const map={orden_pesos:'pesos',orden_entregas:'entregas',orden_pagos:'pagos',orden_estados_historial:'historialEstados'};
  aux.forEach((table,index)=>{state[map[table]]=auxResults[index]?.data||[];});

  if(includeLots){
    const [lotes,detalle,documentos,liquidaciones,liqDetalle,correcciones,eventos,transferencias]=await Promise.all([
      optionalSafe(sb.from('entrega_lotes').select('*').order('creado_en',{ascending:false}).limit(500),'entrega_lotes'),
      optionalSafe(sb.from('entrega_lote_detalle').select('*').order('id',{ascending:false}).limit(2000),'entrega_lote_detalle'),
      optionalSafe(sb.from('entrega_documentos_historial').select('*').order('fecha_evento',{ascending:false}).limit(2000),'entrega_documentos_historial'),
      optionalSafe(sb.from('liquidaciones_lotes').select('*').order('fecha_liquidacion',{ascending:false}).limit(500),'liquidaciones_lotes'),
      optionalSafe(sb.from('liquidacion_lote_detalle').select('*').order('id',{ascending:false}).limit(3000),'liquidacion_lote_detalle'),
      optionalSafe(sb.from('entrega_lote_correcciones').select('*').order('fecha_evento',{ascending:false}).limit(1000),'entrega_lote_correcciones'),
      optionalSafe(sb.from('liquidacion_lote_eventos').select('*').order('creado_en',{ascending:false}).limit(1500),'liquidacion_lote_eventos'),
      optionalSafe(sb.from('entrega_pedido_transferencias').select('*').order('creado_en',{ascending:false}).limit(1500),'entrega_pedido_transferencias')
    ]);
    state.entregaLotes=lotes.data||[];
    state.entregaLoteDetalle=detalle.data||[];
    state.entregaDocumentosHistorial=documentos.data||[];
    state.liquidacionesLotes=liquidaciones.data||[];
    state.liquidacionLoteDetalle=liqDetalle.data||[];
    state.deliveryLotCorrections=correcciones.data||[];
    state.v936SchemaOk=!correcciones.error;
    state.liquidacionLotEvents=eventos.data||[];
    state.v937SchemaOk=!eventos.error;
    state.deliveryTransfers=transferencias.data||[];
    state.v9371SchemaOk=!transferencias.error;
    state.liquidacionSchemaOk=!lotes.error&&!liquidaciones.error;
    state.validacionR5SchemaOk=!lotes.error&&!documentos.error;
  }
  if(includeCases){
    const casos=await optionalSafe(sb.from('orden_casos_historial').select('*').order('creado_en',{ascending:false}).limit(2000),'orden_casos_historial');
    state.casosHistorial=casos.data||[];
  }
  if(page==='liquidacion' && ['cxc','cxc_historial'].includes(state.liquidacionTab)){
    await loadCxcDataV940(true);
  }
  state.performanceV9384={
    scope:includeLots?'operación + lotes':includeCases?'operación + casos':'operación',
    requests:1+aux.length+(includeLots?8:0)+(includeCases?1:0),
    elapsedMs:Math.round(performance.now()-started),
    refreshedAt:new Date().toISOString()
  };
}
function carniceriaProgressDefaultEmployeeIdV943(){
  const linked=linkedEmployeeForUser(state.profile);
  if(linked && employeeHasArea(linked,'Carnicería')) return Number(linked.id);
  if(isStationAccount()){
    const chosen=activeEmployees('Carnicería').find(e=>Number(e.id)===Number(state.carniceriaProgressEmployeeId));
    return Number(chosen?.id||activeEmployees('Carnicería')[0]?.id)||null;
  }
  return state.carniceriaProgressEmployeeId===null ? null : Number(state.carniceriaProgressEmployeeId)||null;
}
async function loadCarniceriaProgressV943(force=false){
  if(!state.user) return;
  const employeeId=carniceriaProgressDefaultEmployeeIdV943();
  if(isStationAccount() && employeeId) state.carniceriaProgressEmployeeId=employeeId;
  if(!force && state.carniceriaProgressLoadedAt && Date.now()-state.carniceriaProgressLoadedAt<30000) return;
  state.carniceriaProgressLoading=true;
  state.carniceriaProgressError='';
  const {data,error}=await sb.rpc('resumen_carniceria_mensual_v943',{
    p_empleado_id:employeeId,
    p_mes:null
  });
  state.carniceriaProgressLoading=false;
  if(error){
    state.carniceriaProgress=null;
    state.carniceriaProgressSchemaOk=false;
    state.carniceriaProgressError=error.message||'No se pudo cargar el progreso mensual.';
    return;
  }
  state.carniceriaProgress=data||null;
  state.carniceriaProgressSchemaOk=true;
  state.carniceriaProgressLoadedAt=Date.now();
}
async function loadModuleDataV942(page=state.page,force=false){
  const key=`module:${page}`;
  const needsReferences=['inicio','control','clientes','ordenes','carniceria','facturacion','validacion','delivery','liquidacion','alertas','kanban','productos','productividad','reportes','config'].includes(page);
  const needsCatalogs=['inicio','control','clientes','ordenes','productos','config'].includes(page);
  const needsOperation=isOperationalPageV942(page)||['control','clientes','productividad','reportes','auditoria'].includes(page);
  if(!force&&!needsOperation&&scopeFreshV942(key,45000)) return;
  const jobs=[];
  if(needsReferences) jobs.push(loadReferenceDataV942(force));
  if(needsCatalogs) jobs.push(loadCatalogDataV942(force));
  if(needsOperation) jobs.push(loadOperationalDataV9384(page));
  if(['productividad','reportes','config'].includes(page)) jobs.push(loadAdminDataV942(force));
  if(page==='auditoria') jobs.push(loadAuditDataV942(force));
  await Promise.all(jobs);
  if(page==='carniceria') await loadCarniceriaProgressV943(force);
  markScopeV942(key);
}
async function refreshVisibleModuleV9384(forceFull=false){
  await loadModuleDataV942(state.page,true);
}
async function navigateToPageV942(page){
  const target=String(page||'');
  if(!puede(target)) return;
  if(!target||target===state.page){render();return;}
  state.page=target;
  setupLiveUpdates();
  render();
  try{await loadModuleDataV942(target,false);}catch(e){state.errors.push('Carga de '+target+': '+(e?.message||e));}
  render();
}
function renderLogin(message=''){
  root.innerHTML = `<div class="login"><div class="login-card"><div class="logo">PC</div><h2 style="text-align:center;margin:0 0 6px">Sistema Productos César</h2><p style="text-align:center;color:var(--muted);margin:0 0 22px">Entrada por empleado · permisos por módulo</p><div id="loginError">${message?`<div class="success">${esc(message)}</div>`:''}</div><div class="form"><div class="field"><label>Correo del empleado</label><input id="email" placeholder="empleado@correo.com" autocomplete="username"></div><div class="field"><label>Contraseña</label><input id="pass" type="password" autocomplete="current-password" placeholder="Contraseña asignada"></div><button class="btn" id="loginBtn">Entrar al sistema</button><button class="btn gray" id="forgotBtn" type="button">Recuperar contraseña</button><div class="hint" style="text-align:center">El correo y contraseña se crean en Supabase Auth. Los módulos se asignan en Configuración → Usuarios y módulos.<br><span style="font-size:11px">Proyecto conectado: ${esc(SUPABASE_PROJECT_REF)}</span></div></div></div></div>`;
  const doLogin = async()=>{
    const email=$('#email').value.trim(), password=$('#pass').value;
    if(!email || !password){ $('#loginError').innerHTML=`<div class="error">Escribe correo y contraseña.</div>`; return; }
    $('#loginBtn').disabled=true; $('#loginBtn').textContent='Entrando...';
    const {data,error}=await sb.auth.signInWithPassword({email,password});
    $('#loginBtn').disabled=false; $('#loginBtn').textContent='Entrar al sistema';
    if(error){
      const msg=/invalid login credentials/i.test(String(error.message||''))
        ? `Supabase rechazó el correo o la contraseña en el proyecto ${SUPABASE_PROJECT_REF}. Verifica el usuario o usa “Recuperar contraseña”.`
        : error.message;
      $('#loginError').innerHTML=`<div class="error">${esc(msg)}</div>`;
    }else {state.session=data.session; state.user=data.user; await loadAll(); setupLiveUpdates(); render();}
  };
  $('#loginBtn').onclick = doLogin;
  $('#pass').onkeydown = e=>{ if(e.key==='Enter') doLogin(); };
  $('#forgotBtn').onclick = async()=>{
    const email=$('#email').value.trim();
    if(!email){ $('#loginError').innerHTML=`<div class="error">Escribe el correo primero.</div>`; return; }
    $('#forgotBtn').disabled=true; $('#forgotBtn').textContent='Enviando...';
    const {error}=await sb.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname});
    $('#forgotBtn').disabled=false; $('#forgotBtn').textContent='Recuperar contraseña';
    $('#loginError').innerHTML = error ? `<div class="error">${esc(error.message)}</div>` : `<div class="success">Se envió un enlace de recuperación. Ábrelo desde este mismo dispositivo para establecer una contraseña nueva.</div>`;
  };
}
function renderPasswordRecovery(){
  root.innerHTML=`<div class="login"><div class="login-card"><div class="logo">PC</div><h2 style="text-align:center;margin:0 0 6px">Crear contraseña nueva</h2><p style="text-align:center;color:var(--muted);margin:0 0 22px">Escribe y confirma la nueva contraseña.</p><div id="recoveryError"></div><div class="form"><div class="field"><label>Nueva contraseña</label><input id="newPass" type="password" autocomplete="new-password" placeholder="Mínimo 8 caracteres"></div><div class="field"><label>Confirmar contraseña</label><input id="confirmPass" type="password" autocomplete="new-password" placeholder="Repite la contraseña"></div><button class="btn" id="saveNewPass">Guardar contraseña</button><button class="btn gray" id="cancelRecovery" type="button">Cancelar</button></div></div></div>`;
  $('#saveNewPass').onclick=async()=>{
    const a=$('#newPass').value,b=$('#confirmPass').value;
    if(a.length<8){ $('#recoveryError').innerHTML='<div class="error">La contraseña debe tener al menos 8 caracteres.</div>'; return; }
    if(a!==b){ $('#recoveryError').innerHTML='<div class="error">Las contraseñas no coinciden.</div>'; return; }
    $('#saveNewPass').disabled=true; $('#saveNewPass').textContent='Guardando...';
    const {error}=await sb.auth.updateUser({password:a});
    if(error){ $('#saveNewPass').disabled=false; $('#saveNewPass').textContent='Guardar contraseña'; $('#recoveryError').innerHTML=`<div class="error">${esc(error.message)}</div>`; return; }
    await sb.auth.signOut();
    history.replaceState({},document.title,location.pathname+location.search);
    state.session=null; state.user=null;
    renderLogin('Contraseña actualizada. Ya puedes entrar con la nueva contraseña.');
  };
  $('#cancelRecovery').onclick=async()=>{ await sb.auth.signOut(); history.replaceState({},document.title,location.pathname+location.search); state.session=null; state.user=null; renderLogin(); };
}

function render(){
  applyUi();
  if(!state.profile || state.profile.activo===false){
    root.innerHTML = `<div class="login"><div class="login-card"><div class="logo">PC</div><h2 style="text-align:center;margin:0 0 6px">Acceso no habilitado</h2><p style="text-align:center;color:var(--muted);margin:0 0 18px">Tu usuario existe en Supabase Auth, pero no tiene un perfil activo en el sistema.</p><div class="error">Pídele al administrador que active tu perfil en Configuración → Usuarios y módulos.</div><button class="btn dark" id="logoutBlocked">Salir</button></div></div>`;
    $('#logoutBlocked').onclick=async()=>{await sb.auth.signOut(); teardownLiveUpdates(); state.session=null; state.user=null; renderLogin();};
    return;
  }
  let visibleNav = navItems.filter(([id]) => puede(id) && moduleEnabled(id));
  if(!visibleNav.length){
    root.innerHTML = `<div class="login"><div class="login-card"><div class="logo">PC</div><h2 style="text-align:center;margin:0 0 6px">Sin módulos asignados</h2><p style="text-align:center;color:var(--muted);margin:0 0 18px">Tu perfil está activo, pero no tiene ningún módulo permitido.</p><div class="error">El administrador debe asignarte al menos un módulo.</div><button class="btn dark" id="logoutNoModules">Salir</button></div></div>`;
    $('#logoutNoModules').onclick=async()=>{await sb.auth.signOut(); teardownLiveUpdates(); state.session=null; state.user=null; renderLogin();};
    return;
  }
  if(!puede(state.page)) state.page = visibleNav[0][0];
  const sidebarCollapsed=loadSidebarCollapsed();
  root.innerHTML = `<div class="shell${sidebarCollapsed?' sidebar-collapsed':''}"><aside id="appSidebar" class="sidebar" aria-hidden="${sidebarCollapsed?'true':'false'}"><div class="brand"><div class="logo">${esc(appCfg('empresa.logoTexto','PC'))}</div><div><h1>${esc(appCfg('empresa.nombre','Sistema Productos César'))}</h1><p>V9.4.3 PWA · ${esc(appCfg('empresa.subtitulo','CRM · Despacho · CXC'))}</p></div></div><nav class="nav">${renderSideNav(visibleNav)}</nav><div class="side-card"><b>V9.4.3 PWA</b><br>Progreso mensual confiable en Carnicería.</div></aside><button id="sidebarToggle" class="sidebar-toggle" type="button" data-collapsed="${sidebarCollapsed?'1':'0'}" aria-controls="appSidebar" aria-expanded="${sidebarCollapsed?'false':'true'}" aria-label="${sidebarCollapsed?'Mostrar menú lateral':'Ocultar menú lateral'}" title="${sidebarCollapsed?'Mostrar menú lateral':'Ocultar menú lateral'}"><span aria-hidden="true">${sidebarCollapsed?'›':'‹'}</span></button><main class="main"><div class="top"><div class="mobile-brand-mini"><span>${esc(appCfg('empresa.logoTexto','PC'))}</span></div><div class="title"><h2>${titleOf(state.page)}</h2><p>${subtitleOf(state.page)}</p></div><div class="user-pill"><span title="${esc(currentUserEmail())}">${esc(currentWorkerName())} · ${esc(state.profile?.rol||'')}</span><button id="myAccessBtn" class="gray" aria-label="Mi acceso">Mi acceso</button><button id="refreshBtn" aria-label="Actualizar">Actualizar</button><button id="logoutBtn" class="dark" aria-label="Salir">Salir</button></div></div>${state.errors.length?`<div class="error"><b>Avisos:</b><br>${state.errors.map(esc).join('<br>')}<br><small>Si falta una tabla o no ves clientes, ejecuta el SQL V5.5.1 de mapeo de roles.</small></div>`:''}${liveStatusHtml()}<div id="content"></div></main><nav class="bottom-nav">${renderBottomNav(visibleNav)}</nav></div>`;
  setupKeyboardShortcuts();
  bindSidebarToggle();
  $$('[data-page]').forEach(b=>b.onclick=()=>navigateToPageV942(b.dataset.page));
  const moreBtn=$('[data-mobile-more]'); if(moreBtn) moreBtn.onclick=()=>openMobileMoreMenu(visibleNav);
  $('#myAccessBtn').onclick=()=>openMyAccess();
  $('#logoutBtn').onclick=async()=>{await sb.auth.signOut(); teardownLiveUpdates(); state.session=null; state.user=null; renderLogin();};
  $('#refreshBtn').onclick=async()=>{await refreshVisibleModuleV9384(); state.liveLastRefresh=new Date().toISOString(); render(); toast('Datos actualizados');};
  bindLiveBar();
  renderPage();
}
function titleOf(p){return {inicio:'Panel general',control:'Control de llamadas',clientes:'Clientes',ordenes:'Órdenes',carniceria:'Carnicería / despacho',facturacion:'Facturación',validacion:'Validación y delivery',delivery:'Mis entregas',liquidacion:'Liquidación / CXC',productos:'Productos',productividad:'Productividad e incentivos',alertas:'Centro de alertas',kanban:'Tablero Kanban',reportes:'Reportes',auditoria:'Auditoría',config:'Configuración'}[p]||'Sistema'}
function subtitleOf(p){return {inicio:'Vista ejecutiva del negocio.',control:'Gestiones del día, llamadas y seguimiento.',clientes:'Ficha completa, WhatsApp e importación Excel.',ordenes:'Vista total del flujo operativo por estados.',carniceria:'Órdenes recibidas para preparar, pesar y enviar a facturación.',facturacion:'Órdenes listas para imprimir en ticket 80 mm y registrar factura.',validacion:'Validación final, asignación y entrega a delivery.',delivery:'Pedidos asignados por delivery.',liquidacion:'Recepción de dinero, crédito, devoluciones y cierre.',productos:'Catálogo operativo del despacho.',productividad:'KPIs mensuales por empleado, rol e incentivo calculado.',alertas:'Prioridades, atrasos y acciones que requieren atención.',kanban:'Vista visual del flujo completo de órdenes por etapa.',reportes:'Indicadores operativos, tiempos, productividad y ventas.',auditoria:'Historial de acciones, cambios y trazabilidad por usuario.',config:'Catálogos, plantillas, usuarios y empleados operativos.'}[p]||''}
function openMyAccess(){
  const rows=permisosActuales().filter(x=>x.nivel!=='none');
  const faltaNombre=looksEmail(state.profile?.nombre||'') && !String(state.profile?.vendedor||'').trim() && !String(state.user?.user_metadata?.full_name||state.user?.user_metadata?.name||'').trim();
  const body=`<div class="grid2"><div class="card"><h3>Mi perfil</h3><div class="kv"><b>Nombre operativo</b><span>${esc(currentWorkerName())}</span></div><div class="kv"><b>Correo de acceso</b><span>${esc(currentUserEmail())}</span></div><div class="kv"><b>Rol</b><span>${esc(state.profile?.rol||'')}</span></div><div class="kv"><b>Estado</b><span>${state.profile?.activo!==false?'Activo':'Inactivo'}</span></div>${faltaNombre?'<div class="error">El perfil todavía tiene el correo como nombre. El administrador debe editar el campo <b>Nombre</b> en Configuración → Usuarios y módulos para que las órdenes muestren el nombre real.</div>':''}<button class="btn gray" id="changeMyPass">Cambiar mi contraseña</button></div><div class="card"><h3>Módulos permitidos</h3>${rows.map(r=>`<div class="kv"><b>${esc(r.n)}</b><span>${r.nivel==='editar'?'Editar':'Ver'}</span></div>`).join('')||'<div class="empty">No tienes módulos asignados.</div>'}</div></div>`;
  const m=openModal('Mi acceso',body,'Permisos aplicados a esta sesión');
  $('#changeMyPass',m).onclick=()=>openPasswordChange(m);
}
function openPasswordChange(parent){
  if(parent) parent.remove();
  const m=openModal('Cambiar contraseña',`<div class="form"><div class="field"><label>Nueva contraseña</label><input type="password" id="newPass1" placeholder="Mínimo 6 caracteres"></div><div class="field"><label>Confirmar contraseña</label><input type="password" id="newPass2"></div><button class="btn" id="saveMyPass">Guardar nueva contraseña</button></div>`,'Esto cambia la contraseña del usuario que inició sesión.');
  $('#saveMyPass',m).onclick=async()=>{ const p1=$('#newPass1',m).value, p2=$('#newPass2',m).value; if(p1.length<6) return alert('La contraseña debe tener mínimo 6 caracteres.'); if(p1!==p2) return alert('Las contraseñas no coinciden.'); const {error}=await sb.auth.updateUser({password:p1}); if(error) return alert(error.message); m.remove(); toast('Contraseña actualizada'); };
}
function renderPage(){
  const c=$('#content');
  if(!c) return;
  try{
    if(!puede(state.page)){
      c.innerHTML='<div class="empty">No tienes acceso a este módulo.</div>';
      return;
    }
    const fn=({inicio:renderInicio,control:renderControl,clientes:renderClientes,ordenes:renderOrdenes,carniceria:renderCarniceria,facturacion:renderFacturacion,validacion:renderValidacion,delivery:renderDelivery,liquidacion:renderLiquidacion,productos:renderProductos,productividad:renderProductividad,alertas:renderAlertas,kanban:renderKanban,reportes:renderReportes,auditoria:renderAuditoria,config:renderConfig}[state.page]||renderInicio);
    fn(c);
    applyMobileLabels(c);
  }catch(err){
    console.error('Error renderizando módulo', state.page, err);
    c.innerHTML=`<div class="panel"><div class="empty"><b>No se pudo cargar este módulo.</b><br>${esc(err?.message||err)}<br><br><button class="btn" id="recoverModuleBtn">Reintentar</button> <button class="btn gray" id="goOrdersFallback">Ir a órdenes</button></div></div>`;
    const retry=$('#recoverModuleBtn'); if(retry) retry.onclick=()=>renderPage();
    const go=$('#goOrdersFallback'); if(go) go.onclick=()=>navigateToPageV942('ordenes');
  }
}
function lastCall(clienteId){return state.llamadas.find(l=>Number(l.cliente_id)===Number(clienteId));}
function daysSince(iso){ if(!iso) return null; return Math.max(0,Math.floor((Date.now()-new Date(String(iso).slice(0,10)+'T12:00:00').getTime())/86400000)); }
function matchText(obj,q,fields){ q=norm(q); if(!q) return true; return fields.some(f=>norm(obj[f]).includes(q)); }
function matchClientName(cl,q){ q=norm(q); if(!q) return true; return norm(cl?.negocio).includes(q); }
function matchProductName(p,q){ q=norm(q); if(!q) return true; return norm(p?.nombre).includes(q); }
function matchOrder(o,q){ q=norm(q); if(!q) return true; return norm([orderClientName(o),orderClientPhone(o),orderClientSector(o),orderClientAddress(o),orderClientReference(o),o?.codigo,o?.factura_no,o?.estado,orderDeliveryMode(o),...(o?.items||[]).map(i=>i.producto_nombre)].join(' ')).includes(q); }
function dateOnly(v){ return String(v||'').slice(0,10); }
function dispatchDateOf(o){ return dateOnly(o?.fecha_despacho || o?.fecha || today()); }
function isFutureDispatch(o){ const d=dispatchDateOf(o); return d && d>today(); }
function isDueDispatch(o){ const d=dispatchDateOf(o); return !d || d<=today(); }
function isLateDispatch(o){ const d=dispatchDateOf(o); return d && d<today() && !['Cobrado','Entregado a crédito','No entregado','Devuelto parcial','Cerrado','Entregada en negocio','Anulado'].includes(o?.estado); }
function isScheduledOrder(o){ return o?.estado==='Programada' || o?.es_programada===true || isFutureDispatch(o); }
function scheduleBadge(o){ const d=dispatchDateOf(o); if(o?.estado==='Anulado') return ''; if(isFutureDispatch(o)) return `<span class="badge info">Programada: ${shortDate(d)}</span><span class="badge warn">NO DESPACHAR HOY</span>`; if(isLateDispatch(o) && !isOrderInProcess(o)) return `<span class="badge bad">Programada atrasada: ${shortDate(d)}</span>`; if(o?.estado==='Programada' && isDueDispatch(o)) return `<span class="badge ok">Para preparar hoy</span>`; return d && d!==dateOnly(o?.fecha) ? `<span class="badge info">Despacho: ${shortDate(d)}</span>` : ''; }
function canShowInCarniceria(o){ if(o?.estado==='Anulado') return false; if(!orderRequiresPrep(o)) return false; if(isFutureDispatch(o)) return false; return ['Pedido recibido','En preparación','Programada','Lista para facturar','Impresa para facturar'].includes(o?.estado); }
function looksEmail(v){ return /@/.test(String(v||'')); }
function currentUserEmail(){ return String(state.user?.email||state.profile?.correo||'').trim(); }
function cleanName(v){ const x=String(v||'').trim(); return x && !looksEmail(x) ? x : ''; }
function employeeById(id){ return (state.empleados||[]).find(e=>String(e.id)===String(id||''))||null; }
function linkedEmployeeForUser(u){ return u?.empleado_id ? employeeById(u.empleado_id) : null; }
function linkedUserForEmployee(e){ return (state.usuarios||[]).find(u=>String(u.empleado_id||'')===String(e?.id||''))||null; }
function accountTypeOf(u){ return u?.tipo_cuenta || (u?.empleado_id?'empleado':'estacion'); }
function isStationAccount(){ return accountTypeOf(state.profile)==='estacion'; }
function roleSuggestionForEmployee(e){
  const area=String(e?.area||'');
  return ({'Carnicería':'Carnicería','Facturación':'Facturación','Validación':'Validación','Delivery':'Delivery','Liquidación':'Liquidación','CXC':'Liquidación','Vendedor':'Vendedor','Control':'Control','Gerencia':'Gerente','Supervisor':'Supervisor','Administración':'Supervisor'})[area]||'Sin perfil';
}
function currentWorkerName(){
  const email=currentUserEmail();
  const linked=linkedEmployeeForUser(state.profile);
  const nombre=cleanName(state.profile?.nombre);
  const vendedor=cleanName(state.profile?.vendedor);
  const meta=cleanName(state.user?.user_metadata?.full_name || state.user?.user_metadata?.name);
  const emp=state.empleados.find(e=>norm(e.correo||e.email||e.usuario||'')===norm(email));
  if(linked?.nombre) return linked.nombre;
  if(nombre) return nombre;
  if(emp?.nombre) return emp.nombre;
  if(meta) return meta;
  if(vendedor) return vendedor;
  return email || 'Usuario';
}
function workerDisplayName(v){
  const raw=String(v||'').trim();
  if(!raw) return '';
  if(!looksEmail(raw)) return raw;
  if(norm(raw)===norm(currentUserEmail())) return currentWorkerName();
  const emp=state.empleados.find(e=>norm(e.correo||e.email||e.usuario||'')===norm(raw));
  if(emp?.nombre) return emp.nombre;
  const usr=state.usuarios.find(u=>norm(u.correo||u.email||'')===norm(raw));
  if(cleanName(usr?.nombre)) return usr.nombre;
  return raw;
}
function currentWorkerKeys(){
  return [currentUserEmail(), state.profile?.nombre, state.profile?.vendedor, currentWorkerName(), state.user?.id]
    .map(x=>norm(x)).filter(Boolean);
}
function isCurrentWorker(v){ const n=norm(v); return !!n && currentWorkerKeys().includes(n); }
function isAdminRole(){ return ['Gerente','Administrador','Supervisor'].includes(state.profile?.rol); }
function canEditCarniceriaOrder(o){ if(!o) return false; if(isAdminRole()) return true; if(!o.tomado_por) return true; return isCurrentWorker(o.tomado_por) || isCurrentWorker(o.preparado_por) || isCurrentWorker(o.tomado_por_user); }
function canEditOrderGeneral(o){ return isAdminRole() || puede('ordenes',true) || puede('control',true); }
function canAdminDeleteOrder(){ return ['Gerente','Administrador'].includes(state.profile?.rol) || puede('config',true); }
function canDeleteOrder(o){ return canAdminDeleteOrder(); }
function draftBase(){ return 'pc_borrador_v912_'+(state.user?.id||'anon')+'_'; }
function draftKey(tipo, id='nuevo'){ return draftBase()+tipo+'_'+String(id||'nuevo'); }
function saveDraftLocal(key, data){
  if(!key) return;
  localStorage.setItem(key, JSON.stringify({savedAt:Date.now(),user:currentUserEmail(),data}));
}
function loadDraftLocal(key){
  try{ const raw=localStorage.getItem(key); return raw?JSON.parse(raw):null; }catch(e){ return null; }
}
function clearDraftLocal(key){ if(key) localStorage.removeItem(key); }
function draftTimeText(ts){
  if(!ts) return '';
  const d=new Date(ts);
  return d.toLocaleString('es-DO',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
}
function cloneDraftData(data){
  try{ return JSON.parse(JSON.stringify(data ?? null)); }catch(e){ return data; }
}
function normalizeDraftData(data){
  if(Array.isArray(data)) return data.map(normalizeDraftData);
  if(data && typeof data==='object'){
    return Object.keys(data).sort().reduce((acc,k)=>{ acc[k]=normalizeDraftData(data[k]); return acc; },{});
  }
  if(typeof data==='string') return data.trim();
  if(typeof data==='number') return Number.isFinite(data)?Number(Number(data).toFixed(6)):0;
  return data ?? '';
}
function draftSignature(data){
  try{ return JSON.stringify(normalizeDraftData(data)); }catch(e){ return String(data||''); }
}
function draftChanged(data, baseline){ return draftSignature(data)!==draftSignature(baseline); }
function setDraftStatus(m, id, text){ const el=$('#'+id,m); if(el){ el.style.display='inline-flex'; el.innerHTML='💾 '+esc(text); } }
function hideDraftStatus(m,id){ const el=$('#'+id,m); if(el) el.style.display='none'; }
function addDraftStatus(m, id='draftStatus'){
  const body=$('.modal-body',m); if(body && !$('#'+id,m)) body.insertAdjacentHTML('afterbegin',`<div id="${id}" class="draft-status" style="display:none"></div>`);
}
function showDraftRecovery(m, saved, onRestore, onDiscard, label='borrador'){
  if(!saved) return;
  const body=$('.modal-body',m); if(!body) return;
  const id='draftRecover_'+Math.random().toString(36).slice(2);
  body.insertAdjacentHTML('afterbegin',`<div class="draft-bar warn" id="${id}"><div><b>Borrador encontrado</b><br>Hay un ${label} guardado localmente el ${esc(draftTimeText(saved.savedAt))}.</div><div class="actions"><button type="button" class="btn small" data-draft-restore>Restaurar</button><button type="button" class="btn small gray" data-draft-discard>Descartar</button></div></div>`);
  const box=$('#'+id,m);
  $('[data-draft-restore]',box).onclick=()=>{ onRestore(saved.data||{}); box.remove(); };
  $('[data-draft-discard]',box).onclick=()=>{ onDiscard(); box.remove(); };
}
function bindAutoDraft(m, key, collect, statusId='draftStatus', baselineData=null){
  let t=null;
  const baseline=cloneDraftData(baselineData ?? collect());
  const save=()=>{
    try{
      const data=cloneDraftData(collect());
      if(!draftChanged(data, baseline)){
        clearDraftLocal(key);
        hideDraftStatus(m,statusId);
        return;
      }
      saveDraftLocal(key, data);
      setDraftStatus(m,statusId,'Borrador guardado en este equipo · '+new Date().toLocaleTimeString('es-DO',{hour:'2-digit',minute:'2-digit'}));
    }
    catch(e){ console.warn('draft save',e); setDraftStatus(m,statusId,'No se pudo guardar borrador local'); }
  };
  const schedule=()=>{ clearTimeout(t); t=setTimeout(save,700); };
  m.addEventListener('input', schedule, true);
  m.addEventListener('change', schedule, true);
  m.addEventListener('click', e=>{
    const b=e.target.closest('button');
    if(!b) return;
    if(b.id==='modalClose' || b.classList.contains('close') || b.hasAttribute('data-draft-restore') || b.hasAttribute('data-draft-discard')) return;
    setTimeout(save,180);
  }, true);
  return save;
}
function attachCallDraft(m, key){
  const collect=()=>({
    clientText:$('#callClientText',m)?.value||'', clientId:$('#callClientId',m)?.value||'', fecha:$('#callFecha',m)?.value||today(), hora:$('#callHora',m)?.value||'', resultado:$('#callResult',m)?.value||'', monto:$('#callMonto',m)?.value||0, proximo:$('#callProximo',m)?.value||'', observacion:$('#callObs',m)?.value||''
  });
  const baseline=cloneDraftData(collect());
  addDraftStatus(m,'callDraftStatus');
  let saved=loadDraftLocal(key);
  if(saved && !draftChanged(saved.data||{}, baseline)){ clearDraftLocal(key); saved=null; }
  showDraftRecovery(m, saved, data=>{
    if(data.clientText!==undefined) $('#callClientText',m).value=data.clientText||'';
    if(data.clientId!==undefined) $('#callClientId',m).value=data.clientId||'';
    if(data.fecha!==undefined) $('#callFecha',m).value=data.fecha||today();
    if(data.hora!==undefined) $('#callHora',m).value=data.hora||new Date().toTimeString().slice(0,5);
    if(data.resultado!==undefined) $('#callResult',m).value=data.resultado||'Contactado';
    if(data.monto!==undefined) $('#callMonto',m).value=data.monto||0;
    if(data.proximo!==undefined) $('#callProximo',m).value=data.proximo||'';
    if(data.observacion!==undefined) $('#callObs',m).value=data.observacion||'';
    setDraftStatus(m,'callDraftStatus','Borrador restaurado. Presiona Guardar para enviarlo a Supabase.');
  }, ()=>{ clearDraftLocal(key); setDraftStatus(m,'callDraftStatus','Borrador descartado.'); }, 'borrador de llamada');
  return bindAutoDraft(m,key,collect,'callDraftStatus',baseline);
}
function attachOrderDraft(m, key, collect, apply){
  const baseline=cloneDraftData(collect());
  addDraftStatus(m,'orderDraftStatus');
  let saved=loadDraftLocal(key);
  if(saved && !draftChanged(saved.data||{}, baseline)){ clearDraftLocal(key); saved=null; }
  showDraftRecovery(m, saved, data=>{ apply(data||{}); setDraftStatus(m,'orderDraftStatus','Borrador restaurado. Presiona Guardar orden para enviarlo a Supabase.'); }, ()=>{ clearDraftLocal(key); setDraftStatus(m,'orderDraftStatus','Borrador descartado.'); }, 'borrador de orden');
  return bindAutoDraft(m,key,collect,'orderDraftStatus',baseline);
}
function attachPrepDraft(m, key, collect, apply){
  const baseline=cloneDraftData(collect());
  addDraftStatus(m,'prepDraftStatus');
  let saved=loadDraftLocal(key);
  if(saved && !draftChanged(saved.data||{}, baseline)){ clearDraftLocal(key); saved=null; }
  showDraftRecovery(m, saved, data=>{ apply(data||{}); setDraftStatus(m,'prepDraftStatus','Borrador de preparación restaurado. Guarda avance o marca lista para facturar.'); }, ()=>{ clearDraftLocal(key); setDraftStatus(m,'prepDraftStatus','Borrador descartado.'); }, 'borrador de preparación');
  return bindAutoDraft(m,key,collect,'prepDraftStatus',baseline);
}

function safeDraftPart(v){ return String(v||'').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,70) || 'form'; }
function simpleHash(str){ let h=0; str=String(str||''); for(let i=0;i<str.length;i++){ h=((h<<5)-h)+str.charCodeAt(i); h|=0; } return Math.abs(h).toString(36); }
function modalDraftFields(m){ return $$('input, textarea, select',m).filter(el=>{
  const type=String(el.type||'').toLowerCase();
  if(type==='password'||type==='file') return false;
  if(el.closest('.suggest')) return false;
  if(el.id && /^modalClose$/.test(el.id)) return false;
  return true;
}); }
function modalDraftContext(m,title,opts){
  const headline=$('.client-title',m)?.textContent || $('.modal-title',m)?.textContent || title || '';
  const ids=modalDraftFields(m).slice(0,8).map(el=>`${el.id||el.name||el.dataset?.modsel||el.tagName}:${el.value||''}`).join('|');
  return safeDraftPart(title)+'_'+simpleHash(String(headline)+'|'+String(opts||'')+'|'+ids);
}
function collectModalDraft(m){
  return modalDraftFields(m).map((el,idx)=>({
    id:el.id||'', name:el.name||'', modsel:el.dataset?.modsel||'', idx, tag:el.tagName, type:el.type||'', value:(el.type==='checkbox'||el.type==='radio')?!!el.checked:el.value
  }));
}
function applyModalDraft(m, rows){
  if(!Array.isArray(rows)) return;
  const fields=modalDraftFields(m);
  rows.forEach(r=>{
    let el=null;
    if(r.id) el=$('#'+(window.CSS&&CSS.escape?CSS.escape(r.id):r.id),m);
    if(!el && r.name) el=$(`[name="${String(r.name).replace(/"/g,'\"')}"]`,m);
    if(!el && r.modsel) el=$(`[data-modsel="${String(r.modsel).replace(/"/g,'\"')}"]`,m);
    if(!el) el=fields[r.idx];
    if(!el || el.disabled || el.readOnly) return;
    if(el.type==='checkbox'||el.type==='radio') el.checked=!!r.value; else el.value=r.value??'';
    el.dispatchEvent(new Event('input',{bubbles:true}));
    el.dispatchEvent(new Event('change',{bubbles:true}));
  });
}
function attachGlobalModalDraft(m,title='',opts=''){
  if(!m || !document.body.contains(m)) return;
  if($('.draft-status',m) || $('[id$="DraftStatus"]',m)) return;
  const fields=modalDraftFields(m).filter(el=>!el.disabled && !el.readOnly);
  if(!fields.length) return;
  const key=draftKey('global_'+modalDraftContext(m,title,opts),'');
  const baseline=cloneDraftData(collectModalDraft(m));
  addDraftStatus(m,'globalDraftStatus');
  let saved=loadDraftLocal(key);
  if(saved && !draftChanged(saved.data||[], baseline)){ clearDraftLocal(key); saved=null; }
  showDraftRecovery(m,saved,data=>{ applyModalDraft(m,data); setDraftStatus(m,'globalDraftStatus','Borrador restaurado. Presiona Guardar para enviarlo a Supabase.'); },()=>{ clearDraftLocal(key); setDraftStatus(m,'globalDraftStatus','Borrador descartado.'); },'borrador de este formulario');
  bindAutoDraft(m,key,()=>collectModalDraft(m),'globalDraftStatus',baseline);
  let saveIntent=false;
  const saveWords=/guardar|registrar|actualizar|tomar pedido|marcar lista|validar|asignar|recibir|cerrar|liberar|soltar/i;
  m.addEventListener('click',e=>{ const b=e.target.closest('button'); if(b && saveWords.test(String(b.textContent||''))) saveIntent=true; },true);
  const obs=new MutationObserver(()=>{ if(saveIntent && !document.body.contains(m)){ clearDraftLocal(key); obs.disconnect(); } });
  obs.observe(document.body,{childList:true,subtree:true});
}

function fixedWorkerHtml(id,label,value){
  const nombre=value||currentWorkerName();
  const correo=currentUserEmail();
  return `<div class="field"><label>${esc(label)}</label><input id="${id}" value="${esc(nombre)}" readonly><div class="hint">Usuario de acceso: <b>${esc(correo||'—')}</b>. El pedido queda registrado con tu usuario y no puedes elegir otro empleado.</div></div>`;
}
function workerSelectHtml(area,id,label,selected){
  if(isStationAccount()) return `<div class="field"><label>${esc(label)} *</label><select id="${id}">${employeeOptionsForArea(area,'',{fallbackAll:false,placeholder:'Selecciona el empleado que está usando esta estación'})}</select><div class="hint">Cuenta compartida: el pedido se atribuye al empleado seleccionado y conserva la estación ${esc(currentUserEmail())} en la auditoría.</div></div>`;
  return isAdminRole() ? `<div class="field"><label>${esc(label)}</label><select id="${id}">${employeeOptions(area,selected||currentWorkerName())}</select>${manualInput(id+'Manual')}</div>` : fixedWorkerHtml(id,label,currentWorkerName());
}
function workerValueFromModal(m,id){ return (isAdminRole()&&!isStationAccount()) ? getSelectManual(m,id,id+'Manual') : (isStationAccount()?String($('#'+id,m)?.value||'').trim():currentWorkerName()); }
function lockText(o){ return o?.tomado_por ? `En preparación por ${workerDisplayName(o.tomado_por)}${o.tomado_en?' desde '+new Date(o.tomado_en).toLocaleTimeString('es-DO',{hour:'2-digit',minute:'2-digit'}):''}` : 'Libre para tomar'; }
function isActiveCarnOrder(o){ return o && o.estado==='En preparación' && !!o.tomado_por; }
function carnQueueCount(nombre){
  const n=norm(nombre); if(!n) return 0;
  const currentKeys=currentWorkerKeys();
  const isMe=currentKeys.includes(n);
  return state.ordenes.filter(o=>isActiveCarnOrder(o) && (isMe ? (isCurrentWorker(o.tomado_por)||isCurrentWorker(o.preparado_por)||isCurrentWorker(o.tomado_por_user)) : norm(o.tomado_por)===n)).length;
}
function carnQueueCountByEmployeeId(employeeId){
  const id=String(employeeId||''); if(!id) return 0;
  return state.ordenes.filter(o=>isActiveCarnOrder(o) && String(o.tomado_por_empleado_id||'')===id).length;
}
function myCarnQueueCount(){ return state.ordenes.filter(o=>isActiveCarnOrder(o) && (isCurrentWorker(o.tomado_por)||isCurrentWorker(o.preparado_por)||isCurrentWorker(o.tomado_por_user))).length; }
function canReleaseCarnOrder(o){ if(!o||!o.tomado_por) return false; return isAdminRole() || isCurrentWorker(o.tomado_por) || isCurrentWorker(o.preparado_por) || isCurrentWorker(o.tomado_por_user); }
function queueLabel(nombre){ const c=carnQueueCount(nombre); return `${c}/3 pedidos en cola`; }
function prepStatusClass(s){ return String(s||'').toLowerCase().includes('sin existencia') ? 'no-stock' : ''; }
function normalizeOrderStateForSchedule(selected, despacho){ if(despacho && despacho>today()) return 'Programada'; if(selected==='Programada' && (!despacho || despacho<=today())) return 'Pedido recibido'; return selected||'Pedido recibido'; }
function initialOrderStateByDispatch(despacho){ return despacho && despacho>today() ? 'Programada' : 'Pedido recibido'; }
function canonicalOrderStates(){ return ['Programada','Pendiente por existencia','Pedido recibido','En preparación','Lista para facturar','Impresa para facturar','Facturada','Lista para retiro','Entregada en negocio','Asignada a delivery','En ruta','Cobrado','Entregado a crédito','No entregado','Devuelto parcial','Anulado']; }

const ORDER_TYPE_RULES={
  'Pedido normal':{prep:true,invoice:true,delivery:true,label:'Pedido normal',badge:'ok',desc:'Flujo normal: Carnicería → Facturación → Validación → Delivery → Liquidación.'},
  'Devolución / recogida':{prep:false,invoice:false,delivery:true,label:'Devolución',badge:'warn',desc:'No entra a Carnicería. Se valida/asigna a delivery para recoger producto y cerrar el caso.'},
  'Cambio / sustitución':{prep:true,invoice:true,delivery:true,label:'Cambio',badge:'info',desc:'Puede requerir preparar mercancía de reemplazo y luego pasar por validación/delivery.'},
  'Incidente / reclamo':{prep:false,invoice:false,delivery:false,label:'Incidencia',badge:'bad',desc:'Caso de seguimiento. No debe pasar por Carnicería salvo que luego se convierta en cambio/pedido.'}
};
function orderTypes(){ return Object.keys(ORDER_TYPE_RULES); }
function orderType(o){ return o?.tipo_orden || 'Pedido normal'; }
function orderTypeRule(oOrType){ const t=typeof oOrType==='string'?oOrType:orderType(oOrType); return ORDER_TYPE_RULES[t]||ORDER_TYPE_RULES['Pedido normal']; }
function orderRequiresPrep(o){ const r=orderTypeRule(o); return o?.requiere_preparacion===false ? false : !!r.prep; }
function orderRequiresInvoice(o){ const r=orderTypeRule(o); return o?.requiere_facturacion===false ? false : !!r.invoice; }
function orderRequiresDelivery(o){ const r=orderTypeRule(o); if(isStorePickup(o) || orderDeliveryMode(o)==='No aplica') return false; return o?.requiere_delivery===false ? false : !!r.delivery; }
function isSpecialOrder(o){ return orderType(o)!=='Pedido normal'; }
function orderTypeBadge(o){ const t=orderType(o); if(t==='Pedido normal') return ''; const r=orderTypeRule(t); return `<span class="badge ${r.badge}">${esc(r.label)}</span>`; }
function orderTypeClass(o){ const t=orderType(o); const extra=orderFlowClass(o); if(t.includes('Devolución')) return ('return-order '+extra).trim(); if(t.includes('Cambio')) return ('change-order '+extra).trim(); if(t.includes('Incidente')) return ('incident-order '+extra).trim(); return extra; }
function orderTypeWorkflowHint(type){ const r=orderTypeRule(type); return r.desc; }

function specialCaseStates(){ return ['Abierto','En revisión','Asignado a delivery','En ruta de recogida','Pendiente de crédito','Resuelto','Cerrado']; }
function specialCaseStatus(o){
  if(!isSpecialOrder(o)) return '';
  if(o.estado_caso_especial) return o.estado_caso_especial;
  if(['Cobrado','Entregado a crédito','No entregado','Devuelto parcial'].includes(o.estado)) return 'Pendiente de cierre';
  if(o.estado==='Anulado') return 'Anulado';
  if(o.estado==='Asignada a delivery') return 'Asignado a delivery';
  if(o.estado==='En ruta') return 'En ruta de recogida';
  if(['Cerrado','Resuelto'].includes(o.estado)) return 'Cerrado';
  return 'Abierto';
}
function specialCaseBadge(o){
  if(!isSpecialOrder(o)) return '';
  const st=specialCaseStatus(o);
  const cls=st==='Cerrado'||st==='Resuelto'?'ok':(st==='Pendiente de crédito'?'warn':(st==='Anulado'?'bad':'info'));
  return `<span class="badge ${cls}">Caso: ${esc(st)}</span>`;
}
function specialCaseKpis(rows){
  return rows.reduce((a,o)=>{ const st=specialCaseStatus(o); a.total++; if(orderType(o).includes('Devolución')) a.dev++; if(orderType(o).includes('Cambio')) a.cam++; if(orderType(o).includes('Incidente')) a.inc++; if(['Cerrado','Resuelto'].includes(st)) a.cerrados++; else a.abiertos++; if(o.requiere_nota_credito) a.creditos++; return a; },{total:0,dev:0,cam:0,inc:0,abiertos:0,cerrados:0,creditos:0});
}
function specialCaseHistoryFor(o){ return (state.casosHistorial||[]).filter(h=>Number(h.orden_id)===Number(o?.id)); }
function specialCaseNeedsAttention(o){
  if(!isSpecialOrder(o) || ['Cerrado','Resuelto','Anulado'].includes(specialCaseStatus(o))) return false;
  if(o.fecha_compromiso && String(o.fecha_compromiso).slice(0,10)<today()) return true;
  if(orderType(o).includes('Incidente') && !o.responsable_caso) return true;
  return false;
}
function specialCasePanel(rows){
  const all=state.ordenes.filter(o=>isSpecialOrder(o) && o.estado!=='Anulado');
  const k=specialCaseKpis(all);
  const q=state.specialSearch||'';
  let list=all;
  if(state.specialTypeFilter && state.specialTypeFilter!=='Todos') list=list.filter(o=>orderType(o)===state.specialTypeFilter);
  if(state.specialStatusFilter && state.specialStatusFilter!=='Todos') list=list.filter(o=>specialCaseStatus(o)===state.specialStatusFilter);
  if(q) list=list.filter(o=>matchOrder(o,q) || norm(o.accion_caso).includes(norm(q)) || norm(o.responsable_caso).includes(norm(q)) || norm(o.factura_no).includes(norm(q)));
  const cards=list.slice(0,120).map(o=>`<div class="client-card ${orderTypeClass(o)} ${specialCaseNeedsAttention(o)?'case-attention':''}" style="grid-template-columns:1fr auto"><div><div class="client-title">${esc(orderClientName(o))} · ${esc(o.codigo||('ORD-'+o.id))}</div><div class="client-sub">${esc(orderType(o))} · Factura ${esc(o.factura_no||'—')} · Responsable: ${esc(o.responsable_caso||'Sin asignar')} ${o.fecha_compromiso?'· Compromiso '+shortDate(o.fecha_compromiso):''}</div><div class="badges">${orderCustomerBadge(o)}${orderDeliveryModeBadge(o)}${orderTypeBadge(o)}${specialCaseBadge(o)}${specialCaseNeedsAttention(o)?'<span class="badge bad">Requiere atención</span>':''}${o.requiere_nota_credito?'<span class="badge warn">Nota crédito</span>':''}${Number(o.monto_ajuste||0)?`<span class="badge info">Ajuste ${money(o.monto_ajuste)}</span>`:''}</div><div class="mini-items">${esc(o.accion_caso||o.notas||orderItemsText(o,4)||'Sin detalle registrado')}</div></div><div class="card-actions"><button class="btn small" data-special-case="${o.id}">Gestionar caso</button><button class="btn small gray" data-oper-order="${o.id}">Ver</button></div></div>`).join('');
  return `<div class="panel special-case-panel"><div class="panel-head"><div><h3>Centro de devoluciones, cambios e incidencias</h3><p>${list.length} visibles · seguimiento administrativo por tipo, estado, responsable y fecha.</p></div></div><div class="grid4 compact-kpis"><div class="card kpi"><div class="label">Abiertos</div><div class="value">${k.abiertos}</div></div><div class="card kpi"><div class="label">Devoluciones</div><div class="value">${k.dev}</div></div><div class="card kpi"><div class="label">Cambios</div><div class="value">${k.cam}</div></div><div class="card kpi"><div class="label">Incidencias</div><div class="value">${k.inc}</div></div></div><div class="batch-toolbar"><div class="field"><label>Tipo</label><select id="specialTypeFilter"><option>Todos</option>${orderTypes().filter(x=>x!=='Pedido normal').map(x=>`<option ${state.specialTypeFilter===x?'selected':''}>${esc(x)}</option>`).join('')}</select></div><div class="field"><label>Estado</label><select id="specialStatusFilter"><option>Todos</option>${specialCaseStates().map(x=>`<option ${state.specialStatusFilter===x?'selected':''}>${esc(x)}</option>`).join('')}</select></div><div class="field"><label>Buscar</label><input id="specialSearch" value="${esc(q)}" placeholder="Cliente, lote, factura, responsable..."></div><div class="batch-actions"><button class="btn gray" id="printSpecialCases">Imprimir reporte</button></div></div><div class="lock-alert info"><b>Regla V9.2.2:</b> las devoluciones, cambios e incidencias se crean desde <b>+ Orden</b> usando <b>Tipo de orden</b>. Esta vista queda solo para seguimiento, filtros, gestión e historial.</div><div class="list">${cards||'<div class="empty">No hay casos especiales con esos filtros.</div>'}</div></div>`;
}
function effectiveOrderState(o){
  if(!o) return '';
  if(o.estado==='Anulado') return 'Anulado';
  if(isFutureDispatch(o)) return 'Programada';
  if(o.estado==='Programada' && isDueDispatch(o)) return 'Pedido recibido';
  return o.estado || 'Pedido recibido';
}
function orderStatusBadgeHtml(o){ return `<span class="badge info">${esc(effectiveOrderState(o))}</span>`; }
function orderTakenByBadge(o){
  if(!o?.tomado_por || o.estado==='Anulado') return '';
  const name=workerDisplayName(o.tomado_por);
  if(!name) return '';
  const t=o.tomado_en ? ` · ${elapsedTextSince(o.tomado_en)}` : '';
  const cls=o.estado==='En preparación' ? 'warn' : 'info';
  return `<span class="badge ${cls}">Tomada por ${esc(name)}${esc(t)}</span>`;
}
function orderStateControlHtml(o){
  const initial=initialOrderStateByDispatch(o?.fecha_despacho||today());
  if(o && isAdminRole()){
    return `<div class="field"><label>Estado administrativo</label><select id="ordEstado">${canonicalOrderStates().map(x=>`<option ${x===(o?.estado||initial)?'selected':''}>${esc(x)}</option>`).join('')}</select><div class="hint">Solo administrador/supervisor puede cambiar el estado manualmente. Usar solo para correcciones.</div></div>`;
  }
  const label=o ? (o.estado||initial) : initial;
  return `<div class="field order-auto-state"><label>${o?'Estado actual':'Estado inicial automático'}</label><input id="ordEstadoInfo" value="${esc(label)}" readonly><div class="hint">El estado se asigna automáticamente según la fecha de despacho y luego avanza por cada módulo.</div></div>`;
}
function focusAfterRender(id,pos){ setTimeout(()=>{ const el=document.getElementById(id); if(el){ el.focus(); try{ el.setSelectionRange(pos,pos); }catch(e){} } },0); }
function parseDateTime(v){ if(!v) return null; try{ const s=String(v); const d=s.includes('T') ? new Date(s) : new Date(s.slice(0,10)+'T00:00:00'); return isNaN(d.getTime()) ? null : d; }catch(e){ return null; } }
function minutesSince(v){ const d=parseDateTime(v); if(!d) return null; return Math.max(0,Math.floor((Date.now()-d.getTime())/60000)); }
function elapsedTextSince(v){ const m=minutesSince(v); if(m===null) return '—'; if(m<1) return 'ahora'; if(m<60) return `${m} min`; const h=Math.floor(m/60), r=m%60; if(h<24) return `${h} h${r?` ${r} min`:''}`; const d=Math.floor(h/24), hr=h%24; return `${d} día${d===1?'':'s'}${hr?` ${hr} h`:''}`; }
function createdAtOf(o){ return o?.creado_en || o?.created_at || o?.fecha; }
function createdClockBadge(o){ const m=minutesSince(createdAtOf(o)); const cls=m!==null && m>60?'warn':'info'; return `<span class="badge ${cls}">⏱ Creada hace ${esc(elapsedTextSince(createdAtOf(o)))}</span>`; }
function isOrderReady(o){ return ['Lista para facturar','Impresa para facturar'].includes(o?.estado); }
function isOrderInProcess(o){ return ['En preparación','Lista para facturar','Impresa para facturar','Facturada','Lista para retiro','Validada para delivery','Asignada a delivery','En ruta'].includes(o?.estado); }
// V9.3.0 R4 - relojes operativos protegidos contra acciones sin transición
// V9.3.0 R5 - historial de entregas, snapshots, reimpresión y reporte diario
// V9.3.0 R6 - agenda comercial unificada con llamadas y órdenes directas
// V9.3.0 R7 - confirmación de órdenes por WhatsApp sin información económica
// V9.3.0 R10.1 - crear orden y despacho ultracompactos para tablet
function orderProcessStartedAt(o){
  const stage=currentModuleOfOrder(o);
  return stage ? (stageEntryAt(o,stage) || createdAtOf(o)) : createdAtOf(o);
}
function processClockBadge(o){ if(!isOrderInProcess(o)) return ''; const start=orderProcessStartedAt(o); const m=minutesSince(start); const cls=m!==null && m>45?'bad':'info'; return `<span class="badge ${cls}">⏱ En proceso ${esc(elapsedTextSince(start))}</span>`; }
function orderHistoryFor(o){
  return (state.historialEstados||[]).filter(h=>Number(h.orden_id)===Number(o?.id));
}
function stateStageName(value){
  const st=String(value||'').trim();
  if(['Pedido recibido','En preparación'].includes(st)) return 'carniceria';
  if(['Lista para facturar','Impresa para facturar'].includes(st)) return 'facturacion';
  if(['Facturada','Validada para delivery','Lista para retiro','Entregada en negocio'].includes(st)) return 'validacion';
  if(['Asignada a delivery','En ruta'].includes(st)) return 'delivery';
  if(st==='Entregada en negocio') return 'validacion';
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
  return histTimeFor(o,['Cobrado','Entregado a crédito','No entregado','Devuelto parcial','Cerrado','Entregada en negocio','Anulado']);
}
function totalOrderClockBadge(o){
  const start=createdAtOf(o); if(!start) return '';
  const end=closedAtOf(o); const txt=end?elapsedBetweenText(start,end):elapsedTextSince(start);
  const mins=end?minutesBetween(start,end):minutesSince(start);
  const cls=mins!==null && mins>180?'bad':mins!==null && mins>60?'warn':'info';
  return `<span class="badge ${cls}">⏱ Total ${esc(txt)}</span>`;
}
function minutesBetween(a,b){ const da=parseDateTime(a), db=parseDateTime(b); if(!da||!db) return null; return Math.max(0,Math.floor((db.getTime()-da.getTime())/60000)); }
function elapsedBetweenText(a,b){ const m=minutesBetween(a,b); if(m===null) return '—'; if(m<1) return 'ahora'; if(m<60) return `${m} min`; const h=Math.floor(m/60), r=m%60; if(h<24) return `${h} h${r?` ${r} min`:''}`; const d=Math.floor(h/24), hr=h%24; return `${d} día${d===1?'':'s'}${hr?` ${hr} h`:''}`; }

function operationAlertConfig(){ return normalizeSystemConfig(state.systemConfig||{}).alertas || defaultSystemConfig().alertas; }
function operationHolidayList(value){
  const src=Array.isArray(value)?value.join(','):String(value||'');
  return Array.from(new Set(src.split(/[\s,;|]+/).map(x=>String(x||'').slice(0,10)).filter(x=>/^\d{4}-\d{2}-\d{2}$/.test(x)))).sort();
}
function operationWorkingConfig(){
  const a=operationAlertConfig(), h=a.horarioLaboral||{};
  const ls=Array.isArray(h.lunesSabado)&&h.lunesSabado.length?h.lunesSabado:[['07:00','12:00'],['14:00','17:00']];
  const dom=Array.isArray(h.domingo)?h.domingo:[['07:00','12:00']];
  const weekdaySchedule={0:dom,1:ls,2:ls,3:ls,4:ls,5:ls,6:ls};
  return {enabled:a.usarTiempoLaborable!==false,weekdaySchedule,holidays:operationHolidayList(a.feriados||[])};
}
function operationMinutesBetween(a,b){
  if(!a||!b) return null;
  const cfg=operationWorkingConfig();
  return cfg.enabled?calculateWorkingMinutes(a,b,cfg):minutesBetween(a,b);
}
function operationMinutesSince(a){ return a?operationMinutesBetween(a,new Date()):null; }
function operationMinutesText(minutes){
  const m=Math.max(0,Math.round(Number(minutes)||0));
  if(m<1) return 'ahora';
  if(m<60) return `${m} min`;
  const h=Math.floor(m/60), r=m%60;
  if(h<24) return `${h} h${r?` ${r} min`:''}`;
  const d=Math.floor(h/24), hr=h%24;
  return `${d} día${d===1?'':'s'}${hr?` ${hr} h`:''}`;
}
function stageSlaMinutes(stage){
  const a=operationAlertConfig();
  return Number({carniceria:a.carniceriaMaxMin,facturacion:a.facturacionMaxMin,validacion:a.validacionMaxMin,delivery:a.deliveryMaxMin,liquidacion:a.liquidacionMaxMin}[stage]||60);
}

function moduleFromSearchKey(k){ return {facturacionSearch:'facturacion',validacionSearch:'validacion',deliverySearch:'delivery',liquidacionSearch:'liquidacion'}[k] || ''; }
function currentModuleOfOrder(o){
  const st=effectiveOrderState(o);
  if(st==='Pendiente por existencia') return 'ordenes';
  if(['Pedido recibido','En preparación'].includes(st)) return orderRequiresPrep(o) ? 'carniceria' : (orderRequiresDelivery(o) ? 'validacion' : 'ordenes');
  if(['Lista para facturar','Impresa para facturar'].includes(st)) return orderRequiresInvoice(o) ? 'facturacion' : 'validacion';
  if(['Facturada','Validada para delivery','Lista para retiro'].includes(st)) return 'validacion';
  if(['Asignada a delivery','En ruta'].includes(st)) return 'delivery';
  if(st==='Entregada en negocio') return 'validacion';
  if(['Entregado','Cobrado','Entregado a crédito','No entregado','Devuelto parcial','Cerrado'].includes(st)) return 'liquidacion';
  return '';
}
function stageEntryAt(o,stage){
  if(!o) return null;
  const transitionAt=stageTransitionTimeFor(o,stage);
  if(transitionAt) return transitionAt;
  if(stage==='carniceria') return createdAtOf(o);
  if(stage==='facturacion') return o.preparado_en || null;
  if(stage==='validacion') return o.facturado_en || null;
  if(stage==='delivery') return o.asignado_delivery_en || o.en_ruta_en || null;
  if(stage==='liquidacion') return o.recibido_en || null;
  return null;
}
function stageExitAt(o,stage){
  if(stage==='carniceria') return stageEntryAt(o,'facturacion');
  if(stage==='facturacion') return stageEntryAt(o,'validacion');
  if(stage==='validacion') return stageEntryAt(o,'delivery');
  if(stage==='delivery') return stageEntryAt(o,'liquidacion');
  if(stage==='liquidacion') return closedAtOf(o);
  return null;
}
function stageLabel(stage){ return {carniceria:'Carnicería',facturacion:'Facturación',validacion:'Validación',delivery:'Delivery',liquidacion:'Liquidación'}[stage]||stage; }
function stageTimerClass(minutes,stage){
  if(!stage) return 'info';
  const sla=Math.max(1,stageSlaMinutes(stage));
  const warn=Math.max(1,Math.round(sla*.7));
  return Number(minutes)>=sla?'bad':Number(minutes)>=warn?'warn':'info';
}
function stageClockBadge(o,stage){
  const start=stageEntryAt(o,stage); if(!start) return '';
  const end=stageExitAt(o,stage);
  const mins=end?operationMinutesBetween(start,end):operationMinutesSince(start);
  const txt=operationMinutesText(mins);
  const cls=stageTimerClass(mins||0,stage);
  const mode=operationWorkingConfig().enabled?' laborable':'';
  return `<span class="badge ${cls}" title="SLA ${stageSlaMinutes(stage)} min · tiempo${mode}">⏱ ${esc(stageLabel(stage))} ${esc(txt)}</span>`;
}
function currentStageClockBadge(o){ const st=currentModuleOfOrder(o); return st ? stageClockBadge(o,st) : ''; }
function stageTimersHtml(o){
  const stages=['carniceria','facturacion','validacion','delivery','liquidacion'];
  const cur=currentModuleOfOrder(o), workMode=operationWorkingConfig().enabled;
  return `<div class="timer-grid">${stages.map(s=>{ const start=stageEntryAt(o,s); const end=stageExitAt(o,s); const mins=start?(end?operationMinutesBetween(start,end):operationMinutesSince(start)):null; const cls=(cur===s?'active ':'')+(mins!==null?stageTimerClass(mins,s):''); const txt=start?operationMinutesText(mins):'—'; return `<div class="timer-card ${cls}"><b>${esc(stageLabel(s))}</b><span>${esc(txt)}</span><div class="stage-note">${start?(end?'Finalizado':'Activo/pendiente'):'Sin entrar'} · SLA ${stageSlaMinutes(s)} min${workMode?' laborables':''}</div></div>`; }).join('')}</div>`;
}

function weightAlertText(o, finalPeso){
  const prep=Number(o?.peso_preparado || orderLastPeso(o,'Preparado')?.libras || 0);
  const fact=Number(o?.peso_facturado || orderLastPeso(o,'Facturado')?.libras || 0);
  const final=Number(finalPeso || 0);
  const refs=[];
  if(prep>0) refs.push(['preparado',prep]);
  if(fact>0) refs.push(['facturado',fact]);
  if(!final || !refs.length) return '';
  const diffs=refs.map(([name,val])=>({name,val,diff:Math.abs(final-val)})).filter(x=>x.diff>0.01);
  if(!diffs.length) return '';
  return diffs.map(x=>`Diferencia con peso ${x.name}: ${x.diff.toFixed(2)} lb (ref. ${x.val} lb, final ${final} lb)`).join(' · ');
}
function weightAlertHtml(o, finalPeso){ const t=weightAlertText(o, finalPeso); return t ? `<div class="lock-alert bad">${esc(t)}</div>` : `<div class="lock-alert ok">Peso sin diferencias relevantes.</div>`; }

function orderRequiresFinalWeight(o){
  const items=o?.items||[];
  if(items.length) return items.some(i=>detailSumsWeight(i) && detailWeightType(i)!=='No pesa');
  return Number(o?.peso_preparado||0)>0 || Number(o?.peso_facturado||0)>0 || Number(orderLastPeso(o,'Preparado')?.libras||0)>0;
}
function validationWeightReference(o){
  const prep=Number(o?.peso_preparado || orderLastPeso(o,'Preparado')?.libras || 0);
  const fact=Number(o?.peso_facturado || orderLastPeso(o,'Facturado')?.libras || 0);
  if(prep>0) return {name:'peso preparado en Carnicería', value:prep};
  if(fact>0) return {name:'peso facturado', value:fact};
  return {name:'peso de referencia', value:0};
}
function validationWeightCheck(o, finalPeso){
  const ref=validationWeightReference(o);
  const peso=Number(finalPeso)||0;
  if(!ref.value || !peso) return {level:'ok',calc:ref.value||0,peso,diff:0,abs:0,aviso:0,max:0,refName:ref.name};
  return {...weightControlCheck(ref.value,peso), refName:ref.name};
}
function validationWeightAlertText(o, finalPeso){
  const peso=Number(finalPeso)||0;
  if(!peso) return orderRequiresFinalWeight(o) ? 'Debes registrar el peso final entregado antes de asignar esta orden al responsable del viaje.' : 'Esta orden no requiere peso final obligatorio.';
  const ch=validationWeightCheck(o,peso);
  if(!ch.calc) return 'Peso final registrado. No hay peso de referencia para comparar.';
  const diffTxt=(ch.diff>0?'+':'')+ch.diff+' lb';
  if(ch.level==='ok') return `Peso dentro de tolerancia. Referencia: ${ch.calc} lb · Final: ${ch.peso} lb · Diferencia: ${diffTxt}.`;
  if(ch.level==='warn') return `Diferencia con ${ch.refName}: ${diffTxt}. Ref. ${ch.calc} lb · final ${ch.peso} lb · aviso ${ch.aviso} lb · máximo ${ch.max} lb.`;
  return `Diferencia demasiado alta con ${ch.refName}: ${diffTxt}. Ref. ${ch.calc} lb · final ${ch.peso} lb · máximo ${ch.max} lb.`;
}
function validationWeightAlertHtml(o, finalPeso){
  const peso=Number(finalPeso)||0;
  if(!peso) return orderRequiresFinalWeight(o) ? `<div class="lock-alert bad">${esc(validationWeightAlertText(o,finalPeso))}</div>` : `<div class="lock-alert ok">${esc(validationWeightAlertText(o,finalPeso))}</div>`;
  const ch=validationWeightCheck(o,peso);
  const cls=ch.level==='block'?'bad':(ch.level==='warn'?'':'ok');
  return `<div class="lock-alert ${cls}">${esc(validationWeightAlertText(o,finalPeso))}</div>`;
}
function validationWeightDiffDialog(check){
  if(check.level==='block'){ alert('El peso final entregado supera la tolerancia máxima. Debes corregirlo antes de continuar.'); return Promise.resolve(null); }
  const diffTxt=(check.diff>0?'+':'')+check.diff+' lb';
  return responsibilityDecisionDialog({title:'Verificar peso final',message:'El peso final tiene una diferencia fuera de la tolerancia de aviso.',rows:[['Referencia',`${check.refName||'Peso'} · ${check.calc} lb`],['Peso final',`${check.peso} lb`],['Diferencia',diffTxt],['Tolerancia aviso',`${check.aviso} lb`],['Tolerancia máxima',`${check.max} lb`]]});
}
function fuzzy(s,q){ let i=0; for(const ch of s){ if(ch===q[i]) i++; if(i>=q.length) return true; } return q.length>2 && i/q.length>.72; }

function safeDateObj(v){ const d=parseDateTime(v); return d || new Date(0); }
function rowDateKey(v){ try{ const d=safeDateObj(v); return d.getTime()? localIsoDate(d) : ''; }catch(e){ return String(v||'').slice(0,10); } }
function inCurrentMonth(v){ const k=rowDateKey(v); return k && k.slice(0,7)===today().slice(0,7); }
function groupCount(rows, fn){ const out={}; (rows||[]).forEach(r=>{ const k=fn(r)||'—'; out[k]=(out[k]||0)+1; }); return out; }
function groupSum(rows, keyFn, valFn){ const out={}; (rows||[]).forEach(r=>{ const k=keyFn(r)||'—'; out[k]=(out[k]||0)+(Number(valFn(r))||0); }); return out; }
function sortEntries(obj){ return Object.entries(obj||{}).sort((a,b)=>Number(b[1]||0)-Number(a[1]||0)); }
function avg(arr){ const nums=(arr||[]).map(Number).filter(n=>Number.isFinite(n)&&n>=0); return nums.length ? nums.reduce((a,b)=>a+b,0)/nums.length : 0; }
function pct(n,d){ return d ? Math.round((Number(n)||0)*100/(Number(d)||0)) : 0; }
function minutesText(m){ m=Number(m)||0; if(m<1) return '—'; if(m<60) return Math.round(m)+' min'; const h=Math.floor(m/60), r=Math.round(m%60); if(h<24) return h+' h'+(r?' '+r+' min':''); const d=Math.floor(h/24), hr=h%24; return d+' día'+(d===1?'':'s')+(hr?' '+hr+' h':''); }
function orderAmount(o){ return Number(o?.total_factura || o?.total_estimado || 0); }
function orderClientName(o){ return String(o?.cliente_nombre_orden || o?.cliente?.negocio || '').trim() || 'Cliente'; }
function orderClientPhone(o){ return String(o?.cliente_telefono_orden || o?.cliente?.telefono || '').trim(); }
function orderClientSector(o){ return String(o?.cliente_sector_orden || o?.cliente?.sector || '').trim(); }
function orderClientAddress(o){ return String(o?.cliente_direccion_orden || o?.cliente?.direccion || '').trim(); }
function orderClientReference(o){ return String(o?.cliente_referencia_orden || o?.cliente?.referencia || '').trim(); }
function orderCustomerType(o){ if(o?.tipo_cliente_orden) return o.tipo_cliente_orden; if(o && Object.prototype.hasOwnProperty.call(o,'cliente_id') && o.cliente_id===null) return 'Venta interna'; return 'Registrado'; }
function orderDeliveryMode(o){
  if(o?.modalidad_entrega) return o.modalidad_entrega;
  if(o?.requiere_delivery===false && orderType(o)==='Incidente / reclamo') return 'No aplica';
  if(o && Object.keys(o).length===0) return appCfg('flujos.modalidadPredeterminada','Delivery');
  return o?.requiere_delivery===false ? 'Retiro en negocio' : 'Delivery';
}
function isStorePickup(o){ return orderDeliveryMode(o)==='Retiro en negocio'; }
function isInternalSale(o){ return orderCustomerType(o)==='Venta interna'; }
function isOccasionalCustomer(o){ return orderCustomerType(o)==='Ocasional'; }
function occasionalPrintBlock(o){
  if(!isOccasionalCustomer(o)) return '';
  return `<div class="print-occasional"><b>CLIENTE OCASIONAL · VERIFICAR DIRECCIÓN</b><br>Nombre: ${esc(orderClientName(o))}<br>Teléfono: ${esc(orderClientPhone(o)||'—')}<br>Sector: ${esc(orderClientSector(o)||'—')}<br>Dirección: ${esc(orderClientAddress(o)||'—')}<br>Referencia: ${esc(orderClientReference(o)||'—')}<br>Modalidad: ${esc(orderDeliveryMode(o))}</div>`;
}
function pickupNoticeText(){ return appCfg('impresion.textoAvisoRetiro','RETIRO EN NEGOCIO · NO ENVIAR A DELIVERY'); }
function orderDeliveryModeBadge(o){
  const mode=orderDeliveryMode(o);
  if(mode==='Retiro en negocio') return '<span class="badge pickup-badge">RETIRO EN NEGOCIO</span>';
  if(mode==='No aplica') return '<span class="badge">Sin entrega</span>';
  return '<span class="badge ok">Delivery</span>';
}
function orderCustomerBadge(o){ return isInternalSale(o)?'<span class="badge internal-sale-badge">Venta interna</span>':isOccasionalCustomer(o)?'<span class="badge warn">Cliente ocasional</span>':''; }
function orderFlowClass(o){ return isStorePickup(o)?'store-pickup-order':''; }
function pickupReadyOrders(){
  return (state.ordenes||[]).filter(o=>isStorePickup(o) && o.estado!=='Anulado' && (o.estado==='Lista para retiro' || (!orderRequiresPrep(o) && !orderRequiresInvoice(o) && ['Pedido recibido','Facturada'].includes(effectiveOrderState(o)))));
}
function pickupDeliveredOrders(){ return (state.ordenes||[]).filter(o=>isStorePickup(o) && o.estado==='Entregada en negocio'); }

function usuarioNameFromId(id){ if(!id) return '—'; const s=String(id); const u=(state.usuarios||[]).find(x=>String(x.id||x.usuario_id||'')===s || String(x.user_id||'')===s); if(u) return cleanName(u.nombre)||u.correo||u.email||s.slice(0,8); return s.includes('@') ? workerDisplayName(s) : s.slice(0,8); }
function stageDurationFor(o,stage){ const start=stageEntryAt(o,stage); if(!start) return null; const end=stageExitAt(o,stage); return end ? minutesBetween(start,end) : minutesSince(start); }
function productAggregation(){ const map={}; (state.ordenes||[]).filter(o=>o.estado!=='Anulado').forEach(o=>{ (o.items||[]).forEach(i=>{ const name=i.producto_nombre||'Producto'; if(!map[name]) map[name]={producto:name,cantidad:0,monto:0,ordenes:new Set()}; map[name].cantidad += Number(i.cantidad_pedida||0); map[name].monto += (Number(i.cantidad_pedida||0) * Number(i.precio||0)); map[name].ordenes.add(o.id); }); }); return Object.values(map).map(x=>({...x,ordenes:x.ordenes.size})).sort((a,b)=>b.monto-a.monto); }
function renderBarRow(label,value,max,cls=''){ const p=Math.min(100,pct(value,max||1)); return `<div class="bar-row ${cls}"><div><b>${esc(label)}</b><span>${esc(value)}</span></div><div class="bar"><i style="width:${p}%"></i></div></div>`; }
function auditEvents(){
  const events=[];
  (state.historialEstados||[]).forEach(h=>{ const o=(state.ordenes||[]).find(x=>Number(x.id)===Number(h.orden_id)); events.push({tipo:'Estado de orden',fecha:h.creado_en,actor:usuarioNameFromId(h.usuario),titulo:`${o?.codigo||'Orden'} · ${orderClientName(o)}`,detalle:`${h.estado_anterior||'—'} → ${h.estado_nuevo}${h.comentario?' · '+h.comentario:''}`,ordenId:h.orden_id,modulo:currentModuleOfOrder(o)||'ordenes'}); });
  (state.llamadas||[]).slice(0,800).forEach(l=>{ events.push({tipo:'Gestión de llamada',fecha:(String(l.fecha||'').slice(0,10)+'T'+String(l.hora||'00:00').slice(0,5)+':00'),actor:l.vendedor||l.usuario||'—',titulo:`${l.cliente?.negocio||'Cliente'} · ${l.resultado||''}`,detalle:l.comentario||l.observacion||'',clienteId:l.cliente_id,modulo:'control'}); });
  (state.ordenes||[]).slice(0,800).forEach(o=>{ events.push({tipo:'Orden creada',fecha:o.creado_en||o.created_at||o.fecha,actor:o.vendedor||o.creado_por||'—',titulo:`${o.codigo||'Orden'} · ${orderClientName(o)}`,detalle:`Estado actual: ${o.estado||'—'} · Total ${money(orderAmount(o))}`,ordenId:o.id,modulo:'ordenes'}); });
  (state.pagos||[]).slice(0,500).forEach(p=>{ const o=(state.ordenes||[]).find(x=>Number(x.id)===Number(p.orden_id)); events.push({tipo:'Pago / liquidación',fecha:p.creado_en||p.created_at||today(),actor:p.usuario||p.recibido_por||'—',titulo:`${o?.codigo||'Orden'} · ${orderClientName(o)}`,detalle:`Monto: ${money(p.monto||p.monto_pagado||0)} · ${p.forma_pago||p.tipo||''}`,ordenId:p.orden_id,modulo:'liquidacion'}); });
  return events.sort((a,b)=>safeDateObj(b.fecha)-safeDateObj(a.fecha));
}


// =========================================================
// V9.3.0 R6 - Agenda comercial unificada
// Una llamada o un pedido normal creado directamente cuenta como
// gestión comercial del cliente en la fecha real de la actividad.
// =========================================================
function commercialCallCreatedAt(l){
  const raw=l?.creado_en || l?.created_at;
  if(raw) return raw;
  const d=String(l?.fecha||today()).slice(0,10);
  const t=String(l?.hora||'12:00').slice(0,5);
  return `${d}T${t}:00`;
}
function isCommercialNormalOrder(o){
  return !!o && o.tipo_cliente_orden!=='Venta interna' && o.cliente_id!==null && o.cliente_id!==undefined && orderType(o)==='Pedido normal' && norm(o.canal)!=='caso especial';
}
function commercialCallsForDate(f){
  return (state.llamadas||[]).filter(l=>String(l.fecha||'').slice(0,10)===f);
}
function commercialOrdersForDate(f){
  return (state.ordenes||[]).filter(o=>isCommercialNormalOrder(o) && rowDateKey(createdAtOf(o))===f);
}
function commercialLinkedOrdersForCall(l){
  if(!l?.id) return [];
  return (state.ordenes||[])
    .filter(o=>isCommercialNormalOrder(o) && String(o.llamada_id||'')===String(l.id))
    .sort((a,b)=>safeDateObj(createdAtOf(b))-safeDateObj(createdAtOf(a)));
}
function commercialDirectOrdersForDate(f){
  const callsToday=new Set(commercialCallsForDate(f).map(l=>String(l.id)));
  return commercialOrdersForDate(f).filter(o=>!o.llamada_id || !callsToday.has(String(o.llamada_id)));
}
function commercialManagedClientIdsForDate(f){
  const ids=new Set();
  commercialCallsForDate(f).forEach(l=>{ if(l.cliente_id!==null && l.cliente_id!==undefined) ids.add(Number(l.cliente_id)); });
  commercialOrdersForDate(f).forEach(o=>{ if(o.cliente_id!==null && o.cliente_id!==undefined) ids.add(Number(o.cliente_id)); });
  return ids;
}
function clientCommerciallyManagedOnDate(clienteId,f){
  return commercialManagedClientIdsForDate(f).has(Number(clienteId));
}
function commercialActivitiesForDate(f){
  const calls=commercialCallsForDate(f).map(l=>({
    kind:'call',
    cliente_id:Number(l.cliente_id),
    at:commercialCallCreatedAt(l),
    call:l,
    orders:commercialLinkedOrdersForCall(l)
  }));
  const direct=commercialDirectOrdersForDate(f).map(o=>({
    kind:'order',
    cliente_id:Number(o.cliente_id),
    at:createdAtOf(o),
    order:o
  }));
  return calls.concat(direct).sort((a,b)=>safeDateObj(b.at)-safeDateObj(a.at));
}
function commercialActivityClient(a){
  if(a?.kind==='call') return a.call?.cliente || state.clientes.find(x=>Number(x.id)===Number(a.cliente_id)) || {};
  return a?.order?.cliente || state.clientes.find(x=>Number(x.id)===Number(a?.cliente_id)) || {};
}
function commercialActivityMatches(a,q){
  if(!q) return true;
  const c=commercialActivityClient(a);
  if(a.kind==='call'){
    const l=a.call||{};
    const orders=a.orders||[];
    return norm([c.negocio,c.contacto,c.codigo,l.resultado,l.observacion,l.comentario,...orders.map(o=>`${o.codigo} ${o.estado} ${o.factura_no||''}`)].join(' ')).includes(norm(q));
  }
  const o=a.order||{};
  return norm([c.negocio,c.contacto,c.codigo,o.codigo,o.estado,o.factura_no,o.notas,o.vendedor,o.total_factura,o.total_estimado].join(' ')).includes(norm(q));
}
function commercialActivityTime(v){
  const d=parseDateTime(v);
  return d ? d.toLocaleTimeString('es-DO',{hour:'2-digit',minute:'2-digit'}) : '';
}
function latestCommercialOrderForClientOnDate(clienteId,f){
  return commercialOrdersForDate(f)
    .filter(o=>Number(o.cliente_id)===Number(clienteId))
    .sort((a,b)=>safeDateObj(createdAtOf(b))-safeDateObj(createdAtOf(a)))[0] || null;
}

function renderInicio(c){
  const hoy=today();
  const activos=state.clientes.filter(x=>x.estado==='Activo').length;
  const llamadasHoy=commercialCallsForDate(hoy);
  const pedidosDirectosHoy=commercialDirectOrdersForDate(hoy);
  const agendaHoy=controlScheduledClientsForDate(hoy);
  const gestionadosIds=commercialManagedClientIdsForDate(hoy);
  const gestionadosAgenda=agendaHoy.filter(cl=>gestionadosIds.has(Number(cl.id))).length;
  const pendientesAgenda=agendaHoy.filter(cl=>!gestionadosIds.has(Number(cl.id))).length;
  const pedidosHoy=state.ordenes.filter(o=>String(o.fecha||'').slice(0,10)===hoy && o.estado!=='Anulado');
  const pedidosMes=state.ordenes.filter(o=>String(o.fecha||'').slice(0,7)===hoy.slice(0,7) && o.estado!=='Anulado');
  const montoHoy=pedidosHoy.reduce((s,o)=>s+(+o.total_factura||+o.total_estimado||0),0);
  const montoMes=pedidosMes.reduce((s,o)=>s+(+o.total_factura||+o.total_estimado||0),0);
  const ordenesActivas=state.ordenes.filter(o=>!['Anulado','Cobrado','Entregado'].includes(o.estado||''));
  const pendientesCarniceria=state.ordenes.filter(o=>canShowInCarniceria(o) && !isFutureDispatch(o) && !['Lista para facturar','Impresa para facturar'].includes(o.estado)).length;
  const listasFacturar=state.ordenes.filter(o=>['Lista para facturar','Impresa para facturar'].includes(o.estado)).length;
  const pendientesValidacion=state.ordenes.filter(o=>!isStorePickup(o) && ['Facturada','Validada para delivery'].includes(o.estado)).length;
  const pendientesRetiro=pickupReadyOrders().length;
  const enRuta=state.ordenes.filter(o=>['Asignada a delivery','En ruta'].includes(o.estado)).length;
  const porLiquidar=state.ordenes.filter(o=>['Entregado','Entregado a crédito'].includes(o.estado||'')).length;
  const programadasProximas=state.ordenes.filter(o=>o.estado!=='Anulado' && isFutureDispatch(o)).sort((a,b)=>dispatchDateOf(a).localeCompare(dispatchDateOf(b))).slice(0,8);
  const programadasHoy=state.ordenes.filter(o=>o.estado!=='Anulado' && dispatchDateOf(o)===hoy && (o.estado==='Programada'||o.es_programada===true));
  const programadasAtrasadas=state.ordenes.filter(o=>isLateDispatch(o) && !['Lista para facturar','Facturada','Lista para retiro','Entregada en negocio','Asignada a delivery','En ruta','Cobrado','Entregado'].includes(o.estado||''));
  const productosMal=state.productos.filter(p=>p.activo!==false && productConfigIssues(p).length);
  const seguimiento=state.clientes.filter(x=>{const d=daysSince(x.ultimo_pedido); return d===null || d>=30;}).slice(0,8);
  function stageMinutes(o){ const st=currentModuleOfOrder(o); const start=st?stageEntryAt(o,st):null; return start?minutesSince(start):0; }
  function riskScore(o){ const st=currentModuleOfOrder(o); const mins=stageMinutes(o); let score=0; if(isLateDispatch(o)) score+=8000; if(st){ const cls=stageTimerClass(mins,st); if(cls==='bad') score+=4000; if(cls==='warn') score+=1500; score+=mins; } return score; }
  const criticas=ordenesActivas.filter(o=>riskScore(o)>0).sort((a,b)=>riskScore(b)-riskScore(a)).slice(0,7);
  const latest=state.ordenes.filter(o=>o.estado!=='Anulado').slice(0,6);
  const avgTicket=pedidosHoy.length ? montoHoy / pedidosHoy.length : 0;
  const moduleRows=[
    ['carniceria','Carnicería',pendientesCarniceria,'Órdenes para preparar o tomadas',pendientesCarniceria>8?'danger':pendientesCarniceria>0?'warn':'ok'],
    ['facturacion','Facturación',listasFacturar,'Listas para imprimir / facturar',listasFacturar>3?'warn':'ok'],
    ['validacion','Validación',pendientesValidacion,'Facturadas pendientes de asignar',pendientesValidacion>3?'warn':'ok'],
    ['validacion','Retiros',pendientesRetiro,'Clientes que retiran en negocio',pendientesRetiro>0?'warn':'ok'],
    ['delivery','Delivery',enRuta,'Asignadas o en ruta',enRuta>8?'warn':'ok'],
    ['liquidacion','Liquidación',porLiquidar,'Pendientes de cierre / CXC',porLiquidar>5?'warn':'ok']
  ];
  const alertas=[];
  if(programadasAtrasadas.length) alertas.push(['bad','Pedidos programados atrasados',`${programadasAtrasadas.length} orden(es) requieren revisión`, 'ordenes','atrasadas']);
  if(criticas.length) alertas.push(['warn','Órdenes con tiempo elevado',`${criticas.length} orden(es) aparecen con alerta de etapa`, 'ordenes','proceso']);
  if(productosMal.length) alertas.push(['warn','Productos por configurar',`${productosMal.length} producto(s) necesitan revisar peso estándar o fracción`, 'productos','']);
  if(pendientesAgenda) alertas.push(['info','Agenda pendiente de hoy',`${pendientesAgenda} cliente(s) faltan por gestionar`, 'control','']);
  if(!alertas.length) alertas.push(['ok','Operación estable','No hay alertas críticas visibles en este momento', 'ordenes','']);
  c.innerHTML=`
  <div class="executive-hero v83-hero">
    <div>
      <div class="hero-eyebrow">Centro ejecutivo operativo</div>
      <h3>Panel de control del día</h3>
      <p>Resumen en vivo de llamadas, pedidos directos, órdenes, tiempos y tareas pendientes por módulo.</p>
    </div>
    <div class="hero-actions">
      <button class="btn" data-go="control">Registrar gestión</button>
      <button class="btn dark" data-go="ordenes">Ver órdenes</button>
      <button class="btn gray" data-go="carniceria">Carnicería</button>
      <button class="btn gray" data-go="config">Configurar</button>
    </div>
  </div>
  <div class="exec-kpi-grid">
    <div class="exec-kpi primary"><span>Órdenes hoy</span><strong>${pedidosHoy.length}</strong><small>${money(montoHoy)} facturado/estimado</small></div>
    <div class="exec-kpi"><span>Clientes gestionados</span><strong>${gestionadosIds.size}</strong><small>${llamadasHoy.length} llamadas · ${pedidosDirectosHoy.length} pedidos directos</small></div>
    <div class="exec-kpi"><span>Órdenes activas</span><strong>${ordenesActivas.length}</strong><small>En flujo o pendientes</small></div>
    <div class="exec-kpi"><span>Ticket promedio</span><strong>${money(avgTicket)}</strong><small>Promedio de órdenes de hoy</small></div>
    <div class="exec-kpi"><span>Ventas del mes</span><strong>${pedidosMes.length}</strong><small>${money(montoMes)}</small></div>
  </div>
  <div class="exec-layout">
    <div class="exec-main">
      <div class="panel panel-clean">
        <div class="panel-head"><div><h3>Flujo operativo por área</h3><p>Haz clic en un área para entrar directo al módulo correspondiente.</p></div><span class="badge info">En vivo</span></div>
        <div class="module-flow-grid">${moduleRows.map(([go,title,count,sub,level])=>`<button class="module-flow ${level}" data-go="${go}"><span>${esc(title)}</span><strong>${count}</strong><small>${esc(sub)}</small></button>`).join('')}</div>
      </div>
      <div class="panel panel-clean">
        <div class="panel-head"><div><h3>Órdenes críticas o con tiempo elevado</h3><p>Prioridad automática por programación atrasada y tiempo en etapa actual.</p></div><button class="btn small gray" data-go-view="proceso">Ver en proceso</button></div>
        <div class="list priority-list">${criticas.map(o=>priorityOrderCard(o)).join('')||'<div class="empty">No hay órdenes críticas en este momento.</div>'}</div>
      </div>
      <div class="panel panel-clean">
        <div class="panel-head"><div><h3>Últimas órdenes</h3><p>Actividad reciente del flujo operativo.</p></div><button class="btn small" data-go="ordenes">Ver todas</button></div>
        <div class="list order-board-list">${latest.map(orderMini).join('')||'<div class="empty">No hay órdenes todavía.</div>'}</div>
      </div>
    </div>
    <aside class="exec-side">
      <div class="panel panel-clean alert-panel"><div class="panel-head"><div><h3>Alertas operativas</h3><p>Lo que requiere atención primero.</p></div></div><div class="list">${alertas.map(([level,title,sub,go,view])=>`<button class="alert-row ${level}" data-go-alert="${go}" data-view-alert="${view}"><b>${esc(title)}</b><span>${esc(sub)}</span></button>`).join('')}</div></div>
      <div class="panel panel-clean"><div class="panel-head"><div><h3>Pedidos programados</h3><p>Futuros y atrasados.</p></div><button class="btn small gray" data-go-view="programadas">Ver</button></div><div class="badges metrics-row"><span class="badge ok">Hoy: ${programadasHoy.length}</span><span class="badge info">Próximas: ${programadasProximas.length}</span><span class="badge ${programadasAtrasadas.length?'bad':'ok'}">Atrasadas: ${programadasAtrasadas.length}</span></div><div class="list compact-list">${programadasAtrasadas.concat(programadasProximas).slice(0,6).map(orderMini).join('')||'<div class="empty">No hay pedidos programados próximos.</div>'}</div></div>
      <div class="panel panel-clean"><div class="panel-head"><div><h3>Agenda de hoy</h3><p>${agendaHoy.length} cliente(s) programados · ${pendientesAgenda} pendiente(s).</p></div><button class="btn small gray" data-go="control">Ir</button></div><div class="badges metrics-row"><span class="badge info">Agenda: ${agendaHoy.length}</span><span class="badge ok">Gestionados: ${gestionadosAgenda}</span><span class="badge info">Llamadas: ${llamadasHoy.length}</span><span class="badge info">Pedidos directos: ${pedidosDirectosHoy.length}</span><span class="badge ${pendientesAgenda?'warn':'ok'}">Pendientes: ${pendientesAgenda}</span></div></div>
      <div class="panel panel-clean"><div class="panel-head"><div><h3>Clientes en seguimiento</h3><p>Sin pedido reciente o nunca han pedido.</p></div><span class="badge warn">${seguimiento.length} visibles</span></div><div class="list compact-list">${seguimiento.slice(0,5).map(clientMini).join('')||'<div class="empty">Sin alertas de clientes.</div>'}</div></div>
    </aside>
  </div>`;
  $$('[data-go]').forEach(b=>b.onclick=()=>{state.page=b.dataset.go; render();});
  $$('[data-go-view]').forEach(b=>b.onclick=()=>{state.page='ordenes'; state.orderView=b.dataset.goView; render();});
  $$('[data-go-alert]').forEach(b=>b.onclick=()=>{state.page=b.dataset.goAlert||'inicio'; if(b.dataset.viewAlert){state.orderView=b.dataset.viewAlert;} render();});
  bindDynamic();
}

function priorityOrderCard(o){
  const st=currentModuleOfOrder(o); const mins=st&&stageEntryAt(o,st)?minutesSince(stageEntryAt(o,st)):0; const level=isLateDispatch(o)||stageTimerClass(mins||0,st)==='bad'?'bad':stageTimerClass(mins||0,st)==='warn'?'warn':'info';
  return `<div class="priority-card ${level}"><div><div class="client-title" style="font-size:15px">${esc(o.codigo||('ORD-'+o.id))} · ${esc(orderClientName(o))}</div><div class="client-sub">${esc(o.estado||'')} · Total ${elapsedTextSince(o.fecha||o.creado_en||today())}${st?` · ${esc(stageLabel(st))} ${elapsedTextSince(stageEntryAt(o,st))}`:''}</div><div class="badges">${orderStatusBadgeHtml(o)}${scheduleBadge(o)}${currentStageClockBadge(o)}${orderTakenByBadge(o)}<span class="badge">${money(o.total_factura||o.total_estimado)}</span></div></div><div class="card-actions"><button class="btn small gray" data-oper-order="${o.id}">Ver</button></div></div>`;
}

function clientMini(c){ const lc=lastCall(c.id); return `<div class="client-card" data-client="${c.id}" style="grid-template-columns:auto 1fr;cursor:pointer"><div class="avatar">${esc(String(c.codigo||'').replace('CL-','').slice(-3)||'C')}</div><div><div class="client-title" style="font-size:15px">${esc(c.negocio)}</div><div class="client-sub">${esc(c.contacto||'')} · ${esc(c.sector||'')}</div><div class="badges"><span class="badge ${c.estado==='Activo'?'ok':''}">${esc(c.estado||'')}</span>${lc?`<span class="badge info">${esc(lc.resultado)} · ${shortDate(lc.fecha)} ${callTime(lc)}</span>`:'<span class="badge warn">Sin gestión reciente</span>'}<span class="badge">${daysSince(c.ultimo_pedido)===null?'Sin historial de pedidos':daysSince(c.ultimo_pedido)+' días sin pedir'}</span></div></div></div>`; }
function controlPendingCard(c){ const lc=lastCall(c.id); return `<div class="client-card" style="grid-template-columns:auto 1fr auto"><div class="avatar">${esc(String(c.codigo||'').replace('CL-','').slice(-3)||'C')}</div><div><div class="client-title" style="font-size:15px">${esc(c.negocio)}</div><div class="client-sub">${esc(c.contacto||'')} · ${esc(c.sector||'')}</div><div class="badges"><span class="badge ${c.estado==='Activo'?'ok':''}">${esc(c.estado||'')}</span>${lc?`<span class="badge info">${esc(lc.resultado)} · ${shortDate(lc.fecha)}</span>`:'<span class="badge">Sin gestión reciente</span>'}</div></div><div class="card-actions"><button class="iconbtn whatsapp" data-wa="${c.id}">WA</button><button class="btn small" data-call="${c.id}">Gestionar</button><button class="btn small gray" data-client="${c.id}">Ficha</button></div></div>`; }
function callMini(l,linkedOrders=[]){
  const c=l.cliente || state.clientes.find(x=>Number(x.id)===Number(l.cliente_id)) || {};
  const faltaMonto=l.resultado==='Pidió' && !(+l.monto>0);
  const hora=callTime(l);
  const orders=(linkedOrders||[]).filter(Boolean);
  const primary=orders[0]||null;
  const orderBadges=orders.slice(0,2).map(o=>`<span class="badge info">${esc(o.codigo||('ORD-'+o.id))} · ${esc(o.estado||'')}</span>`).join('')+(orders.length>2?`<span class="badge">+${orders.length-2} orden(es)</span>`:'');
  return `<div class="client-card ${faltaMonto?'call-warn':'call-done'}" style="grid-template-columns:1fr auto"><div><div class="client-title" style="font-size:15px">${esc(c.negocio||'Cliente')}</div><div class="client-sub">${esc(c.codigo||'')} · ${shortDate(l.fecha)} ${hora?('· '+hora):''} · ${esc(l.resultado)} ${l.monto?money(l.monto):''}</div>${l.observacion?`<div class="hint">“${esc(l.observacion)}”</div>`:''}<div class="badges"><span class="badge ${faltaMonto?'warn':'ok'}">${faltaMonto?'Falta monto':'Gestión registrada'}</span>${l.proximo_contacto?`<span class="badge info">Próximo ${shortDate(l.proximo_contacto)}</span>`:''}${orderBadges}</div></div><div class="card-actions"><button class="btn small gray" data-edit-call="${l.id}">Editar</button><button class="btn small danger" data-revert-call="${l.id}">Revertir</button>${primary?`<button class="btn small dark" data-oper-order="${primary.id}">Ver pedido</button>`:''}<button class="btn small gray" data-client="${c.id||l.cliente_id}">Ficha</button><button class="iconbtn whatsapp" data-wa="${c.id||l.cliente_id}">WA</button></div></div>`;
}
function directOrderActivityMini(o){
  const c=o?.cliente || state.clientes.find(x=>Number(x.id)===Number(o?.cliente_id)) || {};
  const at=createdAtOf(o);
  const hora=commercialActivityTime(at);
  const linkedPrevious=!!o?.llamada_id;
  const cancelled=o?.estado==='Anulado';
  const label=linkedPrevious?'Pedido vinculado a gestión anterior':'Pedido directo';
  return `<div class="client-card ${cancelled?'call-warn':'call-done'} commercial-order-activity" style="grid-template-columns:1fr auto"><div><div class="client-title" style="font-size:15px">${esc(c.negocio||'Cliente')}</div><div class="client-sub">${esc(c.codigo||'')} · ${shortDate(rowDateKey(at))} ${hora?('· '+hora):''} · ${esc(label)} ${money(orderAmount(o))}</div><div class="hint">Orden ${esc(o.codigo||('ORD-'+o.id))} creada desde el módulo Órdenes${dispatchDateOf(o)!==rowDateKey(at)?` · despacho ${shortDate(dispatchDateOf(o))}`:''}.</div><div class="badges"><span class="badge ${cancelled?'bad':'ok'}">${esc(label)}</span><span class="badge info">${esc(o.codigo||('ORD-'+o.id))}</span><span class="badge ${cancelled?'bad':'info'}">${esc(o.estado||'Pedido recibido')}</span>${scheduleBadge(o)}</div></div><div class="card-actions"><button class="btn small dark" data-oper-order="${o.id}">Ver pedido</button>${!cancelled&&canEditOrderGeneral(o)?`<button class="btn small gray" data-edit-order="${o.id}">Editar pedido</button>`:''}<button class="btn small gray" data-client="${c.id||o.cliente_id}">Ficha</button><button class="iconbtn whatsapp" data-wa="${c.id||o.cliente_id}">WA</button></div></div>`;
}
function commercialActivityMini(a){
  return a?.kind==='call' ? callMini(a.call,a.orders||[]) : directOrderActivityMini(a.order);
}

function orderMini(o){return `<div class="client-card" style="grid-template-columns:1fr auto"><div><div class="client-title" style="font-size:15px">${esc(o.codigo||('ORD-'+o.id))} · ${esc(orderClientName(o))}</div><div class="client-sub">${shortDate(o.fecha)} · Despacho: ${shortDate(dispatchDateOf(o))} · ${money(o.total_factura||o.total_estimado)}${(o.items||[]).length?' · '+(o.items||[]).length+' producto(s)':''}</div><div class="badges">${scheduleBadge(o)}</div></div><div class="card-actions"><span class="badge info">${esc(o.estado||'')}</span><button class="btn small gray" data-oper-order="${o.id}">Ver pedido</button></div></div>`;}
function renderControl(c){
  const tabs=[['gestiones','Gestiones'],['agenda','Agenda']];
  c.innerHTML=`<div class="panel"><div class="tabs">${tabs.map(([id,n])=>`<button class="tab ${state.controlTab===id?'active':''}" data-controltab="${id}">${n}</button>`).join('')}</div><div id="controlBody"></div></div>`;
  $$('[data-controltab]').forEach(b=>b.onclick=()=>{state.controlTab=b.dataset.controltab; renderControl($('#content'));});
  if(state.controlTab==='agenda') renderControlAgenda($('#controlBody')); else renderControlGestiones($('#controlBody'));
}
function hasNextContactOn(c,f){
  return state.llamadas.some(l=>Number(l.cliente_id)===Number(c?.id) && String(l.proximo_contacto||'').slice(0,10)===f);
}
function controlScheduledClientsForDate(f){
  const dia=dayName(f);
  return state.clientes.filter(cl=>cl.estado==='Activo' && (clientMatchesContactDay(cl,dia) || hasNextContactOn(cl,f)));
}
function renderControlGestiones(c){
  const f=state.controlDate || today();
  const q=state.callSearch||'';
  const programados=controlScheduledClientsForDate(f);
  const managedIds=commercialManagedClientIdsForDate(f);
  const pendientesBase=programados.filter(cl=>!managedIds.has(Number(cl.id)));
  const pendientes=pendientesBase.filter(cl=>matchClientName(cl,q));
  const activities=commercialActivitiesForDate(f);
  const visibleActivities=activities.filter(a=>commercialActivityMatches(a,q));
  const calls=commercialCallsForDate(f);
  const directOrders=commercialDirectOrdersForDate(f);
  c.innerHTML=`<div class="panel-head"><div><h3>Control comercial</h3><p>${managedIds.size} cliente(s) gestionados · ${activities.length} actividad(es) · ${pendientesBase.length} pendiente(s) · ${programados.length} en agenda.</p></div><div class="agenda-date"><input type="date" id="controlDate" value="${f}"><button class="btn" id="nuevaGestion">Registrar gestión</button></div></div><div class="badges control-commercial-kpis"><span class="badge info">Llamadas: ${calls.length}</span><span class="badge ok">Pedidos directos: ${directOrders.length}</span><span class="badge">Clientes únicos: ${managedIds.size}</span><span class="badge ${pendientesBase.length?'warn':'ok'}">Pendientes: ${pendientesBase.length}</span></div><div class="searchbar"><input id="controlSearch" value="${esc(q)}" placeholder="Buscar cliente, resultado, orden o factura..."></div><div id="controlSuggest"></div><div class="grid2"><div class="panel" style="box-shadow:none"><h3 style="margin-top:0">Pendientes de agenda</h3><p class="hint">Desaparecen al registrar una llamada o al crear un pedido normal directamente desde Órdenes.</p><div class="list">${pendientes.slice(0,40).map(c=>controlPendingCard(c)).join('')||'<div class="empty">No quedan clientes pendientes para la agenda de esta fecha con ese filtro.</div>'}</div></div><div class="panel" style="box-shadow:none"><h3 style="margin-top:0">Gestionados</h3><p class="hint">Cronología unificada: llamadas, pedidos desde gestiones y pedidos creados directamente.</p><div class="list">${visibleActivities.slice(0,80).map(commercialActivityMini).join('')||'<div class="empty">Sin actividades comerciales en esta fecha.</div>'}</div></div></div>`;
  $('#controlDate').onchange=e=>{state.controlDate=e.target.value||today(); renderControl($('#content'));};
  $('#nuevaGestion').onclick=()=>openCallModal();
  const inp=$('#controlSearch'), sug=$('#controlSuggest');
  inp.oninput=()=>{ state.callSearch=inp.value; const query=inp.value; const rows=state.clientes.filter(x=>matchClientName(x,query)).slice(0,10); sug.innerHTML=query?`<div class="panel"><div class="list">${rows.map(x=>`<div class="client-card"><div class="avatar">${esc(String(x.codigo||'').replace('CL-','').slice(-3))}</div><div><div class="client-title">${esc(x.negocio)}</div><div class="client-sub">${esc(x.contacto||'')} · ${esc(x.telefono||'')} · ${esc(x.sector||'')}</div></div><div class="card-actions"><button class="iconbtn whatsapp" data-wa="${x.id}">WA</button><button class="btn small" data-call="${x.id}">Gestionar</button><button class="btn small gray" data-client="${x.id}">Ficha</button></div></div>`).join('')}</div></div>`:''; if(query.length>1) setTimeout(()=>{ const pos=inp.selectionStart||inp.value.length; renderControlGestiones($('#controlBody')); focusAfterRender('controlSearch',pos); },0); bindDynamic(); };
  bindDynamic();
}

function renderControlAgenda(c){
  const f=state.agendaDate || today();
  const dia=dayName(f);
  const calls=commercialCallsForDate(f);
  const directOrders=commercialDirectOrdersForDate(f);
  const managedIds=commercialManagedClientIdsForDate(f);
  const rows=controlScheduledClientsForDate(f);
  const gestionados=rows.filter(cl=>managedIds.has(Number(cl.id))).length;
  const pendientes=Math.max(0,rows.length-gestionados);
  c.innerHTML=`<div class="panel-head"><div><h3>Agenda de ${dia}</h3><p>${rows.length} clientes para esta fecha · ${gestionados} gestionados · ${pendientes} pendientes.</p></div><div class="agenda-date"><input type="date" id="agendaDate" value="${f}"><button class="btn" data-go-control="1">Ir a gestiones →</button></div></div><div class="badges" style="margin:0 0 12px"><span class="badge info">Agenda: ${rows.length}</span><span class="badge ok">Gestionados: ${gestionados}</span><span class="badge info">Llamadas: ${calls.length}</span><span class="badge info">Pedidos directos: ${directOrders.length}</span><span class="badge ${pendientes?'warn':'ok'}">Pendientes: ${pendientes}</span></div><div class="list">${rows.map(cl=>{
    const clientCalls=calls.filter(g=>Number(g.cliente_id)===Number(cl.id));
    const clientOrders=commercialOrdersForDate(f).filter(o=>Number(o.cliente_id)===Number(cl.id)).sort((a,b)=>safeDateObj(createdAtOf(b))-safeDateObj(createdAtOf(a)));
    const l=clientCalls[0]||null;
    const order=clientOrders[0]||null;
    const managed=managedIds.has(Number(cl.id));
    const reprogramado=hasNextContactOn(cl,f);
    let status='<span class="badge warn">Pendiente</span>';
    if(managed){
      const source=l ? `Gestión · ${esc(l.resultado||'Registrada')}${callTime(l)?' '+esc(callTime(l)):''}` : `Pedido directo · ${esc(order?.codigo||'')}`;
      status=`<span class="badge ok">Gestionado · ${source}</span>`;
      if(l && order) status+=`<span class="badge info">${esc(order.codigo||('ORD-'+order.id))}</span>`;
    }
    return `<div class="client-card" style="grid-template-columns:auto 1fr auto"><div class="avatar">${esc(String(cl.codigo||'').replace('CL-','').slice(-3)||'C')}</div><div><div class="client-title" style="font-size:15px">${esc(cl.negocio)}</div><div class="client-sub">${esc(cl.contacto||'')} · ${esc(cl.sector||'')} · ${esc(cl.telefono||'')}</div><div class="badges"><span class="badge ok">${esc(cl.estado)}</span><span class="badge info">${esc(contactDaysText(cl)||dia)}</span>${reprogramado?'<span class="badge warn">Reprogramado para esta fecha</span>':''}${status}</div></div><div class="card-actions"><button class="iconbtn whatsapp" data-wa="${cl.id}">WA</button><button class="btn small" data-call="${cl.id}">${managed?'Otra gestión':'Gestionar'}</button>${order?`<button class="btn small dark" data-oper-order="${order.id}">Ver pedido</button>`:''}<button class="btn small gray" data-client="${cl.id}">Ficha</button></div></div>`;
  }).join('')||`<div class="empty">No hay clientes activos programados para ${dia}. Revisa los días de contacto en la ficha del cliente.</div>`}</div>`;
  $('#agendaDate').onchange=e=>{state.agendaDate=e.target.value||today(); renderControl($('#content'));};
  $('[data-go-control]').onclick=()=>{state.controlTab='gestiones'; state.controlDate=state.agendaDate; renderControl($('#content'));};
  bindDynamic();
}

function renderClientes(c){
  const q=state.clientSearch; const rows=state.clientes.filter(x=>(state.filter==='Todos'||x.estado===state.filter) && matchClientName(x,q));
  c.innerHTML=`<div class="panel"><div class="panel-head"><div><h3>Clientes</h3><p>${rows.length} de ${state.clientes.length} clientes · búsqueda estricta por nombre.</p></div><button class="btn" id="newClient">+ Cliente</button></div><div class="searchbar"><input id="clientSearch" value="${esc(q)}" placeholder="Buscar nombre del cliente..."></div><div class="chips">${['Todos','Activo','Inactivo','Prospecto','Suspendido'].map(f=>`<button class="chip ${state.filter===f?'active':''}" data-filter="${f}">${f}</button>`).join('')}</div><div class="actions"><button class="btn gray" id="tplClientes">Descargar plantilla clientes</button><button class="btn gray" id="exportClientes">Exportar Excel</button><label class="btn gray" for="importClientes">Importar Excel</label><input id="importClientes" type="file" accept=".xlsx,.xls" style="display:none"></div></div><div class="list">${rows.slice(0,150).map(clientCard).join('')||'<div class="empty">No hay clientes con ese filtro.</div>'}</div>`;
  $('#clientSearch').oninput=e=>{ const pos=e.target.selectionStart||e.target.value.length; state.clientSearch=e.target.value; renderClientes($('#content')); focusAfterRender('clientSearch',pos);}; $$('[data-filter]').forEach(b=>b.onclick=()=>{state.filter=b.dataset.filter; renderClientes($('#content'));}); $('#newClient').onclick=()=>openClientForm(); $('#tplClientes').onclick=()=>downloadClienteTemplate(); $('#exportClientes').onclick=()=>exportClientes(rows); $('#importClientes').onchange=e=>importClientes(e.target.files[0]); bindDynamic();
}
function clientCard(c){ const lc=lastCall(c.id); const d=daysSince(c.ultimo_pedido); return `<div class="client-card"><div class="avatar">${esc(String(c.codigo||'').replace('CL-','').slice(-3)||'C')}</div><div><div class="client-title">${esc(c.negocio)}</div><div class="client-sub">${esc(c.contacto||'')} · ${esc(c.sector||'Sin sector')} · ${esc(c.tipo||'')}</div><div class="badges"><span class="badge ${c.estado==='Activo'?'ok':c.estado==='Prospecto'?'info':''}">${esc(c.estado||'')}</span>${lc?`<span class="badge ${lc.resultado==='Pidió'?'ok':'warn'}">${esc(lc.resultado)} · ${shortDate(lc.fecha)}</span>`:'<span class="badge">Sin gestiones</span>'}<span class="badge ${d===null||d>=30?'warn':''}">${d===null?'nunca ha pedido':d+' días sin pedir'}</span></div></div><div class="card-actions"><a class="iconbtn call" href="tel:${esc(c.telefono||'')}">Llamar</a><button class="iconbtn whatsapp" data-wa="${c.id}">WhatsApp</button><button class="btn small gray" data-client="${c.id}">Ficha</button></div></div>`; }
function bindDynamic(){
  $$('[data-wa]').forEach(b=>b.onclick=()=>openWhatsApp(state.clientes.find(x=>x.id==b.dataset.wa)));
  $$('[data-wa-order]').forEach(b=>b.onclick=(e)=>{ if(e){e.preventDefault();e.stopPropagation();} const o=state.ordenes.find(x=>String(x.id)===String(b.dataset.waOrder)); if(!o) return alert('No encontré esta orden. Actualiza la pantalla e intenta nuevamente.'); showOrderWhatsAppPrompt(o,'reenvio'); });
  $$('[data-client]').forEach(b=>b.onclick=()=>openClientFicha(state.clientes.find(x=>x.id==b.dataset.client)));
  $$('[data-call]').forEach(b=>b.onclick=()=>openCallModal(state.clientes.find(x=>x.id==b.dataset.call)));
  $$('[data-prep-order]').forEach(b=>b.onclick=()=>{clearLiveFlashOrder(b.dataset.prepOrder); openPreparacionModal(state.ordenes.find(x=>x.id==b.dataset.prepOrder));});
  $$('[data-take-order]').forEach(b=>b.onclick=()=>{clearLiveFlashOrder(b.dataset.takeOrder); openTakeOrderModal(state.ordenes.find(x=>String(x.id)===String(b.dataset.takeOrder)));});
  $$('[data-release-order]').forEach(b=>b.onclick=()=>openReleaseOrderModal(state.ordenes.find(x=>String(x.id)===String(b.dataset.releaseOrder))));
  $$('[data-print-prep]').forEach(b=>b.onclick=()=>printPreparationTicket(state.ordenes.find(x=>x.id==b.dataset.printPrep)));
  $$('[data-print-order]').forEach(b=>b.onclick=()=>printOrderTicket(state.ordenes.find(x=>x.id==b.dataset.printOrder)));
  $$('[data-invoice-order]').forEach(b=>b.onclick=()=>openFacturaModal(state.ordenes.find(x=>x.id==b.dataset.invoiceOrder)));
  $$('[data-quick-invoice]').forEach(b=>b.onclick=()=>quickInvoiceOrder(state.ordenes.find(x=>String(x.id)===String(b.dataset.quickInvoice)),b));
  $$('[data-validate-order]').forEach(b=>b.onclick=()=>{ try{ const o=state.ordenes.find(x=>String(x.id)===String(b.dataset.validateOrder)); if(!o) return alert('No encontré esta orden. Actualiza la pantalla e intenta nuevamente.'); openValidacionModal(o); }catch(err){ console.error(err); alert('No pude abrir Validación: '+(err.message||err)); } });
  $$('[data-return-invoice]').forEach(b=>b.onclick=()=>openReturnToInvoiceModal(state.ordenes.find(x=>String(x.id)===String(b.dataset.returnInvoice))));
  $$('[data-special-case]').forEach(b=>b.onclick=()=>openSpecialCaseModal(state.ordenes.find(x=>String(x.id)===String(b.dataset.specialCase))));
  $$('[data-liquidate-order]').forEach(b=>b.onclick=()=>openLiquidacionOrdenModal(state.ordenes.find(x=>String(x.id)===String(b.dataset.liquidateOrder))));
  $$('[data-oper-order]').forEach(b=>b.onclick=(e)=>{ if(e){ e.preventDefault(); e.stopPropagation(); } try{ const o=state.ordenes.find(x=>String(x.id)===String(b.dataset.operOrder)); if(!o) return alert('No encontré esta orden. Actualiza la pantalla e intenta nuevamente.'); clearLiveFlashOrder(o.id); openOrderStatusModal(o); }catch(err){ console.error(err); alert('No pude abrir la ficha de la orden: '+(err.message||err)); } });
  $$('[data-edit-order]').forEach(b=>b.onclick=(e)=>{ if(e) e.stopPropagation(); openOrderForm(state.ordenes.find(x=>x.id==b.dataset.editOrder)); });
  $$('[data-cancel-order]').forEach(b=>b.onclick=(e)=>{ if(e) e.stopPropagation(); cancelOrder(state.ordenes.find(x=>x.id==b.dataset.cancelOrder)); });
  $$('[data-release-stock-order]').forEach(b=>b.onclick=async(e)=>{
    if(e){ e.preventDefault(); e.stopPropagation(); }
    const o=state.ordenes.find(x=>String(x.id)===String(b.dataset.releaseStockOrder));
    if(!o) return alert('No encontré la orden pendiente. Actualiza la pantalla.');
    const note=prompt('Confirma que los artículos ya están disponibles. Puedes agregar una observación:','Existencia confirmada');
    if(note===null) return;
    b.disabled=true;
    const {error}=await sb.rpc('liberar_pendiente_existencia_v9391',{p_orden_id:o.id,p_observacion:note||null});
    if(error){ b.disabled=false; return alert('No se pudo liberar la orden: '+error.message+'\n\nVerifica que aplicaste el SQL 44.'); }
    await refreshVisibleModuleV9384(); render(); toast(`${o.codigo} fue enviada a Carnicería.`);
  });
  $$('[data-order-client]').forEach(b=>b.onclick=()=>openOrderForm(null,state.clientes.find(x=>x.id==b.dataset.orderClient)));
  $$('[data-edit-call]').forEach(b=>b.onclick=()=>{ const l=state.llamadas.find(x=>x.id==b.dataset.editCall); const c=l?.cliente || state.clientes.find(x=>Number(x.id)===Number(l?.cliente_id)); openCallModal(c,l); });
  $$('[data-revert-call]').forEach(b=>b.onclick=()=>{ const l=state.llamadas.find(x=>x.id==b.dataset.revertCall); revertCall(l); });
  bindClientAdminButtons(document);
}


function linkedOrderForCall(call){
  if(!call) return null;
  return state.ordenes.find(o=>Number(o.llamada_id)===Number(call.id)) || null;
}
function orderPreparationFinalized(o){
  if(!o) return false;
  const st=String(o.estado||'');
  if(o.preparado_en) return true;
  if(['Lista para facturar','Impresa para facturar','Facturada','Validada para delivery','Asignada a delivery','En ruta','Entregado','Cobrado','Entregado a crédito','No entregado','Devuelto parcial','Cerrada'].includes(st)) return true;
  if(state.pesos.some(p=>Number(p.orden_id)===Number(o.id) && String(p.tipo||'').toLowerCase().includes('prepar'))) return true;
  return false;
}
function preparedByDisplay(o){
  return orderPreparationFinalized(o) ? workerDisplayName(o?.preparado_por) : '';
}
function orderHasProgress(o){
  if(!o) return false;
  const st=String(o.estado||'');
  if(st && !['Pedido recibido','Anulado'].includes(st)) return true;
  if(state.pesos.some(p=>Number(p.orden_id)===Number(o.id))) return true;
  if(state.entregas.some(e=>Number(e.orden_id)===Number(o.id))) return true;
  if(state.pagos.some(p=>Number(p.orden_id)===Number(o.id))) return true;
  return !!((o.preparado_por&&orderPreparationFinalized(o))||o.facturado_por||o.validado_por||o.recibido_por||o.factura_no||o.delivery_nombre||o.peso_preparado||o.peso_facturado||o.peso_validado||o.cantidad_impresiones);
}
async function archiveOrderSafely(o,reason=''){
  if(!o) return {error:new Error('Orden no encontrada.')};
  const r=await sb.rpc('cancelar_orden_v9383',{
    p_orden_id:o.id,
    p_estado_esperado:o.estado,
    p_motivo:reason,
    p_archivar:true
  });
  return {error:r.error||null,data:r.data||null};
}
async function annulOrder(o, reason=''){
  if(!o) return {error:new Error('Orden no encontrada.')};
  const r=await sb.rpc('cancelar_orden_v9383',{
    p_orden_id:o.id,
    p_estado_esperado:o.estado,
    p_motivo:reason,
    p_archivar:false
  });
  return {error:r.error||null,data:r.data||null};
}
async function cancelOrder(o, opts={}){
  if(!o) return alert('No encontré la orden.');
  if(!canDeleteOrder(o)){
    alert('Acceso restringido. Solo el administrador puede eliminar o anular órdenes.');
    return false;
  }
  const advanced=orderHasProgress(o);
  const fromRevert=!!opts.fromRevert;
  let reason=opts.reason||'';
  if(advanced){
    if(!reason){
      reason=prompt(`Esta orden ya avanzó en el proceso (${o.estado}). No se eliminará físicamente; se ANULARÁ y saldrá de Carnicería, Facturación, Validación, Delivery y Liquidación.\n\nEscribe el motivo de la anulación:`);
      if(reason===null) return false;
      reason=reason.trim()||'Sin motivo especificado';
    }
    const r=await annulOrder(o,reason);
    if(r.error){ alert(r.error.message+'\n\nVerifica que aplicaste el SQL 41 y su corrección SQL 49 de la V9.3.9.6.'); return false; }
    if(!fromRevert){ await refreshVisibleModuleV9384(); render(); toast('Orden anulada y retirada de los módulos operativos.'); }
    return true;
  }
  const msg=`Esta orden está recién creada y no ha avanzado.\n\nSe archivará de forma segura y dejará de aparecer en los módulos operativos, pero conservará todos sus datos e historial:\n${o.codigo||('ORD-'+o.id)} · ${orderClientName(o)}\n\n¿Deseas continuar?`;
  if(!opts.skipConfirm && !confirm(msg)) return false;
  if(!reason){
    reason=prompt('Escribe el motivo obligatorio para archivar esta orden:');
    if(reason===null) return false;
    reason=reason.trim();
    if(reason.length<5) return alert('El motivo debe tener al menos 5 caracteres.');
  }
  const r=await archiveOrderSafely(o,reason);
  if(r.error){ alert(r.error.message+'\n\nVerifica que aplicaste el SQL 41 y su corrección SQL 49 de la V9.3.9.6.'); return false; }
  if(!fromRevert){ await refreshVisibleModuleV9384(); render(); toast('Orden archivada sin borrar datos ni historial.'); }
  return true;
}
async function revertCall(call){
  if(!call) return alert('No encontré la gestión.');
  const cl=call.cliente || state.clientes.find(x=>Number(x.id)===Number(call.cliente_id)) || {};
  const linked=linkedOrderForCall(call);
  let reason='Gestión de llamada revertida';
  let ok=false;
  if(linked){
    const advanced=orderHasProgress(linked);
    const action=advanced?'se anulará':'se archivará sin borrar datos';
    ok=confirm(`Esta gestión tiene una orden vinculada:\n${linked.codigo||('ORD-'+linked.id)} · ${linked.estado}\n\nSi reviertes la gestión, esa orden también ${action}. El sistema limpiará el pedido interno relacionado para evitar errores de vínculo.\n\n¿Deseas continuar?`);
    if(!ok) return false;
    if(advanced){
      const p=prompt('Motivo para anular la orden vinculada:');
      if(p===null) return false;
      reason=p.trim()||reason;
    }
  }else{
    ok=confirm(`¿Revertir esta gestión de ${cl.negocio||'este cliente'}?\n\nSi esta gestión tuvo un pedido interno vinculado, también se limpiará antes de revertir la llamada.`);
    if(!ok) return false;
  }

  const rpc=await sb.rpc('revertir_gestion_segura',{p_llamada_id:call.id,p_motivo:reason});
  if(rpc.error){
    alert('No se revirtió la gestión. La operación fue detenida para proteger órdenes e historial.\n\n'+rpc.error.message+'\n\nVerifica que la migración V9.4.2 R1 esté aplicada.');
    return false;
  }
  await refreshVisibleModuleV9384(); render(); toast('Gestión revertida de forma segura.');
  return true;
}

function renderOrdenes(c){
  const estados=['Programada','Pendiente por existencia','Pedido recibido','En preparación','Lista para facturar','Impresa para facturar','Facturada','Lista para retiro','Entregada en negocio','Asignada a delivery','En ruta','Cobrado','Entregado a crédito','No entregado','Anulado'];
  const counts=Object.fromEntries(estados.map(e=>[e,state.ordenes.filter(o=>effectiveOrderState(o)===e).length]));
  const q=state.orderSearch||'';
  const view=state.orderView||'hoy';
  let base=state.ordenes.slice();
  if(view==='recientes') base=base.filter(o=>o.estado!=='Anulado');
  if(view==='hoy') base=base.filter(o=>o.estado!=='Anulado' && isDueDispatch(o));
  if(view==='accion') base=base.filter(o=>o.estado!=='Anulado' && ['Pendiente por existencia','Pedido recibido','En preparación','Lista para facturar','Impresa para facturar','Facturada','Validada para delivery','Lista para retiro'].includes(effectiveOrderState(o)));
  if(view==='programadas') base=base.filter(o=>o.estado!=='Anulado' && isFutureDispatch(o));
  if(view==='atrasadas') base=base.filter(o=>isLateDispatch(o));
  if(view==='listas') base=base.filter(o=>isOrderReady(o));
  if(view==='proceso') base=base.filter(o=>o.estado!=='Anulado' && isOrderInProcess(o));
  if(view==='anuladas') base=base.filter(o=>o.estado==='Anulado');
  if(view==='especiales') base=base.filter(o=>isSpecialOrder(o) && o.estado!=='Anulado');
  if(view==='finalizadas') base=base.filter(o=>['Cobrado','Entregado a crédito','No entregado','Devuelto parcial','Cerrado','Entregada en negocio'].includes(effectiveOrderState(o)));
  const rows=(q ? base.filter(o=>matchOrder(o,q)) : base).sort((a,b)=>{
    const priority=o=>String(o.prioridad||'Normal')==='Urgente'?2:String(o.prioridad||'Normal')==='Alta'?1:0;
    const late=o=>isLateDispatch(o)?1:0;
    const recent=o=>safeDateObj(createdAtOf(o)).getTime();
    if(view==='recientes'||view==='hoy') return recent(b)-recent(a) || priority(b)-priority(a);
    return late(b)-late(a) || priority(b)-priority(a) || recent(b)-recent(a) || Number(b.id||0)-Number(a.id||0);
  });
  const pageSize=25;
  const totalPages=Math.max(1,Math.ceil(rows.length/pageSize));
  const page=Math.min(Math.max(1,Number(state.orderPage||1)),totalPages);
  state.orderPage=page;
  const pageRows=rows.slice((page-1)*pageSize,page*pageSize);
  const from=rows.length?(page-1)*pageSize+1:0;
  const to=Math.min(page*pageSize,rows.length);
  const tabs=[['recientes','Nuevas / recientes'],['accion','Requieren acción'],['hoy','Hoy / vencidas'],['atrasadas','Atrasadas'],['programadas','Programadas'],['proceso','En proceso'],['listas','Listas'],['finalizadas','Finalizadas'],['especiales','Devol./Incid.'],['todas','Todas'],['anuladas','Anuladas']];
  c.innerHTML=`<div class="orders-toolbar panel"><div class="orders-toolbar-top"><div><h3>Órdenes operativas</h3><p>${rows.length} resultado(s) · mostrando ${from}-${to} · prioridad: vencidas y urgentes primero.</p></div><button class="btn" id="createOrder">+ Orden</button></div><div class="orders-flow-strip">${estados.slice(0,6).map(e=>`<div class="orders-flow-item"><span>${esc(e)}</span><strong>${counts[e]||0}</strong></div>`).join('')}</div><div class="orders-filter-row"><div class="tabs orders-tabs">${tabs.map(([id,n])=>`<button class="tab ${view===id?'active':''}" data-order-view="${id}">${n}</button>`).join('')}</div><div class="searchbar orders-search"><input id="orderSearch" value="${esc(q)}" placeholder="Cliente, orden, teléfono o producto..."></div></div></div>${view==='especiales'?specialCasePanel(rows):''}<div class="list orders-compact-list">${pageRows.map(operOrderCard).join('')||'<div class="empty">No hay órdenes con esa búsqueda o vista.</div>'}</div>${rows.length>pageSize?`<div class="orders-pagination"><span>Mostrando ${from}-${to} de ${rows.length}</span><div class="actions"><button class="btn small gray" id="orderPrev" ${page<=1?'disabled':''}>← Anterior</button><span class="badge info">Página ${page} de ${totalPages}</span><button class="btn small gray" id="orderNext" ${page>=totalPages?'disabled':''}>Siguiente →</button></div></div>`:''}`;
  $('#createOrder').onclick=()=>openOrderForm();
  $('#specialTypeFilter')?.addEventListener('change',e=>{state.specialTypeFilter=e.target.value; renderOrdenes($('#content'));});
  $('#specialStatusFilter')?.addEventListener('change',e=>{state.specialStatusFilter=e.target.value; renderOrdenes($('#content'));});
  $('#specialSearch')?.addEventListener('input',e=>{ const pos=e.target.selectionStart||e.target.value.length; state.specialSearch=e.target.value; renderOrdenes($('#content')); focusAfterRender('specialSearch',pos);});
  $('#printSpecialCases')?.addEventListener('click',()=>printSpecialCasesReport());
  $$('[data-order-view]').forEach(b=>b.onclick=()=>{state.orderView=b.dataset.orderView; state.orderPage=1; renderOrdenes($('#content'));});
  $('#orderSearch').oninput=e=>{ const pos=e.target.selectionStart||e.target.value.length; state.orderSearch=e.target.value; state.orderPage=1; renderOrdenes($('#content')); focusAfterRender('orderSearch',pos); };
  $('#orderPrev')?.addEventListener('click',()=>{state.orderPage=Math.max(1,page-1); renderOrdenes($('#content')); window.scrollTo({top:0,behavior:'smooth'});});
  $('#orderNext')?.addEventListener('click',()=>{state.orderPage=Math.min(totalPages,page+1); renderOrdenes($('#content')); window.scrollTo({top:0,behavior:'smooth'});});
  bindDynamic();
}


function productTypeNormalized(p){ return String(productWeightTypeFromProduct(p)||'Por libra').trim(); }
function productHasOrders(p){
  if(!p) return false;
  return (state.ordenes||[]).some(o => (o.items||[]).some(i => String(i.producto_id||'')===String(p.id||'')));
}
function productConfigIssues(p){
  const issues=[];
  const type=productTypeNormalized(p);
  const unidad=String(p?.unidad||'').trim().toLowerCase();
  const precio=Number(p?.precio_defecto||0);
  const pesoStd=Number(p?.peso_estandar_lb||0);
  const suma=p?.suma_peso_final!==false;
  const allows=productAllowsFraction(p);
  if(!String(p?.nombre||'').trim()) issues.push('Sin nombre');
  if(!String(p?.categoria||'').trim()) issues.push('Sin categoría');
  if(!String(p?.unidad||'').trim()) issues.push('Sin unidad');
  if(!(precio>0)) issues.push('Sin precio');
  if(type==='Unidad peso fijo'){
    if(!(pesoStd>0)) issues.push('Unidad fija sin peso estándar');
    if(allows) issues.push('Unidad fija permite fracción');
    if(!suma) issues.push('Unidad fija no suma peso final');
  }
  if(type==='No pesa' && suma) issues.push('No pesa pero suma al peso');
  if(type==='Por libra' && !['lb','lbs','libra','libras'].includes(unidad)) issues.push('Unidad no parece libra');
  if(type==='Unidad peso variable' && p?.requiere_pesaje===false) issues.push('Unidad variable sin pesaje');
  return issues;
}
function productConfigBadge(p){
  const issues=productConfigIssues(p);
  if(!issues.length) return `<span class="badge ok">Configurado</span>`;
  const txt=issues.slice(0,2).join(' · ')+(issues.length>2?` +${issues.length-2}`:'');
  return `<span class="badge bad" title="${esc(issues.join(' | '))}">Revisar: ${esc(txt)}</span>`;
}
function uniqueProductValues(field){
  return [...new Set((state.productos||[]).map(p=>String(p?.[field]||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es'));
}
function productMatchesAdvancedFilters(p){
  const f=state.productFilter||'Todos';
  if(f==='Activo' && p.activo===false) return false;
  if(f==='Inactivo' && p.activo!==false) return false;
  if(f==='Mal configurados' && !productConfigIssues(p).length) return false;
  if(state.productCategoryFilter && state.productCategoryFilter!=='Todas' && String(p.categoria||'')!==state.productCategoryFilter) return false;
  if(state.productUnitFilter && state.productUnitFilter!=='Todas' && String(p.unidad||'')!==state.productUnitFilter) return false;
  if(state.productWeightFilter && state.productWeightFilter!=='Todos' && productTypeNormalized(p)!==state.productWeightFilter) return false;
  return true;
}
function renderProductos(c){
  const q=state.productSearch;
  const all=state.productos.filter(x=>matchProductName(x,q));
  const rows=all.filter(productMatchesAdvancedFilters);
  const cats=uniqueProductValues('categoria');
  const units=uniqueProductValues('unidad');
  const weightTypes=['Por libra','Unidad peso fijo','Unidad peso variable','No pesa'];
  const activos=state.productos.filter(p=>p.activo!==false).length;
  const inactivos=state.productos.filter(p=>p.activo===false).length;
  const mal=state.productos.filter(p=>p.activo!==false && productConfigIssues(p).length).length;
  c.innerHTML=`
  <div class="product-dashboard">
    <div class="product-summary-card"><span>Total productos</span><strong>${state.productos.length}</strong><small>Catálogo completo</small></div>
    <div class="product-summary-card"><span>Activos</span><strong>${activos}</strong><small>Disponibles para pedidos</small></div>
    <div class="product-summary-card"><span>Inactivos</span><strong>${inactivos}</strong><small>Fuera del catálogo activo</small></div>
    <div class="product-summary-card ${mal?'danger':''}"><span>Revisar</span><strong>${mal}</strong><small>Posibles malas configuraciones</small></div>
  </div>
  <div class="panel product-panel"><div class="panel-head"><div><h3>Productos</h3><p>${rows.length} visibles de ${state.productos.length} productos · catálogo conectado con órdenes, carnicería, facturación y reportes.</p></div><button class="btn" id="newProduct">+ Producto</button></div>
    <div class="searchbar"><input id="productSearch" value="${esc(q)}" placeholder="Buscar nombre del producto..."></div>
    <div class="chips">${['Todos','Activo','Inactivo','Mal configurados'].map(x=>`<button class="chip ${state.productFilter===x?'active':''}" data-prod-filter="${x}">${x}</button>`).join('')}</div>
    <details class="product-filter-shell" open><summary>Filtros y herramientas</summary><div class="product-filters">
      <div class="field"><label>Categoría</label><select id="productCategoryFilter"><option>Todas</option>${cats.map(x=>`<option ${state.productCategoryFilter===x?'selected':''}>${esc(x)}</option>`).join('')}</select></div>
      <div class="field"><label>Unidad</label><select id="productUnitFilter"><option>Todas</option>${units.map(x=>`<option ${state.productUnitFilter===x?'selected':''}>${esc(x)}</option>`).join('')}</select></div>
      <div class="field"><label>Tipo de despacho / peso</label><select id="productWeightFilter"><option>Todos</option>${weightTypes.map(x=>`<option ${state.productWeightFilter===x?'selected':''}>${esc(x)}</option>`).join('')}</select></div>
    </div>
    <div class="actions product-toolbar"><button class="btn gray" id="tplProductos">Plantilla</button><button class="btn gray" id="exportProductos">Exportar</button><label class="btn gray" for="importProductos">Importar</label><input id="importProductos" type="file" accept=".xlsx,.xls" style="display:none"></div></details>
    ${mal?`<div class="weight-alert"><strong>Catálogo con productos por revisar</strong>Hay ${mal} producto(s) activo(s) con configuración que puede afectar órdenes, peso calculado o despacho. Usa el filtro <b>Mal configurados</b> para corregirlos.</div>`:''}
  </div>
  <div class="product-mobile-list">${rows.map(p=>{const issues=productConfigIssues(p);return `<article class="product-mobile-card ${issues.length?'needs-review':''}"><div class="product-mobile-head"><div><span class="product-code">${esc(p.codigo||'Sin código')}</span><h4>${esc(p.nombre)}</h4><p>${esc(p.categoria||'Sin categoría')} · ${money(p.precio_defecto)}/${esc(p.unidad||'lb')}</p></div><span class="badge ${p.activo!==false?'ok':'bad'}">${p.activo!==false?'Activo':'Inactivo'}</span></div><div class="badges"><span class="badge info">${esc(weightConfigLabel(p))}</span>${p.suma_peso_final===false?'<span class="badge">No suma peso</span>':''}<span class="badge">${productAllowsFraction(p)?'Permite fracción':'Solo entero'}</span></div>${issues.length?`<div class="product-mobile-warning"><b>Revisar configuración</b><span>${esc(issues.join(' · '))}</span></div>`:'<div class="product-mobile-ok">Configurado correctamente</div>'}<div class="product-mobile-actions"><button class="btn small gray" data-prod-edit="${p.id}">Editar</button><button class="btn small dark" data-prod-actions="${p.id}">Más</button></div></article>`}).join('')||'<div class="empty">No hay productos con estos filtros.</div>'}</div>
  <div class="table-wrap product-table-wrap"><table class="table product-table"><thead><tr><th>Código</th><th>Producto</th><th>Categoría</th><th>Unidad</th><th>Precio</th><th>Despacho / peso</th><th>Estado</th><th>Configuración</th><th>Acciones</th></tr></thead><tbody>${rows.map(p=>`<tr><td>${esc(p.codigo||'')}</td><td><b>${esc(p.nombre)}</b>${p.observaciones?`<div class="hint">${esc(p.observaciones).slice(0,80)}</div>`:''}</td><td>${esc(p.categoria||'')}</td><td>${esc(p.unidad||'lb')}</td><td>${money(p.precio_defecto)}</td><td><span class="badge info">${esc(weightConfigLabel(p))}</span>${p.suma_peso_final===false?`<div class="hint">No suma peso</div>`:''}${productAllowsFraction(p)?`<div class="hint">Permite fracción</div>`:`<div class="hint">Solo entero</div>`}</td><td><span class="badge ${p.activo!==false?'ok':'bad'}">${p.activo!==false?'Activo':'Inactivo'}</span></td><td>${productConfigBadge(p)}</td><td><div class="actions product-row-actions"><button class="btn small gray" data-prod-edit="${p.id}">Editar</button><button class="btn small dark" data-prod-actions="${p.id}">Acciones</button></div></td></tr>`).join('')}</tbody></table></div>`;
  const productFilterShell=$('.product-filter-shell',c); if(productFilterShell && isMobileViewport()) productFilterShell.removeAttribute('open');
  $('#productSearch').oninput=e=>{ const pos=e.target.selectionStart||e.target.value.length; state.productSearch=e.target.value; renderProductos($('#content')); focusAfterRender('productSearch',pos);};
  $$('[data-prod-filter]').forEach(b=>b.onclick=()=>{state.productFilter=b.dataset.prodFilter; renderProductos($('#content'));});
  $('#productCategoryFilter').onchange=e=>{state.productCategoryFilter=e.target.value; renderProductos($('#content'));};
  $('#productUnitFilter').onchange=e=>{state.productUnitFilter=e.target.value; renderProductos($('#content'));};
  $('#productWeightFilter').onchange=e=>{state.productWeightFilter=e.target.value; renderProductos($('#content'));};
  $('#newProduct').onclick=()=>openProductForm(); $('#tplProductos').onclick=()=>downloadProductoTemplate(); $('#exportProductos').onclick=()=>exportProductos(rows); $('#importProductos').onchange=e=>importProductos(e.target.files[0]);
  $$('[data-prod-edit]').forEach(b=>b.onclick=()=>openProductForm(state.productos.find(x=>String(x.id)===String(b.dataset.prodEdit))));
  $$('[data-prod-actions]').forEach(b=>b.onclick=()=>openProductActions(state.productos.find(x=>String(x.id)===String(b.dataset.prodActions))));
}


function operationalAlerts(){
  const rows=[];
  const orders=(state.ordenes||[]).filter(o=>o.estado!=='Anulado');
  const levelRank={bad:3,warn:2,info:1,ok:0};
  orders.forEach(o=>{
    const client=orderClientName(o);
    const code=o.codigo||('ORD-'+o.id);
    if(isLateDispatch(o) && !isOrderInProcess(o)){
      rows.push({level:'bad',tipo:'Programación',titulo:'Pedido programado atrasado',detalle:`${code} · ${client} · despacho ${shortDate(dispatchDateOf(o))}`,orden:o,modulo:'ordenes'});
    }
    const st=currentModuleOfOrder(o);
    if(st){
      const start=stageEntryAt(o,st);
      const mins=start?minutesSince(start):0;
      const cls=stageTimerClass(mins||0,st);
      if(cls==='bad' || cls==='warn'){
        rows.push({level:cls,tipo:'Tiempo por etapa',titulo:`${stageLabel(st)} con tiempo elevado`,detalle:`${code} · ${client} · ${stageLabel(st)} ${elapsedTextSince(start)} · Total ${elapsedTextSince(createdAtOf(o))}`,orden:o,modulo:st});
      }
    }
    if(o.tomado_por && o.estado==='En preparación'){
      const mins=o.tomado_en?minutesSince(o.tomado_en):0;
      if((mins||0)>=45){
        rows.push({level:'warn',tipo:'Cola de carnicería',titulo:'Orden tomada hace mucho tiempo',detalle:`${code} · ${client} · tomada por ${workerDisplayName(o.tomado_por)} hace ${elapsedTextSince(o.tomado_en)}`,orden:o,modulo:'carniceria'});
      }
    }
  });
  const productosMal=(state.productos||[]).filter(p=>p.activo!==false && productConfigIssues(p).length);
  productosMal.slice(0,20).forEach(p=>rows.push({level:'warn',tipo:'Catálogo',titulo:'Producto necesita configuración de peso',detalle:`${p.codigo||''} · ${p.nombre||'Producto'} · unidad peso fijo requiere peso estándar y no fraccionado`,producto:p,modulo:'productos'}));
  const f=today();
  const agenda=controlScheduledClientsForDate(f);
  const gestionados=commercialManagedClientIdsForDate(f);
  const pendientes=agenda.filter(c=>!gestionados.has(Number(c.id)));
  if(pendientes.length){ rows.push({level:'info',tipo:'Agenda',titulo:'Clientes pendientes de gestión hoy',detalle:`${pendientes.length} cliente(s) pendientes en agenda de ${shortDate(f)}`,modulo:'control'}); }
  const porLiquidar=orders.filter(o=>['Entregado','Entregado a crédito'].includes(o.estado||''));
  if(porLiquidar.length){ rows.push({level:'warn',tipo:'Liquidación',titulo:'Pedidos pendientes de liquidar',detalle:`${porLiquidar.length} pedido(s) requieren cierre de dinero/CXC`,modulo:'liquidacion'}); }
  return rows.sort((a,b)=>(levelRank[b.level]||0)-(levelRank[a.level]||0));
}
function alertLevelLabel(x){ return {todos:'Todas',bad:'Críticas',warn:'Advertencias',info:'Informativas',ok:'Estables'}[x]||x; }
function alertCard(a){
  const cls=a.level||'info';
  const go=a.modulo||'ordenes';
  return `<div class="alert-card ${cls}"><div><div class="alert-top"><span class="badge ${cls}">${esc(a.tipo||'Alerta')}</span><b>${esc(a.titulo||'Alerta')}</b></div><p>${esc(a.detalle||'')}</p>${a.orden?`<div class="badges">${orderTypeBadge(a.orden)}${orderStatusBadgeHtml(a.orden)}${scheduleBadge(a.orden)}${currentStageClockBadge(a.orden)}${orderTakenByBadge(a.orden)}<span class="badge">${money(orderAmount(a.orden))}</span></div>`:''}</div><div class="card-actions">${a.orden?`<button class="btn small gray" data-oper-order="${a.orden.id}">Ver orden</button>`:''}${a.producto?`<button class="btn small gray" data-prod-edit="${a.producto.id}">Configurar</button>`:''}<button class="btn small" data-go="${go}">Ir al módulo</button></div></div>`;
}
function renderAlertas(c){
  const q=state.alertSearch||'';
  const level=state.alertLevel||'todos';
  const all=operationalAlerts();
  const rows=all.filter(a=>(level==='todos'||a.level===level) && (!q || norm([a.tipo,a.titulo,a.detalle,a.orden?.codigo,a.orden?.cliente?.negocio,a.producto?.nombre].join(' ')).includes(norm(q))));
  const counts={bad:all.filter(a=>a.level==='bad').length,warn:all.filter(a=>a.level==='warn').length,info:all.filter(a=>a.level==='info').length};
  c.innerHTML=`<div class="executive-hero alert-hero"><div><div class="hero-eyebrow">V9.3.0 R3 · Centro de alertas</div><h3>Prioridades operativas del día</h3><p>Unifica atrasos, órdenes detenidas, productos mal configurados, pendientes de agenda y liquidaciones para actuar rápido.</p></div><div class="hero-actions"><button class="btn" data-go="kanban">Ver Kanban</button><button class="btn gray" data-go="ordenes">Órdenes</button><button class="btn dark" id="refreshAlerts">Actualizar</button></div></div>
  <div class="exec-kpi-grid alert-kpis"><div class="exec-kpi danger"><span>Críticas</span><strong>${counts.bad}</strong><small>Bloquean o atrasan la operación</small></div><div class="exec-kpi warn"><span>Advertencias</span><strong>${counts.warn}</strong><small>Requieren revisión</small></div><div class="exec-kpi"><span>Informativas</span><strong>${counts.info}</strong><small>Seguimiento operativo</small></div><div class="exec-kpi"><span>Total alertas</span><strong>${all.length}</strong><small>${rows.length} visibles con filtros</small></div></div>
  <div class="panel"><div class="panel-head"><div><h3>Alertas y tareas de atención</h3><p>Filtra por nivel y busca por cliente, orden, producto o módulo.</p></div></div><div class="alert-toolbar"><input id="alertSearch" value="${esc(q)}" placeholder="Buscar alerta, cliente, orden o producto..."><div class="tabs mini-tabs">${['todos','bad','warn','info'].map(x=>`<button class="tab ${level===x?'active':''}" data-alert-level="${x}">${alertLevelLabel(x)}</button>`).join('')}</div></div><div class="alert-list">${rows.map(alertCard).join('')||'<div class="empty">No hay alertas con esos filtros.</div>'}</div></div>`;
  $('#alertSearch').oninput=e=>{const pos=e.target.selectionStart||e.target.value.length; state.alertSearch=e.target.value; renderAlertas($('#content')); focusAfterRender('alertSearch',pos);};
  $$('[data-alert-level]').forEach(b=>b.onclick=()=>{state.alertLevel=b.dataset.alertLevel; renderAlertas($('#content'));});
  $('#refreshAlerts').onclick=async()=>{await liveRefresh('manual'); renderAlertas($('#content'));};
  $$('[data-go]').forEach(b=>b.onclick=()=>{state.page=b.dataset.go; render();});
  bindDynamic();
}
function kanbanStageOf(o){
  if(o.estado==='Anulado') return 'anuladas';
  if(isFutureDispatch(o)) return 'programadas';
  const st=effectiveOrderState(o)||o.estado||'';
  if(['Cobrado','Entregado a crédito','No entregado','Devuelto parcial','Cerrado','Entregado','Entregada en negocio'].includes(st)) return 'cerradas';
  if(st==='Lista para retiro') return 'retiros';
  if(['En ruta','Asignada a delivery'].includes(st)) return 'delivery';
  if(['Facturada','Validada para delivery'].includes(st) || (!orderRequiresPrep(o) && orderRequiresDelivery(o) && st==='Pedido recibido')) return 'validacion';
  if(['Lista para facturar','Impresa para facturar'].includes(st)) return orderRequiresInvoice(o)?'facturacion':'validacion';
  if(['En preparación'].includes(st)) return 'carniceria';
  return 'recibido';
}
function kanbanClosedTime(o){
  return closedAtOf(o) || o?.recibido_en || o?.actualizado_en || o?.updated_at || o?.creado_en || o?.created_at || o?.fecha || null;
}
function kanbanClosedTimestamp(o){
  const d=parseDateTime(kanbanClosedTime(o));
  return d ? d.getTime() : 0;
}
function kanbanClosedStatus(o){ return effectiveOrderState(o)||o?.estado||'Cerrada'; }
function kanbanClosedPeriodMatch(o,period='todos',from='',to=''){
  const raw=kanbanClosedTime(o); const d=parseDateTime(raw); if(!d) return period==='todos' && !from && !to;
  const date=localIsoDate(d);
  if(from && date<from) return false;
  if(to && date>to) return false;
  if(from || to) return true;
  if(period==='hoy') return date===today();
  if(period==='7dias'){
    const min=new Date(); min.setHours(0,0,0,0); min.setDate(min.getDate()-6);
    return d>=min;
  }
  if(period==='mes') return date.slice(0,7)===today().slice(0,7);
  return true;
}
function kanbanCard(o){
  const st=currentModuleOfOrder(o);
  return `<div class="kanban-card ${newOrderClass(o,st||'ordenes')}" data-oper-order="${o.id}"><div class="kanban-title">${esc(o.codigo||('ORD-'+o.id))}</div><div class="kanban-client">${esc(orderClientName(o))}</div><div class="kanban-sub">Despacho: ${shortDate(dispatchDateOf(o))} · ${money(orderAmount(o))}</div><div class="badges">${newOrderBadge(o,st||'ordenes')}${orderCustomerBadge(o)}${orderDeliveryModeBadge(o)}${orderTypeBadge(o)}${specialCaseBadge(o)}${orderStatusBadgeHtml(o)}${scheduleBadge(o)}${totalOrderClockBadge(o)}${currentStageClockBadge(o)}${orderTakenByBadge(o)}</div><div class="mini-items">${orderItemsText(o,3)}</div></div>`;
}
function kanbanClosedCard(o){
  const closed=kanbanClosedTime(o);
  return `<div class="kanban-card closed-compact" data-oper-order="${o.id}"><div class="kanban-card-top"><div><div class="kanban-title">${esc(o.codigo||('ORD-'+o.id))}</div><div class="kanban-client">${esc(orderClientName(o))}</div></div><span class="kanban-view-hint">Ver</span></div><div class="kanban-sub">${closed?`Cerrada: ${new Date(closed).toLocaleString('es-DO',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}`:'Cierre sin fecha'} · ${money(orderAmount(o))}</div><div class="badges">${orderStatusBadgeHtml(o)}${totalOrderClockBadge(o)}</div></div>`;
}
function refreshKanbanPreserveScroll(){
  const old=$('.kanban-board'); const left=old?.scrollLeft||0;
  renderKanban($('#content'));
  requestAnimationFrame(()=>{ const board=$('.kanban-board'); if(board) board.scrollLeft=left; });
}
function kanbanClosedHistoryRows(){
  const q=norm(state.kanbanHistorySearch||'');
  const period=state.kanbanHistoryPeriod||'todos';
  const status=state.kanbanHistoryStatus||'Todos';
  return (state.ordenes||[])
    .filter(o=>o.estado!=='Anulado' && kanbanStageOf(o)==='cerradas')
    .filter(o=>status==='Todos' || kanbanClosedStatus(o)===status)
    .filter(o=>kanbanClosedPeriodMatch(o,period,state.kanbanHistoryFrom,state.kanbanHistoryTo))
    .filter(o=>!q || norm([o.codigo,orderClientName(o),o.factura_no,o.delivery_nombre,kanbanClosedStatus(o),orderItemsText(o,15)].join(' ')).includes(q))
    .sort((a,b)=>kanbanClosedTimestamp(b)-kanbanClosedTimestamp(a));
}
function renderKanbanClosedHistory(m){
  const body=$('.modal-body',m); if(!body) return;
  const rows=kanbanClosedHistoryRows();
  const size=[25,50].includes(Number(state.kanbanHistoryPageSize))?Number(state.kanbanHistoryPageSize):25;
  const pages=Math.max(1,Math.ceil(rows.length/size));
  state.kanbanHistoryPage=Math.max(0,Math.min(Number(state.kanbanHistoryPage)||0,pages-1));
  const fromIndex=state.kanbanHistoryPage*size;
  const visible=rows.slice(fromIndex,fromIndex+size);
  const statuses=['Todos',...Array.from(new Set((state.ordenes||[]).filter(o=>o.estado!=='Anulado'&&kanbanStageOf(o)==='cerradas').map(kanbanClosedStatus))).sort()];
  const totals=rows.reduce((a,o)=>{a.amount+=Number(orderAmount(o)||0);a.cash+=Number(o.monto_cobrado||0);a.credit+=Number(o.monto_pendiente||0);return a;},{amount:0,cash:0,credit:0});
  body.innerHTML=`<div class="kanban-history-toolbar"><div class="field history-search"><label>Buscar</label><input id="kanbanHistorySearch" value="${esc(state.kanbanHistorySearch||'')}" placeholder="Orden, cliente, factura, delivery o producto..."></div><div class="field"><label>Estado final</label><select id="kanbanHistoryStatus">${statuses.map(x=>`<option ${x===state.kanbanHistoryStatus?'selected':''}>${esc(x)}</option>`).join('')}</select></div><div class="field"><label>Desde</label><input id="kanbanHistoryFrom" type="date" value="${esc(state.kanbanHistoryFrom||'')}"></div><div class="field"><label>Hasta</label><input id="kanbanHistoryTo" type="date" value="${esc(state.kanbanHistoryTo||'')}"></div></div>
  <div class="kanban-history-quick">${[['hoy','Hoy'],['7dias','7 días'],['mes','Este mes'],['todos','Todos']].map(([id,label])=>`<button class="btn small ${state.kanbanHistoryPeriod===id&&!state.kanbanHistoryFrom&&!state.kanbanHistoryTo?'':'gray'}" data-kanban-history-period="${id}">${label}</button>`).join('')}<button class="btn small dark" id="kanbanHistoryClear">Limpiar filtros</button></div>
  <div class="grid4 compact-kpis kanban-history-kpis"><div class="card kpi"><div class="label">Órdenes cerradas</div><div class="value">${rows.length}</div></div><div class="card kpi"><div class="label">Monto facturado</div><div class="value">${money(totals.amount)}</div></div><div class="card kpi"><div class="label">Efectivo registrado</div><div class="value">${money(totals.cash)}</div></div><div class="card kpi"><div class="label">Crédito pendiente</div><div class="value">${money(totals.credit)}</div></div></div>
  <div class="kanban-history-table"><div class="kanban-history-head"><span>Orden / cliente</span><span>Estado</span><span>Cierre</span><span>Total</span><span>Acción</span></div>${visible.map(o=>`<div class="kanban-history-row"><div><b>${esc(o.codigo||('ORD-'+o.id))}</b><small>${esc(orderClientName(o))}${o.factura_no?` · Factura ${esc(o.factura_no)}`:''}${o.delivery_nombre?` · ${esc(o.delivery_nombre)}`:''}</small></div><div>${orderStatusBadgeHtml(o)}</div><div><b>${kanbanClosedTime(o)?new Date(kanbanClosedTime(o)).toLocaleDateString('es-DO'):'—'}</b><small>${kanbanClosedTime(o)?new Date(kanbanClosedTime(o)).toLocaleTimeString('es-DO',{hour:'2-digit',minute:'2-digit'}):''}</small></div><div><b>${money(orderAmount(o))}</b></div><div><button class="btn small gray" data-oper-order="${o.id}">Ver</button></div></div>`).join('')||'<div class="empty">No hay órdenes cerradas con estos filtros.</div>'}</div>
  <div class="kanban-history-pagination"><div>Mostrando ${rows.length?fromIndex+1:0}–${Math.min(fromIndex+size,rows.length)} de ${rows.length}</div><div class="pager-actions"><label>Por página <select id="kanbanHistoryPageSize"><option ${size===25?'selected':''}>25</option><option ${size===50?'selected':''}>50</option></select></label><button class="btn small gray" id="kanbanHistoryPrev" ${state.kanbanHistoryPage<=0?'disabled':''}>Anterior</button><span>Página ${state.kanbanHistoryPage+1} de ${pages}</span><button class="btn small gray" id="kanbanHistoryNext" ${state.kanbanHistoryPage>=pages-1?'disabled':''}>Siguiente</button></div></div>`;
  const search=$('#kanbanHistorySearch',m); search.oninput=e=>{const pos=e.target.selectionStart||e.target.value.length;state.kanbanHistorySearch=e.target.value;state.kanbanHistoryPage=0;renderKanbanClosedHistory(m);requestAnimationFrame(()=>{const n=$('#kanbanHistorySearch',m);n?.focus();n?.setSelectionRange(pos,pos);});};
  $('#kanbanHistoryStatus',m).onchange=e=>{state.kanbanHistoryStatus=e.target.value;state.kanbanHistoryPage=0;renderKanbanClosedHistory(m);};
  $('#kanbanHistoryFrom',m).onchange=e=>{state.kanbanHistoryFrom=e.target.value;state.kanbanHistoryPeriod='todos';state.kanbanHistoryPage=0;renderKanbanClosedHistory(m);};
  $('#kanbanHistoryTo',m).onchange=e=>{state.kanbanHistoryTo=e.target.value;state.kanbanHistoryPeriod='todos';state.kanbanHistoryPage=0;renderKanbanClosedHistory(m);};
  $$('[data-kanban-history-period]',m).forEach(b=>b.onclick=()=>{state.kanbanHistoryPeriod=b.dataset.kanbanHistoryPeriod;state.kanbanHistoryFrom='';state.kanbanHistoryTo='';state.kanbanHistoryPage=0;renderKanbanClosedHistory(m);});
  $('#kanbanHistoryClear',m).onclick=()=>{state.kanbanHistorySearch='';state.kanbanHistoryStatus='Todos';state.kanbanHistoryPeriod='todos';state.kanbanHistoryFrom='';state.kanbanHistoryTo='';state.kanbanHistoryPage=0;renderKanbanClosedHistory(m);};
  $('#kanbanHistoryPageSize',m).onchange=e=>{state.kanbanHistoryPageSize=Number(e.target.value)||25;state.kanbanHistoryPage=0;renderKanbanClosedHistory(m);};
  $('#kanbanHistoryPrev',m).onclick=()=>{state.kanbanHistoryPage=Math.max(0,state.kanbanHistoryPage-1);renderKanbanClosedHistory(m);};
  $('#kanbanHistoryNext',m).onclick=()=>{state.kanbanHistoryPage=Math.min(pages-1,state.kanbanHistoryPage+1);renderKanbanClosedHistory(m);};
  bindDynamic();
}
function openKanbanClosedHistory(){
  state.kanbanHistoryPage=0;
  const m=openModal('Historial de órdenes cerradas','<div class="empty">Preparando historial...</div>','Consulta paginada, filtros y acceso a la trazabilidad completa.');
  m.classList.add('kanban-history-modal');
  renderKanbanClosedHistory(m);
}
function renderKanban(c){
  const q=state.kanbanSearch||'';
  const orders=(state.ordenes||[]).filter(o=>o.estado!=='Anulado' && (!q || norm([o.codigo,orderClientName(o),o.cliente?.telefono,o.cliente?.sector,orderItemsText(o,10),o.estado].join(' ')).includes(norm(q))));
  const cols=[['programadas','Programadas','Pedidos futuros'],['recibido','Pedido recibido','Listas para tomar'],['carniceria','Carnicería','En preparación'],['facturacion','Facturación','Listas para facturar'],['validacion','Validación','Facturadas para delivery'],['retiros','Retiros','Listas para retirar'],['delivery','Delivery','Asignadas/en ruta'],['liquidacion','Liquidación','Pendientes de cierre'],['cerradas','Cerradas','Completadas o crédito']];
  const grouped={}; cols.forEach(([id])=>grouped[id]=[]); orders.forEach(o=>{ const k=kanbanStageOf(o); if(grouped[k]) grouped[k].push(o); });
  Object.keys(grouped).forEach(k=>grouped[k].sort((a,b)=>k==='cerradas'?kanbanClosedTimestamp(b)-kanbanClosedTimestamp(a):(()=>{ const sa=currentModuleOfOrder(a), sb=currentModuleOfOrder(b); const ma=sa?stageDurationFor(a,sa):minutesSince(createdAtOf(a)); const mb=sb?stageDurationFor(b,sb):minutesSince(createdAtOf(b)); return (mb||0)-(ma||0); })()));
  const closedTotal=grouped.cerradas.length;
  state.kanbanClosedLimit=Math.max(10,Number(state.kanbanClosedLimit)||10);
  const closedVisible=grouped.cerradas.slice(0,state.kanbanClosedLimit);
  const activeTotal=orders.filter(o=>kanbanStageOf(o)!=='cerradas').length;
  const closedToday=grouped.cerradas.filter(o=>kanbanClosedPeriodMatch(o,'hoy')).length;
  const mobileStages=cols.filter(([id])=>id!=='programadas' || grouped[id].length>0);
  if(!mobileStages.some(([id])=>id===state.kanbanMobileStage)) state.kanbanMobileStage=mobileStages[0]?.[0]||'recibido';
  const mobileStageTabs=`<div class="kanban-mobile-tabs">${mobileStages.map(([id,title])=>`<button type="button" data-kanban-mobile-stage="${id}" class="${state.kanbanMobileStage===id?'active':''}"><span>${esc(title)}</span><em>${grouped[id].length}</em></button>`).join('')}</div>`;
  const colsHtml=cols.map(([id,title,sub])=>{
    const mobileActive=state.kanbanMobileStage===id?'mobile-active':'';
    if(id!=='cerradas') return `<section class="kanban-col ${mobileActive}" data-kanban-col="${id}"><header><div><b>${esc(title)}</b><span>${esc(sub)}</span></div><em>${grouped[id].length}</em></header><div class="kanban-list">${grouped[id].slice(0,40).map(kanbanCard).join('')||'<div class="kanban-empty">Sin órdenes</div>'}</div></section>`;
    const hidden=state.kanbanClosedHidden;
    return `<section class="kanban-col kanban-closed-col ${mobileActive} ${hidden?'closed-collapsed':''}" data-kanban-col="cerradas"><header><div><b>${esc(title)}</b><span>${esc(sub)} · ${hidden?'ocultas':`mostrando ${Math.min(closedVisible.length,closedTotal)} de ${closedTotal}`}</span></div><div class="kanban-header-actions"><em>${closedTotal}</em><button class="icon-btn" data-kanban-closed-toggle title="${hidden?'Mostrar cerradas':'Ocultar cerradas'}">${hidden?'＋':'−'}</button></div></header>${hidden?`<div class="kanban-closed-collapsed"><strong>${closedTotal}</strong><span>órdenes cerradas</span><button class="btn small gray" data-kanban-closed-history>Ver historial</button></div>`:`<div class="kanban-list kanban-closed-list">${closedVisible.map(kanbanClosedCard).join('')||'<div class="kanban-empty">Sin órdenes</div>'}</div><div class="kanban-closed-footer">${closedVisible.length<closedTotal?`<button class="btn small gray" data-kanban-closed-more>Mostrar 10 más</button>`:closedTotal>10?'<button class="btn small gray" data-kanban-closed-reset>Mostrar solo 10</button>':''}<button class="btn small dark" data-kanban-closed-history>Historial completo</button></div>`}</section>`;
  }).join('');
  c.innerHTML=`<div class="executive-hero kanban-hero"><div><div class="hero-eyebrow">V9.3.0 · Tablero Kanban</div><h3>Flujo completo de órdenes</h3><p>Visualiza dónde está cada pedido, quién lo tiene y cuánto tiempo lleva en su etapa actual.</p></div><div class="hero-actions"><button class="btn" data-go="alertas">Centro de alertas</button><button class="btn gray" data-go="ordenes">Lista de órdenes</button><button class="btn dark" data-kanban-closed-history>Historial cerradas</button></div></div><div class="kanban-kpi-grid"><div class="kanban-kpi"><span>Órdenes activas</span><strong>${activeTotal}</strong><small>Requieren seguimiento</small></div><div class="kanban-kpi"><span>En preparación</span><strong>${grouped.carniceria.length}</strong><small>Carnicería</small></div><div class="kanban-kpi"><span>Retiros pendientes</span><strong>${grouped.retiros.length}</strong><small>En el negocio</small></div><div class="kanban-kpi"><span>En ruta</span><strong>${grouped.delivery.length}</strong><small>Delivery asignado</small></div><div class="kanban-kpi"><span>Cerradas hoy</span><strong>${closedToday}</strong><small>${closedTotal} en historial visible</small></div></div><div class="panel"><div class="panel-head"><div><h3>Tablero operativo</h3><p>${orders.length} orden(es) visibles. Cada columna tiene desplazamiento interno; los cambios reales se hacen con los botones de cada módulo.</p></div></div><div class="searchbar"><input id="kanbanSearch" value="${esc(q)}" placeholder="Buscar orden, cliente, producto, teléfono o estado..."></div>${mobileStageTabs}<div class="kanban-board">${colsHtml}</div></div>`;
  $('#kanbanSearch').oninput=e=>{ const pos=e.target.selectionStart||e.target.value.length; state.kanbanSearch=e.target.value; renderKanban($('#content')); focusAfterRender('kanbanSearch',pos); };
  $$('[data-go]').forEach(b=>b.onclick=()=>{state.page=b.dataset.go; render();});
  $$('[data-kanban-mobile-stage]').forEach(b=>b.onclick=()=>{state.kanbanMobileStage=b.dataset.kanbanMobileStage;renderKanban($('#content'));});
  $$('[data-kanban-closed-history]').forEach(b=>b.onclick=e=>{e.preventDefault();e.stopPropagation();openKanbanClosedHistory();});
  $$('[data-kanban-closed-toggle]').forEach(b=>b.onclick=e=>{e.preventDefault();e.stopPropagation();state.kanbanClosedHidden=!state.kanbanClosedHidden;refreshKanbanPreserveScroll();});
  $$('[data-kanban-closed-more]').forEach(b=>b.onclick=e=>{e.preventDefault();e.stopPropagation();state.kanbanClosedLimit=Math.min(closedTotal,state.kanbanClosedLimit+10);refreshKanbanPreserveScroll();});
  $$('[data-kanban-closed-reset]').forEach(b=>b.onclick=e=>{e.preventDefault();e.stopPropagation();state.kanbanClosedLimit=10;refreshKanbanPreserveScroll();});
  bindDynamic();
}


function employeeAreas(){ return ['Carnicería','Facturación','Validación','Delivery','Liquidación','CXC','Vendedor','Control','Gerencia','Supervisor','Administración']; }
function splitEmployeeAreas(v){
  if(Array.isArray(v)) return v.map(x=>String(x||'').trim()).filter(Boolean);
  return String(v||'').split(/[,+/|;]+/).map(x=>x.trim()).filter(Boolean);
}
function employeeOperationalAreas(e){
  const values=[e?.area,...splitEmployeeAreas(e?.areas_adicionales)];
  const seen=new Set();
  return values.filter(x=>{const key=norm(x);if(!key||seen.has(key))return false;seen.add(key);return true;});
}
function employeeHasArea(e, area){ if(!area) return true; const a=norm(area); return employeeOperationalAreas(e).some(x=>norm(x)===a); }
function activeEmployees(area=''){ return (state.empleados||[]).filter(e=>e.activo!==false && employeeHasArea(e,area)); }
function employeeNameExists(name){ const n=norm(name||''); return !!activeEmployees('').find(e=>norm(e.nombre)===n); }
function employeeOptionsForArea(area='', selected='', opts={}){
  const config={fallbackAll:false, placeholder:'Selecciona', includeManual:true, ...opts};
  const sel=String(selected||'').trim();
  let list=activeEmployees(area);
  if((!list.length || config.fallbackAll) && config.fallbackAll){
    const byName=new Map();
    activeEmployees('').forEach(e=>{ if(e?.nombre) byName.set(norm(e.nombre), e); });
    list=Array.from(byName.values());
  }
  const canonical=canonicalEmployeeName(sel, area) || sel;
  const hasSelected=canonical && list.some(e=>norm(e.nombre)===norm(canonical));
  const options=[`<option value="">${esc(config.placeholder||'Selecciona')}</option>`];
  if(canonical && !hasSelected && canonical!=='__manual__') options.push(`<option selected>${esc(canonical)}</option>`);
  options.push(...list.map(e=>`<option ${norm(e.nombre)===norm(canonical)?'selected':''}>${esc(e.nombre)}</option>`));
  if(config.includeManual!==false) options.push(`<option value="__manual__" ${sel==='__manual__'?'selected':''}>Otro / manual</option>`);
  return options.join('');
}

function preferredEmployeeName(names){
  const arr=Array.isArray(names)?names:[names];
  for(const n of arr){ const e=activeEmployees('').find(x=>norm(x.nombre)===norm(n)); if(e) return e.nombre; }
  return activeEmployees('').find(e=>employeeHasArea(e,'Vendedor'))?.nombre || activeEmployees('').find(e=>norm(e.nombre).includes('cesar'))?.nombre || '';
}
function legacyVendorName(name){ return ['chiqui','carlito','cesar','césar','papilo'].includes(norm(name||'')); }
function canonicalEmployeeName(name, desiredArea=''){
  const raw=String(name||'').trim();
  if(!raw) return '';
  if(legacyVendorName(raw) && (!desiredArea || desiredArea==='Vendedor')){
    return preferredEmployeeName(['César Martínez','Cesar Martinez','Cesar Martínez']) || raw;
  }
  const exact=activeEmployees('').find(e=>norm(e.nombre)===norm(raw));
  if(exact) return exact.nombre;
  const byArea=activeEmployees(desiredArea).find(e=>norm(e.nombre)===norm(raw));
  if(byArea) return byArea.nombre;
  return '';
}
function vendorSelect(selected=''){
  return employeeOptionsForArea('Vendedor', selected, {fallbackAll:true, placeholder:'Selecciona vendedor'});
}
function deliveryEmployeeNames(){
  const fromEmp=activeEmployees('Delivery').map(e=>e.nombre).filter(Boolean);
  if(fromEmp.length) return Array.from(new Set(fromEmp));
  return Array.from(new Set((state.deliverys||[]).filter(d=>d.activo!==false).map(d=>d.nombre).filter(Boolean)));
}
function normalizeLegacyVendorInRows(){
  return preferredEmployeeName(['César Martínez','Cesar Martinez','Cesar Martínez']) || 'Cesar Martinez';
}

function defaultIncentiveConfig(){
  return {
    delivery:{activo:true,tipo:'monto_fijo',base:'cliente_entregado',valor:3,cuentaCredito:true,cuentaDevueltoParcial:false},
    despachador:{activo:true,tipo:'monto_fijo',base:'cliente_despachado',valor:3,cuentaSoloValidadas:true},
    vendedor:{activo:true,tipo:'porcentaje',base:'ventas_cobradas',valor:1,cuentaCredito:false},
    extras:{mostrarAlertas:true,redondear:'normal'}
  };
}
function incentiveConfig(){
  const base=defaultIncentiveConfig();
  const cfg=(state.systemConfig&&state.systemConfig.incentivos)||{};
  return {
    delivery:{...base.delivery,...(cfg.delivery||{})},
    despachador:{...base.despachador,...(cfg.despachador||{})},
    vendedor:{...base.vendedor,...(cfg.vendedor||{})},
    extras:{...base.extras,...(cfg.extras||{})}
  };
}
function monthOptions(){return ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];}
function productDateInMonth(v, month, year){ const d=safeDateObj(v||today()); return d && (d.getMonth()+1)===Number(month) && d.getFullYear()===Number(year); }
function incentiveBaseLabel(base){ return ({cliente_entregado:'Cliente entregado',cliente_despachado:'Cliente despachado',lote_viaje:'Lote / viaje',orden:'Orden',ventas_facturadas:'Ventas facturadas',ventas_cobradas:'Ventas cobradas'}[base]||base); }
function incentiveTypeLabel(tipo){ return tipo==='porcentaje'?'Porcentaje':'Monto fijo'; }
function calcIncentiveValue(cfg, qty, amount){
  const val=Number(cfg.valor||0);
  if(cfg.tipo==='porcentaje') return (Number(amount||0)*val)/100;
  return Number(qty||0)*val;
}
function employeeRoleOfName(name){
  const n=norm(name||'');
  const e=(state.empleados||[]).find(x=>norm(x.nombre)===n || norm(x.correo||x.email||x.usuario||'')===n);
  return e?.area || e?.rol || e?.cargo || '';
}
function pushProd(map, key, patch){
  if(!key) key='Sin responsable';
  if(!map[key]) map[key]={empleado:key,rol:patch.rol||employeeRoleOfName(key)||'Operativo',clientes:0,lotes:0,ordenes:0,montoFacturado:0,montoCobrado:0,credito:0,noEntregado:0,diferencias:0,baseTexto:'',valorBase:0,incentivo:0,alertas:[]};
  const r=map[key]; Object.keys(patch).forEach(k=>{ if(k==='alertas') r.alertas.push(...patch[k]); else if(typeof patch[k]==='number') r[k]=(Number(r[k]||0)+patch[k]); else if(patch[k]!==undefined && patch[k]!==null) r[k]=patch[k]; });
  return r;
}
function productivityRows(month=state.prodMonth, year=state.prodYear){
  const cfg=incentiveConfig();
  const by={};
  const deliveredOk=['Cobrado','Entregado','Entregado a crédito'];
  if(cfg.delivery.cuentaDevueltoParcial) deliveredOk.push('Devuelto parcial');
  const lotes=(state.entregaLotes||[]).filter(l=>String(l.estado||'').toLowerCase()!=='revertido' && productDateInMonth(l.fecha_entrega||l.creado_en,month,year));
  const lotesByCode=Object.fromEntries(lotes.map(l=>[String(l.codigo_lote||''),l]));
  const employeesIndex=Object.fromEntries(activeEmployees('').map(e=>[norm(e.nombre),e]));
  (state.entregaLoteDetalle||[]).forEach(d=>{
    const lot=lotesByCode[String(d.codigo_lote||'')]; if(!lot) return;
    const delivery=canonicalEmployeeName(lot.delivery_nombre||d.delivery_nombre,'Delivery');
    if(!delivery) return;
    const res=d.resultado_entrega || d.estado_liquidacion || '';
    const entregado=deliveredOk.includes(res) || (cfg.delivery.cuentaCredito && res==='Entregado a crédito');
    const cob=Number(d.monto_cobrado||0), cred=Number(d.monto_credito||0), mf=Number(d.monto_factura||0);
    pushProd(by,delivery,{rol:'Delivery',clientes:entregado?1:0,ordenes:1,montoFacturado:mf,montoCobrado:cob,credito:cred,noEntregado:res==='No entregado'?mf:0,alertas:res==='No entregado'?[`No entregado: ${d.codigo_orden||''}`]:[]});
  });
  lotes.forEach(l=>{ const delivery=canonicalEmployeeName(l.delivery_nombre,'Delivery'); if(delivery) pushProd(by,delivery,{rol:'Delivery',lotes:1}); });
  const orders=(state.ordenes||[]).filter(o=>o.estado!=='Anulado' && productDateInMonth(o.fecha_despacho||o.fecha||o.creado_en,month,year));
  orders.forEach(o=>{
    const prep=canonicalEmployeeName(preparedByDisplay(o),'Carnicería') || canonicalEmployeeName(preparedByDisplay(o),'Despachador');
    const validated=!!(o.validado_por || ['Validada para delivery','Asignada a delivery','En ruta','Cobrado','Entregado a crédito','No entregado','Devuelto parcial','Cerrado','Entregado'].includes(effectiveOrderState(o)||o.estado||''));
    if(prep && orderPreparationFinalized(o) && (!cfg.despachador.cuentaSoloValidadas || validated)) pushProd(by,prep,{rol:'Despachador',clientes:1,ordenes:1,montoFacturado:orderAmount(o)});
    const vendRaw=o.vendedor||o.vendedor_nombre||'';
    const vend=canonicalEmployeeName(vendRaw,'Vendedor');
    if(vend){
      const paid=['Cobrado','Entregado'].includes(effectiveOrderState(o)||o.estado||'');
      const amountFact=orderAmount(o);
      const cobros=(state.pagos||[]).filter(p=>Number(p.orden_id)===Number(o.id)).reduce((s,p)=>s+Number(p.monto||p.monto_cobrado||0),0);
      const amountCob=cfg.vendedor.base==='ventas_cobradas' ? (paid?amountFact:cobros) : amountFact;
      if(amountCob>0) pushProd(by,vend,{rol:'Vendedor',ordenes:1,montoFacturado:amountFact,montoCobrado:amountCob});
    }
  });
  Object.values(by).forEach(r=>{
    let c=null, qty=0, amt=0;
    if(r.rol==='Delivery'){ c=cfg.delivery; qty=c.base==='lote_viaje'?r.lotes:r.clientes; amt=r.montoCobrado; }
    else if(r.rol==='Despachador'){ c=cfg.despachador; qty=c.base==='orden'?r.ordenes:r.clientes; amt=r.montoFacturado; }
    else if(r.rol==='Vendedor'){ c=cfg.vendedor; qty=r.ordenes; amt=c.base==='ventas_facturadas'?r.montoFacturado:r.montoCobrado; }
    else { c={activo:false,tipo:'monto_fijo',base:'',valor:0}; }
    r.baseTexto=incentiveBaseLabel(c.base); r.valorBase=Number(c.valor||0); r.incentivo=c.activo?calcIncentiveValue(c,qty,amt):0;
    r.medida=qty; r.baseMonto=amt; r.tipoIncentivo=incentiveTypeLabel(c.tipo);
    const emp=employeesIndex[norm(r.empleado)];
    r.areaEmpleado=emp?.area||'';
  });
  return Object.values(by).sort((a,b)=>(b.incentivo||0)-(a.incentivo||0));
}
function renderProductividad(c){
  const month=state.prodMonth||String(new Date().getMonth()+1), year=state.prodYear||String(new Date().getFullYear()), role=state.prodRole||'Todos';
  const rowsAll=productivityRows(month,year);
  const rows=rowsAll.filter(r=>role==='Todos'||r.rol===role);
  const totalIncentivo=rows.reduce((s,r)=>s+Number(r.incentivo||0),0);
  const totalClientes=rows.reduce((s,r)=>s+Number(r.clientes||0),0);
  const totalCobrado=rows.reduce((s,r)=>s+Number(r.montoCobrado||0),0);
  const totalLotes=rows.reduce((s,r)=>s+Number(r.lotes||0),0);
  const years=Array.from(new Set([new Date().getFullYear(),...((state.ordenes||[]).map(o=>safeDateObj(o.fecha_despacho||o.fecha||o.creado_en)?.getFullYear()).filter(Boolean)),...((state.entregaLotes||[]).map(l=>safeDateObj(l.fecha_entrega||l.creado_en)?.getFullYear()).filter(Boolean))])).sort((a,b)=>b-a);
  c.innerHTML=`<div class="executive-hero productivity-hero"><div><div class="hero-eyebrow">V9.3.0 R3 · Productividad e incentivos</div><h3>Panel mensual por empleado activo</h3><p>Solo calcula empleados registrados en Configuración → Empleados. Los deliverys y vendedores también se crean desde esa misma sección.</p></div><div class="hero-actions"><button class="btn" data-go="config" data-config-go="incentivos">Configurar</button><button class="btn gray" data-go="config" data-config-go="empleados">Empleados</button><button class="btn gray" id="refreshProd">Actualizar</button><button class="btn dark" id="printProd">Imprimir</button></div></div>
  <div class="panel productivity-filter-panel"><div class="prod-filters"><div class="field"><label>Mes</label><select id="prodMonth">${monthOptions().map((m,i)=>`<option value="${i+1}" ${Number(month)===i+1?'selected':''}>${m}</option>`).join('')}</select></div><div class="field"><label>Año</label><select id="prodYear">${years.map(y=>`<option value="${y}" ${Number(year)===Number(y)?'selected':''}>${y}</option>`).join('')}</select></div><div class="field"><label>Rol productivo</label><select id="prodRole">${['Todos','Delivery','Despachador','Vendedor'].map(x=>`<option ${x===role?'selected':''}>${x}</option>`).join('')}</select></div></div></div>
  <div class="exec-kpi-grid productivity-kpis"><div class="exec-kpi primary"><span>Incentivo estimado</span><strong>${money(totalIncentivo)}</strong><small>${rows.length} empleado(s)</small></div><div class="exec-kpi"><span>Clientes contados</span><strong>${totalClientes}</strong><small>Entregados/despachados</small></div><div class="exec-kpi"><span>Viajes/lotes</span><strong>${totalLotes}</strong><small>Entregas creadas</small></div><div class="exec-kpi"><span>Cobrado vinculado</span><strong>${money(totalCobrado)}</strong><small>Según liquidación/pagos</small></div></div>
  <div class="panel panel-clean productivity-ranking-panel"><div class="panel-head"><div><h3>Ranking de productividad</h3><p>Resumen para validar antes de pagar incentivos.</p></div></div><div class="productivity-mobile-list">${rows.map(r=>`<article class="productivity-mobile-card"><div class="productivity-mobile-head"><div><h4>${esc(r.empleado)}</h4><p>${esc(r.areaEmpleado||employeeRoleOfName(r.empleado)||'Empleado activo')}</p></div><span class="badge info">${esc(r.rol)}</span></div><div class="productivity-mobile-metrics"><div><span>Base</span><b>${esc(r.baseTexto)}</b><small>${esc(r.tipoIncentivo)} · ${r.tipoIncentivo==='Porcentaje'?Number(r.valorBase||0)+'%':money(r.valorBase)}</small></div><div><span>Clientes</span><b>${r.clientes||0}</b><small>${r.lotes||0} viajes</small></div><div><span>Cobrado</span><b>${money(r.montoCobrado||0)}</b><small>Facturado ${money(r.montoFacturado||0)}</small></div><div class="primary"><span>Incentivo</span><b>${money(r.incentivo||0)}</b><small>${r.alertas?.length?r.alertas.length+' alertas':'Sin alertas'}</small></div></div></article>`).join('')||'<div class="empty">No hay productividad registrada para este período.</div>'}</div><div class="table-wrap productivity-table-wrap"><table class="table productivity-table"><thead><tr><th>Empleado</th><th>Rol productivo</th><th>Base</th><th>Clientes</th><th>Viajes</th><th>Facturado</th><th>Cobrado</th><th>Incentivo</th><th>Alertas</th></tr></thead><tbody>${rows.map(r=>`<tr><td><b>${esc(r.empleado)}</b><div class="hint">${esc(r.areaEmpleado||employeeRoleOfName(r.empleado)||'Empleado activo')}</div></td><td><span class="badge info">${esc(r.rol)}</span></td><td><b>${esc(r.baseTexto)}</b><div class="hint">${esc(r.tipoIncentivo)} · ${r.tipoIncentivo==='Porcentaje'?Number(r.valorBase||0)+'%':money(r.valorBase)}</div></td><td>${r.clientes||0}</td><td>${r.lotes||0}</td><td>${money(r.montoFacturado||0)}</td><td>${money(r.montoCobrado||0)}</td><td><b>${money(r.incentivo||0)}</b></td><td>${r.alertas?.length?`<span class="badge warn">${r.alertas.length}</span>`:'<span class="badge ok">OK</span>'}</td></tr>`).join('')||'<tr><td colspan="9">No hay productividad registrada para este período con empleados activos.</td></tr>'}</tbody></table></div></div>
  <div class="report-grid"><div class="panel panel-clean"><div class="panel-head"><div><h3>Detalle por rol</h3><p>Resumen operativo para validar antes de pagar incentivo.</p></div></div><div class="stage-report-grid">${['Delivery','Despachador','Vendedor'].map(r=>{const part=rowsAll.filter(x=>x.rol===r); return `<div class="stage-report"><b>${r}</b><strong>${money(part.reduce((s,x)=>s+Number(x.incentivo||0),0))}</strong><small>${part.length} empleado(s) · ${part.reduce((s,x)=>s+Number(x.clientes||0),0)} cliente(s)</small></div>`}).join('')}</div></div><div class="panel panel-clean"><div class="panel-head"><div><h3>Reglas activas</h3><p>Se toman de Configuración → Incentivos.</p></div></div>${productivityRulesHtml()}</div></div>`;
  $('#prodMonth').onchange=e=>{state.prodMonth=e.target.value; renderProductividad($('#content'));};
  $('#prodYear').onchange=e=>{state.prodYear=e.target.value; renderProductividad($('#content'));};
  $('#prodRole').onchange=e=>{state.prodRole=e.target.value; renderProductividad($('#content'));};
  $('#refreshProd').onclick=async()=>{ await refreshVisibleModuleV9384(); renderProductividad($('#content')); toast('Productividad actualizada'); };
  $('#printProd').onclick=()=>window.print();
  $$('[data-go="config"]').forEach(b=>b.onclick=()=>{state.page='config'; state.configTab=b.dataset.configGo||'incentivos'; render();});
}
function productivityRulesHtml(){
  const c=incentiveConfig();
  const row=(name,cfg)=>`<div class="kv"><b>${esc(name)}</b><span>${cfg.activo?'Activo':'Inactivo'} · ${esc(incentiveBaseLabel(cfg.base))} · ${cfg.tipo==='porcentaje'?Number(cfg.valor||0)+'%':money(cfg.valor||0)}</span></div>`;
  return `<div class="list">${row('Delivery',c.delivery)}${row('Despachador',c.despachador)}${row('Vendedor',c.vendedor)}</div>`;
}
function renderConfigIncentivos(c){
  const cfg=incentiveConfig();
  c.innerHTML=`<div class="panel-head"><div><h3>Incentivos / Productividad</h3><p>Configura cómo se calcula el incentivo mensual. Delivery y despacho se miden por cliente; el lote queda como opción alternativa.</p></div><span class="badge info">V9.3.9.0 PWA</span></div>
  <div class="config-incentive-grid"><div class="card incentive-card"><h3>Delivery</h3><div class="grid2"><div class="field"><label>Activo</label><select id="incDeliveryActivo"><option value="true" ${cfg.delivery.activo!==false?'selected':''}>Sí</option><option value="false" ${cfg.delivery.activo===false?'selected':''}>No</option></select></div><div class="field"><label>Tipo</label><select id="incDeliveryTipo"><option value="monto_fijo" ${cfg.delivery.tipo!=='porcentaje'?'selected':''}>Monto fijo</option><option value="porcentaje" ${cfg.delivery.tipo==='porcentaje'?'selected':''}>Porcentaje</option></select></div></div><div class="field"><label>Base de cálculo</label><select id="incDeliveryBase"><option value="cliente_entregado" ${cfg.delivery.base==='cliente_entregado'?'selected':''}>Por cliente entregado</option><option value="lote_viaje" ${cfg.delivery.base==='lote_viaje'?'selected':''}>Por lote / viaje</option><option value="orden" ${cfg.delivery.base==='orden'?'selected':''}>Por orden</option></select></div><div class="field"><label>Valor</label><input id="incDeliveryValor" type="number" step="0.01" value="${Number(cfg.delivery.valor||0)}"></div><label class="checkrow"><input id="incDeliveryCredito" type="checkbox" ${cfg.delivery.cuentaCredito!==false?'checked':''}> <b>Contar entregados a crédito</b><span>Cuenta el cliente como entregado aunque quede saldo pendiente.</span></label></div>
  <div class="card incentive-card"><h3>Despachador</h3><div class="grid2"><div class="field"><label>Activo</label><select id="incDespActivo"><option value="true" ${cfg.despachador.activo!==false?'selected':''}>Sí</option><option value="false" ${cfg.despachador.activo===false?'selected':''}>No</option></select></div><div class="field"><label>Tipo</label><select id="incDespTipo"><option value="monto_fijo" ${cfg.despachador.tipo!=='porcentaje'?'selected':''}>Monto fijo</option><option value="porcentaje" ${cfg.despachador.tipo==='porcentaje'?'selected':''}>Porcentaje</option></select></div></div><div class="field"><label>Base de cálculo</label><select id="incDespBase"><option value="cliente_despachado" ${cfg.despachador.base==='cliente_despachado'?'selected':''}>Por cliente despachado</option><option value="orden" ${cfg.despachador.base==='orden'?'selected':''}>Por orden</option></select></div><div class="field"><label>Valor</label><input id="incDespValor" type="number" step="0.01" value="${Number(cfg.despachador.valor||0)}"></div><label class="checkrow"><input id="incDespValidadas" type="checkbox" ${cfg.despachador.cuentaSoloValidadas!==false?'checked':''}> <b>Solo órdenes validadas</b><span>Evita pagar por pedidos preparados que no salieron a entrega.</span></label></div>
  <div class="card incentive-card"><h3>Vendedor</h3><div class="grid2"><div class="field"><label>Activo</label><select id="incVendActivo"><option value="true" ${cfg.vendedor.activo!==false?'selected':''}>Sí</option><option value="false" ${cfg.vendedor.activo===false?'selected':''}>No</option></select></div><div class="field"><label>Tipo</label><select id="incVendTipo"><option value="porcentaje" ${cfg.vendedor.tipo==='porcentaje'?'selected':''}>Porcentaje</option><option value="monto_fijo" ${cfg.vendedor.tipo!=='porcentaje'?'selected':''}>Monto fijo</option></select></div></div><div class="field"><label>Base de cálculo</label><select id="incVendBase"><option value="ventas_cobradas" ${cfg.vendedor.base==='ventas_cobradas'?'selected':''}>Sobre ventas cobradas</option><option value="ventas_facturadas" ${cfg.vendedor.base==='ventas_facturadas'?'selected':''}>Sobre ventas facturadas</option></select></div><div class="field"><label>Valor</label><input id="incVendValor" type="number" step="0.01" value="${Number(cfg.vendedor.valor||0)}"></div><div class="hint">Recomendación: calcular vendedores sobre ventas cobradas para no pagar comisiones de dinero pendiente.</div></div></div>
  <div class="actions"><button class="btn" id="saveIncentivos">Guardar configuración</button><button class="btn gray" id="resetIncentivos">Restaurar sugerida</button><button class="btn dark" data-go="productividad">Ver panel</button></div>`;
  const collect=()=>({delivery:{activo:$('#incDeliveryActivo').value==='true',tipo:$('#incDeliveryTipo').value,base:$('#incDeliveryBase').value,valor:+$('#incDeliveryValor').value||0,cuentaCredito:$('#incDeliveryCredito').checked},despachador:{activo:$('#incDespActivo').value==='true',tipo:$('#incDespTipo').value,base:$('#incDespBase').value,valor:+$('#incDespValor').value||0,cuentaSoloValidadas:$('#incDespValidadas').checked},vendedor:{activo:$('#incVendActivo').value==='true',tipo:$('#incVendTipo').value,base:$('#incVendBase').value,valor:+$('#incVendValor').value||0},extras:{mostrarAlertas:true,redondear:'normal'}});
  $('#saveIncentivos').onclick=async()=>{ const val=collect(); if(await saveConfigKey('incentivos',val)) renderConfig($('#content')); };
  $('#resetIncentivos').onclick=async()=>{ const val=defaultIncentiveConfig(); if(await saveConfigKey('incentivos',val)){ toast('Configuración sugerida restaurada'); renderConfig($('#content')); } };
  $$('[data-go="productividad"]').forEach(b=>b.onclick=()=>{state.page='productividad'; render();});
  wireEnterFlow(c,['incDeliveryValor','incDespValor','incVendValor','saveIncentivos']);
}

function reportDateAdd(key,days){
  const d=new Date(String(key||today()).slice(0,10)+'T12:00:00');
  d.setDate(d.getDate()+Number(days||0));
  return localIsoDate(d);
}
function reportRangeForPreset(preset){
  const now=today(), d=new Date(now+'T12:00:00');
  if(preset==='hoy') return {from:now,to:now};
  if(preset==='ayer'){ const y=reportDateAdd(now,-1); return {from:y,to:y}; }
  if(preset==='semana'){
    const mondayOffset=(d.getDay()+6)%7;
    return {from:reportDateAdd(now,-mondayOffset),to:now};
  }
  if(preset==='mes_anterior'){
    const first=new Date(d.getFullYear(),d.getMonth()-1,1,12);
    const last=new Date(d.getFullYear(),d.getMonth(),0,12);
    return {from:localIsoDate(first),to:localIsoDate(last)};
  }
  return {from:now.slice(0,8)+'01',to:now};
}
function normalizeReportRange(){
  let from=String(state.reportFrom||'').slice(0,10), to=String(state.reportTo||'').slice(0,10);
  if(!from||!to){ const r=reportRangeForPreset(state.reportPreset||'mes'); from=r.from; to=r.to; }
  if(from>to){ const x=from; from=to; to=x; }
  state.reportFrom=from; state.reportTo=to;
  return {from,to};
}
function reportPreviousRange(from,to){
  const a=new Date(from+'T12:00:00'), b=new Date(to+'T12:00:00');
  const days=Math.max(1,Math.round((b-a)/86400000)+1);
  const prevTo=reportDateAdd(from,-1);
  return {from:reportDateAdd(prevTo,-(days-1)),to:prevTo};
}
function reportOrderDateKey(o){ return rowDateKey(o?.facturado_en || o?.fecha_despacho || o?.fecha || o?.creado_en || o?.created_at); }
function reportClosedState(st){ return ['Entregado','Cobrado','Entregado a crédito','No entregado','Devuelto parcial','Cerrado'].includes(st); }
function reportIsActiveOrder(o){
  const st=effectiveOrderState(o)||o?.estado||'';
  return !!o && st!=='Anulado' && !reportClosedState(st);
}
function reportInvoicedAmount(o){
  const fact=Number(o?.total_factura||0);
  if(fact>0) return fact;
  const st=effectiveOrderState(o)||o?.estado||'';
  const invoiced=['Facturada','Validada para delivery','Asignada a delivery','En ruta','Entregado','Cobrado','Entregado a crédito','No entregado','Devuelto parcial','Cerrado'];
  return invoiced.includes(st) ? Number(o?.total_estimado||0) : 0;
}
function reportMatchesStatus(o,status){
  const st=effectiveOrderState(o)||o?.estado||'Sin estado';
  if(!status||status==='Todos') return true;
  if(status==='Activas') return reportIsActiveOrder(o);
  if(status==='Cerradas') return reportClosedState(st);
  if(status==='Cobrado') return ['Cobrado','Entregado'].includes(st);
  if(status==='Crédito') return st==='Entregado a crédito';
  if(status==='Programadas') return st==='Programada';
  return st===status;
}
function reportRowsInRange(rows,from,to,dateFn){ return (rows||[]).filter(r=>{ const k=dateFn(r); return k && k>=from && k<=to; }); }
function reportMedian(arr){ const a=(arr||[]).map(Number).filter(Number.isFinite).sort((x,y)=>x-y); if(!a.length) return 0; const m=Math.floor(a.length/2); return a.length%2?a[m]:(a[m-1]+a[m])/2; }
function reportTrendHtml(current,previous,label='período anterior'){
  const c=Number(current)||0,p=Number(previous)||0;
  if(!c&&!p) return `<em class="kpi-trend flat">Sin variación</em>`;
  if(!p) return `<em class="kpi-trend up">Nuevo vs. ${esc(label)}</em>`;
  const diff=((c-p)/Math.abs(p))*100;
  const cls=diff>0.05?'up':diff<-0.05?'down':'flat';
  const arrow=cls==='up'?'▲':cls==='down'?'▼':'•';
  return `<em class="kpi-trend ${cls}">${arrow} ${Math.abs(diff).toFixed(1)}% vs. ${esc(label)}</em>`;
}
function reportProductAggregation(rows){
  const map={};
  (rows||[]).forEach(o=>(o.items||[]).forEach(i=>{
    const name=i.producto_nombre||'Producto', unit=i.unidad||'—', key=norm(name)+'|'+norm(unit);
    if(!map[key]) map[key]={producto:name,unidad:unit,cantidad:0,monto:0,ordenes:new Set()};
    map[key].cantidad+=Number(i.cantidad_pedida||0);
    map[key].monto+=Number(i.cantidad_pedida||0)*Number(i.precio||0);
    map[key].ordenes.add(o.id);
  }));
  return Object.values(map).map(x=>({...x,ordenes:x.ordenes.size})).sort((a,b)=>b.monto-a.monto);
}
function reportStateRow(label,count,amount,maxCount){
  const p=Math.min(100,pct(count,maxCount||1));
  return `<button class="bar-row report-state-button" data-report-state-value="${esc(label)}"><div><b>${esc(label)}</b><span>${count} · ${money(amount)}</span></div><div class="bar"><i style="width:${p}%"></i></div></button>`;
}
function reportKpiCard({id,label,value,small,trend='',primary=false,info=''}){
  return `<button class="exec-kpi report-kpi ${primary?'primary':''}" data-report-detail="${esc(id)}" title="${esc(info)}"><span class="kpi-top"><span>${esc(label)}</span><i class="kpi-info">i</i></span><strong>${value}</strong><small>${small}</small>${trend}</button>`;
}
function reportOrderReopenings(o){
  return orderHistoryFor(o).filter(h=>isReopeningTransition(h.estado_anterior,h.estado_nuevo,h.comentario||h.notas||''));
}
function reportStageAnalysis(rows,stage){
  const cfg=operationAlertConfig(), sla=stageSlaMinutes(stage), workMode=operationWorkingConfig().enabled;
  const completed=(rows||[]).map(o=>{
    const start=stageEntryAt(o,stage), end=stageExitAt(o,stage);
    if(!start||!end) return null;
    const calendar=minutesBetween(start,end), working=operationMinutesBetween(start,end);
    if(calendar===null||working===null) return null;
    const reopenings=reportOrderReopenings(o);
    return {o,start,end,calendar,working,duration:workMode?working:calendar,reopenings,reopened:reopenings.length>0};
  }).filter(Boolean);
  const metricRows=cfg.excluirReaperturasPromedio!==false?completed.filter(x=>!x.reopened):completed.slice();
  const durations=metricRows.map(x=>x.duration), threshold=durationOutlierThreshold(durations,sla,Number(cfg.extremoFactor||3));
  completed.forEach(x=>{x.overSla=x.duration>sla;x.outlier=x.duration>threshold;});
  const over=metricRows.filter(x=>x.duration>sla).length, compliance=metricRows.length?Math.round(((metricRows.length-over)/metricRows.length)*100):0;
  return {stage,sla,workMode,completed,metricRows,count:metricRows.length,avg:avg(durations),median:reportMedian(durations),max:Math.max(0,...durations),over,compliance,threshold,outliers:completed.filter(x=>x.outlier),reopened:completed.filter(x=>x.reopened)};
}
function reportBottleneck(stageRows){
  const rows=(stageRows||[]).filter(x=>x.count);
  if(!rows.length) return null;
  return rows.slice().sort((a,b)=>{
    const ar=(a.median/Math.max(1,a.sla))+(a.over/Math.max(1,a.count));
    const br=(b.median/Math.max(1,b.sla))+(b.over/Math.max(1,b.count));
    return br-ar;
  })[0];
}
function reportStalledOrders(activeOrders){
  return (activeOrders||[]).map(o=>{
    const stage=currentModuleOfOrder(o), start=stage?stageEntryAt(o,stage):null;
    if(!stage||!start) return null;
    const minutes=operationMinutesSince(start), sla=stageSlaMinutes(stage);
    if(minutes===null||!Number.isFinite(minutes)) return null;
    return {o,stage,start,minutes,sla,ratio:minutes/Math.max(1,sla)};
  }).filter(Boolean).filter(x=>x.minutes>x.sla).sort((a,b)=>b.ratio-a.ratio);
}
function reportStageClass(row){
  if(!row.count) return 'stage-no-data';
  if(row.compliance>=90) return 'stage-sla-good';
  if(row.compliance>=70) return 'stage-sla-warn';
  return 'stage-sla-bad';
}
function openReportOrdersDetail(title,rows,subtitle=''){
  const list=(rows||[]).slice().sort((a,b)=>safeDateObj(reportOrderDateKey(b))-safeDateObj(reportOrderDateKey(a)));
  const body=`<div class="report-detail-summary"><b>${list.length} orden(es)</b><span>${esc(subtitle)}</span></div><div class="report-detail-table"><div class="report-detail-head"><span>Orden / cliente</span><span>Fecha</span><span>Estado</span><span>Monto</span><span></span></div>${list.map(o=>`<div class="report-detail-row"><div><b>${esc(o.codigo||('ORD-'+o.id))}</b><small>${esc(orderClientName(o))}</small></div><div>${shortDate(reportOrderDateKey(o))}</div><div><span class="badge info">${esc(effectiveOrderState(o)||o.estado||'—')}</span></div><div><b>${money(reportInvoicedAmount(o)||orderAmount(o))}</b></div><div><button class="btn small gray" data-oper-order="${o.id}">Ver</button></div></div>`).join('')||'<div class="empty">No hay órdenes para este detalle.</div>'}</div>`;
  openModal(title,body,subtitle||'Detalle generado desde Reportes');
  bindDynamic();
}
function openReportCallsDetail(title,rows,subtitle=''){
  const list=(rows||[]).slice().sort((a,b)=>safeDateObj(b.fecha)-safeDateObj(a.fecha));
  const body=`<div class="report-detail-summary"><b>${list.length} gestión(es)</b><span>${esc(subtitle)}</span></div><div class="report-detail-table calls"><div class="report-detail-head"><span>Cliente</span><span>Fecha</span><span>Resultado</span><span>Responsable</span><span></span></div>${list.map(l=>`<div class="report-detail-row"><div><b>${esc(l.cliente?.negocio||'Cliente')}</b><small>${esc(l.comentario||l.observacion||'Sin comentario')}</small></div><div>${shortDate(l.fecha)} ${esc(callTime(l))}</div><div>${esc(l.resultado||'—')}</div><div>${esc(workerDisplayName(l.vendedor||l.usuario)||l.vendedor||l.usuario||'—')}</div><div>${l.cliente_id?`<button class="btn small gray" data-client="${l.cliente_id}">Ficha</button>`:''}</div></div>`).join('')||'<div class="empty">No hay gestiones para este período.</div>'}</div>`;
  openModal(title,body,subtitle||'Detalle generado desde Reportes');
  bindDynamic();
}
function openReportStageDetail(row){
  const list=(row?.completed||[]).slice().sort((a,b)=>b.duration-a.duration);
  const body=`<div class="report-detail-summary"><b>${list.length} etapa(s) cerradas</b><span>${row.workMode?'Tiempo laborable':'Tiempo calendario'} · SLA ${row.sla} min · cumplimiento ${row.compliance}%</span></div><div class="stage-detail-table"><div class="stage-detail-head"><span>Orden / cliente</span><span>Laborable</span><span>Calendario</span><span>SLA</span><span>Calidad</span><span></span></div>${list.map(x=>`<div class="stage-detail-row ${x.overSla?'over-sla':''} ${x.outlier?'is-outlier':''}"><div><b>${esc(x.o.codigo||('ORD-'+x.o.id))}</b><small>${esc(orderClientName(x.o))}${x.reopened?' · Reabierta':''}</small></div><div><b>${esc(operationMinutesText(x.working))}</b></div><div>${esc(operationMinutesText(x.calendar))}</div><div>${x.duration<=row.sla?'<span class="badge ok">Dentro</span>':'<span class="badge bad">Fuera</span>'}</div><div>${x.outlier?'<span class="badge bad">Extremo</span>':x.reopened?'<span class="badge warn">Reapertura</span>':'<span class="badge info">Normal</span>'}</div><div><button class="btn small gray" data-oper-order="${x.o.id}">Ver</button></div></div>`).join('')||'<div class="empty">No hay etapas cerradas para este cálculo.</div>'}</div>`;
  openModal('Tiempo de '+stageLabel(row.stage),body,`Promedio ${minutesText(row.avg)} · mediana ${minutesText(row.median)} · máximo ${minutesText(row.max)}`);
  bindDynamic();
}

function reportSellerOf(o){ return String(o?.vendedor || o?.cliente?.vendedor || 'Sin vendedor').trim() || 'Sin vendedor'; }
function reportZoneOf(o){ return String(o?.zona || o?.cliente?.sector || 'Sin zona').trim() || 'Sin zona'; }
function reportPaymentOf(o){
  const st=effectiveOrderState(o)||o?.estado||'';
  if(st==='Entregado a crédito') return 'Crédito';
  if(['Cobrado','Entregado'].includes(st)) return o?.condicion_pago||'Contado';
  return o?.condicion_pago||'Sin condición';
}
function reportProductKeyOfItem(i){ return `${i?.producto_nombre||'Producto'}|${i?.unidad||'—'}`; }
function reportOrderPaidAmount(o){
  const direct=Number(o?.monto_cobrado||0);
  const payments=(state.pagos||[]).filter(p=>String(p.orden_id)===String(o?.id)).reduce((s,p)=>s+Number(p.monto||0),0);
  const paid=Math.max(0,direct,payments), amount=reportInvoicedAmount(o)||orderAmount(o);
  return amount>0?Math.min(paid,amount):paid;
}
function reportOrderPendingAmount(o){
  const direct=Number(o?.monto_pendiente||0);
  const amount=reportInvoicedAmount(o)||orderAmount(o), paid=reportOrderPaidAmount(o);
  const condition=reportPaymentOf(o);
  return Math.max(0,direct,condition==='Crédito'?amount-paid:0);
}
function reportOrderMatchesDimensionsV9215(o){
  if(!o) return false;
  if(state.reportSeller!=='Todos' && reportSellerOf(o)!==state.reportSeller) return false;
  if(state.reportZone!=='Todas' && reportZoneOf(o)!==state.reportZone) return false;
  if(state.reportClient!=='Todos' && String(o.cliente_id)!==String(state.reportClient)) return false;
  if(state.reportPayment!=='Todas' && reportPaymentOf(o)!==state.reportPayment) return false;
  if(state.reportProduct!=='Todos' && !(o.items||[]).some(i=>reportProductKeyOfItem(i)===state.reportProduct)) return false;
  return true;
}
function reportOrderMatchesV9215(o){ return reportOrderMatchesDimensionsV9215(o) && reportMatchesStatus(o,state.reportStatus); }
function reportCallMatchesV9215(l){
  const client=l?.cliente || state.clientes.find(c=>String(c.id)===String(l?.cliente_id)) || {};
  if(state.reportSeller!=='Todos' && String(l?.vendedor||client.vendedor||'Sin vendedor')!==state.reportSeller) return false;
  if(state.reportZone!=='Todas' && String(client.sector||'Sin zona')!==state.reportZone) return false;
  if(state.reportClient!=='Todos' && String(l?.cliente_id)!==String(state.reportClient)) return false;
  return true;
}
function reportVariationText(value){
  if(value===null || value===undefined || !Number.isFinite(Number(value))) return 'Nuevo';
  const n=Number(value); return `${n>0?'+':''}${n.toFixed(1)}%`;
}
function reportVariationClass(value){ const n=Number(value); if(!Number.isFinite(n)||Math.abs(n)<.05)return 'flat'; return n>0?'up':'down'; }
function reportSegmentClass(segment){ return {'Nuevo':'info','Recuperado':'ok','En crecimiento':'ok','En reducción':'warn','En riesgo':'bad','Activo':'info','Estable':''}[segment]||''; }
function reportTabsHtml(){
  const tabs=[['resumen','Resumen'],['ventas','Ventas'],['clientes','Clientes'],['productos','Productos'],['crm','CRM comercial'],['operacion','Operación y tiempos']];
  return `<div class="panel report-module-tabs"><div class="tabs">${tabs.map(([id,label])=>`<button class="tab ${state.reportTab===id?'active':''}" data-report-tab="${id}">${label}</button>`).join('')}</div></div>`;
}
function bindReportTabs(c){ $$('[data-report-tab]',c).forEach(b=>b.onclick=()=>{state.reportTab=b.dataset.reportTab;renderReportes(c);}); }
function reportFilterOptionsV9215(allOrders){
  const sellers=Array.from(new Set(allOrders.map(reportSellerOf).filter(Boolean))).sort((a,b)=>a.localeCompare(b));
  const zones=Array.from(new Set(allOrders.map(reportZoneOf).filter(Boolean))).sort((a,b)=>a.localeCompare(b));
  const clientIds=Array.from(new Set(allOrders.map(o=>String(o.cliente_id||'')).filter(Boolean)));
  const clients=clientIds.map(id=>state.clientes.find(c=>String(c.id)===id)||allOrders.find(o=>String(o.cliente_id)===id)?.cliente).filter(Boolean).sort((a,b)=>String(a.negocio||'').localeCompare(String(b.negocio||'')));
  const productMap=new Map(); allOrders.forEach(o=>(o.items||[]).forEach(i=>productMap.set(reportProductKeyOfItem(i),{key:reportProductKeyOfItem(i),name:i.producto_nombre||'Producto',unit:i.unidad||'—'})));
  const products=Array.from(productMap.values()).sort((a,b)=>a.name.localeCompare(b.name));
  return {sellers,zones,clients,products};
}
function reportFilterPanelV9215(ctx){
  const o=ctx.options;
  return `<div class="panel report-filter-panel report-filter-v9215"><div class="panel-head"><div><h3>Período y filtros comerciales</h3><p>Todos los KPI y tablas usan la misma selección. Comparación automática: ${esc(ctx.prevTxt)}.</p></div><div class="actions"><button class="btn gray" id="refreshReportBtn">Actualizar</button><button class="btn dark" id="exportReportV9215">Exportar Excel</button></div></div><div class="report-filter-grid-v9215">
  <div class="field"><label>Período</label><select id="reportPreset"><option value="hoy" ${state.reportPreset==='hoy'?'selected':''}>Hoy</option><option value="ayer" ${state.reportPreset==='ayer'?'selected':''}>Ayer</option><option value="semana" ${state.reportPreset==='semana'?'selected':''}>Esta semana</option><option value="mes" ${state.reportPreset==='mes'?'selected':''}>Este mes</option><option value="mes_anterior" ${state.reportPreset==='mes_anterior'?'selected':''}>Mes anterior</option><option value="custom" ${state.reportPreset==='custom'?'selected':''}>Personalizado</option></select></div>
  <div class="field"><label>Desde</label><input id="reportFrom" type="date" value="${esc(ctx.range.from)}"></div><div class="field"><label>Hasta</label><input id="reportTo" type="date" value="${esc(ctx.range.to)}"></div>
  <div class="field"><label>Estado</label><select id="reportStatus">${['Todos','Activas','Cerradas','Cobrado','Crédito','Programadas'].map(x=>`<option ${state.reportStatus===x?'selected':''}>${x}</option>`).join('')}</select></div>
  <div class="field"><label>Vendedor</label><select id="reportSeller"><option>Todos</option>${o.sellers.map(x=>`<option ${state.reportSeller===x?'selected':''}>${esc(x)}</option>`).join('')}</select></div>
  <div class="field"><label>Zona</label><select id="reportZone"><option>Todas</option>${o.zones.map(x=>`<option ${state.reportZone===x?'selected':''}>${esc(x)}</option>`).join('')}</select></div>
  <div class="field"><label>Cliente</label><select id="reportClient"><option value="Todos">Todos</option>${o.clients.map(x=>`<option value="${x.id}" ${String(state.reportClient)===String(x.id)?'selected':''}>${esc(x.codigo||'')} · ${esc(x.negocio||'Cliente')}</option>`).join('')}</select></div>
  <div class="field"><label>Producto / unidad</label><select id="reportProduct"><option value="Todos">Todos</option>${o.products.map(x=>`<option value="${esc(x.key)}" ${state.reportProduct===x.key?'selected':''}>${esc(x.name)} · ${esc(x.unit)}</option>`).join('')}</select></div>
  <div class="field"><label>Condición</label><select id="reportPayment">${['Todas','Contado','Crédito','Sin condición'].map(x=>`<option ${state.reportPayment===x?'selected':''}>${x}</option>`).join('')}</select></div>
  </div><div class="report-filter-footer"><div><b>Período:</b> ${esc(ctx.rangeTxt)} · <b>${ctx.orders.length}</b> orden(es) · <b>${ctx.calls.length}</b> gestión(es)</div><div class="actions"><button class="btn" id="applyReportFilters">Aplicar</button><button class="btn gray" id="clearReportFilters">Limpiar</button><button class="btn gray" id="printReportBtn">Imprimir / PDF</button></div></div></div>`;
}
function reportCommercialContext(){
  const range=normalizeReportRange(), previous=reportPreviousRange(range.from,range.to);
  const allOrders=(state.ordenes||[]).filter(o=>o.estado!=='Anulado');
  const dimensionOrders=allOrders.filter(reportOrderMatchesDimensionsV9215);
  const orders=reportRowsInRange(dimensionOrders,range.from,range.to,reportOrderDateKey).filter(o=>reportMatchesStatus(o,state.reportStatus));
  const previousOrders=reportRowsInRange(dimensionOrders,previous.from,previous.to,reportOrderDateKey).filter(o=>reportMatchesStatus(o,state.reportStatus));
  const calls=reportRowsInRange((state.llamadas||[]).filter(reportCallMatchesV9215),range.from,range.to,l=>rowDateKey(l.fecha));
  const previousCalls=reportRowsInRange((state.llamadas||[]).filter(reportCallMatchesV9215),previous.from,previous.to,l=>rowDateKey(l.fecha));
  const invoiced=orders.filter(o=>reportInvoicedAmount(o)>0), previousInvoiced=previousOrders.filter(o=>reportInvoicedAmount(o)>0);
  const amount=invoiced.reduce((s,o)=>s+reportInvoicedAmount(o),0), previousAmount=previousInvoiced.reduce((s,o)=>s+reportInvoicedAmount(o),0);
  const paid=orders.reduce((s,o)=>s+reportOrderPaidAmount(o),0), previousPaid=previousOrders.reduce((s,o)=>s+reportOrderPaidAmount(o),0);
  const pending=orders.reduce((s,o)=>s+reportOrderPendingAmount(o),0), previousPending=previousOrders.reduce((s,o)=>s+reportOrderPendingAmount(o),0);
  const daily=buildDailySeries(orders,range.from,range.to,reportOrderDateKey,o=>reportInvoicedAmount(o));
  const products=aggregateProducts(orders,previousOrders);
  const clients=aggregateClients({currentOrders:orders,previousOrders,allOrders:dimensionOrders,clients:state.clientes,from:range.from,to:range.to,amountFn:o=>reportInvoicedAmount(o),dateFn:reportOrderDateKey});
  const crm=aggregateCrm({calls,previousCalls,orders,amountFn:o=>reportInvoicedAmount(o)});
  const options=reportFilterOptionsV9215(allOrders);
  const rangeTxt=`${shortDate(range.from)} al ${shortDate(range.to)}`,prevTxt=`${shortDate(previous.from)} al ${shortDate(previous.to)}`;
  return {range,previous,allOrders,dimensionOrders,orders,previousOrders,calls,previousCalls,invoiced,previousInvoiced,amount,previousAmount,paid,previousPaid,pending,previousPending,daily,products,clients,crm,options,rangeTxt,prevTxt};
}
function reportDailyChartHtml(series){
  const rows=series||[], max=Math.max(1,...rows.map(x=>x.value)), step=Math.max(1,Math.ceil(rows.length/9));
  return `<div class="report-sales-chart">${rows.map((x,i)=>`<button class="report-sales-bar" data-report-day="${x.date}" title="${shortDate(x.date)} · ${money(x.value)}"><span style="height:${Math.max(x.value?5:1,(x.value/max)*100)}%"></span><small>${i%step===0||i===rows.length-1?String(x.date).slice(8,10):''}</small></button>`).join('')}</div>`;
}
function reportRankingRows(entries,type,amountTotal){
  const max=Math.max(1,...entries.map(x=>x.amount));
  return entries.map(x=>`<button class="bar-row money" data-report-rank-type="${type}" data-report-rank-value="${esc(x.key)}"><div><b>${esc(x.key)}</b><span>${money(x.amount)}</span></div><div class="bar"><i style="width:${Math.min(100,(x.amount/max)*100)}%"></i></div><small>${x.orders} orden(es) · ${amountTotal?pct(x.amount,amountTotal):0}% del monto</small></button>`).join('')||'<div class="empty">Sin datos para el período.</div>';
}
function reportSalesGroups(ctx,keyFn){
  const map=new Map();ctx.orders.forEach(o=>{const key=keyFn(o)||'—';if(!map.has(key))map.set(key,{key,amount:0,orders:0});const r=map.get(key);r.amount+=reportInvoicedAmount(o);r.orders++;});
  return Array.from(map.values()).sort((a,b)=>b.amount-a.amount);
}
function reportSummaryTabV9215(ctx){
  const buyers=ctx.clients.filter(x=>x.monto>0).length, ticket=ctx.invoiced.length?ctx.amount/ctx.invoiced.length:0, prevTicket=ctx.previousInvoiced.length?ctx.previousAmount/ctx.previousInvoiced.length:0;
  const topClients=ctx.clients.filter(x=>x.monto>0).slice(0,6), topProducts=ctx.products.filter(x=>x.monto>0).slice(0,6);
  const creditOrders=ctx.orders.filter(o=>reportPaymentOf(o)==='Crédito'), cashOrders=ctx.orders.filter(o=>reportPaymentOf(o)==='Contado');
  return `<div class="report-kpi-grid report-v9215-kpis">${reportKpiCard({id:'period',label:'Facturado',value:money(ctx.amount),small:`${ctx.invoiced.length} orden(es) con monto`,trend:reportTrendHtml(ctx.amount,ctx.previousAmount),primary:true,info:'Suma de total_factura; usa total estimado solo en estados ya facturados.'})}${reportKpiCard({id:'paid',label:'Cobrado vinculado',value:money(ctx.paid),small:'Máximo entre pagos registrados y monto cobrado de la orden',trend:reportTrendHtml(ctx.paid,ctx.previousPaid),info:'No suma dos veces el mismo cobro.'})}${reportKpiCard({id:'pending',label:'Crédito pendiente',value:money(ctx.pending),small:`${creditOrders.length} orden(es) a crédito`,trend:reportTrendHtml(ctx.pending,ctx.previousPending),info:'Saldo pendiente registrado o diferencia entre facturado y cobrado.'})}${reportKpiCard({id:'orders',label:'Órdenes',value:ctx.orders.length,small:`${cashOrders.length} contado · ${creditOrders.length} crédito`,trend:reportTrendHtml(ctx.orders.length,ctx.previousOrders.length)})}${reportKpiCard({id:'ticket',label:'Ticket promedio',value:money(ticket),small:`${buyers} cliente(s) comprador(es)`,trend:reportTrendHtml(ticket,prevTicket)})}${reportKpiCard({id:'calls',label:'Conversión CRM',value:`${ctx.crm.conversion.toFixed(1)}%`,small:`${ctx.crm.requestedClients} de ${ctx.crm.managedClients} cliente(s) gestionados`,trend:reportTrendHtml(ctx.crm.conversion,ctx.crm.previousConversion)})}</div>
  <div class="report-grid report-summary-grid"><div class="panel panel-clean"><div class="panel-head"><div><h3>Tendencia de facturación</h3><p>Facturación diaria dentro del período seleccionado.</p></div><span class="badge info">${money(ctx.amount)}</span></div>${reportDailyChartHtml(ctx.daily)}</div><div class="panel panel-clean"><div class="panel-head"><div><h3>Contado y crédito</h3><p>Distribución según condición de pago y estado final.</p></div></div><div class="report-split-grid"><button data-report-payment-detail="Contado"><span>Contado</span><strong>${money(cashOrders.reduce((s,o)=>s+reportInvoicedAmount(o),0))}</strong><small>${cashOrders.length} orden(es)</small></button><button data-report-payment-detail="Crédito"><span>Crédito</span><strong>${money(creditOrders.reduce((s,o)=>s+reportInvoicedAmount(o),0))}</strong><small>${creditOrders.length} orden(es)</small></button><button data-report-detail="paid"><span>Cobrado</span><strong>${money(ctx.paid)}</strong><small>Vinculado a las órdenes</small></button><button data-report-detail="pending"><span>Pendiente</span><strong>${money(ctx.pending)}</strong><small>Saldo estimado/registrado</small></button></div></div></div>
  <div class="report-grid"><div class="panel panel-clean"><div class="panel-head"><div><h3>Clientes principales</h3><p>Monto, órdenes y clasificación comercial.</p></div><button class="btn small gray" data-report-tab="clientes">Ver todos</button></div><div class="report-client-summary">${topClients.map(x=>`<button data-report-client-key="${esc(x.key)}"><div><b>${esc(x.nombre)}</b><small>${x.ordenes} orden(es) · ticket ${money(x.ticket)}</small></div><div><strong>${money(x.monto)}</strong><span class="badge ${reportSegmentClass(x.segment)}">${esc(x.segment)}</span></div></button>`).join('')||'<div class="empty">Sin clientes compradores.</div>'}</div></div><div class="panel panel-clean"><div class="panel-head"><div><h3>Productos principales</h3><p>Separados por producto y unidad.</p></div><button class="btn small gray" data-report-tab="productos">Ver todos</button></div><div class="report-product-summary">${topProducts.map(x=>`<button data-report-product-key-v9215="${esc(x.key)}"><div><b>${esc(x.producto)}</b><small>${esc(x.unidad)} · ${x.ordenes} orden(es) · ${x.clientes} cliente(s)</small></div><strong>${money(x.monto)}</strong></button>`).join('')||'<div class="empty">Sin productos facturados.</div>'}</div></div></div>`;
}
function reportVentasTabV9215(ctx){
  const ticket=ctx.invoiced.length?ctx.amount/ctx.invoiced.length:0, days=Math.max(1,ctx.daily.length), sellers=reportSalesGroups(ctx,reportSellerOf), zones=reportSalesGroups(ctx,reportZoneOf), conditions=reportSalesGroups(ctx,reportPaymentOf);
  const bestDay=ctx.daily.slice().sort((a,b)=>b.value-a.value)[0]||{date:'',value:0};
  return `<div class="report-kpi-grid report-v9215-kpis">${reportKpiCard({id:'period',label:'Facturado',value:money(ctx.amount),small:`Promedio diario ${money(ctx.amount/days)}`,trend:reportTrendHtml(ctx.amount,ctx.previousAmount),primary:true})}${reportKpiCard({id:'orders',label:'Órdenes',value:ctx.orders.length,small:`${ctx.invoiced.length} con monto`,trend:reportTrendHtml(ctx.orders.length,ctx.previousOrders.length)})}${reportKpiCard({id:'ticket',label:'Ticket promedio',value:money(ticket),small:`Mejor día ${bestDay.date?shortDate(bestDay.date):'—'}`})}${reportKpiCard({id:'paid',label:'Cobrado',value:money(ctx.paid),small:`${ctx.amount?pct(ctx.paid,ctx.amount):0}% del facturado`})}${reportKpiCard({id:'pending',label:'Pendiente',value:money(ctx.pending),small:'Crédito vinculado'})}${reportKpiCard({id:'buyers',label:'Clientes compradores',value:ctx.clients.filter(x=>x.monto>0).length,small:'Clientes únicos del período'})}</div>
  <div class="panel panel-clean"><div class="panel-head"><div><h3>Facturación por día</h3><p>Pulse una barra para abrir las órdenes de esa fecha.</p></div><span class="badge info">${ctx.rangeTxt}</span></div>${reportDailyChartHtml(ctx.daily)}</div>
  <div class="report-grid report-ranking-grid"><div class="panel panel-clean"><div class="panel-head"><div><h3>Ventas por vendedor</h3><p>Responsable guardado en la orden o heredado del cliente.</p></div></div><div class="report-bars">${reportRankingRows(sellers,'seller',ctx.amount)}</div></div><div class="panel panel-clean"><div class="panel-head"><div><h3>Ventas por zona</h3><p>Zona de la orden o sector del cliente.</p></div></div><div class="report-bars">${reportRankingRows(zones,'zone',ctx.amount)}</div></div></div>
  <div class="panel panel-clean"><div class="panel-head"><div><h3>Condición de pago</h3><p>Separación de contado, crédito y registros sin condición.</p></div></div><div class="report-bars report-condition-bars">${reportRankingRows(conditions,'payment',ctx.amount)}</div></div>`;
}
function reportClientesTabV9215(ctx){
  const rows=ctx.clients.filter(x=>x.monto>0||x.anteriorMonto>0||['Nuevo','Recuperado','En riesgo','En reducción'].includes(x.segment));
  const count=s=>rows.filter(x=>x.segment===s).length;
  return `<div class="report-kpi-grid report-v9215-kpis">${reportKpiCard({id:'buyers',label:'Compradores',value:rows.filter(x=>x.monto>0).length,small:'Clientes con órdenes en el período',primary:true})}${reportKpiCard({id:'client-new',label:'Nuevos',value:count('Nuevo'),small:'Primera compra en el período'})}${reportKpiCard({id:'client-recovered',label:'Recuperados',value:count('Recuperado'),small:'Volvieron después de 30 días o más'})}${reportKpiCard({id:'client-growth',label:'En crecimiento',value:count('En crecimiento'),small:'Subieron al menos 20%'})}${reportKpiCard({id:'client-reduction',label:'En reducción',value:count('En reducción'),small:'Bajaron al menos 20%'})}${reportKpiCard({id:'client-risk',label:'En riesgo',value:count('En riesgo'),small:'Activo sin compra reciente'})}</div>
  <div class="panel panel-clean"><div class="panel-head"><div><h3>Análisis de clientes</h3><p>Comparación contra ${esc(ctx.prevTxt)}. La clasificación usa el historial cargado del CRM.</p></div><span class="badge info">${rows.length} cliente(s)</span></div><div class="table-wrap"><table class="table report-v9215-table"><thead><tr><th>Cliente</th><th>Segmento</th><th>Facturado</th><th>Anterior</th><th>Variación</th><th>Órdenes</th><th>Ticket</th><th>Última compra</th><th></th></tr></thead><tbody>${rows.slice(0,80).map(x=>`<tr><td><b>${esc(x.nombre)}</b><small>${esc(x.codigo)} · ${esc(x.sector||'Sin zona')} · ${esc(x.vendedor||'Sin vendedor')}</small></td><td><span class="badge ${reportSegmentClass(x.segment)}">${esc(x.segment)}</span></td><td><b>${money(x.monto)}</b></td><td>${money(x.anteriorMonto)}</td><td><span class="kpi-trend ${reportVariationClass(x.variacion)}">${reportVariationText(x.variacion)}</span></td><td>${x.ordenes}</td><td>${money(x.ticket)}</td><td>${shortDate(x.lastDate)}</td><td><div class="actions"><button class="btn small gray" data-report-client-key="${esc(x.key)}">Órdenes</button>${x.clienteId?`<button class="btn small gray" data-client="${x.clienteId}">Ficha</button>`:''}</div></td></tr>`).join('')||'<tr><td colspan="9">Sin clientes para estos filtros.</td></tr>'}</tbody></table></div></div>`;
}
function reportProductosTabV9215(ctx){
  const sold=ctx.products.filter(x=>x.monto>0), activeNames=new Set(sold.map(x=>norm(x.producto))), noMovement=(state.productos||[]).filter(p=>p.activo!==false&&!activeNames.has(norm(p.nombre))).length;
  const returns=sold.filter(x=>x.devoluciones>0), customers=new Set();ctx.orders.forEach(o=>(o.items||[]).forEach(()=>customers.add(String(o.cliente_id))));
  return `<div class="report-kpi-grid report-v9215-kpis">${reportKpiCard({id:'products',label:'Producto/unidad vendidos',value:sold.length,small:'Cada unidad se analiza por separado',primary:true})}${reportKpiCard({id:'products-no-move',label:'Sin movimiento',value:noMovement,small:'Productos activos sin venta'})}${reportKpiCard({id:'products-return',label:'Con devoluciones',value:returns.length,small:'Aparecen en órdenes devueltas'})}${reportKpiCard({id:'buyers',label:'Clientes alcanzados',value:customers.size,small:'Clientes únicos'})}${reportKpiCard({id:'product-orders',label:'Órdenes con productos',value:ctx.orders.filter(o=>(o.items||[]).length).length,small:'Con detalle cargado'})}${reportKpiCard({id:'product-value',label:'Valor analizado',value:money(sold.reduce((s,x)=>s+x.monto,0)),small:'Suma del detalle de productos'})}</div>
  <div class="panel panel-clean"><div class="panel-head"><div><h3>Rendimiento de productos</h3><p>Cantidad, precio promedio, alcance y variación; sin mezclar libras, unidades, paquetes o cajas.</p></div><span class="badge info">${sold.length} renglón(es)</span></div><div class="table-wrap"><table class="table report-v9215-table report-products-v9215"><thead><tr><th>Producto</th><th>Unidad</th><th>Cantidad</th><th>Precio prom.</th><th>Órdenes</th><th>Clientes</th><th>Monto</th><th>Variación</th><th>Calidad</th><th></th></tr></thead><tbody>${sold.slice(0,100).map(x=>`<tr><td><b>${esc(x.producto)}</b></td><td><span class="badge info">${esc(x.unidad)}</span></td><td>${Number(x.cantidad).toLocaleString('es-DO',{maximumFractionDigits:2})}</td><td>${money(x.precioPromedio)}</td><td>${x.ordenes}</td><td>${x.clientes}</td><td><b>${money(x.monto)}</b></td><td><span class="kpi-trend ${reportVariationClass(x.variacion)}">${reportVariationText(x.variacion)}</span></td><td>${x.devoluciones?`<span class="badge warn">${x.devoluciones} devolución(es)</span>`:'<span class="badge ok">Sin alerta</span>'}</td><td><button class="btn small gray" data-report-product-key-v9215="${esc(x.key)}">Detalle</button></td></tr>`).join('')||'<tr><td colspan="10">Sin productos para estos filtros.</td></tr>'}</tbody></table></div></div>`;
}
function reportPendingFollowupsV9215(calls){
  const all=state.llamadas||[];
  return calls.filter(l=>{const due=String(l.proximo_contacto||'').slice(0,10);if(!due||due>today())return false;return !all.some(n=>String(n.cliente_id)===String(l.cliente_id)&&rowDateKey(n.fecha)>rowDateKey(l.fecha));});
}
function reportCrmTabV9215(ctx){
  const pending=reportPendingFollowupsV9215(ctx.calls), linked=ctx.crm.linkedOrders;
  return `<div class="report-kpi-grid report-v9215-kpis">${reportKpiCard({id:'calls',label:'Gestiones',value:ctx.crm.calls,small:`${ctx.crm.managedClients} cliente(s) únicos`,trend:reportTrendHtml(ctx.crm.calls,ctx.crm.previousCalls),primary:true})}${reportKpiCard({id:'crm-managed',label:'Clientes gestionados',value:ctx.crm.managedClients,small:'Clientes únicos contactados',trend:reportTrendHtml(ctx.crm.managedClients,ctx.crm.previousManagedClients)})}${reportKpiCard({id:'crm-requested',label:'Clientes que pidieron',value:ctx.crm.requestedClients,small:'Resultado “Pidió”'})}${reportKpiCard({id:'calls',label:'Conversión',value:`${ctx.crm.conversion.toFixed(1)}%`,small:'Pidieron / gestionados'})}${reportKpiCard({id:'crm-orders',label:'Órdenes vinculadas',value:linked.length,small:money(ctx.crm.linkedAmount)})}${reportKpiCard({id:'crm-followup',label:'Seguimientos vencidos',value:pending.length,small:'Próximo contacto sin gestión posterior'})}</div>
  <div class="report-grid"><div class="panel panel-clean"><div class="panel-head"><div><h3>Resultados de las gestiones</h3><p>Distribución de respuestas registradas.</p></div></div><div class="report-bars">${sortEntries(ctx.crm.byResult).map(([k,v])=>`<button class="bar-row" data-report-crm-result="${esc(k)}"><div><b>${esc(k)}</b><span>${v}</span></div><div class="bar"><i style="width:${Math.min(100,pct(v,ctx.crm.calls||1))}%"></i></div></button>`).join('')||'<div class="empty">Sin gestiones.</div>'}</div></div><div class="panel panel-clean"><div class="panel-head"><div><h3>Seguimientos que requieren atención</h3><p>Fecha vencida y sin una gestión posterior del mismo cliente.</p></div><button class="btn small gray" data-report-followups="1">Ver todos</button></div><div class="report-action-list">${pending.slice(0,8).map(l=>`<button data-client="${l.cliente_id}"><div><b>${esc(l.cliente?.negocio||'Cliente')}</b><small>${shortDate(l.proximo_contacto)} · ${esc(l.vendedor||'Sin responsable')}</small></div><span class="badge warn">Vencido</span></button>`).join('')||'<div class="empty">No hay seguimientos vencidos.</div>'}</div></div></div>
  <div class="panel panel-clean"><div class="panel-head"><div><h3>Rendimiento por vendedor / promotor</h3><p>Gestiones, clientes, conversión y órdenes directamente vinculadas a llamadas.</p></div><span class="badge info">${ctx.crm.sellers.length} responsable(s)</span></div><div class="table-wrap"><table class="table report-v9215-table"><thead><tr><th>Responsable</th><th>Gestiones</th><th>Clientes</th><th>Pidieron</th><th>Conversión</th><th>Órdenes vinculadas</th><th>Monto vinculado</th><th></th></tr></thead><tbody>${ctx.crm.sellers.map(x=>`<tr><td><b>${esc(x.vendedor)}</b></td><td>${x.llamadas}</td><td>${x.clientes}</td><td>${x.pidieron}</td><td><b>${x.conversion.toFixed(1)}%</b></td><td>${x.ordenes}</td><td>${money(x.monto)}</td><td><button class="btn small gray" data-report-crm-seller="${esc(x.vendedor)}">Detalle</button></td></tr>`).join('')||'<tr><td colspan="8">Sin actividad comercial.</td></tr>'}</tbody></table></div></div>`;
}
function bindReportCommercialV9215(c,ctx){
  bindReportTabs(c);
  $('#reportPreset',c).onchange=e=>{state.reportPreset=e.target.value;if(state.reportPreset!=='custom'){const r=reportRangeForPreset(state.reportPreset);state.reportFrom=r.from;state.reportTo=r.to;}renderReportes(c);};
  $('#reportFrom',c).onchange=()=>{state.reportPreset='custom';};$('#reportTo',c).onchange=()=>{state.reportPreset='custom';};
  $('#applyReportFilters',c).onclick=()=>{state.reportFrom=$('#reportFrom',c).value;state.reportTo=$('#reportTo',c).value;state.reportPreset=$('#reportPreset',c).value;state.reportStatus=$('#reportStatus',c).value;state.reportSeller=$('#reportSeller',c).value;state.reportZone=$('#reportZone',c).value;state.reportClient=$('#reportClient',c).value;state.reportProduct=$('#reportProduct',c).value;state.reportPayment=$('#reportPayment',c).value;renderReportes(c);};
  $('#clearReportFilters',c).onclick=()=>{const r=reportRangeForPreset('mes');Object.assign(state,{reportPreset:'mes',reportFrom:r.from,reportTo:r.to,reportStatus:'Todos',reportSeller:'Todos',reportZone:'Todas',reportClient:'Todos',reportProduct:'Todos',reportPayment:'Todas'});renderReportes(c);};
  $('#refreshReportBtn',c).onclick=async()=>{await refreshVisibleModuleV9384();renderReportes(c);toast('Reportes actualizados');};
  $('#printReportBtn',c).onclick=()=>window.print();$('#exportReportV9215',c).onclick=()=>exportReportV9215(reportCommercialContext());
  $$('[data-report-detail]',c).forEach(b=>b.onclick=()=>{const id=b.dataset.reportDetail;if(['period','orders','ticket','buyers'].includes(id))return openReportOrdersDetail('Órdenes del período',ctx.orders,ctx.rangeTxt);if(id==='paid')return openReportOrdersDetail('Órdenes con cobro',ctx.orders.filter(o=>reportOrderPaidAmount(o)>0),ctx.rangeTxt);if(id==='pending')return openReportOrdersDetail('Órdenes con saldo pendiente',ctx.orders.filter(o=>reportOrderPendingAmount(o)>0),ctx.rangeTxt);if(id==='calls')return openReportCallsDetail('Gestiones CRM',ctx.calls,ctx.rangeTxt);if(id==='crm-orders')return openReportOrdersDetail('Órdenes vinculadas a gestiones',ctx.crm.linkedOrders,ctx.rangeTxt);if(id==='crm-followup')return openReportCallsDetail('Seguimientos vencidos',reportPendingFollowupsV9215(ctx.calls),ctx.rangeTxt);});
  $$('[data-report-day]',c).forEach(b=>b.onclick=()=>openReportOrdersDetail('Ventas del '+shortDate(b.dataset.reportDay),ctx.orders.filter(o=>reportOrderDateKey(o)===b.dataset.reportDay),ctx.rangeTxt));
  $$('[data-report-rank-type]',c).forEach(b=>b.onclick=()=>{const type=b.dataset.reportRankType,value=b.dataset.reportRankValue;const rows=ctx.orders.filter(o=>type==='seller'?reportSellerOf(o)===value:type==='zone'?reportZoneOf(o)===value:reportPaymentOf(o)===value);openReportOrdersDetail(`${type==='seller'?'Vendedor':type==='zone'?'Zona':'Condición'}: ${value}`,rows,ctx.rangeTxt);});
  $$('[data-report-payment-detail]',c).forEach(b=>b.onclick=()=>openReportOrdersDetail('Condición: '+b.dataset.reportPaymentDetail,ctx.orders.filter(o=>reportPaymentOf(o)===b.dataset.reportPaymentDetail),ctx.rangeTxt));
  $$('[data-report-client-key]',c).forEach(b=>{b.onclick=()=>{const row=ctx.clients.find(x=>x.key===b.dataset.reportClientKey);openReportOrdersDetail('Cliente: '+(row?.nombre||'Cliente'),ctx.orders.filter(o=>String(o.cliente_id??o.cliente?.id??o.cliente?.codigo??o.cliente?.negocio)===String(b.dataset.reportClientKey)),ctx.rangeTxt);};});
  $$('[data-report-product-key-v9215]',c).forEach(b=>b.onclick=()=>{const row=ctx.products.find(x=>x.key===b.dataset.reportProductKeyV9215);openReportOrdersDetail('Producto: '+(row?.producto||'Producto'),ctx.orders.filter(o=>(o.items||[]).some(i=>norm(reportProductKeyOfItem(i))===norm(`${row?.producto}|${row?.unidad}`))),`${row?.unidad||''} · ${ctx.rangeTxt}`);});
  $$('[data-report-crm-result]',c).forEach(b=>b.onclick=()=>openReportCallsDetail('Resultado: '+b.dataset.reportCrmResult,ctx.calls.filter(l=>(l.resultado||'Sin resultado')===b.dataset.reportCrmResult),ctx.rangeTxt));
  $$('[data-report-crm-seller]',c).forEach(b=>b.onclick=()=>openReportCallsDetail('Gestiones de '+b.dataset.reportCrmSeller,ctx.calls.filter(l=>(l.vendedor||l.usuario||'Sin responsable')===b.dataset.reportCrmSeller),ctx.rangeTxt));
  $$('[data-report-followups]',c).forEach(b=>b.onclick=()=>openReportCallsDetail('Seguimientos vencidos',reportPendingFollowupsV9215(ctx.calls),ctx.rangeTxt));
  $$('[data-client]',c).forEach(b=>b.onclick=()=>{const cl=state.clientes.find(x=>String(x.id)===String(b.dataset.client));if(cl)openClientFicha(cl);});
  bindDynamic();
}
function exportReportV9215(ctx){
  const wb=XLSX.utils.book_new();
  const add=(name,rows)=>XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rows.length?rows:[{Mensaje:'Sin datos'}]),name.slice(0,31));
  add('Resumen',[{Desde:ctx.range.from,Hasta:ctx.range.to,Facturado:ctx.amount,Cobrado:ctx.paid,Pendiente:ctx.pending,Ordenes:ctx.orders.length,Clientes:ctx.clients.filter(x=>x.monto>0).length,Gestiones:ctx.calls.length,Conversion_CRM:ctx.crm.conversion}]);
  add('Ventas',ctx.orders.map(o=>({Fecha:reportOrderDateKey(o),Orden:o.codigo,Cliente:orderClientName(o),Vendedor:reportSellerOf(o),Zona:reportZoneOf(o),Condicion:reportPaymentOf(o),Estado:effectiveOrderState(o)||o.estado,Facturado:reportInvoicedAmount(o),Cobrado:reportOrderPaidAmount(o),Pendiente:reportOrderPendingAmount(o)})));
  add('Clientes',ctx.clients.map(x=>({Codigo:x.codigo,Cliente:x.nombre,Segmento:x.segment,Facturado:x.monto,Anterior:x.anteriorMonto,Variacion_pct:x.variacion,Ordenes:x.ordenes,Ticket:x.ticket,Ultima_compra:x.lastDate,Vendedor:x.vendedor,Zona:x.sector})));
  add('Productos',ctx.products.map(x=>({Producto:x.producto,Unidad:x.unidad,Cantidad:x.cantidad,Precio_promedio:x.precioPromedio,Ordenes:x.ordenes,Clientes:x.clientes,Monto:x.monto,Anterior:x.anteriorMonto,Variacion_pct:x.variacion,Devoluciones:x.devoluciones})));
  add('CRM',ctx.calls.map(l=>({Fecha:rowDateKey(l.fecha),Cliente:l.cliente?.negocio||'',Vendedor:l.vendedor||'',Resultado:l.resultado||'',Monto:l.monto||0,Proximo_contacto:l.proximo_contacto||'',Observacion:l.observacion||''})));
  XLSX.writeFile(wb,`reporte-productos-cesar-${ctx.range.from}-a-${ctx.range.to}.xlsx`);toast('Reporte Excel descargado');
}
function renderReportes(c){
  if(state.reportTab==='operacion'){
    renderReportesOperacionV9214(c);
    c.insertAdjacentHTML('afterbegin',reportTabsHtml()+`<div class="report-active-filter-strip"><span><b>Filtros comerciales activos:</b> Vendedor ${esc(state.reportSeller)} · Zona ${esc(state.reportZone)} · Cliente ${esc(state.reportClient==='Todos'?'Todos':'seleccionado')} · Producto ${esc(state.reportProduct==='Todos'?'Todos':'seleccionado')} · Condición ${esc(state.reportPayment)}</span><button class="btn small gray" id="clearReportDimensionFilters">Limpiar dimensiones</button></div>`);
    bindReportTabs(c); const clearDims=$('#clearReportDimensionFilters',c); if(clearDims) clearDims.onclick=()=>{Object.assign(state,{reportSeller:'Todos',reportZone:'Todas',reportClient:'Todos',reportProduct:'Todos',reportPayment:'Todas'});renderReportes(c);}; return;
  }
  const ctx=reportCommercialContext();
  const body=state.reportTab==='ventas'?reportVentasTabV9215(ctx):state.reportTab==='clientes'?reportClientesTabV9215(ctx):state.reportTab==='productos'?reportProductosTabV9215(ctx):state.reportTab==='crm'?reportCrmTabV9215(ctx):reportSummaryTabV9215(ctx);
  c.innerHTML=`${reportTabsHtml()}<div class="executive-hero report-hero report-commercial-hero"><div><div class="hero-eyebrow">V9.2.15 · Ventas, clientes, productos y CRM</div><h3>Centro comercial y de crecimiento</h3><p>Facturación, cobros vinculados, cartera pendiente, segmentación de clientes, rendimiento de productos y conversión de gestiones.</p></div><div class="hero-actions"><button class="btn" data-go="ordenes">Ver órdenes</button><button class="btn gray" data-go="clientes">Clientes</button><button class="btn gray" data-go="control">Control CRM</button><button class="btn dark" id="printReportHero">Imprimir</button></div></div>${reportFilterPanelV9215(ctx)}${body}`;
  $$('[data-go]',c).forEach(b=>b.onclick=()=>{state.page=b.dataset.go;render();});
  $('#printReportHero',c).onclick=()=>window.print();bindReportCommercialV9215(c,ctx);
}


function renderReportesOperacionV9214(c){
  const range=normalizeReportRange(), previous=reportPreviousRange(range.from,range.to);
  const allOrders=(state.ordenes||[]).filter(o=>o.estado!=='Anulado');
  const periodBase=reportRowsInRange(allOrders,range.from,range.to,reportOrderDateKey).filter(reportOrderMatchesDimensionsV9215);
  const previousBase=reportRowsInRange(allOrders,previous.from,previous.to,reportOrderDateKey).filter(reportOrderMatchesDimensionsV9215);
  const periodOrders=periodBase.filter(o=>reportMatchesStatus(o,state.reportStatus));
  const previousOrders=previousBase.filter(o=>reportMatchesStatus(o,state.reportStatus));
  const periodCalls=reportRowsInRange((state.llamadas||[]).filter(reportCallMatchesV9215),range.from,range.to,l=>rowDateKey(l.fecha));
  const previousCalls=reportRowsInRange((state.llamadas||[]).filter(reportCallMatchesV9215),previous.from,previous.to,l=>rowDateKey(l.fecha));
  const todayOrders=allOrders.filter(o=>reportOrderDateKey(o)===today() && reportInvoicedAmount(o)>0);
  const yesterdayOrders=allOrders.filter(o=>reportOrderDateKey(o)===reportDateAdd(today(),-1) && reportInvoicedAmount(o)>0);
  const activeOrders=allOrders.filter(reportIsActiveOrder).filter(reportOrderMatchesDimensionsV9215);
  const invoiced=periodOrders.filter(o=>reportInvoicedAmount(o)>0), prevInvoiced=previousOrders.filter(o=>reportInvoicedAmount(o)>0);
  const amount=invoiced.reduce((s,o)=>s+reportInvoicedAmount(o),0), prevAmount=prevInvoiced.reduce((s,o)=>s+reportInvoicedAmount(o),0);
  const todayAmount=todayOrders.reduce((s,o)=>s+reportInvoicedAmount(o),0), yesterdayAmount=yesterdayOrders.reduce((s,o)=>s+reportInvoicedAmount(o),0);
  const ticket=invoiced.length?amount/invoiced.length:0, prevTicket=prevInvoiced.length?prevAmount/prevInvoiced.length:0;
  const stateGroups=sortEntries(groupCount(periodOrders,o=>effectiveOrderState(o)||o.estado||'Sin estado'));
  const stateAmounts=groupSum(periodOrders,o=>effectiveOrderState(o)||o.estado||'Sin estado',o=>reportInvoicedAmount(o)||orderAmount(o));
  const maxState=Math.max(1,...stateGroups.map(x=>x[1]));
  const stages=['carniceria','facturacion','validacion','delivery','liquidacion'];
  const stageRows=stages.map(stage=>reportStageAnalysis(periodOrders,stage));
  const bottleneck=reportBottleneck(stageRows), stalled=reportStalledOrders(activeOrders);
  const reopenedOrders=periodOrders.filter(o=>reportOrderReopenings(o).length);
  const outlierOrders=Array.from(new Map(stageRows.flatMap(r=>r.outliers.map(x=>[String(x.o.id),x.o]))).values());
  const completedForSla=stageRows.reduce((s,r)=>s+r.count,0), slaOk=stageRows.reduce((s,r)=>s+(r.count-r.over),0);
  const slaCompliance=completedForSla?Math.round((slaOk/completedForSla)*100):0;
  const products=reportProductAggregation(periodOrders).slice(0,8);
  const clients=sortEntries(groupSum(periodOrders,o=>orderClientName(o),o=>reportInvoicedAmount(o)||orderAmount(o))).slice(0,8);
  const prep=sortEntries(groupCount(periodOrders.filter(o=>preparedByDisplay(o)),o=>preparedByDisplay(o))).slice(0,8);
  const deliveries=sortEntries(groupCount(periodOrders.filter(o=>o.delivery_nombre),o=>o.delivery_nombre)).slice(0,8);
  const missingDate=allOrders.filter(o=>!reportOrderDateKey(o)).length;
  const missingAmount=periodOrders.filter(o=>['Facturada','Validada para delivery','Asignada a delivery','En ruta','Entregado','Cobrado','Entregado a crédito','Cerrado'].includes(effectiveOrderState(o)||o.estado||'') && reportInvoicedAmount(o)<=0).length;
  const missingItems=periodOrders.filter(o=>!(o.items||[]).length).length;
  const noHistory=periodOrders.filter(o=>!orderHistoryFor(o).length).length;
  const rangeTxt=`${shortDate(range.from)} al ${shortDate(range.to)}`;
  const prevTxt=`${shortDate(previous.from)} al ${shortDate(previous.to)}`;
  const opCfg=operationAlertConfig(), workMode=operationWorkingConfig().enabled;
  c.innerHTML=`<div class="executive-hero report-hero"><div><div class="hero-eyebrow">V9.2.15 · Operación y tiempos</div><h3>Centro de análisis operativo</h3><p>Tiempo laborable real, SLA por etapa, órdenes detenidas, reaperturas y detección de casos extremos.</p></div><div class="hero-actions"><button class="btn" data-go="ordenes">Ver órdenes</button><button class="btn gray" id="reportConfigBtn">Horario y SLA</button><button class="btn gray" data-go="auditoria">Auditoría</button><button class="btn dark" id="printReportBtn">Imprimir / PDF</button></div></div>
  <div class="panel report-filter-panel"><div class="panel-head"><div><h3>Período y filtros generales</h3><p>Todos los bloques inferiores usan estos mismos filtros. Período comparado: ${esc(prevTxt)}.</p></div><button class="btn gray" id="refreshReportBtn">Actualizar datos</button></div><div class="report-filter-grid"><div class="field"><label>Período rápido</label><select id="reportPreset"><option value="hoy" ${state.reportPreset==='hoy'?'selected':''}>Hoy</option><option value="ayer" ${state.reportPreset==='ayer'?'selected':''}>Ayer</option><option value="semana" ${state.reportPreset==='semana'?'selected':''}>Esta semana</option><option value="mes" ${state.reportPreset==='mes'?'selected':''}>Este mes</option><option value="mes_anterior" ${state.reportPreset==='mes_anterior'?'selected':''}>Mes anterior</option><option value="custom" ${state.reportPreset==='custom'?'selected':''}>Personalizado</option></select></div><div class="field"><label>Desde</label><input id="reportFrom" type="date" value="${esc(range.from)}"></div><div class="field"><label>Hasta</label><input id="reportTo" type="date" value="${esc(range.to)}"></div><div class="field"><label>Estado</label><select id="reportStatus">${['Todos','Activas','Cerradas','Cobrado','Crédito','Programadas'].map(x=>`<option ${state.reportStatus===x?'selected':''}>${x}</option>`).join('')}</select></div><div class="report-filter-actions"><button class="btn" id="applyReportFilters">Aplicar</button><button class="btn gray" id="clearReportFilters">Restablecer</button></div></div><div class="report-period-meta"><b>Período analizado: ${esc(rangeTxt)}</b><span>${periodOrders.length} orden(es) · ${periodCalls.length} gestión(es)</span><span>${workMode?'Tiempo laborable activo':'Tiempo calendario activo'} · ${operationHolidayList(opCfg.feriados||[]).length} feriado(s)</span><span>Actualizado: ${businessDateTime(new Date())}</span></div></div>
  <div class="report-kpi-grid">${reportKpiCard({id:'period',label:'Facturado del período',value:money(amount),small:`${invoiced.length} orden(es) facturadas`,trend:reportTrendHtml(amount,prevAmount),primary:true,info:'Suma total_factura. Cuando falta, usa total_estimado únicamente en estados facturados o posteriores.'})}${reportKpiCard({id:'today',label:'Facturado hoy',value:money(todayAmount),small:`${todayOrders.length} orden(es)`,trend:reportTrendHtml(todayAmount,yesterdayAmount,'ayer'),info:'Monto facturado correspondiente al día de hoy.'})}${reportKpiCard({id:'ticket',label:'Ticket promedio',value:money(ticket),small:`${invoiced.length} orden(es) con monto`,trend:reportTrendHtml(ticket,prevTicket),info:'Facturado del período dividido entre órdenes con monto.'})}${reportKpiCard({id:'orders',label:'Órdenes del período',value:String(periodOrders.length),small:`${periodOrders.filter(o=>reportClosedState(effectiveOrderState(o)||o.estado||'')).length} cerradas`,trend:reportTrendHtml(periodOrders.length,previousOrders.length),info:'Órdenes no anuladas dentro del período.'})}${reportKpiCard({id:'calls',label:'Gestiones CRM',value:String(periodCalls.length),small:`${new Set(periodCalls.map(l=>Number(l.cliente_id)).filter(Boolean)).size} cliente(s)`,trend:reportTrendHtml(periodCalls.length,previousCalls.length),info:'Llamadas o gestiones registradas en el período.'})}${reportKpiCard({id:'active',label:'Órdenes activas',value:String(activeOrders.length),small:'Foto actual del flujo',info:'Incluye etapas abiertas y excluye estados finales.'})}</div>
  <div class="operation-kpi-grid"><button class="operation-kpi ${slaCompliance>=90?'ok':slaCompliance>=70?'warn':'bad'}" data-report-operation="sla"><span>Cumplimiento SLA</span><strong>${completedForSla?slaCompliance+'%':'Sin base'}</strong><small>${completedForSla} etapa(s) válidas</small></button><button class="operation-kpi ${stalled.length?'bad':'ok'}" data-report-operation="stalled"><span>Órdenes detenidas</span><strong>${stalled.length}</strong><small>Superaron el SLA actual</small></button><button class="operation-kpi ${reopenedOrders.length?'warn':'ok'}" data-report-operation="reopened"><span>Órdenes reabiertas</span><strong>${reopenedOrders.length}</strong><small>${opCfg.excluirReaperturasPromedio!==false?'Excluidas del promedio':'Incluidas en promedio'}</small></button><button class="operation-kpi ${outlierOrders.length?'warn':'ok'}" data-report-operation="outliers"><span>Casos extremos</span><strong>${outlierOrders.length}</strong><small>${bottleneck?`Cuello: ${stageLabel(bottleneck.stage)}`:'Sin cuello definido'}</small></button></div>
  <div class="report-quality-grid"><button data-report-quality="amount" class="report-quality ${missingAmount?'warn':'ok'}"><span>Facturadas sin monto</span><strong>${missingAmount}</strong></button><button data-report-quality="items" class="report-quality ${missingItems?'warn':'ok'}"><span>Órdenes sin productos</span><strong>${missingItems}</strong></button><button data-report-quality="history" class="report-quality ${noHistory?'warn':'ok'}"><span>Sin historial de estados</span><strong>${noHistory}</strong></button><div class="report-quality ${missingDate?'bad':'ok'}"><span>Órdenes globales sin fecha</span><strong>${missingDate}</strong></div></div>
  <div class="report-grid"><div class="panel panel-clean"><div class="panel-head"><div><h3>Órdenes por estado</h3><p>Cantidad y monto dentro del período. Pulse una barra para abrir el detalle.</p></div></div><div class="report-bars">${stateGroups.map(([k,v])=>reportStateRow(k,v,stateAmounts[k]||0,maxState)).join('')||'<div class="empty">Sin órdenes para estos filtros.</div>'}</div></div>
  <div class="panel panel-clean"><div class="panel-head"><div><h3>Tiempos y SLA por etapa</h3><p>${workMode?'Descuenta almuerzo, horas cerradas y feriados configurados.':'Usa tiempo calendario.'} Reaperturas ${opCfg.excluirReaperturasPromedio!==false?'excluidas':'incluidas'} del promedio principal.</p></div></div><div class="stage-report-grid">${stageRows.map(r=>`<button class="stage-report clickable ${reportStageClass(r)}" data-report-stage="${r.stage}" title="Abrir órdenes usadas en este cálculo"><b>${esc(stageLabel(r.stage))}</b><strong>${r.count?minutesText(r.avg):'Sin datos cerrados'}</strong><small>${r.count?`Mediana ${minutesText(r.median)} · SLA ${r.sla} min · ${r.compliance}% cumple · ${r.over} fuera`:'No hay entrada y salida completas sin exclusiones.'}</small></button>`).join('')}</div></div></div>
  <div class="panel operation-exceptions"><div class="panel-head"><div><h3>Cuellos de botella y excepciones</h3><p>Prioriza las órdenes que requieren intervención y separa reaperturas de los tiempos normales.</p></div><span class="badge ${bottleneck&&bottleneck.compliance<70?'bad':bottleneck?'warn':'ok'}">${bottleneck?`Mayor presión: ${esc(stageLabel(bottleneck.stage))}`:'Sin cuello detectado'}</span></div><div class="exception-grid"><div><div class="section-title">Detenidas fuera de SLA</div><div class="exception-list">${stalled.slice(0,8).map(x=>`<button class="exception-row bad" data-report-stalled="${x.o.id}"><div><b>${esc(x.o.codigo||('ORD-'+x.o.id))} · ${esc(orderClientName(x.o))}</b><small>${esc(stageLabel(x.stage))} · ${esc(operationMinutesText(x.minutes))} / SLA ${x.sla} min</small></div><span>${x.ratio.toFixed(1)}×</span></button>`).join('')||'<div class="empty compact">No hay órdenes detenidas fuera de SLA.</div>'}</div></div><div><div class="section-title">Reaperturas del período</div><div class="exception-list">${reopenedOrders.slice(0,8).map(o=>`<button class="exception-row warn" data-report-reopened="${o.id}"><div><b>${esc(o.codigo||('ORD-'+o.id))} · ${esc(orderClientName(o))}</b><small>${reportOrderReopenings(o).length} reapertura(s) · ${esc(effectiveOrderState(o)||o.estado||'')}</small></div><span>Revisar</span></button>`).join('')||'<div class="empty compact">No se detectaron reaperturas.</div>'}</div></div><div><div class="section-title">Casos extremos</div><div class="exception-list">${outlierOrders.slice(0,8).map(o=>`<button class="exception-row" data-report-outlier="${o.id}"><div><b>${esc(o.codigo||('ORD-'+o.id))} · ${esc(orderClientName(o))}</b><small>Duración atípica en una o más etapas</small></div><span>Ver</span></button>`).join('')||'<div class="empty compact">No se detectaron duraciones extremas.</div>'}</div></div></div></div>
  <div class="report-grid"><div class="panel panel-clean"><div class="panel-head"><div><h3>Productos más movidos</h3><p>Separados por unidad para evitar mezclar libras, unidades, paquetes o cajas.</p></div></div><div class="table-wrap"><table class="table report-product-table"><thead><tr><th>Producto</th><th>Unidad</th><th>Cantidad</th><th>Órdenes</th><th>Monto</th></tr></thead><tbody>${products.map(p=>`<tr data-report-product="${esc(p.producto)}" data-report-unit="${esc(p.unidad)}"><td><b>${esc(p.producto)}</b></td><td><span class="badge info">${esc(p.unidad)}</span></td><td>${Number(p.cantidad).toLocaleString('es-DO')}</td><td>${p.ordenes}</td><td>${money(p.monto)}</td></tr>`).join('')||'<tr><td colspan="5">Sin productos.</td></tr>'}</tbody></table></div></div>
  <div class="panel panel-clean"><div class="panel-head"><div><h3>Clientes con mayor movimiento</h3><p>Por monto de órdenes dentro del período seleccionado.</p></div></div><div class="report-bars">${clients.map(([k,v])=>`<button class="bar-row money report-client-button" data-report-client="${esc(k)}"><div><b>${esc(k)}</b><span>${money(v)}</span></div><div class="bar"><i style="width:${Math.min(100,pct(v,amount||1))}%"></i></div></button>`).join('')||'<div class="empty">Sin ventas en el período.</div>'}</div></div></div>
  <div class="report-grid"><div class="panel panel-clean"><div class="panel-head"><div><h3>Productividad por despachador</h3><p>Conteo preliminar de órdenes preparadas. Pulse un nombre para revisar las órdenes atribuidas.</p></div></div><div class="report-bars">${prep.map(([k,v])=>`<button class="bar-row report-prep-button" data-report-prep="${esc(k)}"><div><b>${esc(k)}</b><span>${v}</span></div><div class="bar"><i style="width:${Math.min(100,pct(v,Math.max(1,...prep.map(x=>x[1]))))}%"></i></div></button>`).join('')||'<div class="empty">Aún no hay preparaciones finalizadas.</div>'}</div></div>
  <div class="panel panel-clean"><div class="panel-head"><div><h3>Delivery / ruta</h3><p>Órdenes asignadas dentro del período. Pulse un delivery para abrir el detalle.</p></div></div><div class="report-bars">${deliveries.map(([k,v])=>`<button class="bar-row report-delivery-button" data-report-delivery="${esc(k)}"><div><b>${esc(k)}</b><span>${v}</span></div><div class="bar"><i style="width:${Math.min(100,pct(v,Math.max(1,...deliveries.map(x=>x[1]))))}%"></i></div></button>`).join('')||'<div class="empty">Sin órdenes asignadas a delivery.</div>'}</div></div></div>`;
  $$('[data-go]',c).forEach(b=>b.onclick=()=>{state.page=b.dataset.go; render();});
  $('#reportConfigBtn',c).onclick=()=>{state.page='config';state.configTab='alertas';render();};
  $('#reportPreset',c).onchange=e=>{ state.reportPreset=e.target.value; if(state.reportPreset!=='custom'){ const r=reportRangeForPreset(state.reportPreset); state.reportFrom=r.from; state.reportTo=r.to; renderReportes(c); } };
  $('#reportFrom',c).onchange=e=>{state.reportFrom=e.target.value; state.reportPreset='custom';};
  $('#reportTo',c).onchange=e=>{state.reportTo=e.target.value; state.reportPreset='custom';};
  $('#reportStatus',c).onchange=e=>{state.reportStatus=e.target.value; renderReportes(c);};
  $('#applyReportFilters',c).onclick=()=>{state.reportFrom=$('#reportFrom',c).value;state.reportTo=$('#reportTo',c).value;state.reportStatus=$('#reportStatus',c).value;state.reportPreset=$('#reportPreset',c).value;renderReportes(c);};
  $('#clearReportFilters',c).onclick=()=>{const r=reportRangeForPreset('mes');state.reportPreset='mes';state.reportFrom=r.from;state.reportTo=r.to;state.reportStatus='Todos';renderReportes(c);};
  $('#refreshReportBtn',c).onclick=async()=>{await refreshVisibleModuleV9384();renderReportes(c);toast('Reportes actualizados');};
  const pr=$('#printReportBtn',c); if(pr) pr.onclick=()=>window.print();
  $$('[data-report-detail]',c).forEach(b=>b.onclick=()=>{
    const id=b.dataset.reportDetail;
    if(id==='period'||id==='ticket'||id==='orders') return openReportOrdersDetail('Órdenes del período',periodOrders,rangeTxt);
    if(id==='today') return openReportOrdersDetail('Facturado hoy',todayOrders,shortDate(today()));
    if(id==='active') return openReportOrdersDetail('Órdenes activas',activeOrders,'Foto actual del flujo operativo');
    if(id==='calls') return openReportCallsDetail('Gestiones CRM del período',periodCalls,rangeTxt);
  });
  $$('[data-report-operation]',c).forEach(b=>b.onclick=()=>{
    const id=b.dataset.reportOperation;
    if(id==='stalled') return openReportOrdersDetail('Órdenes detenidas',stalled.map(x=>x.o),'Superaron el SLA de su etapa actual');
    if(id==='reopened') return openReportOrdersDetail('Órdenes reabiertas',reopenedOrders,'Transiciones hacia una etapa anterior');
    if(id==='outliers') return openReportOrdersDetail('Casos extremos',outlierOrders,'Duraciones por encima del umbral estadístico y operativo');
    if(id==='sla'&&bottleneck) return openReportStageDetail(bottleneck);
  });
  $$('[data-report-state-value]',c).forEach(b=>b.onclick=()=>{const st=b.dataset.reportStateValue;openReportOrdersDetail('Estado: '+st,periodBase.filter(o=>(effectiveOrderState(o)||o.estado||'Sin estado')===st),rangeTxt);});
  $$('[data-report-stage]',c).forEach(b=>{const r=stageRows.find(x=>x.stage===b.dataset.reportStage);b.onclick=()=>openReportStageDetail(r);});
  $$('[data-report-product]',c).forEach(r=>r.onclick=()=>{const name=r.dataset.reportProduct,unit=r.dataset.reportUnit;openReportOrdersDetail('Producto: '+name,periodOrders.filter(o=>(o.items||[]).some(i=>(i.producto_nombre||'Producto')===name && (i.unidad||'—')===unit)),`${unit} · ${rangeTxt}`);});
  $$('[data-report-client]',c).forEach(b=>b.onclick=()=>openReportOrdersDetail('Cliente: '+b.dataset.reportClient,periodOrders.filter(o=>orderClientName(o)===b.dataset.reportClient),rangeTxt));
  $$('[data-report-prep]',c).forEach(b=>b.onclick=()=>openReportOrdersDetail('Preparado por: '+b.dataset.reportPrep,periodOrders.filter(o=>preparedByDisplay(o)===b.dataset.reportPrep),rangeTxt));
  $$('[data-report-delivery]',c).forEach(b=>b.onclick=()=>openReportOrdersDetail('Delivery: '+b.dataset.reportDelivery,periodOrders.filter(o=>o.delivery_nombre===b.dataset.reportDelivery),rangeTxt));
  $$('[data-report-stalled]',c).forEach(b=>b.onclick=()=>openOrderStatusModal(activeOrders.find(o=>String(o.id)===String(b.dataset.reportStalled))));
  $$('[data-report-reopened]',c).forEach(b=>b.onclick=()=>openOrderStatusModal(periodOrders.find(o=>String(o.id)===String(b.dataset.reportReopened))));
  $$('[data-report-outlier]',c).forEach(b=>b.onclick=()=>openOrderStatusModal(outlierOrders.find(o=>String(o.id)===String(b.dataset.reportOutlier))));
  $$('[data-report-quality]',c).forEach(b=>b.onclick=()=>{const t=b.dataset.reportQuality; const rows=t==='amount'?periodOrders.filter(o=>['Facturada','Validada para delivery','Asignada a delivery','En ruta','Entregado','Cobrado','Entregado a crédito','Cerrado'].includes(effectiveOrderState(o)||o.estado||'')&&reportInvoicedAmount(o)<=0):t==='items'?periodOrders.filter(o=>!(o.items||[]).length):periodOrders.filter(o=>!orderHistoryFor(o).length); openReportOrdersDetail('Calidad de datos',rows,'Registros que requieren revisión');});
}
function auditExceptionFiltered(){
  const q=norm(state.auditExceptionSearch||''), from=state.auditExceptionFrom||'', to=state.auditExceptionTo||'';
  return (state.auditExceptions||[]).filter(x=>{
    const day=String(x.creado_en||'').slice(0,10);
    if(from&&day<from) return false;
    if(to&&day>to) return false;
    if(state.auditExceptionStatus!=='Todos'&&x.estado_revision!==state.auditExceptionStatus) return false;
    if(state.auditExceptionSeverity!=='Todas'&&x.gravedad!==state.auditExceptionSeverity) return false;
    return !q||norm([x.tipo_evento,x.usuario_nombre,x.empleado_nombre,x.cuenta_estacion,x.modulo,x.orden_codigo,x.cliente_nombre,x.lote_codigo,x.motivo,x.nota_administrativa].join(' ')).includes(q);
  });
}
function exportAuditExceptions(rows){
  const data=rows.map(x=>({'Fecha':x.creado_en?businessDateTime(x.creado_en):'','Gravedad':x.gravedad,'Estado revisión':x.estado_revision,'Tipo':x.tipo_evento,'Módulo':x.modulo,'Usuario':x.usuario_nombre,'Empleado':x.empleado_nombre||'','Estación':x.cuenta_estacion||'','Orden':x.orden_codigo||'','Cliente':x.cliente_nombre||'','Lote':x.lote_codigo||'','Esperado':x.valor_esperado??'','Registrado':x.valor_registrado??'','Diferencia':x.diferencia??'','Unidad':x.unidad||'','Motivo':x.motivo,'Nota administrativa':x.nota_administrativa||''}));
  const wb=XLSX.utils.book_new(), ws=XLSX.utils.json_to_sheet(data);
  ws['!cols']=[18,14,20,34,16,24,24,28,20,28,18,14,14,14,10,48,48].map(w=>({wch:w}));
  XLSX.utils.book_append_sheet(wb,ws,'Excepciones');
  XLSX.writeFile(wb,`Auditoria_excepciones_${state.auditExceptionFrom||'inicio'}_${state.auditExceptionTo||today()}.xlsx`);
}
function openAuditExceptionReview(row){
  const body=`<div class="form"><div class="grid2"><div class="kv"><b>Evento</b><span>${esc(row.tipo_evento)}</span></div><div class="kv"><b>Fecha</b><span>${businessDateTime(row.creado_en)}</span></div><div class="kv"><b>Empleado</b><span>${esc(row.empleado_nombre||row.usuario_nombre)}</span></div><div class="kv"><b>Estación</b><span>${esc(row.cuenta_estacion||'Cuenta personal')}</span></div><div class="kv"><b>Orden</b><span>${esc(row.orden_codigo||'—')}</span></div><div class="kv"><b>Diferencia</b><span>${row.diferencia===null||row.diferencia===undefined?'—':esc(`${row.diferencia} ${row.unidad||''}`)}</span></div></div><div class="weight-alert"><b>Motivo declarado</b><br>${esc(row.motivo||'—')}</div><div class="field"><label>Estado de revisión</label><select id="auditReviewStatus">${['Pendiente','Revisado','Requiere seguimiento'].map(x=>`<option ${x===row.estado_revision?'selected':''}>${x}</option>`).join('')}</select></div><div class="field"><label>Nota administrativa</label><textarea id="auditAdminNote" maxlength="1000" placeholder="Conclusión, seguimiento o corrección requerida">${esc(row.nota_administrativa||'')}</textarea></div><button class="btn" id="saveAuditReview">Guardar revisión</button></div>`;
  const m=openModal('Revisar excepción',body,'El registro original y el motivo del empleado permanecen inalterables.');
  $('#saveAuditReview',m).onclick=async()=>{
    const {error}=await sb.rpc('revisar_excepcion_v9378',{p_id:row.id,p_estado:$('#auditReviewStatus',m).value,p_nota:$('#auditAdminNote',m).value||null});
    if(error) return alert(error.message);
    m.remove(); await refreshVisibleModuleV9384(); render(); toast('Revisión administrativa guardada');
  };
}
function renderAuditoria(c){
  if(!isAuditAdministrator(state.profile?.rol)){ c.innerHTML='<div class="error">Este módulo está reservado para Gerente/Administrador.</div>'; return; }
  const exceptionRows=auditExceptionFiltered(), summary=exceptionSummary(state.auditExceptions||[]);
  const q=state.auditSearch||'', tipo=state.auditType||'todos', all=auditEvents();
  const tipos=['todos',...Array.from(new Set(all.map(e=>e.tipo))).sort()];
  const rows=all.filter(e=>(tipo==='todos'||e.tipo===tipo) && (!q || norm([e.tipo,e.actor,e.titulo,e.detalle].join(' ')).includes(norm(q)))).slice(0,250);
  const exceptionHtml=exceptionRows.map(x=>{
    const values=x.valor_esperado!==null&&x.valor_esperado!==undefined?`Esperado ${x.valor_esperado} ${x.unidad||''} · registrado ${x.valor_registrado??'—'} ${x.unidad||''} · diferencia ${x.diferencia??'—'} ${x.unidad||''}`:'';
    return `<div class="audit-exception-card severity-${norm(x.gravedad)}"><div class="audit-exception-head"><div><span class="badge ${x.gravedad==='Crítica'?'bad':x.gravedad==='Advertencia'?'warn':'info'}">${esc(x.gravedad)}</span><span class="badge ${x.estado_revision==='Revisado'?'ok':x.estado_revision==='Requiere seguimiento'?'bad':'warn'}">${esc(x.estado_revision)}</span></div><time>${businessDateTime(x.creado_en)}</time></div><h4>${esc(x.tipo_evento)}</h4><div class="client-sub"><b>${esc(x.empleado_nombre||x.usuario_nombre)}</b> · ${esc(x.modulo)}${x.cuenta_estacion?` · Estación ${esc(x.cuenta_estacion)}`:''}</div><div class="client-sub">${x.orden_codigo?`${esc(x.orden_codigo)} · `:''}${esc(x.cliente_nombre||x.lote_codigo||'')}</div>${values?`<div class="audit-values">${esc(values)}</div>`:''}<p><b>Motivo:</b> ${esc(x.motivo)}</p>${x.nota_administrativa?`<p class="audit-admin-note"><b>Nota administrativa:</b> ${esc(x.nota_administrativa)}</p>`:''}<div class="actions">${x.orden_id?`<button class="btn small gray" data-oper-order="${x.orden_id}">Ver orden</button>`:''}<button class="btn small" data-audit-review="${x.id}">Revisar</button></div></div>`;
  }).join('');
  c.innerHTML=`<div class="audit-private-banner"><div><span>🔒</span><div><h3>Auditoría privada de excepciones</h3><p>Solo Gerente/Administrador puede consultar, revisar y exportar estas decisiones.</p></div></div><button class="btn gray" id="refreshAudit">Actualizar</button></div>
  ${state.auditExceptionsSchemaOk?'':`<div class="error"><b>Auditoría V9.3.7.9 pendiente:</b> ejecuta el SQL 36 para activar el registro privado de excepciones.</div>`}
  <div class="audit-kpis"><div class="card kpi"><div class="label">Hoy</div><div class="value">${summary.today}</div></div><div class="card kpi"><div class="label">Pendientes</div><div class="value">${summary.pending}</div></div><div class="card kpi"><div class="label">Críticas abiertas</div><div class="value">${summary.critical}</div></div><div class="card kpi"><div class="label">Seguimiento</div><div class="value">${summary.followup}</div></div></div>
  <div class="panel"><div class="panel-head"><div><h3>Excepciones bajo responsabilidad</h3><p>${exceptionRows.length} resultado(s) según los filtros.</p></div><button class="btn dark" id="exportAuditExceptions">Exportar Excel</button></div><div class="audit-exception-filters"><div class="field"><label>Desde</label><input type="date" id="auditExceptionFrom" value="${esc(state.auditExceptionFrom)}"></div><div class="field"><label>Hasta</label><input type="date" id="auditExceptionTo" value="${esc(state.auditExceptionTo)}"></div><div class="field"><label>Estado</label><select id="auditExceptionStatus">${['Todos','Pendiente','Revisado','Requiere seguimiento'].map(x=>`<option ${x===state.auditExceptionStatus?'selected':''}>${x}</option>`).join('')}</select></div><div class="field"><label>Gravedad</label><select id="auditExceptionSeverity">${['Todas','Informativa','Advertencia','Crítica'].map(x=>`<option ${x===state.auditExceptionSeverity?'selected':''}>${x}</option>`).join('')}</select></div><div class="field audit-search-wide"><label>Buscar</label><input id="auditExceptionSearch" value="${esc(state.auditExceptionSearch)}" placeholder="Empleado, orden, cliente, motivo o estación..."></div></div><div class="audit-exception-list">${exceptionHtml||'<div class="empty">No hay excepciones con estos filtros.</div>'}</div></div>
  <details class="panel audit-general-details"><summary><b>Trazabilidad general del sistema</b><span>${all.length} eventos de estados, llamadas, órdenes y pagos</span></summary><div class="audit-filters"><input id="auditSearch" value="${esc(q)}" placeholder="Buscar por cliente, usuario, orden o acción..."><select id="auditType">${tipos.map(t=>`<option value="${esc(t)}" ${t===tipo?'selected':''}>${esc(t==='todos'?'Todos los eventos':t)}</option>`).join('')}</select></div><div class="audit-timeline">${rows.map(e=>`<div class="audit-item"><div class="audit-dot"></div><div class="audit-card"><div class="audit-head"><b>${esc(e.tipo)}</b><span>${esc(e.fecha?safeDateObj(e.fecha).toLocaleString('es-DO'):'—')}</span></div><div class="client-title" style="font-size:15px">${esc(e.titulo||'Evento')}</div><div class="client-sub">Usuario/responsable: <b>${esc(workerDisplayName(e.actor)||e.actor||'—')}</b> · Módulo: ${esc(liveTargetName(e.modulo||''))}</div>${e.detalle?`<p class="audit-detail">${esc(e.detalle)}</p>`:''}<div class="actions">${e.ordenId?`<button class="btn small gray" data-oper-order="${e.ordenId}">Ver orden</button>`:''}${e.clienteId?`<button class="btn small gray" data-client="${e.clienteId}">Ficha cliente</button>`:''}</div></div></div>`).join('')||'<div class="empty">No hay eventos con esos filtros.</div>'}</div></details>`;
  const rerender=()=>renderAuditoria($('#content'));
  $('#auditExceptionFrom').onchange=e=>{state.auditExceptionFrom=e.target.value;rerender();};
  $('#auditExceptionTo').onchange=e=>{state.auditExceptionTo=e.target.value;rerender();};
  $('#auditExceptionStatus').onchange=e=>{state.auditExceptionStatus=e.target.value;rerender();};
  $('#auditExceptionSeverity').onchange=e=>{state.auditExceptionSeverity=e.target.value;rerender();};
  $('#auditExceptionSearch').oninput=e=>{const pos=e.target.selectionStart||e.target.value.length;state.auditExceptionSearch=e.target.value;rerender();focusAfterRender('auditExceptionSearch',pos);};
  $('#exportAuditExceptions').onclick=()=>exportAuditExceptions(exceptionRows);
  $$('[data-audit-review]').forEach(b=>b.onclick=()=>openAuditExceptionReview((state.auditExceptions||[]).find(x=>String(x.id)===String(b.dataset.auditReview))));
  $('#auditSearch').oninput=e=>{ const pos=e.target.selectionStart||e.target.value.length; state.auditSearch=e.target.value; rerender(); focusAfterRender('auditSearch',pos); };
  $('#auditType').onchange=e=>{ state.auditType=e.target.value; rerender(); };
  $('#refreshAudit').onclick=async()=>{ await refreshVisibleModuleV9384(); render(); toast('Auditoría actualizada'); };
  bindDynamic();
}

function renderConfig(c){
  const tabs=[['general','Centro de control'],['empresa','General'],['flujos','Flujos de órdenes'],['recibos','Recibos'],['respaldo','Copias de seguridad'],['atajos','Atajos'],['menu','Menú'],['apariencia','Apariencia'],['catalogos','Catálogos'],['peso','Control de peso'],['facturacion','Facturación'],['alertas','Alertas'],['impresion','Impresión'],['seguridad','Seguridad'],['incentivos','Incentivos'],['empleados','Empleados'],['usuarios','Usuarios'],['plantillas','WhatsApp']];
  c.innerHTML=`<div class="panel config-center"><div class="tabs config-tabs">${tabs.map(([id,n])=>`<button class="tab ${state.configTab===id?'active':''}" data-configtab="${id}">${n}</button>`).join('')}</div><div id="configBody"></div></div>`;
  $$('[data-configtab]').forEach(b=>b.onclick=()=>{state.configTab=b.dataset.configtab; renderConfig($('#content'));});
  if(state.configTab==='general') renderConfigGeneral($('#configBody'));
  if(state.configTab==='empresa') renderConfigEmpresa($('#configBody'));
  if(state.configTab==='flujos') renderConfigFlujos($('#configBody'));
  if(state.configTab==='recibos') renderConfigRecibos($('#configBody'));
  if(state.configTab==='respaldo') renderConfigRespaldo($('#configBody'));
  if(state.configTab==='atajos') renderConfigAtajos($('#configBody'));
  if(state.configTab==='menu') renderConfigMenu($('#configBody'));
  if(state.configTab==='apariencia') renderConfigApariencia($('#configBody'));
  if(state.configTab==='catalogos') renderConfigCatalogos($('#configBody'));
  if(state.configTab==='peso') renderConfigPeso($('#configBody'));
  if(state.configTab==='facturacion') renderConfigFacturacion($('#configBody'));
  if(state.configTab==='alertas') renderConfigAlertas($('#configBody'));
  if(state.configTab==='impresion') renderConfigImpresion($('#configBody'));
  if(state.configTab==='seguridad') renderConfigSeguridad($('#configBody'));
  if(state.configTab==='incentivos') renderConfigIncentivos($('#configBody'));
    if(state.configTab==='empleados') renderConfigEmpleados($('#configBody'));
  if(state.configTab==='usuarios') renderConfigUsuarios($('#configBody'));
  if(state.configTab==='plantillas') renderConfigPlantillas($('#configBody'));
}
async function saveConfigKey(key,val){
  const previous=state.systemConfig;
  const {data,error}=await sb.rpc('guardar_configuracion_v9390',{p_clave:key,p_valor:val});
  if(error){
    state.systemConfig=previous;
    appAlert('No se guardó la configuración global. Ningún cambio local fue aplicado.\n\n'+error.message+'\n\nVerifica que ejecutaste el SQL 43 de V9.3.9.0.','Configuración no guardada');
    return false;
  }
  state.systemConfig=normalizeSystemConfig({...previous,[key]:val});
  saveSystemConfigLocal(state.systemConfig);
  toast('Configuración global guardada y sincronizada');
  return Boolean(data?.ok??true);
}
function configCardStatus(title,ok,desc){ return `<div class="config-status ${ok?'ok':'warn'}"><b>${esc(title)}</b><span>${esc(desc)}</span></div>`; }
function renderConfigApariencia(c){
  const u=state.ui;
  c.innerHTML=`<div class="panel-head"><div><h3>Apariencia y menú</h3><p>Configuraciones visuales conectadas a todo el programa: panel, menú, tarjetas, letras y densidad.</p></div><button class="btn gray" id="uiReset">Restablecer</button></div><div class="grid2"><div class="card"><h3>Diseño general</h3><div class="field"><label>Tema</label><select id="uiTheme"><option value="red" ${u.theme==='red'?'selected':''}>Rojo profesional</option><option value="blue" ${u.theme==='blue'?'selected':''}>Azul ejecutivo</option><option value="green" ${u.theme==='green'?'selected':''}>Verde operativo</option><option value="charcoal" ${u.theme==='charcoal'?'selected':''}>Negro elegante</option><option value="dark" ${u.theme==='dark'?'selected':''}>Modo oscuro</option></select></div><div class="field" style="margin-top:12px"><label>Densidad</label><select id="uiDensity"><option value="normal" ${u.density==='normal'?'selected':''}>Normal</option><option value="compact" ${u.density==='compact'?'selected':''}>Compacta: botones y tarjetas pequeñas</option></select></div><div class="field" style="margin-top:12px"><label>Ancho de trabajo</label><select id="uiLayout"><option value="wide" ${(u.layoutWidth||'wide')==='wide'?'selected':''}>Amplio para escritorio</option><option value="contained" ${u.layoutWidth==='contained'?'selected':''}>Contenido centrado</option></select></div></div><div class="card"><h3>Menú lateral</h3><div class="field"><label>Estilo de menú</label><select id="uiMenuStyle"><option value="executive" ${(u.menuStyle||'executive')==='executive'?'selected':''}>Ejecutivo con tarjetas</option><option value="compact" ${u.menuStyle==='compact'?'selected':''}>Compacto</option><option value="minimal" ${u.menuStyle==='minimal'?'selected':''}>Minimalista</option></select></div><div class="field" style="margin-top:12px"><label>Mostrar descripción debajo del módulo</label><select id="uiMenuSubtitles"><option value="true" ${u.menuSubtitles!==false?'selected':''}>Sí</option><option value="false" ${u.menuSubtitles===false?'selected':''}>No, solo nombre</option></select></div><div class="field" style="margin-top:12px"><label>Estilo de panel</label><select id="uiPanelStyle"><option value="executive" ${(u.panelStyle||'executive')==='executive'?'selected':''}>Ejecutivo moderno</option><option value="clean" ${u.panelStyle==='clean'?'selected':''}>Limpio/simple</option></select></div></div></div><div class="grid2" style="margin-top:14px"><div class="card"><div class="field"><label>Tamaño de letra</label><select id="uiFont"><option value="normal" ${u.font==='normal'?'selected':''}>Normal</option><option value="small" ${u.font==='small'?'selected':''}>Pequeña</option><option value="large" ${u.font==='large'?'selected':''}>Grande</option></select></div><div class="field" style="margin-top:12px"><label>Estilo de bordes</label><select id="uiRadius"><option value="normal" ${u.radius==='normal'?'selected':''}>Redondeado profesional</option><option value="soft" ${u.radius==='soft'?'selected':''}>Más cuadrado/compacto</option><option value="pill" ${u.radius==='pill'?'selected':''}>Más redondo/app móvil</option></select></div></div><div class="card"><h3>Vista previa</h3><div class="client-card"><div class="avatar">PC</div><div><div class="client-title">Colmado ejemplo</div><div class="client-sub">Contacto · Sector · estilo actual</div><div class="badges"><span class="badge ok">Activo</span><span class="badge info">Contactado</span><span class="badge warn">Seguimiento</span></div></div><div class="card-actions"><button class="btn small">Gestionar</button><button class="iconbtn whatsapp">WA</button></div></div></div></div>`;
  const save=()=>{ state.ui={theme:$('#uiTheme').value,density:$('#uiDensity').value,font:$('#uiFont').value,radius:$('#uiRadius').value,menuStyle:$('#uiMenuStyle').value,menuSubtitles:$('#uiMenuSubtitles').value==='true',layoutWidth:$('#uiLayout').value,panelStyle:$('#uiPanelStyle').value}; saveUi(); renderConfig($('#content')); };
  ['#uiTheme','#uiDensity','#uiFont','#uiRadius','#uiMenuStyle','#uiMenuSubtitles','#uiLayout','#uiPanelStyle'].forEach(sel=>$(sel).onchange=save);
  $('#uiReset').onclick=()=>{state.ui={theme:'red',density:'normal',font:'normal',radius:'normal',menuStyle:'executive',menuSubtitles:true,layoutWidth:'wide',panelStyle:'executive'}; saveUi(); renderConfig($('#content'));};
}
function renderConfigPlantillas(c){
  const cfg=normalizeSystemConfig(state.systemConfig||{}).whatsapp || defaultSystemConfig().whatsapp;
  c.innerHTML=`<div class="panel-head"><div><h3>WhatsApp</h3><p>Configura la confirmación de órdenes y las plantillas generales para clientes.</p></div><span class="badge info">V9.3.9.0 PWA</span></div>
  <div class="grid2">
    <div class="card">
      <h3>Confirmación de órdenes</h3>
      <label class="checkrow"><input id="waOrderOffer" type="checkbox" ${cfg.ofrecerAlGuardar!==false?'checked':''}> <b>Ofrecer envío después de guardar</b><span>Muestra una vista previa y permite abrir WhatsApp. No envía mensajes automáticamente.</span></label>
      <label class="checkrow"><input id="waOrderManual" type="checkbox" ${cfg.botonManual!==false?'checked':''}> <b>Mostrar botón manual en la orden</b><span>Permite reenviar el detalle desde Trazabilidad de orden.</span></label>
      <div class="success"><b>Protección:</b> el mensaje solo recibe producto, cantidad, unidad, código, fechas y observación de programación. No recibe precios, subtotales, total, crédito ni factura.</div>
    </div>
    <div class="card">
      <h3>Plantilla de confirmación</h3>
      <div class="hint" style="margin-bottom:8px">Variables permitidas: {contacto}, {negocio}, {encabezado}, {codigo_orden}, {fecha_orden}, {fecha_despacho}, {hora_despacho}, {modalidad_entrega}, {direccion_entrega}, {referencia_entrega}, {detalle_sin_precio}, {observacion_cliente}.</div>
      <div class="field"><label>Mensaje</label><textarea id="waOrderTemplate" style="min-height:310px">${esc(cfg.plantilla||defaultSystemConfig().whatsapp.plantilla)}</textarea></div>
      <div class="actions"><button class="btn" id="saveWaOrderCfg">Guardar configuración</button><button class="btn gray" id="previewWaOrderCfg">Vista previa</button><button class="btn gray" id="resetWaOrderCfg">Restablecer</button></div>
    </div>
  </div>
  <div class="section-title">Plantillas generales de WhatsApp</div>
  <div class="panel-head"><div><h3>Mensajes para clientes</h3><p>Variables generales: {contacto}, {negocio}, {telefono}, {sector}, {vendedor}, {monto}, {fecha}, {factura}</p></div><button class="btn" id="newTpl">+ Plantilla</button></div>
  <div class="list">${state.plantillas.map(p=>`<div class="client-card" style="grid-template-columns:1fr auto"><div><div class="client-title" style="font-size:16px">${esc(p.nombre)}</div><div class="client-sub">${esc(p.categoria)} · ${esc(p.texto)}</div></div><div class="card-actions"><span class="badge ${p.activo?'ok':''}">${p.activo?'Activa':'Inactiva'}</span><button class="btn small gray" data-tpl="${p.id}">Editar</button></div></div>`).join('')||'<div class="empty">No hay plantillas generales registradas.</div>'}</div>`;
  $('#saveWaOrderCfg').onclick=async()=>{
    const plantilla=$('#waOrderTemplate').value.trim()||defaultSystemConfig().whatsapp.plantilla;
    const forbidden=plantilla.match(/\{(?:monto|precio|precios|subtotal|total|factura|credito|crédito|balance|condicion_pago)\}/i);
    if(forbidden) return alert(`La variable ${forbidden[0]} no está permitida en la confirmación de orden porque puede exponer información económica.`);
    const val={ofrecerAlGuardar:$('#waOrderOffer').checked,botonManual:$('#waOrderManual').checked,plantilla};
    await saveConfigKey('whatsapp',val);
    renderConfig($('#content'));
  };
  $('#previewWaOrderCfg').onclick=()=>{
    const sample={id:'demo',codigo:'ORD-260720-0001',fecha:today(),fecha_despacho:today(),hora_despacho:'09:00',estado:'Pedido recibido',cliente:{negocio:'COLMADO EJEMPLO',contacto:'Juan',telefono:'8095550000'},items:[{producto_nombre:'Carne de res para guisar',cantidad_pedida:10,unidad:'lb'},{producto_nombre:'Salami especial',cantidad_pedida:2,unidad:'unidad'}],nota_programacion:'Entregar en horario de la mañana.'};
    const msg=buildOrderWhatsAppMessage(sample,'confirmacion',$('#waOrderTemplate').value);
    openModal('Vista previa de confirmación',`<div class="success"><b>Ejemplo sin precios ni monto.</b></div><pre class="wa-order-preview">${esc(msg)}</pre>`,'Este ejemplo no abre WhatsApp.');
  };
  $('#resetWaOrderCfg').onclick=()=>{$('#waOrderTemplate').value=defaultSystemConfig().whatsapp.plantilla;};
  $('#newTpl').onclick=()=>openTemplateForm();
  $$('[data-tpl]').forEach(b=>b.onclick=()=>openTemplateForm(state.plantillas.find(x=>x.id==b.dataset.tpl)));
}
const USER_ROLES=['Gerente','Supervisor','Control','Vendedor','Carnicería','Facturación','Validación','Delivery','Liquidación','Cobrador','Sin perfil'];
function sameUserId(a,b){ return String(a||'')===String(b||''); }
function userBaseLevel(role,moduleId){
  if(role==='Gerente') return 'editar';
  const rp=(state.permisos||[]).find(x=>String(x.rol||'')===String(role||'') && x.modulo===moduleId);
  return rp?.nivel||'none';
}
function userOverrideRow(userId,moduleId){
  return (state.usuarioModulos||[]).find(x=>sameUserId(x.usuario_id,userId) && x.modulo===moduleId) || null;
}
function userFinalLevel(u,moduleId){
  if(!u || u.activo===false) return 'none';
  if(u.rol==='Gerente') return 'editar';
  const ov=userOverrideRow(u.id,moduleId);
  return ov?.nivel||userBaseLevel(u.rol,moduleId);
}
function userAccessSummary(u){
  return navItems.map(([id,n])=>({id,n,nivel:userFinalLevel(u,id)})).filter(x=>x.nivel!=='none');
}
function permissionBadge(level){
  const label=level==='editar'?'Editar':level==='ver'?'Solo ver':'Sin acceso';
  const cls=level==='editar'?'ok':level==='ver'?'info':'bad';
  return `<span class="badge ${cls}">${label}</span>`;
}
function roleMapHtml(){
  const roles=Array.from(new Set([...USER_ROLES.filter(x=>x!=='Sin perfil'),...(state.permisos||[]).map(x=>x.rol).filter(Boolean)])).sort((a,b)=>USER_ROLES.indexOf(a)-USER_ROLES.indexOf(b));
  const deps={
    'Gerente':'Todo el sistema y configuración.',
    'Supervisor':'Vista y control operativo del flujo. La configuración técnica solo se habilita si recibe permiso personalizado.',
    'Control':'Clientes, llamadas, órdenes y productos para registrar ventas.',
    'Vendedor':'Mismo flujo comercial de Control: clientes, gestiones y órdenes.',
    'Carnicería':'Órdenes, clientes, productos, detalle y personal operativo para preparar y pesar.',
    'Facturación':'Órdenes listas, clientes, detalle, productos y pesajes para imprimir y facturar.',
    'Validación':'Órdenes facturadas, clientes, deliverys, detalle y pesajes para validar y asignar.',
    'Delivery':'Sus entregas asignadas, cliente, dirección, teléfono y estado de ruta.',
    'Liquidación':'Órdenes entregadas, clientes, pagos, CXC y cierre de cobros.',
    'Cobrador':'Clientes, órdenes, delivery en lectura y liquidación/CXC.'
  };
  const rows=roles.map(r=>{
    const mods=navItems.map(([id,n])=>{
      const nivel=userBaseLevel(r,id);
      return nivel==='none'?null:`${n} (${nivel==='editar'?'editar':'ver'})`;
    }).filter(Boolean);
    return `<tr><td><b>${esc(r)}</b></td><td><small>${mods.map(esc).join(' · ')||'Sin módulos base'}</small></td><td><small>${esc(deps[r]||'Rol detectado en la base de datos.')}</small></td></tr>`;
  }).join('');
  return `<div class="section-title">Mapa base de roles</div>
  <div class="hint" style="margin-bottom:10px">El acceso final combina el rol base con permisos personalizados. Un permiso personalizado puede heredar el rol, negar acceso, permitir solo lectura o permitir edición.</div>
  <div class="table-wrap"><table class="table"><thead><tr><th>Rol</th><th>Módulos base</th><th>Alcance operativo</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
function renderConfigUsuarios(c){
  const canEdit=puede('config',true);
  const q=state.userSearch||'';
  const roleFilter=state.userRoleFilter||'Todos';
  const statusFilter=state.userStatusFilter||'Todos';
  const linkFilter=state.userLinkFilter||'Todos';
  const roles=Array.from(new Set((state.usuarios||[]).map(u=>u.rol||'Sin perfil'))).sort();
  const linkedCount=(state.usuarios||[]).filter(u=>!!u.empleado_id).length;
  const stationCount=(state.usuarios||[]).filter(u=>accountTypeOf(u)==='estacion').length;
  const unlinkedCount=(state.usuarios||[]).filter(u=>accountTypeOf(u)==='empleado'&&!u.empleado_id).length;
  const rows=(state.usuarios||[]).filter(u=>{
    const emp=linkedEmployeeForUser(u);
    const matchesSearch=!q || norm([u.nombre,u.correo,u.email,u.rol,u.vendedor,u.id,emp?.nombre,emp?.area,accountTypeOf(u)].join(' ')).includes(norm(q));
    const matchesRole=roleFilter==='Todos'||(u.rol||'Sin perfil')===roleFilter;
    const st=u.activo===false?'Inactivo':'Activo';
    const matchesLink=linkFilter==='Todos'
      || (linkFilter==='Vinculados'&&!!u.empleado_id)
      || (linkFilter==='Sin empleado'&&accountTypeOf(u)==='empleado'&&!u.empleado_id)
      || (linkFilter==='Cuentas de estación'&&accountTypeOf(u)==='estacion');
    return matchesSearch&&matchesRole&&(statusFilter==='Todos'||st===statusFilter)&&matchesLink;
  });
  const overrides=(state.usuarioModulos||[]).length;
  c.innerHTML=`<div class="panel-head"><div><h3>Usuarios, empleados y permisos</h3><p>V9.3.9.0 PWA: cada acceso personal se vincula con el empleado real; las cuentas compartidas se identifican como estaciones.</p></div><div class="actions"><button class="btn gray" id="refreshUsers">Actualizar</button><button class="btn gray" id="authGuide">Guía crear login</button></div></div>
  <div class="grid4 compact-kpis">
    <div class="card"><h3>${state.usuarios.length}</h3><p class="hint">perfiles registrados</p></div>
    <div class="card"><h3>${linkedCount}</h3><p class="hint">vinculados a empleados</p></div>
    <div class="card"><h3 class="${unlinkedCount?'bad-text':''}">${unlinkedCount}</h3><p class="hint">usuarios personales sin vincular</p></div>
    <div class="card"><h3>${stationCount}</h3><p class="hint">cuentas de estación</p></div>
  </div>
  <div class="user-filter-grid user-filter-grid-r9" style="margin:14px 0">
    <input id="userSearch" value="${esc(q)}" placeholder="Buscar usuario, empleado, área, rol, correo o ID...">
    <select id="userRoleFilter"><option>Todos</option>${roles.map(r=>`<option ${r===roleFilter?'selected':''}>${esc(r)}</option>`).join('')}</select>
    <select id="userStatusFilter">${['Todos','Activo','Inactivo'].map(v=>`<option ${v===statusFilter?'selected':''}>${v}</option>`).join('')}</select>
    <select id="userLinkFilter">${['Todos','Vinculados','Sin empleado','Cuentas de estación'].map(v=>`<option ${v===linkFilter?'selected':''}>${v}</option>`).join('')}</select>
  </div>
  ${!canEdit?'<div class="error"><b>Acceso de lectura:</b> necesitas Configuración = Editar para modificar usuarios.</div>':''}
  ${unlinkedCount?`<div class="weight-alert"><strong>Identidad pendiente</strong>${unlinkedCount} usuario(s) personal(es) todavía no están vinculados con Empleados. Vincúlalos para que pesajes, órdenes y auditorías muestren la persona correcta.</div>`:''}
  <div class="table-wrap"><table class="table"><thead><tr><th>Usuario / acceso</th><th>Empleado vinculado</th><th>Rol</th><th>Acceso final</th><th>Estado</th><th>Acción</th></tr></thead><tbody>${rows.map(u=>{
    const mods=userAccessSummary(u);
    const custom=(state.usuarioModulos||[]).filter(x=>sameUserId(x.usuario_id,u.id)).length;
    const identity=u.correo||u.email||u.id;
    const emp=linkedEmployeeForUser(u);
    const type=accountTypeOf(u);
    const displayName=emp?.nombre||u.nombre||'Sin nombre';
    const employeeCell=emp
      ? `<b>${esc(emp.nombre)}</b><br><small>${esc(emp.area||'Sin área')}</small><br><span class="badge ok">Vinculado</span>`
      : type==='estacion'
        ? `<span class="badge info">Cuenta de estación</span><br><small>Acceso compartido sin empleado</small>`
        : `<span class="badge bad">Sin empleado</span><br><small>Debe vincularse</small>`;
    return `<tr><td><b>${esc(displayName)}</b><br><small>${esc(identity||'Sin identificación')}</small><br><span class="badge ${type==='estacion'?'info':'ok'}">${type==='estacion'?'Estación':'Personal'}</span></td><td>${employeeCell}</td><td>${esc(u.rol||'Sin perfil')}</td><td><small>${mods.slice(0,3).map(x=>`${esc(x.n)} (${x.nivel==='editar'?'editar':'ver'})`).join(' · ')}${mods.length>3?' · +'+(mods.length-3):''}${!mods.length?'Sin acceso':''}</small>${custom?`<br><span class="badge info">${custom} personalizado(s)</span>`:''}</td><td><span class="badge ${u.activo!==false?'ok':'bad'}">${u.activo!==false?'Activo':'Inactivo'}</span></td><td><button class="btn small gray" data-user="${u.id}" ${canEdit?'':'disabled'}>Editar</button></td></tr>`;
  }).join('')||'<tr><td colspan="6"><div class="empty">No hay usuarios con esos filtros.</div></td></tr>'}</tbody></table></div>${roleMapHtml()}`;
  $('#authGuide').onclick=()=>openAuthGuide();
  $('#refreshUsers').onclick=async()=>{ await refreshVisibleModuleV9384(); state.configTab='usuarios'; renderConfig($('#content')); toast('Usuarios y empleados actualizados'); };
  $('#userSearch').oninput=e=>{const pos=e.target.selectionStart||e.target.value.length;state.userSearch=e.target.value;renderConfigUsuarios(c);focusAfterRender('userSearch',pos);};
  $('#userRoleFilter').onchange=e=>{state.userRoleFilter=e.target.value;renderConfigUsuarios(c);};
  $('#userStatusFilter').onchange=e=>{state.userStatusFilter=e.target.value;renderConfigUsuarios(c);};
  $('#userLinkFilter').onchange=e=>{state.userLinkFilter=e.target.value;renderConfigUsuarios(c);};
  $$('[data-user]',c).forEach(b=>b.onclick=()=>{
    const u=state.usuarios.find(x=>sameUserId(x.id,b.dataset.user));
    if(!u) return alert('No encontré este usuario. Actualiza la pantalla e intenta nuevamente.');
    openUserPerms(u);
  });
}
async function saveUserPermissions(u,profilePatch,overrides){
  const args={p_usuario_id:u.id,p_nombre:profilePatch.nombre,p_rol:profilePatch.rol,p_activo:profilePatch.activo,p_vendedor:profilePatch.vendedor||null,p_empleado_id:profilePatch.empleado_id||null,p_tipo_cuenta:profilePatch.tipo_cuenta||'empleado',p_modulos:overrides};
  const rpc=await sb.rpc('actualizar_usuario_permisos_v930r9',args);
  if(!rpc.error) return rpc.data;
  throw rpc.error;
}
function employeeSelectOptionsForUser(u,selectedId=''){
  const current=String(selectedId||u?.empleado_id||'');
  const rows=[...state.empleados].sort((a,b)=>String(a.nombre||'').localeCompare(String(b.nombre||''),'es'));
  return `<option value="">Selecciona un empleado</option>${rows.map(e=>{
    const linked=linkedUserForEmployee(e);
    const occupied=linked&&!sameUserId(linked.id,u?.id);
    const label=`${e.nombre} · ${e.area}${e.activo===false?' · INACTIVO':''}${occupied?' · vinculado a '+(linked.nombre||linked.correo||'otro usuario'):''}`;
    return `<option value="${e.id}" ${String(e.id)===current?'selected':''} ${occupied?'disabled':''}>${esc(label)}</option>`;
  }).join('')}`;
}
function openUserPerms(u){
  const suggestedEmployeeId=arguments.length>1?arguments[1]:null;
  if(!u) return alert('Usuario no encontrado.');
  if(!puede('config',true)) return alert('Tu perfil no tiene permiso para editar Configuración.');
  const initialEmployeeId=String(suggestedEmployeeId||u.empleado_id||'');
  const initialType=suggestedEmployeeId?'empleado':accountTypeOf(u);
  const roleOptions=Array.from(new Set([...USER_ROLES,...(state.usuarios||[]).map(x=>x.rol).filter(Boolean),...(state.permisos||[]).map(x=>x.rol).filter(Boolean)]));
  const moduleRows=navItems.map(([id,n,d])=>{
    const ov=userOverrideRow(u.id,id);
    const selected=ov?.nivel||'heredar';
    return `<tr data-user-perm-row="${id}"><td><b>${esc(n)}</b><br><small>${esc(d)}</small></td><td data-user-perm-base="${id}">${permissionBadge(userBaseLevel(u.rol,id))}</td><td><select data-user-perm="${id}">
      <option value="heredar" ${selected==='heredar'?'selected':''}>Heredar del rol</option>
      <option value="none" ${selected==='none'?'selected':''}>Sin acceso</option>
      <option value="ver" ${selected==='ver'?'selected':''}>Solo ver</option>
      <option value="editar" ${selected==='editar'?'selected':''}>Editar</option>
    </select></td><td data-user-perm-final="${id}">${permissionBadge(userFinalLevel(u,id))}</td></tr>`;
  }).join('');
  const body=`<div class="grid2"><div class="card"><h3>Identidad, empleado y acceso</h3>
    <div class="field"><label>Tipo de cuenta</label><select id="usrAccountType"><option value="empleado" ${initialType==='empleado'?'selected':''}>Usuario personal de empleado</option><option value="estacion" ${initialType==='estacion'?'selected':''}>Cuenta compartida de estación</option></select></div>
    <div class="field" id="usrEmployeeField"><label>Empleado vinculado</label><select id="usrEmployee">${employeeSelectOptionsForUser(u,initialEmployeeId)}</select><div class="hint" id="usrEmployeeHint">El nombre y la identidad operativa se sincronizan desde Empleados.</div></div>
    <div class="field"><label>Nombre visible</label><input id="usrName" value="${esc(u.nombre||'')}" autocomplete="off"><div class="hint" id="usrNameHint"></div></div>
    <div class="field"><label>Correo / identificación</label><input value="${esc(u.correo||u.email||u.id||'')}" readonly></div>
    <div class="field"><label>Rol base</label><select id="usrRole">${roleOptions.map(r=>`<option value="${esc(r)}" ${r===(u.rol||'Sin perfil')?'selected':''}>${esc(r)}</option>`).join('')}</select><div class="actions" style="margin-top:6px"><button class="btn small gray" id="applySuggestedRole" type="button">Aplicar rol sugerido por área</button><span class="hint" id="suggestedRoleText"></span></div></div>
    <label class="checkrow"><input id="usrActive" type="checkbox" ${u.activo!==false?'checked':''}> <b>Usuario activo</b><span>Al desactivarlo no podrá entrar al CRM.</span></label>
    <div class="hint">El correo y la contraseña se administran en Supabase Authentication. Aquí se vincula la persona, el rol y los módulos.</div>
  </div><div class="card"><h3>Resumen de identidad y seguridad</h3>
    <div class="kv"><b>Empleado</b><span id="usrEmployeeSummary">—</span></div>
    <div class="kv"><b>Área operativa</b><span id="usrAreaSummary">—</span></div>
    <div class="kv"><b>Tipo de acceso</b><span id="usrTypeSummary">—</span></div>
    <div class="kv"><b>Permisos personalizados</b><span>${(state.usuarioModulos||[]).filter(x=>sameUserId(x.usuario_id,u.id)).length}</span></div>
    <div class="kv"><b>Usuario actual</b><span>${sameUserId(u.id,state.user?.id)?'Sí - protección contra autobloqueo':'No'}</span></div>
    <button class="btn gray" id="resetUserOverrides" type="button">Restablecer todos a “Heredar”</button>
  </div></div>
  <div class="section-title">Permisos por módulo</div>
  <div class="table-wrap"><table class="table"><thead><tr><th>Módulo</th><th>Rol base</th><th>Permiso personalizado</th><th>Acceso final</th></tr></thead><tbody>${moduleRows}</tbody></table></div>
  <div class="actions" style="margin-top:16px"><button class="btn" id="saveUserPerms">Guardar vínculo, usuario y permisos</button></div>`;
  const m=openModal('Editar usuario, empleado y módulos',body,'El vínculo usa el ID del empleado, no solo el texto del nombre.');
  const preview=()=>{
    const role=$('#usrRole',m).value;
    $$('[data-user-perm]',m).forEach(sel=>{
      const moduleId=sel.dataset.userPerm;
      const base=userBaseLevel(role,moduleId);
      const final=role==='Gerente'?'editar':(sel.value==='heredar'?base:sel.value);
      const baseCell=$(`[data-user-perm-base="${moduleId}"]`,m);
      const finalCell=$(`[data-user-perm-final="${moduleId}"]`,m);
      if(baseCell) baseCell.innerHTML=permissionBadge(base);
      if(finalCell) finalCell.innerHTML=permissionBadge(final);
      sel.disabled=role==='Gerente';
    });
  };
  const syncIdentityUi=()=>{
    const type=$('#usrAccountType',m).value;
    const employeeId=$('#usrEmployee',m).value;
    const emp=employeeById(employeeId);
    const isEmployee=type==='empleado';
    $('#usrEmployeeField',m).style.display=isEmployee?'block':'none';
    $('#usrEmployee',m).disabled=!isEmployee;
    $('#usrName',m).readOnly=isEmployee&&!!emp;
    if(isEmployee&&emp) $('#usrName',m).value=emp.nombre;
    $('#usrNameHint',m).textContent=isEmployee?(emp?'Sincronizado desde Empleados.':'Selecciona el empleado para completar el nombre.'):'Nombre de la estación, por ejemplo “Carnicería 1”.';
    $('#usrEmployeeSummary',m).textContent=isEmployee?(emp?.nombre||'Sin vincular'):'No aplica';
    $('#usrAreaSummary',m).textContent=isEmployee?(emp?.area||'—'):'Cuenta compartida';
    $('#usrTypeSummary',m).textContent=isEmployee?'Usuario personal':'Cuenta de estación';
    const suggested=emp?roleSuggestionForEmployee(emp):'Sin perfil';
    $('#suggestedRoleText',m).textContent=emp?`Sugerido: ${suggested}`:'';
    $('#applySuggestedRole',m).disabled=!emp;
  };
  $('#usrRole',m).onchange=preview;
  $$('[data-user-perm]',m).forEach(s=>s.onchange=preview);
  $('#usrAccountType',m).onchange=syncIdentityUi;
  $('#usrEmployee',m).onchange=syncIdentityUi;
  $('#applySuggestedRole',m).onclick=()=>{const emp=employeeById($('#usrEmployee',m).value);if(emp){$('#usrRole',m).value=roleSuggestionForEmployee(emp);preview();}};
  $('#resetUserOverrides',m).onclick=()=>{$$('[data-user-perm]',m).forEach(s=>s.value='heredar');preview();};
  preview(); syncIdentityUi();
  $('#saveUserPerms',m).onclick=async()=>{
    const btn=$('#saveUserPerms',m);
    const tipoCuenta=$('#usrAccountType',m).value;
    const empleadoId=tipoCuenta==='empleado' ? ($('#usrEmployee',m).value||null) : null;
    const emp=employeeById(empleadoId);
    const nombre=(tipoCuenta==='empleado'&&emp?emp.nombre:$('#usrName',m).value.trim());
    const rol=$('#usrRole',m).value;
    const activo=$('#usrActive',m).checked;
    if(tipoCuenta==='empleado'&&!empleadoId) return alert('Selecciona el empleado que utilizará este usuario.');
    if(tipoCuenta==='empleado'&&emp?.activo===false&&activo) return alert('El empleado está inactivo. Reactívalo en Empleados o deja el usuario inactivo.');
    if(!nombre) return alert('Escribe el nombre visible del usuario o estación.');
    if(!rol) return alert('Selecciona un rol.');
    const duplicate=empleadoId&&(state.usuarios||[]).find(x=>!sameUserId(x.id,u.id)&&String(x.empleado_id||'')===String(empleadoId));
    if(duplicate) return alert(`Ese empleado ya está vinculado al usuario ${duplicate.nombre||duplicate.correo||duplicate.id}.`);
    const overrides=rol==='Gerente'?[]:$$('[data-user-perm]',m).map(s=>({modulo:s.dataset.userPerm,nivel:s.value})).filter(x=>x.nivel!=='heredar');
    const configOverride=rol==='Gerente'?'editar':(overrides.find(x=>x.modulo==='config')?.nivel||userBaseLevel(rol,'config'));
    if(sameUserId(u.id,state.user?.id) && (!activo || configOverride!=='editar')) return alert('No puedes desactivar tu propio usuario ni quitarte Configuración = Editar desde esta sesión.');
    btn.disabled=true; btn.textContent='Guardando...';
    try{
      await saveUserPermissions(u,{nombre,rol,activo,vendedor:emp?.nombre||null,empleado_id:empleadoId?Number(empleadoId):null,tipo_cuenta:tipoCuenta,actualizado_en:new Date().toISOString()},overrides);
      m.remove(); await refreshVisibleModuleV9384(); state.configTab='usuarios'; renderConfig($('#content')); toast('Usuario vinculado y permisos actualizados');
    }catch(e){
      console.error(e);
      alert('No se pudo guardar el vínculo del usuario: '+(e.message||e)+'. Ejecuta el SQL 26_actualizacion_v930r9_vincular_usuarios_empleados.sql y revisa las políticas RLS.');
      btn.disabled=false; btn.textContent='Guardar vínculo, usuario y permisos';
    }
  };
}
function openAuthGuide(){
  openModal('Guía para crear login del empleado',`<div class="card"><h3>1. Crear la credencial</h3><p class="hint">Supabase → Authentication → Users → Add user. Escribe el correo y una contraseña temporal.</p><h3>2. Confirmar el perfil</h3><p class="hint">El mismo ID de Authentication debe existir en <b>perfiles</b>.</p><h3>3. Vincular la persona</h3><p class="hint">Regresa a Configuración → Usuarios, pulsa Editar, selecciona <b>Usuario personal de empleado</b> y elige el empleado desde el catálogo.</p><h3>4. Asignar acceso</h3><p class="hint">Revisa el rol sugerido por el área y configura las excepciones por módulo.</p><h3>5. Cuentas compartidas</h3><p class="hint">Usa “Cuenta de estación” solo para equipos compartidos. Estas cuentas no identifican con precisión a una persona.</p><div class="success"><b>Seguridad:</b> el correo y las contraseñas permanecen en Supabase Auth. El CRM guarda únicamente el vínculo con el empleado, el rol y los permisos.</div></div>`);
}

function renderConfigGeneral(c){
  const sc=normalizeSystemConfig(state.systemConfig||{}); const wc=normalizeWeightConfig(state.weightConfig||{});
  sc.empresa=sc.empresa||defaultSystemConfig().empresa; sc.alertas=sc.alertas||defaultSystemConfig().alertas; sc.impresion=sc.impresion||defaultSystemConfig().impresion; sc.recibos=sc.recibos||defaultSystemConfig().recibos; sc.respaldo=sc.respaldo||defaultSystemConfig().respaldo; sc.atajos=sc.atajos||defaultSystemConfig().atajos; sc.seguridad=sc.seguridad||defaultSystemConfig().seguridad;
  const enabled=navItems.filter(([id])=>moduleEnabled(id)).length;
  c.innerHTML=`<div class="panel-head"><div><h3>Centro de configuración</h3><p>Todo lo que cambies aquí alimenta los módulos operativos del sistema.</p></div><span class="badge info">V9.3.9.0 PWA</span></div>
  <div class="config-overview">
    ${configCardStatus('Empresa',!!sc.empresa.nombre,`Nombre: ${sc.empresa.nombre || 'sin configurar'}`)}
    ${configCardStatus('Menú',enabled>0,`${enabled} módulos activos de ${navItems.length}`)}
    ${configCardStatus('Control de peso',wc.exigirPesoReal,`Aviso ${wc.avisoLb} lb / ${wc.avisoPct}% · bloqueo ${wc.maxLb} lb / ${wc.maxPct}%`)}
    ${configCardStatus('Alertas en vivo',true,`Respaldo cada ${pollSeconds()} segundos · parpadeo ${sc.alertas.parpadeoNuevas?'activo':'apagado'}`)}
    ${configCardStatus('Impresión',true,`${sc.impresion.ticketCarniceria} carnicería · ${sc.impresion.ticketFacturacion} facturación`)}
    ${configCardStatus('Recibos',true,`${sc.recibos.tituloLiquidacion || 'Recibo'} · encabezado ${sc.recibos.mostrarLogo!==false?'activo':'sin logo'}`)}
    ${configCardStatus('Copias de seguridad',true,`Frecuencia sugerida: ${sc.respaldo.frecuencia || 'Semanal'}`)}
    ${configCardStatus('Atajos',sc.atajos.activos!==false,sc.atajos.activos!==false?'Activos':'Desactivados')}
    ${configCardStatus('Seguridad',sc.seguridad.soloAdminEliminar,'Eliminar/anular restringido por rol operativo')}
    ${configCardStatus('WhatsApp órdenes',sc.whatsapp?.ofrecerAlGuardar!==false,sc.whatsapp?.ofrecerAlGuardar!==false?'Confirmación al guardar activa':'Confirmación al guardar desactivada')}
  </div>
  <div class="grid2" style="margin-top:16px"><div class="card"><h3>Recomendación operativa</h3><p class="hint">Mantén activos solo los módulos que usas. Las unidades y categorías deben agregarse desde Catálogos para que Productos, Órdenes y Carnicería usen la misma información.</p><div class="actions"><button class="btn" data-config-go="catalogos">Revisar catálogos</button><button class="btn gray" data-config-go="peso">Control de peso</button></div></div><div class="card"><h3>Conexiones principales</h3><div class="kv"><b>Categorías/unidades</b><span>Productos → Órdenes → Carnicería</span></div><div class="kv"><b>Deliverys</b><span>Validación → Delivery → Liquidación</span></div><div class="kv"><b>Roles</b><span>Menú → permisos → acciones permitidas</span></div><div class="kv"><b>Alertas</b><span>Realtime → sonido/parpadeo → módulos</span></div></div></div>`;
  $$('[data-config-go]').forEach(b=>b.onclick=()=>{state.configTab=b.dataset.configGo; renderConfig($('#content'));});
}
function renderConfigEmpresa(c){ const e=normalizeSystemConfig(state.systemConfig||{}).empresa || defaultSystemConfig().empresa;
  c.innerHTML=`<div class="panel-head"><div><h3>Configuración general del negocio</h3><p>Datos maestros que salen en menú, reportes, hojas de ruta, recibos y facturas internas.</p></div><span class="badge info">V9.3.9.0 PWA</span></div><div class="grid2"><div class="card"><div class="field"><label>Nombre comercial</label><input id="empNombre" value="${esc(e.nombre)}"></div><div class="field"><label>Subtítulo del sistema</label><input id="empSub" value="${esc(e.subtitulo)}"></div><div class="grid2"><div class="field"><label>Texto del logo</label><input id="empLogo" maxlength="6" value="${esc(e.logoTexto)}"></div><div class="field"><label>Moneda</label><input id="empMoneda" value="${esc(e.moneda)}"></div></div><div class="field"><label>Logo URL opcional</label><input id="empLogoUrl" value="${esc(e.logoUrl||'')}" placeholder="https://.../logo.png"><div class="hint">Opcional. Si se deja vacío, se usa el texto del logo.</div></div></div><div class="card"><div class="grid2"><div class="field"><label>Teléfono</label><input id="empTel" value="${esc(e.telefono)}"></div><div class="field"><label>RNC</label><input id="empRnc" value="${esc(e.rnc||'')}"></div></div><div class="field"><label>Correo</label><input id="empCorreo" value="${esc(e.correo||'')}"></div><div class="field"><label>Dirección</label><textarea id="empDir">${esc(e.direccion)}</textarea></div><div class="success"><b>Conectado:</b> estos datos se usan en reportes, recibos, hoja de ruta, tickets y encabezado del sistema.</div><button class="btn" id="saveEmpresa">Guardar configuración general</button></div></div>`;
  $('#saveEmpresa').onclick=async()=>{ const val={nombre:$('#empNombre').value.trim()||'Productos César',subtitulo:$('#empSub').value.trim()||'CRM · Despacho · CXC',logoTexto:$('#empLogo').value.trim()||'PC',logoUrl:$('#empLogoUrl').value.trim(),moneda:$('#empMoneda').value.trim()||'RD$',telefono:$('#empTel').value.trim(),rnc:$('#empRnc').value.trim(),correo:$('#empCorreo').value.trim(),direccion:$('#empDir').value.trim()}; await saveConfigKey('empresa',val); render(); state.configTab='empresa'; state.page='config'; setTimeout(()=>renderConfig($('#content')),50); };
}
function renderConfigFlujos(c){
  const f=normalizeSystemConfig(state.systemConfig||{}).flujos||defaultSystemConfig().flujos;
  c.innerHTML=`<div class="panel-head"><div><h3>Flujos de órdenes</h3><p>Define la modalidad predeterminada y las reglas de ventas internas y retiros.</p></div><span class="badge info">V9.3.3</span></div><div class="grid2"><div class="card"><div class="field"><label>Modalidad predeterminada</label><select id="flowDefault"><option ${f.modalidadPredeterminada==='Delivery'?'selected':''}>Delivery</option><option ${f.modalidadPredeterminada==='Retiro en negocio'?'selected':''}>Retiro en negocio</option></select></div><label class="checkrow"><input id="flowInternal" type="checkbox" ${f.permitirVentasInternas!==false?'checked':''}> <b>Permitir ventas internas</b><span>No crean ficha de cliente.</span></label><label class="checkrow"><input id="flowInternalPickup" type="checkbox" checked disabled> <b>Venta interna solo retiro</b><span>Bloquea Delivery sin cliente registrado.</span></label><label class="checkrow"><input id="flowInternalCash" type="checkbox" checked disabled> <b>Venta interna al contado</b><span>No permite crédito sin ficha formal.</span></label></div><div class="card"><div class="pickup-alert"><b>Flujo de retiro</b><span>Carnicería → Facturación → Lista para retiro → Entregada en negocio. Se excluye de Delivery y Liquidación.</span></div><label class="checkrow"><input id="flowConfirmPickup" type="checkbox" ${f.confirmarRetiro!==false?'checked':''}> <b>Confirmar quién retira</b><span>Obligatorio para cerrar la orden.</span></label><div class="success"><b>Regla fija:</b> toda orden exige un nombre de cliente o comprador. Esta regla no se puede desactivar.</div><button class="btn" id="saveFlows">Guardar flujos</button></div></div>`;
  $('#saveFlows').onclick=async()=>{ const val={modalidadPredeterminada:$('#flowDefault').value,permitirVentasInternas:$('#flowInternal').checked,ventaInternaSoloRetiro:true,ventaInternaContado:true,exigirNombreCliente:true,confirmarRetiro:$('#flowConfirmPickup').checked}; await saveConfigKey('flujos',val); renderConfig($('#content')); };
}
function renderConfigRecibos(c){ const cfg=normalizeSystemConfig(state.systemConfig||{}); const r=cfg.recibos||defaultSystemConfig().recibos; const e=cfg.empresa||{};
  c.innerHTML=`<div class="panel-head"><div><h3>Configuración de recibos y encabezados</h3><p>Controla el texto que aparece en recibos, hojas de ruta, tickets y reportes impresos.</p></div><span class="badge info">Editable</span></div><div class="grid2"><div class="card"><div class="grid2"><div class="field"><label>Título orden/facturación interna</label><input id="recTituloOrden" value="${esc(r.tituloOrden)}"></div><div class="field"><label>Título hoja de ruta</label><input id="recTituloRuta" value="${esc(r.tituloRuta)}"></div><div class="field"><label>Título recibo liquidación</label><input id="recTituloLiquidacion" value="${esc(r.tituloLiquidacion)}"></div><div class="field"><label>Título historial</label><input id="recTituloHistorial" value="${esc(r.tituloHistorial)}"></div></div><div class="field"><label>Pie / nota fija</label><input id="recPie" value="${esc(r.pie)}"></div><div class="grid2"><div class="field"><label>Firma delivery</label><input id="recFirmaDelivery" value="${esc(r.firmaDelivery)}"></div><div class="field"><label>Firma recibido por</label><input id="recFirmaRecibido" value="${esc(r.firmaRecibido)}"></div><div class="field"><label>Firma validación</label><input id="recFirmaValidacion" value="${esc(r.firmaValidacion)}"></div><div class="field"><label>Firma facturación</label><input id="recFirmaFacturacion" value="${esc(r.firmaFacturacion)}"></div></div></div><div class="card"><h3>Elementos visibles</h3><label class="checkrow"><input id="recLogo" type="checkbox" ${r.mostrarLogo!==false?'checked':''}> <b>Mostrar logo/nombre</b><span>Usa Configuración general.</span></label><label class="checkrow"><input id="recTel" type="checkbox" ${r.mostrarTelefono!==false?'checked':''}> <b>Mostrar teléfono</b><span>${esc(e.telefono||'Sin teléfono configurado')}</span></label><label class="checkrow"><input id="recDir" type="checkbox" ${r.mostrarDireccion!==false?'checked':''}> <b>Mostrar dirección</b><span>${esc(e.direccion||'Sin dirección configurada')}</span></label><label class="checkrow"><input id="recRnc" type="checkbox" ${r.mostrarRnc?'checked':''}> <b>Mostrar RNC</b><span>${esc(e.rnc||'Sin RNC configurado')}</span></label><label class="checkrow"><input id="recCorreo" type="checkbox" ${r.mostrarCorreo?'checked':''}> <b>Mostrar correo</b><span>${esc(e.correo||'Sin correo configurado')}</span></label><label class="checkrow"><input id="recFecha" type="checkbox" ${r.mostrarFecha!==false?'checked':''}> <b>Mostrar fecha/hora de impresión</b><span>Se agrega automáticamente.</span></label><div class="success" style="margin-top:12px"><b>Vista previa:</b><br>${printCompanyHeader(r.tituloLiquidacion,'Ejemplo de encabezado').replace(/</g,'&lt;').slice(0,160)}...</div><button class="btn" id="saveRecibos">Guardar recibos</button></div></div>`;
  $('#saveRecibos').onclick=async()=>{ const val={tituloOrden:$('#recTituloOrden').value.trim()||'Orden para facturar',tituloRuta:$('#recTituloRuta').value.trim()||'Hoja de ruta / lote de entrega',tituloLiquidacion:$('#recTituloLiquidacion').value.trim()||'Recibo de liquidación',tituloHistorial:$('#recTituloHistorial').value.trim()||'Historial de liquidaciones',mostrarLogo:$('#recLogo').checked,mostrarTelefono:$('#recTel').checked,mostrarDireccion:$('#recDir').checked,mostrarRnc:$('#recRnc').checked,mostrarCorreo:$('#recCorreo').checked,mostrarFecha:$('#recFecha').checked,pie:$('#recPie').value.trim(),firmaDelivery:$('#recFirmaDelivery').value.trim()||'Firma delivery',firmaRecibido:$('#recFirmaRecibido').value.trim()||'Firma recibido por',firmaValidacion:$('#recFirmaValidacion').value.trim()||'Entregado por validación',firmaFacturacion:$('#recFirmaFacturacion').value.trim()||'Facturado por'}; await saveConfigKey('recibos',val); renderConfig($('#content')); };
}
function renderConfigRespaldo(c){ const b=normalizeSystemConfig(state.systemConfig||{}).respaldo||defaultSystemConfig().respaldo;
  c.innerHTML=`<div class="panel-head"><div><h3>Copias de seguridad</h3><p>Exporta una copia local de datos operativos y configuración para control interno.</p></div></div><div class="grid2"><div class="card"><label class="checkrow"><input id="bakActivo" type="checkbox" ${b.recordatorioActivo!==false?'checked':''}> <b>Recordatorio activo</b><span>Solo visible como control operativo.</span></label><div class="field"><label>Frecuencia sugerida</label><select id="bakFrecuencia"><option ${b.frecuencia==='Diario'?'selected':''}>Diario</option><option ${b.frecuencia==='Semanal'?'selected':''}>Semanal</option><option ${b.frecuencia==='Mensual'?'selected':''}>Mensual</option></select></div><label class="checkrow"><input id="bakClientes" type="checkbox" ${b.incluirClientes!==false?'checked':''}> <b>Clientes</b></label><label class="checkrow"><input id="bakOrdenes" type="checkbox" ${b.incluirOrdenes!==false?'checked':''}> <b>Órdenes y liquidaciones</b></label><label class="checkrow"><input id="bakCatalogos" type="checkbox" ${b.incluirCatalogos!==false?'checked':''}> <b>Catálogos/productos</b></label><label class="checkrow"><input id="bakConfig" type="checkbox" ${b.incluirConfiguracion!==false?'checked':''}> <b>Configuración</b></label><button class="btn" id="saveBackupCfg">Guardar configuración</button></div><div class="card"><h3>Respaldo manual</h3><p class="hint">Descarga un archivo JSON con la información que el CRM tiene cargada en pantalla. No reemplaza los backups automáticos de Supabase, pero sirve como soporte operativo.</p><button class="btn dark" id="downloadBackup">Descargar respaldo ahora</button><div class="success" style="margin-top:12px"><b>Recomendación:</b> antes de aplicar SQL o publicar una versión nueva, descarga una copia manual.</div></div></div>`;
  $('#saveBackupCfg').onclick=async()=>{ const val={recordatorioActivo:$('#bakActivo').checked,frecuencia:$('#bakFrecuencia').value,incluirClientes:$('#bakClientes').checked,incluirOrdenes:$('#bakOrdenes').checked,incluirCatalogos:$('#bakCatalogos').checked,incluirConfiguracion:$('#bakConfig').checked,ultimoManual:b.ultimoManual||''}; await saveConfigKey('respaldo',val); };
  $('#downloadBackup').onclick=()=>exportBackup();
}
function renderConfigAtajos(c){ const a=normalizeSystemConfig(state.systemConfig||{}).atajos||defaultSystemConfig().atajos;
  const row=(k,label,desc)=>`<div class="shortcut-row"><b>${esc(label)}</b><span>${esc(a[k]||'')}</span><small>${esc(desc||'')}</small></div>`;
  c.innerHTML=`<div class="panel-head"><div><h3>Atajos de teclado</h3><p>Accesos rápidos para trabajar más fluido sin romper el flujo con Enter de los formularios.</p></div><span class="badge info">Operativo</span></div><div class="grid2"><div class="card"><label class="checkrow"><input id="atajosActivos" type="checkbox" ${a.activos!==false?'checked':''}> <b>Activar atajos</b><span>Se aplican en todo el sistema.</span></label>${row('nuevaOrden','Ir a Órdenes / nueva orden','Ctrl + Alt + O')}${row('clientes','Ir a Clientes','Ctrl + Alt + C')}${row('liquidacion','Ir a Liquidación','Ctrl + Alt + L')}${row('productividad','Ir a Productividad','Ctrl + Alt + P')}${row('buscar','Enfocar buscador','Ctrl + Alt + F')}${row('guardar','Guardar dentro de modal','Ctrl + S')}${row('cerrar','Cerrar modal','Esc')}</div><div class="card"><h3>Regla importante</h3><p>Los formularios siguen usando <b>Enter</b> para avanzar campo por campo. Los atajos globales usan <b>Ctrl + Alt</b> para no chocar con la captura rápida.</p><button class="btn" id="saveAtajos">Guardar atajos</button></div></div>`;
  $('#saveAtajos').onclick=async()=>{ const val={...a,activos:$('#atajosActivos').checked}; await saveConfigKey('atajos',val); toast('Atajos guardados'); };
}
function renderConfigMenu(c){ const m=normalizeSystemConfig(state.systemConfig||{}).menu || defaultSystemConfig().menu; const map=m.modulosActivos||{};
  c.innerHTML=`<div class="panel-head"><div><h3>Menú y módulos</h3><p>Controla la presentación global del menú. Los permisos por usuario siguen en Usuarios y módulos.</p></div></div><div class="grid2"><div class="card"><div class="field"><label>Mostrar iconos</label><select id="menuIcons"><option value="true" ${m.mostrarIconos!==false?'selected':''}>Sí</option><option value="false" ${m.mostrarIconos===false?'selected':''}>No</option></select></div><div class="field"><label>Mostrar subtítulos</label><select id="menuSubs"><option value="true" ${m.mostrarSubtitulos!==false?'selected':''}>Sí</option><option value="false" ${m.mostrarSubtitulos===false?'selected':''}>No</option></select></div><div class="field"><label>Modo compacto</label><select id="menuCompact"><option value="false" ${!m.menuCompacto?'selected':''}>No</option><option value="true" ${m.menuCompacto?'selected':''}>Sí</option></select></div></div><div class="card"><h3>Módulos visibles en el sistema</h3><p class="hint">No sustituye permisos: si apagas un módulo aquí, se oculta para todos.</p>${navItems.map(([id,n,d])=>`<label class="checkrow"><input type="checkbox" data-mod-active="${id}" ${(id==='config'||id==='inicio')?'disabled':''} ${(id==='config'||id==='inicio'||map[id]!==false)?'checked':''}> <b>${esc(n)}</b><span>${esc(d)}${(id==='config'||id==='inicio')?' · fijo':''}</span></label>`).join('')}<button class="btn" id="saveMenuCfg">Guardar menú</button></div></div>`;
  $('#saveMenuCfg').onclick=async()=>{ const modulosActivos={inicio:true,config:true}; $$('[data-mod-active]').forEach(x=>modulosActivos[x.dataset.modActive]=(x.disabled?true:x.checked)); const val={mostrarIconos:$('#menuIcons').value==='true',mostrarSubtitulos:$('#menuSubs').value==='true',menuCompacto:$('#menuCompact').value==='true',modulosActivos}; await saveConfigKey('menu',val); render(); };
}
function renderConfigPeso(c){ renderConfigGeneral(c); const panel=c.querySelector('.panel-head'); if(panel) panel.querySelector('h3').textContent='Control de peso en Carnicería';
  const cfg=normalizeWeightConfig(state.weightConfig||{});
  c.innerHTML=`<div class="panel-head"><div><h3>Control de peso en Carnicería</h3><p>El sistema calcula un peso de referencia por artículos; el despachador registra el peso real de balanza.</p></div></div><div class="grid2"><div class="card"><div class="field"><label>Exigir peso real antes de facturar</label><select id="cfgExigirPeso"><option value="true" ${cfg.exigirPesoReal?'selected':''}>Sí</option><option value="false" ${!cfg.exigirPesoReal?'selected':''}>No</option></select></div><div class="field"><label>Método de cálculo</label><select id="cfgMetodoPeso"><option value="mayor" ${cfg.metodo==='mayor'?'selected':''}>Usar la mayor entre libras y porcentaje</option><option value="libras" ${cfg.metodo==='libras'?'selected':''}>Solo libras</option><option value="porcentaje" ${cfg.metodo==='porcentaje'?'selected':''}>Solo porcentaje</option></select></div><div class="success"><b>Regla:</b> dentro de aviso continúa normal; sobre aviso permite continuar bajo responsabilidad; sobre máximo bloquea.</div></div><div class="card"><div class="section-title">Tolerancia de aviso</div><div class="grid2"><div class="field"><label>Aviso en libras</label><input id="cfgAvisoLb" type="number" step="0.01" value="${cfg.avisoLb}"></div><div class="field"><label>Aviso en porcentaje</label><input id="cfgAvisoPct" type="number" step="0.01" value="${cfg.avisoPct}"></div></div><div class="section-title">Tolerancia máxima de bloqueo</div><div class="grid2"><div class="field"><label>Máximo en libras</label><input id="cfgMaxLb" type="number" step="0.01" value="${cfg.maxLb}"></div><div class="field"><label>Máximo en porcentaje</label><input id="cfgMaxPct" type="number" step="0.01" value="${cfg.maxPct}"></div></div><button class="btn" id="saveWeightCfg">Guardar control de peso</button></div></div>`;
  $('#saveWeightCfg').onclick=saveWeightConfig;
}
function renderConfigFacturacion(c){
  const f=normalizeInvoiceConfig(appCfg('facturacion',{}));
  c.innerHTML=`<div class="panel-head"><div><h3>Control de facturación</h3><p>Valida que monto y peso registrados en factura coincidan con lo calculado/preparado por Carnicería.</p></div></div><div class="grid2"><div class="card"><h3>Control de monto</h3><div class="field"><label>Método de cálculo</label><select id="facMetodoCfg"><option value="mayor" ${f.metodo==='mayor'?'selected':''}>Usar la mayor entre RD$ y porcentaje</option><option value="monto" ${f.metodo==='monto'?'selected':''}>Solo RD$</option><option value="porcentaje" ${f.metodo==='porcentaje'?'selected':''}>Solo porcentaje</option></select></div><div class="section-title">Tolerancia de aviso</div><div class="grid2"><div class="field"><label>Aviso en RD$</label><input id="facAvisoMonto" type="number" step="0.01" value="${f.avisoMonto}"></div><div class="field"><label>Aviso en porcentaje</label><input id="facAvisoPct" type="number" step="0.01" value="${f.avisoPct}"></div></div><div class="section-title">Tolerancia máxima de bloqueo</div><div class="grid2"><div class="field"><label>Máximo en RD$</label><input id="facMaxMonto" type="number" step="0.01" value="${f.maxMonto}"></div><div class="field"><label>Máximo en porcentaje</label><input id="facMaxPct" type="number" step="0.01" value="${f.maxPct}"></div></div></div><div class="card"><h3>Control de peso facturado</h3><div class="field"><label>Exigir peso facturado</label><select id="facExigirPeso"><option value="true" ${f.exigirPesoFacturado?'selected':''}>Sí</option><option value="false" ${!f.exigirPesoFacturado?'selected':''}>No</option></select></div><div class="field"><label>Método de cálculo</label><select id="facMetodoPesoCfg"><option value="mayor" ${f.metodoPeso==='mayor'?'selected':''}>Usar la mayor entre libras y porcentaje</option><option value="libras" ${f.metodoPeso==='libras'?'selected':''}>Solo libras</option><option value="porcentaje" ${f.metodoPeso==='porcentaje'?'selected':''}>Solo porcentaje</option></select></div><div class="section-title">Tolerancia de aviso</div><div class="grid2"><div class="field"><label>Aviso en libras</label><input id="facAvisoPesoLb" type="number" step="0.01" value="${f.avisoPesoLb}"></div><div class="field"><label>Aviso en porcentaje</label><input id="facAvisoPesoPct" type="number" step="0.01" value="${f.avisoPesoPct}"></div></div><div class="section-title">Tolerancia máxima de bloqueo</div><div class="grid2"><div class="field"><label>Máximo en libras</label><input id="facMaxPesoLb" type="number" step="0.01" value="${f.maxPesoLb}"></div><div class="field"><label>Máximo en porcentaje</label><input id="facMaxPesoPct" type="number" step="0.01" value="${f.maxPesoPct}"></div></div><div class="success"><b>Regla:</b> si pasa el máximo, no deja pasar a Validación.</div></div></div><div class="actions" style="margin-top:16px"><button class="btn" id="saveFacturacionCfg">Guardar facturación</button></div>`;
  $('#saveFacturacionCfg').onclick=async()=>{
    const val=normalizeInvoiceConfig({
      metodo:$('#facMetodoCfg').value,
      avisoMonto:+$('#facAvisoMonto').value||100,
      avisoPct:+$('#facAvisoPct').value||2,
      maxMonto:+$('#facMaxMonto').value||1000,
      maxPct:+$('#facMaxPct').value||10,
      exigirPesoFacturado:$('#facExigirPeso').value==='true',
      metodoPeso:$('#facMetodoPesoCfg').value,
      avisoPesoLb:+$('#facAvisoPesoLb').value||0.5,
      avisoPesoPct:+$('#facAvisoPesoPct').value||2,
      maxPesoLb:+$('#facMaxPesoLb').value||3,
      maxPesoPct:+$('#facMaxPesoPct').value||8
    });
    if(val.maxMonto<val.avisoMonto && val.metodo!=='porcentaje') return alert('La tolerancia máxima en RD$ no puede ser menor que la tolerancia de aviso.');
    if(val.maxPct<val.avisoPct && val.metodo!=='monto') return alert('La tolerancia máxima en porcentaje no puede ser menor que la tolerancia de aviso.');
    if(val.maxPesoLb<val.avisoPesoLb && val.metodoPeso!=='porcentaje') return alert('La tolerancia máxima en libras no puede ser menor que la tolerancia de aviso.');
    if(val.maxPesoPct<val.avisoPesoPct && val.metodoPeso!=='libras') return alert('La tolerancia máxima en porcentaje de peso no puede ser menor que la tolerancia de aviso.');
    await saveConfigKey('facturacion',val); renderConfig($('#content'));
  };
}
function renderConfigAlertas(c){
  const a=normalizeSystemConfig(state.systemConfig||{}).alertas || defaultSystemConfig().alertas;
  const h=a.horarioLaboral||{}, ls=Array.isArray(h.lunesSabado)?h.lunesSabado:[], dom=Array.isArray(h.domingo)?h.domingo:[];
  const ls1=ls[0]||['07:00','12:00'], ls2=ls[1]||['14:00','17:00'], ds=dom[0]||['07:00','12:00'];
  c.innerHTML=`<div class="panel-head"><div><h3>Alertas, horario y SLA</h3><p>Configura el tiempo laborable real, los límites por etapa y las reglas del análisis operativo V9.2.15.</p></div><span class="badge info">V9.3.9.0 PWA</span></div>
  <div class="grid2"><div class="card"><h3>Actualización y avisos</h3><div class="field"><label>Parpadeo de órdenes nuevas</label><select id="alParpadeo"><option value="true" ${a.parpadeoNuevas!==false?'selected':''}>Activo</option><option value="false" ${a.parpadeoNuevas===false?'selected':''}>Apagado</option></select></div><div class="field"><label>Sonido activo por defecto</label><select id="alSonido"><option value="false" ${!a.sonidoDefault?'selected':''}>No</option><option value="true" ${a.sonidoDefault?'selected':''}>Sí</option></select></div><div class="field"><label>Revisión automática cada segundos</label><input id="alRevision" type="number" min="10" max="300" value="${a.revisionSegundos||30}"></div></div>
  <div class="card"><h3>SLA máximo por etapa</h3><p class="hint">Al superar este tiempo, la etapa se considera fuera de SLA. El aviso amarillo aparece al 70%.</p><div class="grid2"><div class="field"><label>Carnicería min.</label><input id="alCarn" type="number" min="1" value="${a.carniceriaMaxMin}"></div><div class="field"><label>Facturación min.</label><input id="alFact" type="number" min="1" value="${a.facturacionMaxMin}"></div><div class="field"><label>Validación min.</label><input id="alVal" type="number" min="1" value="${a.validacionMaxMin}"></div><div class="field"><label>Delivery min.</label><input id="alDel" type="number" min="1" value="${a.deliveryMaxMin}"></div><div class="field"><label>Liquidación min.</label><input id="alLiq" type="number" min="1" value="${a.liquidacionMaxMin}"></div><div class="field"><label>Factor de caso extremo</label><input id="alExtreme" type="number" min="1" max="10" step="0.5" value="${Number(a.extremoFactor||3)}"><div class="hint">Ej.: 3 = duración mayor a 3 veces el SLA, además del análisis estadístico.</div></div></div></div></div>
  <div class="grid2"><div class="card"><h3>Horario para tiempo laborable</h3><label class="checkrow"><input id="alUseWork" type="checkbox" ${a.usarTiempoLaborable!==false?'checked':''}> <b>Usar tiempo laborable en cronómetros y reportes</b><span>Descuenta almuerzo, horas fuera del negocio y feriados registrados.</span></label><div class="section-title">Lunes a sábado</div><div class="grid2"><div class="field"><label>Inicio mañana</label><input id="alLs1Start" type="time" value="${esc(ls1[0])}"></div><div class="field"><label>Fin mañana</label><input id="alLs1End" type="time" value="${esc(ls1[1])}"></div><div class="field"><label>Inicio tarde</label><input id="alLs2Start" type="time" value="${esc(ls2[0])}"></div><div class="field"><label>Fin tarde</label><input id="alLs2End" type="time" value="${esc(ls2[1])}"></div></div><div class="section-title">Domingo</div><div class="grid2"><div class="field"><label>Inicio</label><input id="alSunStart" type="time" value="${esc(ds[0])}"></div><div class="field"><label>Fin</label><input id="alSunEnd" type="time" value="${esc(ds[1])}"></div></div></div>
  <div class="card"><h3>Feriados y calidad del promedio</h3><div class="field"><label>Feriados sin operación</label><textarea id="alHolidays" placeholder="2026-01-01, 2026-01-06">${esc(operationHolidayList(a.feriados||[]).join('\n'))}</textarea><div class="hint">Escriba una fecha por línea o separada por comas en formato AAAA-MM-DD.</div></div><label class="checkrow"><input id="alExcludeReopen" type="checkbox" ${a.excluirReaperturasPromedio!==false?'checked':''}> <b>Excluir reaperturas del promedio principal</b><span>Las órdenes reabiertas siguen visibles en un indicador separado, pero no distorsionan el promedio normal.</span></label><div class="success"><b>Horario predeterminado de Productos César:</b><br>Lunes a sábado 7:00–12:00 y 2:00–5:00 · Domingo 7:00–12:00.</div></div></div>
  <div class="actions"><button class="btn" id="saveAlertas">Guardar horario y SLA</button><button class="btn gray" data-go="reportes">Ver reportes</button></div>`;
  $('#saveAlertas').onclick=async()=>{
    const pairs=[[$('#alLs1Start').value,$('#alLs1End').value,'mañana L-S'],[$('#alLs2Start').value,$('#alLs2End').value,'tarde L-S'],[$('#alSunStart').value,$('#alSunEnd').value,'domingo']];
    const invalid=pairs.find(([a,b])=>a&&b&&a>=b); if(invalid) return alert(`El horario de ${invalid[2]} tiene una hora final menor o igual a la inicial.`);
    const val={parpadeoNuevas:$('#alParpadeo').value==='true',sonidoDefault:$('#alSonido').value==='true',revisionSegundos:+$('#alRevision').value||30,carniceriaMaxMin:+$('#alCarn').value||45,facturacionMaxMin:+$('#alFact').value||30,validacionMaxMin:+$('#alVal').value||30,deliveryMaxMin:+$('#alDel').value||120,liquidacionMaxMin:+$('#alLiq').value||60,usarTiempoLaborable:$('#alUseWork').checked,horarioLaboral:{lunesSabado:[[pairs[0][0],pairs[0][1]],[pairs[1][0],pairs[1][1]]].filter(x=>x[0]&&x[1]),domingo:[[pairs[2][0],pairs[2][1]]].filter(x=>x[0]&&x[1])},feriados:operationHolidayList($('#alHolidays').value),excluirReaperturasPromedio:$('#alExcludeReopen').checked,extremoFactor:Math.max(1,+$('#alExtreme').value||3)};
    await saveConfigKey('alertas',val); startLivePolling(); render();
  };
  $$('[data-go="reportes"]',c).forEach(b=>b.onclick=()=>{state.page='reportes';render();});
}
function renderConfigImpresion(c){ const im=normalizeSystemConfig(state.systemConfig||{}).impresion || defaultSystemConfig().impresion;
  c.innerHTML=`<div class="panel-head"><div><h3>Impresión y tickets</h3><p>Parámetros para tickets internos de carnicería y facturación.</p></div><span class="badge info">V9.3.3</span></div><div class="grid2"><div class="card"><div class="field"><label>Ticket de carnicería</label><select id="impCarn"><option ${im.ticketCarniceria==='80mm'?'selected':''}>80mm</option><option ${im.ticketCarniceria==='Carta'?'selected':''}>Carta</option></select></div><div class="field"><label>Ticket de facturación</label><select id="impFact"><option ${im.ticketFacturacion==='80mm'?'selected':''}>80mm</option><option ${im.ticketFacturacion==='Carta'?'selected':''}>Carta</option></select></div><div class="field"><label>Pie de ticket</label><input id="impPie" value="${esc(im.pieTicket)}"></div><div class="grid2"><div class="field"><label>Tamaño de títulos</label><input id="impTitleSize" type="number" min="14" max="28" value="${Number(im.tamanoTituloPx||18)}"><div class="hint">14–28 px</div></div><div class="field"><label>Tamaño detalle de artículos</label><input id="impDetailSize" type="number" min="10" max="20" value="${Number(im.tamanoDetallePx||12)}"><div class="hint">10–20 px</div></div></div></div><div class="card"><label class="checkrow"><input id="impLogo" type="checkbox" ${im.mostrarLogo!==false?'checked':''}> <b>Mostrar logo</b><span>Usa el texto configurado en Empresa.</span></label><label class="checkrow"><input id="impTel" type="checkbox" ${im.mostrarTelefono!==false?'checked':''}> <b>Mostrar teléfono</b><span>Sale en tickets si está definido.</span></label><label class="checkrow"><input id="impDir" type="checkbox" ${im.mostrarDireccion!==false?'checked':''}> <b>Mostrar dirección</b><span>Sale en tickets si está definida.</span></label><label class="checkrow"><input id="impPickupAlert" type="checkbox" ${im.mostrarAvisoRetiro!==false?'checked':''}> <b>Aviso grande de retiro</b><span>Se imprime en preparación y facturación.</span></label><div class="field"><label>Texto del aviso de retiro</label><input id="impPickupText" value="${esc(im.textoAvisoRetiro||'RETIRO EN NEGOCIO · NO ENVIAR A DELIVERY')}"></div><div class="ticket-preview" id="ticketPreview"><strong style="font-size:${Number(im.tamanoTituloPx||18)}px">ORDEN DE PREPARACIÓN</strong><span style="font-size:${Number(im.tamanoDetallePx||12)}px">2 lb · Carne de res para guisar</span></div><button class="btn" id="saveImpresion">Guardar impresión</button></div></div>`;
  const preview=()=>{const p=$('#ticketPreview');if(!p)return;p.querySelector('strong').style.fontSize=Math.max(14,Math.min(28,+$('#impTitleSize').value||18))+'px';p.querySelector('span').style.fontSize=Math.max(10,Math.min(20,+$('#impDetailSize').value||12))+'px';};
  $('#impTitleSize').oninput=preview; $('#impDetailSize').oninput=preview;
  $('#saveImpresion').onclick=async()=>{ const val={ticketCarniceria:$('#impCarn').value,ticketFacturacion:$('#impFact').value,pieTicket:$('#impPie').value.trim(),mostrarLogo:$('#impLogo').checked,mostrarTelefono:$('#impTel').checked,mostrarDireccion:$('#impDir').checked,tamanoTituloPx:Math.max(14,Math.min(28,+$('#impTitleSize').value||18)),tamanoDetallePx:Math.max(10,Math.min(20,+$('#impDetailSize').value||12)),mostrarAvisoRetiro:$('#impPickupAlert').checked,textoAvisoRetiro:$('#impPickupText').value.trim()||'RETIRO EN NEGOCIO · NO ENVIAR A DELIVERY'}; await saveConfigKey('impresion',val); renderConfig($('#content')); };
}
function renderConfigSeguridad(c){ const sg=normalizeSystemConfig(state.systemConfig||{}).seguridad || defaultSystemConfig().seguridad;
  c.innerHTML=`<div class="panel-head"><div><h3>Seguridad operativa</h3><p>Define reglas visibles de acciones delicadas. Los permisos de base siguen en RLS de Supabase.</p></div></div><div class="grid2"><div class="card"><label class="checkrow"><input id="sgSoloAdmin" type="checkbox" ${sg.soloAdminEliminar!==false?'checked':''}> <b>Eliminar solo administrador</b><span>Los roles operativos no ven eliminar.</span></label><label class="checkrow"><input id="sgConfirmar" type="checkbox" ${sg.confirmarAnular!==false?'checked':''}> <b>Confirmar anulaciones/reversos</b><span>Pide confirmación antes de acciones delicadas.</span></label><label class="checkrow"><input id="sgBloquear" type="checkbox" ${sg.bloquearOperativos!==false?'checked':''}> <b>Bloquear acciones operativas fuera de rol</b><span>Evita que un empleado actúe a nombre de otro.</span></label><label class="checkrow"><input id="sgEliminarReciente" type="checkbox" ${sg.mostrarBotonEliminarSoloReciente!==false?'checked':''}> <b>Mostrar eliminar solo en órdenes recientes sin avance</b><span>Si ya avanzó, debe anularse.</span></label><button class="btn" id="saveSeguridad">Guardar seguridad</button></div><div class="card"><h3>Recomendación</h3><div class="error"><b>No pongas service_role key en el frontend.</b><br>Crear usuarios desde Configuración debe hacerse con función segura con RLS y funciones transaccionales.</div><p class="hint">Estas reglas mejoran la interfaz. La protección fuerte debe mantenerse también en SQL/RLS.</p></div></div>`;
  $('#saveSeguridad').onclick=async()=>{ const val={soloAdminEliminar:$('#sgSoloAdmin').checked,confirmarAnular:$('#sgConfirmar').checked,bloquearOperativos:$('#sgBloquear').checked,mostrarBotonEliminarSoloReciente:$('#sgEliminarReciente').checked}; await saveConfigKey('seguridad',val); render(); };
}
async function saveWeightConfig(){
  const cfg=normalizeWeightConfig({exigirPesoReal:$('#cfgExigirPeso')?.value==='true',metodo:$('#cfgMetodoPeso')?.value||'mayor',avisoLb:+($('#cfgAvisoLb')?.value||0.5),avisoPct:+($('#cfgAvisoPct')?.value||2),maxLb:+($('#cfgMaxLb')?.value||3),maxPct:+($('#cfgMaxPct')?.value||8)});
  if(cfg.maxLb<cfg.avisoLb && cfg.metodo!=='porcentaje') return alert('La tolerancia máxima en libras no puede ser menor que la tolerancia de aviso.');
  if(cfg.maxPct<cfg.avisoPct && cfg.metodo!=='libras') return alert('La tolerancia máxima en porcentaje no puede ser menor que la tolerancia de aviso.');
  state.weightConfig=cfg; saveWeightConfigLocal(cfg);
  try{ const {error}=await sb.from('sistema_configuracion').upsert({clave:'control_peso',valor:cfg,actualizado_por:state.user?.id,actualizado_en:new Date().toISOString()},{onConflict:'clave'}); if(error) throw error; toast('Configuración de peso guardada'); }
  catch(e){ toast('Configuración guardada localmente. Ejecuta el SQL V7.2 para guardarla globalmente.'); }
  renderConfig($('#content'));
}
function toleranceValue(calculated, lb, pct, metodo='mayor'){ const byLb=Number(lb)||0, byPct=(Number(calculated)||0)*(Number(pct)||0)/100; if(metodo==='libras') return byLb; if(metodo==='porcentaje') return byPct; return Math.max(byLb,byPct); }
function weightControlCheck(calculated, real){ const cfg=normalizeWeightConfig(state.weightConfig||{}); const calc=Number(calculated)||0, peso=Number(real)||0, diff=Number((peso-calc).toFixed(3)), abs=Math.abs(diff); const aviso=toleranceValue(calc,cfg.avisoLb,cfg.avisoPct,cfg.metodo); const max=toleranceValue(calc,cfg.maxLb,cfg.maxPct,cfg.metodo); const level=abs>max?'block':(abs>aviso?'warn':'ok'); return {cfg,calc,peso,diff,abs,aviso:Number(aviso.toFixed(3)),max:Number(max.toFixed(3)),level}; }
function orderRequiresRealWeightFromModal(m){ return $$('[data-detail-id]',m).some(row=>row.dataset.sumaPeso!=='false' && row.dataset.tipoPeso!=='No pesa'); }
function weightDiffDialog(check){
  if(check.level==='block'){ alert('El peso real supera la tolerancia máxima permitida. Debes corregirlo antes de continuar.'); return Promise.resolve(null); }
  return responsibilityDecisionDialog({title:'Verificar diferencia de peso',message:'El peso real no coincide con el peso calculado.',rows:[['Peso calculado',`${check.calc} lb`],['Peso real',`${check.peso} lb`],['Diferencia',`${check.diff>0?'+':''}${check.diff} lb`],['Tolerancia aviso',`${check.aviso} lb`],['Tolerancia máxima',`${check.max} lb`]]});
}

function openModal(title, body, opts=''){ state.modal=true; document.body.classList.add('modal-open'); const m=document.createElement('div'); m.className='modal'; m.innerHTML=`<div class="modal-card"><div class="mobile-sheet-handle"></div><div class="modal-head"><div><div class="modal-title">${title}</div>${opts?`<div class="hint">${opts}</div>`:''}</div><button class="close" id="modalClose" aria-label="Cerrar">×</button></div><div class="modal-body">${body}</div></div>`; document.body.appendChild(m); const closeModal=()=>{m.remove();state.modal=false;if(!document.querySelector('.modal'))document.body.classList.remove('modal-open');}; $('#modalClose',m).onclick=closeModal; m.onclick=e=>{if(e.target===m)closeModal();}; setTimeout(()=>{attachGlobalModalDraft(m,title,opts);applyMobileLabels(m);},120); return m; }

function orderWhatsAppConfig(){
  return normalizeSystemConfig(state.systemConfig||{}).whatsapp || defaultSystemConfig().whatsapp;
}
function orderWhatsAppPhone(source){
  const num=onlyNum(source?.cliente_telefono_orden||source?.telefono||source?.cliente?.telefono||'');
  if(!num) return '';
  return num.length===10 ? '1'+num : num;
}
function isOrderWhatsAppEligible(o){ return !!o && orderType(o)==='Pedido normal' && !isInternalSale(o) && (isOccasionalCustomer(o)||isCommercialNormalOrder(o)); }
function orderDetailWithoutPrices(o){
  return (o?.items||[]).map(i=>{
    const qty=Number(i.cantidad_pedida||0);
    const unit=String(i.unidad||'').trim();
    const name=String(i.producto_nombre||'Producto').trim();
    const raw=String(i?.notas||'').trim();
    const normalized=raw.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
    const internal=!raw || normalized==='producto no listado' || normalized==='producto no listado unidad asumida lb';
    const instruction=internal?'':raw.replace(/^(?:observación|observacion|corte|nota)\s*:\s*/i,'').trim();
    return `• ${qty}${unit?' '+unit:''} — ${name}${instruction?`\n  ↳ ${instruction}`:''}`;
  }).join('\n');
}

function sanitizeOrderWhatsAppTemplate(t){
  return String(t||'')
    .replace(/\{(?:monto|precio|precios|subtotal|total|factura|credito|crédito|balance|condicion_pago)\}/gi,'')
    .replace(/[ \t]+\n/g,'\n');
}
function buildOrderWhatsAppMessage(o,kind='confirmacion',templateOverride=null){
  const cfg=orderWhatsAppConfig();
  const template=sanitizeOrderWhatsAppTemplate(templateOverride??cfg.plantilla??defaultSystemConfig().whatsapp.plantilla);
  const update=kind==='actualizacion';
  const header=update?'ACTUALIZACIÓN DE ORDEN\nHemos actualizado el detalle de su orden en Productos César.':'Hemos recibido su orden en Productos César.';
  const dispatch=dispatchDateOf(o)||o?.fecha_despacho||today();
  const publicNote=String(o?.nota_programacion||'').trim();
  const map={
    contacto:o?.cliente?.contacto||o?.cliente_nombre_orden||o?.cliente?.negocio||'cliente',
    negocio:o?.cliente_nombre_orden||o?.cliente?.negocio||'',
    encabezado:header,
    codigo_orden:o?.codigo||('ORD-'+(o?.id||'')),
    fecha_orden:shortDate(rowDateKey(createdAtOf(o))||o?.fecha||today()),
    fecha_despacho:shortDate(dispatch),
    hora_despacho:o?.hora_despacho?` · Hora: ${String(o.hora_despacho).slice(0,5)}`:'',
    modalidad_entrega:o?.modalidad_entrega||'Delivery',
    direccion_entrega:o?.cliente_direccion_orden||o?.cliente?.direccion||'',
    referencia_entrega:o?.cliente_referencia_orden||o?.cliente?.referencia||'',
    detalle_sin_precio:orderDetailWithoutPrices(o)||'• Detalle pendiente de confirmar',
    observacion_cliente:publicNote?`\n\nObservación: ${publicNote}`:''
  };
  return template.replace(/\{([a-zA-Z0-9_áéíóúÁÉÍÓÚñÑ]+)\}/g,(m,k)=>Object.prototype.hasOwnProperty.call(map,k)?map[k]:m).replace(/\n{3,}/g,'\n\n').trim();
}
async function logOrderWhatsAppPrepared(o,kind,phone){
  const {error}=await sb.rpc('registrar_evento_orden_v942',{
    p_orden_id:o.id,
    p_comentario:`WhatsApp preparado · ${kind} · teléfono ${phone}`
  });
  if(error) console.warn('No se pudo registrar auditoría de WhatsApp:',error.message);
}
async function openOrderWhatsApp(o,kind='confirmacion'){
  if(!o) return;
  if(o.estado==='Anulado') return alert('No se puede enviar una orden anulada.');
  if(!isCommercialNormalOrder(o) && !isOccasionalCustomer(o)) return alert('La confirmación está disponible para pedidos normales de clientes registrados u ocasionales.');
  if(!(o.items||[]).length) return alert('La orden no tiene productos para enviar.');
  const phone=orderWhatsAppPhone(o);
  if(!phone) return alert('Este cliente no tiene teléfono registrado.');
  const msg=buildOrderWhatsAppMessage(o,kind);
  const w=window.open('https://wa.me/'+phone+'?text='+encodeURIComponent(msg),'_blank');
  if(!w) return alert('El navegador bloqueó WhatsApp. Permite ventanas emergentes para este sitio.');
  await logOrderWhatsAppPrepared(o,kind,phone);
}
function showOrderWhatsAppPrompt(o,kind='confirmacion'){
  if(!o) return;
  const phone=orderWhatsAppPhone(o);
  if(!phone) return alert('La orden se guardó, pero el cliente no tiene teléfono para WhatsApp.');
  if(!(o.items||[]).length) return alert('La orden se guardó, pero no tiene productos para enviar.');
  const actualKind=kind==='reenvio'?'confirmacion':kind;
  const msg=buildOrderWhatsAppMessage(o,actualKind);
  const title=kind==='actualizacion'?'Enviar actualización por WhatsApp':kind==='reenvio'?'Reenviar orden por WhatsApp':'Enviar confirmación por WhatsApp';
  const m=openModal(title,`<div class="success"><b>${esc(o.codigo||'Orden')} guardada correctamente.</b><br>El mensaje no contiene precios ni monto.</div><pre class="wa-order-preview">${esc(msg)}</pre><div class="actions"><button class="btn green" id="sendOrderWa">Abrir WhatsApp</button><button class="btn gray" id="skipOrderWa">Ahora no</button></div>`,'Revisa el detalle antes de pulsar Enviar dentro de WhatsApp.');
  $('#sendOrderWa',m).onclick=async()=>{ await openOrderWhatsApp(o,actualKind); m.remove(); };
  $('#skipOrderWa',m).onclick=()=>m.remove();
}
function maybeOfferOrderWhatsApp(o,kind='confirmacion'){
  const cfg=orderWhatsAppConfig();
  if(cfg.ofrecerAlGuardar===false || !o || o.estado==='Anulado' || !isOrderWhatsAppEligible(o)) return;
  if(!orderWhatsAppPhone(o) || !(o.items||[]).length) return;
  showOrderWhatsAppPrompt(o,kind);
}
function orderWhatsAppManualButton(o){
  const cfg=orderWhatsAppConfig();
  if(cfg.botonManual===false || !o || o.estado==='Anulado' || !isOrderWhatsAppEligible(o) || !orderWhatsAppPhone(o)) return '';
  return `<button class="btn green" data-wa-order="${o.id}">WhatsApp orden</button>`;
}
function openWhatsApp(c){ if(!c) return; const body=`<div class="section-title">Cliente</div><div class="client-card" style="grid-template-columns:auto 1fr"><div class="avatar">WA</div><div><div class="client-title">${esc(c.negocio)}</div><div class="client-sub">${esc(c.contacto||'')} · ${esc(c.telefono||'')}</div></div></div><div class="section-title">Elegir plantilla</div><button class="whatsapp-row" data-wa-empty="1"><b>Abrir chat vacío</b><br><span class="hint">Sin mensaje predeterminado.</span></button>${state.plantillas.filter(p=>p.activo!==false).map(p=>`<button class="whatsapp-row" data-wa-tpl="${p.id}"><b>${esc(p.nombre)}</b><br><span class="hint">${esc(fillTemplate(p.texto,c))}</span></button>`).join('')||'<div class="empty">No hay plantillas. Agrégalas en Configuración.</div>'}`; const m=openModal('WhatsApp',body,'Plantillas editables desde Configuración'); const open=(msg='')=>{ const num=onlyNum(c.telefono); if(!num) return alert('Este cliente no tiene teléfono.'); const phone=(num.length===10?'1'+num:num); window.open('https://wa.me/'+phone+(msg?'?text='+encodeURIComponent(msg):''),'_blank'); m.remove(); }; $('[data-wa-empty]',m).onclick=()=>open(''); $$('[data-wa-tpl]',m).forEach(b=>b.onclick=()=>{ const p=state.plantillas.find(x=>x.id==b.dataset.waTpl); open(fillTemplate(p.texto,c)); }); }
function fillTemplate(t,c,extra={}){ const map={contacto:c.contacto||'',negocio:c.negocio||'',telefono:c.telefono||'',sector:c.sector||'',vendedor:c.vendedor||'',monto:extra.monto||'',fecha:extra.fecha||today(),factura:extra.factura||''}; return String(t||'').replace(/\{(\w+)\}/g,(m,k)=>map[k]??m); }

const CONTACT_DAYS=['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];
function splitContactDays(v){
  const raw=Array.isArray(v)?v.join(','):String(v||'');
  const out=[];
  raw.split(/[,;|\/]+/).map(x=>x.trim()).filter(Boolean).forEach(x=>{
    const found=CONTACT_DAYS.find(d=>norm(d)===norm(x));
    if(found && !out.includes(found)) out.push(found);
  });
  return out;
}
function contactDaysOf(c){ return splitContactDays(c?.dia_contacto || c?.dias_contacto || c?.dias_contacto_txt || ''); }
function contactDaysText(c){ const days=contactDaysOf(c); return days.length?days.join(', '):(c?.dia_contacto||''); }
function freqFromDays(days){
  days=Array.isArray(days)?days:splitContactDays(days);
  if(days.length>=7) return 'Diario';
  if(days.length===0) return 'Sin días asignados';
  if(days.length===1) return '1 vez por semana';
  return days.length+' veces por semana';
}
function contactDaysCheckboxes(c={}){
  const selected=contactDaysOf(c);
  if(!selected.length && c.dia_contacto){ const one=splitContactDays(c.dia_contacto)[0]; if(one) selected.push(one); }
  return `<div class="field"><label>Días de contacto</label><div class="day-checks">${CONTACT_DAYS.map(d=>`<label class="day-check"><input type="checkbox" id="f_dia_${norm(d).replace(/[^a-z0-9]/g,'')}" name="contact_day" value="${esc(d)}" ${selected.includes(d)?'checked':''}> ${esc(d)}</label>`).join('')}</div><div class="hint">Marca todos los días en que el cliente debe aparecer en Control. Si es diario, marca los 7 días.</div></div>`;
}
function selectedContactDays(m){ return $$('input[name="contact_day"]',m).filter(x=>x.checked).map(x=>x.value); }
function clientMatchesContactDay(c,dia){ const days=contactDaysOf(c); if(days.length) return days.some(d=>norm(d)===norm(dia)); return norm(c.dia_contacto)===norm(dia); }
function updateContactFreqPreview(m){ const el=$('#contactFreqPreview',m); if(el) el.textContent=freqFromDays(selectedContactDays(m)); }


function clientHistoryCounts(c){
  const cid=Number(c?.id);
  if(!cid) return {llamadas:0,ordenes:0,cxc:0,total:0};
  const llamadas=(state.llamadas||[]).filter(l=>Number(l.cliente_id)===cid).length;
  const ordenes=(state.ordenes||[]).filter(o=>Number(o.cliente_id)===cid).length;
  const cxcLegacy=(state.cobranza||[]).filter(x=>Number(x.cliente_id)===cid).length;
  const cxcFormal=(state.cxcSaldos||[]).filter(x=>Number(x.cliente_id)===cid).length;
  const cxc=Math.max(cxcLegacy,cxcFormal);
  return {llamadas,ordenes,cxc,total:llamadas+ordenes+cxc};
}
function clientHasHistory(c){ return clientHistoryCounts(c).total>0; }
function canDeleteClient(c){ return !!c?.id && isAdminRole() && !clientHasHistory(c); }
function clientAdminActionsHtml(c){
  if(!c?.id || !isAdminRole()) return '';
  const h=clientHistoryCounts(c);
  const inactive=String(c.estado||'').toLowerCase()==='inactivo';
  const title=inactive?'Activar cliente':'Desactivar cliente';
  const warn=h.total?`Este cliente tiene historial: ${h.llamadas} gestión(es), ${h.ordenes} orden(es), ${h.cxc} registro(s) CXC. Por seguridad, no se elimina; se desactiva para mantener trazabilidad.`:'Cliente sin historial operativo. Si fue creado por error, el administrador puede eliminarlo definitivamente.';
  return `<div class="section-title">Acciones administrativas</div><div class="admin-actions-box"><div><b>Baja segura del cliente</b><p>${esc(warn)}</p></div><div class="actions"><button type="button" class="btn warn" data-client-toggle="${c.id}">${title}</button>${canDeleteClient(c)?`<button type="button" class="btn danger" data-client-delete="${c.id}">Eliminar definitivo</button>`:`<button type="button" class="btn gray" disabled>Eliminar bloqueado</button>`}</div></div>`;
}
function bindClientAdminButtons(scope=document){
  $$('[data-client-toggle]',scope).forEach(b=>b.onclick=()=>toggleClientStatus(state.clientes.find(x=>String(x.id)===String(b.dataset.clientToggle))));
  $$('[data-client-delete]',scope).forEach(b=>b.onclick=()=>deleteClientSafe(state.clientes.find(x=>String(x.id)===String(b.dataset.clientDelete))));
}
async function toggleClientStatus(c){
  if(!c) return;
  if(!isAdminRole()) return alert('Solo administración puede activar o desactivar clientes.');
  const inactive=String(c.estado||'').toLowerCase()==='inactivo';
  const next=inactive?'Activo':'Inactivo';
  const msg=inactive?`¿Activar nuevamente a ${c.negocio}?`:`¿Desactivar a ${c.negocio}?\n\nNo aparecerá en Control/Agenda, pero se conserva todo su historial.`;
  if(!confirm(msg)) return;
  const {error}=await sb.from('clientes').update({estado:next,archivado:false}).eq('id',c.id);
  if(error) return alert(error.message);
  $$('.modal').forEach(x=>x.remove());
  await refreshVisibleModuleV9384(); render(); toast(`Cliente ${next.toLowerCase()}: ${c.negocio}`);
}
async function deleteClientSafe(c){
  if(!c) return;
  if(!isAdminRole()) return alert('Solo administración puede eliminar clientes.');
  const h=clientHistoryCounts(c);
  if(h.total>0){
    return alert(`No se puede eliminar este cliente porque tiene historial.\n\nGestiones: ${h.llamadas}\nÓrdenes: ${h.ordenes}\nCXC: ${h.cxc}\n\nUsa Desactivar cliente para sacarlo de la agenda sin perder trazabilidad.`);
  }
  const ok=prompt(`Eliminar definitivo a ${c.negocio}.\n\nEsta acción solo debe usarse para clientes creados por error y sin historial.\n\nPara confirmar escribe: ELIMINAR`);
  if(ok!=='ELIMINAR') return;
  const {error}=await sb.from('clientes').delete().eq('id',c.id);
  if(error) return alert(error.message+'\n\nSi la base lo bloquea por relación interna, usa Desactivar cliente.');
  $$('.modal').forEach(x=>x.remove());
  await refreshVisibleModuleV9384(); render(); toast('Cliente eliminado definitivamente');
}

async function openClientFicha(c){
  if(!c) return;
  await ensureCxcDataV940();
  const lc=lastCall(c.id);
  const calls=state.llamadas.filter(l=>Number(l.cliente_id)===Number(c.id)).slice(0,8);
  const orders=state.ordenes.filter(o=>Number(o.cliente_id)===Number(c.id));
  const cxc=state.cobranza.filter(x=>Number(x.cliente_id)===Number(c.id));
  const cxcFormal=(state.cxcSaldos||[]).filter(x=>Number(x.cliente_id)===Number(c.id));
  const pendiente=state.cxcSchemaOk
    ? cxcFormal.reduce((s,x)=>s+Number(x.saldo_pendiente||0),0)
    : cxc.reduce((s,x)=>s+(+x.monto||0)-(+x.abonado||0),0);
  const ultimaGestionTxt=lc ? esc(lc.resultado)+' · '+shortDate(lc.fecha)+' '+callTime(lc) : 'Sin gestiones';
  const ultimaComentario=lc && lc.observacion ? `<div class="hint" style="margin-top:6px;line-height:1.45"><b>Comentario:</b> “${esc(lc.observacion)}”</div>` : '';
  const llamadasHtml=calls.map(l=>`<div class="client-card" style="grid-template-columns:1fr auto;padding:12px"><div><div><b>${shortDate(l.fecha)} ${callTime(l)}</b> · ${esc(l.resultado)}</div>${l.observacion?`<div class="hint" style="margin-top:5px;line-height:1.45">“${esc(l.observacion)}”</div>`:''}${l.proximo_contacto?`<div class="hint" style="margin-top:4px">Próximo contacto: ${shortDate(l.proximo_contacto)}</div>`:''}</div><span>${l.monto?money(l.monto):''}</span></div>`).join('') || '<div class="empty">Sin llamadas.</div>';
  const cxcHtml=cxcFormal.slice().sort((a,b)=>String(a.cxc_vencimiento||'').localeCompare(String(b.cxc_vencimiento||''))).slice(0,8).map(x=>`<div class="kv"><b>${esc(x.factura_no||x.orden_codigo||'Factura')}</b><span>${money(x.saldo_pendiente)} · ${esc(x.estado_cxc||'')} · vence ${shortDate(x.cxc_vencimiento)}</span></div>`).join('')||'<div class="empty">Sin cuentas por cobrar formales.</div>';
  const body=`<div class="grid2"><div><div class="badges"><span class="badge ${c.estado==='Activo'?'ok':''}">${esc(c.estado||'')}</span><span class="badge info">${esc(c.codigo||'')}</span></div><div class="kv"><b>Contacto</b><span>${esc(c.contacto||'')}</span></div><div class="kv"><b>Tipo</b><span>${esc(c.tipo||'')}</span></div><div class="kv"><b>Sector</b><span>${esc(c.sector||'')}</span></div><div class="kv"><b>Dirección</b><span>${esc(c.direccion||'—')}</span></div><div class="kv"><b>Referencia</b><span>${esc(c.referencia||'—')}</span></div><div class="kv"><b>Vendedor</b><span>${esc(c.vendedor||'')}</span></div><div class="kv"><b>Días de contacto</b><span>${esc(contactDaysText(c))}</span></div><div class="kv"><b>Frecuencia</b><span>${esc(freqFromDays(contactDaysOf(c)))}</span></div><div class="kv"><b>Teléfono</b><span>${esc(c.telefono||'')}</span></div><div class="kv"><b>Crédito</b><span>${c.credito?'Sí':'No'} · límite ${money(c.limite_credito)}</span></div></div><div><div class="card"><h3 style="margin-top:0">Indicadores</h3><div class="kv"><b>Última gestión</b><span>${ultimaGestionTxt}${ultimaComentario}</span></div><div class="kv"><b>Último pedido</b><span>${shortDate(c.ultimo_pedido)}</span></div><div class="kv"><b>Días sin pedir</b><span>${daysSince(c.ultimo_pedido)??'Nunca'}</span></div><div class="kv"><b>Órdenes cargadas</b><span>${orders.length}</span></div><div class="kv"><b>Pendiente CXC</b><span>${money(pendiente)}</span></div></div></div></div><div class="actions" style="margin-top:18px"><a class="btn gray" href="tel:${esc(c.telefono||'')}">Llamar</a><button class="btn green" data-wa="${c.id}">WhatsApp</button><button class="btn" data-call="${c.id}">Registrar llamada</button><button class="btn dark" data-edit-client="${c.id}">Editar</button></div>${clientAdminActionsHtml(c)}<div class="section-title">Cuentas por cobrar</div>${cxcHtml}<div class="section-title">Historial reciente</div><div class="grid2"><div><b>Llamadas</b>${llamadasHtml}</div><div><b>Órdenes</b><div class="hint" style="margin:4px 0 8px">Usa <b>Ver pedido</b> para revisar artículos solicitados, pesajes e historial del proceso.</div>${orders.slice(0,8).map(orderMini).join('')||'<div class="empty">Sin órdenes.</div>'}</div></div>`;
  const m=openModal(esc(c.negocio),body,'Ficha completa del cliente');
  bindDynamic();
  const editBtn=$('[data-edit-client]',m); if(editBtn) editBtn.onclick=()=>{m.remove(); openClientForm(c);};
  bindClientAdminButtons(m);
}


function optionList(catId, selected=''){
  const fallback = {
    tipo_negocio:['Colmado','Comedor','Bodega','Carnicería','Embutidos','Provisiones','Supermercado','Otro'],
    sectores:['Los Camberos','Avenida Colon','Los Cocos','Los Bordas','Los Dominguez','Barrio Haití','Los Ginebra','Bello Costero','Altos Del Chavon','Otro'],
    frecuencias:['Diario','Interdiario','Semanal','Quincenal','Mensual','Ocasional'],
    categoria_producto:['Carnes','Embutidos','Ahumados','Pollo','Lácteos','Provisiones','Otros'],
    unidad_producto:['lb','unidad','paquete','caja','galón','funda'],
    estado_orden:['Pedido recibido','En preparación','Pesada / lista para facturar','Impresa para facturar','Facturada','Lista para retiro','Entregada en negocio','Asignada a delivery','En ruta','Cobrado','Entregado a crédito','No entregado','Devuelto parcial','Anulada']
  };
  let vals = (state.catalogos && state.catalogos[catId] ? state.catalogos[catId].map(x=>x.valor) : []);
  if(!vals.length) vals = fallback[catId] || [];
  if(selected && !vals.includes(selected)) vals = [selected, ...vals];
  vals = vals.filter((v,i,a)=>v && a.indexOf(v)===i);
  return vals.map(v=>`<option value="${esc(v)}" ${v===selected?'selected':''}>${esc(v)}</option>`).join('');
}
function nextClientCode(){
  const codes=(state.clientes||[]).map(c=>String(c.codigo||'')).filter(Boolean);
  let max=0, width=3, prefix='';
  for(const code of codes){
    const m=code.match(/^(.*?)(\d+)$/);
    if(m){ const n=parseInt(m[2],10); if(n>max){max=n; width=Math.max(3,m[2].length); prefix=m[1]||'';} }
  }
  return prefix + String(max+1).padStart(width,'0');
}
function sectorValues(){
  return (state.catalogos?.sectores||[]).map(x=>String(x.valor||'').trim()).filter(Boolean).filter((v,i,a)=>a.findIndex(x=>norm(x)===norm(v))===i).sort((a,b)=>a.localeCompare(b,'es'));
}
function sectorMatches(value){
  const q=norm(value||''); if(!q) return [];
  return sectorValues().filter(v=>norm(v).includes(q)||q.includes(norm(v))||fuzzy(norm(v),q)).slice(0,5);
}
async function ensureSectorCatalog(value){
  const sector=String(value||'').trim(); if(!sector) return '';
  const exact=sectorValues().find(v=>norm(v)===norm(sector));
  if(exact) return exact;
  const similar=sectorMatches(sector);
  const hint=similar.length?`\n\nSectores parecidos:\n- ${similar.join('\n- ')}`:'';
  if(!confirm(`El sector “${sector}” no existe en el catálogo.${hint}\n\n¿Deseas agregarlo como sector nuevo?`)) return null;
  const rpc=await sb.rpc('agregar_sector_si_no_existe',{p_sector:sector});
  if(rpc.error) return alert('No se pudo agregar el sector al catálogo: '+rpc.error.message), null;
  return String(rpc.data||sector).trim();
}

function openClientForm(c={}){
  const selectedVendor=canonicalEmployeeName(c.vendedor||state.profile.vendedor||'','Vendedor') || normalizeLegacyVendorInRows();
  const body=`<div class="form"><div class="grid2"><div class="field"><label>Código</label><div style="display:flex;gap:8px"><input id="f_codigo" value="${esc(c.codigo||(!c.id?nextClientCode():''))}"><button type="button" class="btn gray small" id="genClientCode">Generar</button></div></div><div class="field"><label>Estado</label><select id="f_estado">${['Activo','Inactivo','Prospecto','Cerrado','Suspendido'].map(x=>`<option ${x===(c.estado||'Activo')?'selected':''}>${x}</option>`).join('')}</select></div></div><div class="field"><label>Negocio</label><input id="f_negocio" value="${esc(c.negocio||'')}"></div><div class="grid2"><div class="field"><label>Contacto</label><input id="f_contacto" value="${esc(c.contacto||'')}"></div><div class="field"><label>Teléfono</label><input id="f_telefono" value="${esc(c.telefono||'')}"></div></div><div class="grid2"><div class="field"><label>Tipo de negocio</label><select id="f_tipo">${optionList('tipo_negocio',c.tipo)}</select></div><div class="field"><label>Sector</label><input id="f_sector" list="sectorOptions" value="${esc(c.sector||'')}" placeholder="Escribe para buscar por similitud"><datalist id="sectorOptions">${sectorValues().map(v=>`<option value="${esc(v)}">`).join('')}</datalist><div class="hint" id="sectorHint">Selecciona una coincidencia o escribe uno nuevo; se confirmará antes de agregarlo.</div></div></div><div class="field"><label>Dirección completa</label><input id="f_direccion" value="${esc(c.direccion||'')}" placeholder="Calle, número y ubicación"></div><div class="field"><label>Referencia de ubicación</label><input id="f_referencia" value="${esc(c.referencia||'')}" placeholder="Ej.: casa azul, frente a la escuela"></div><div class="field"><label>Vendedor</label><select id="f_vendedor">${vendorSelect(selectedVendor)}</select><div class="hint">Se alimenta de Configuración → Empleados. Crea el empleado con área Vendedor.</div></div>${contactDaysCheckboxes(c)}<div class="grid2"><div class="field"><label>Frecuencia automática</label><div id="contactFreqPreview" class="calc-box">${esc(freqFromDays(contactDaysOf(c)))}</div><div class="hint">Se calcula según las casillas marcadas. Ya no se edita manualmente.</div></div><div class="field"><label>Límite crédito</label><input type="number" id="f_limite" value="${esc(c.limite_credito||0)}"></div></div><div class="field"><label>Observaciones</label><textarea id="f_obs">${esc(c.observaciones||'')}</textarea></div>${clientAdminActionsHtml(c)}<button class="btn" id="saveClient">Guardar cliente</button></div>`;
  const m=openModal(c.id?'Editar cliente':'Nuevo cliente',body);
  bindClientAdminButtons(m);
  $$('input[name="contact_day"]',m).forEach(ch=>ch.onchange=()=>updateContactFreqPreview(m));
  $('#saveClient',m).onclick=async()=>{
    const days=selectedContactDays(m);
    if(!days.length) return alert('Selecciona por lo menos un día de contacto.');
    const vendedor=$('#f_vendedor',m).value;
    if(!vendedor) return alert('Selecciona un vendedor registrado en empleados.');
    const sector=await ensureSectorCatalog($('#f_sector',m).value);
    if(sector===null) return;
    const row={codigo:$('#f_codigo',m).value.trim()||nextClientCode(),negocio:$('#f_negocio',m).value.trim(),contacto:$('#f_contacto',m).value.trim(),telefono:$('#f_telefono',m).value.trim(),tipo:$('#f_tipo',m).value,sector,direccion:$('#f_direccion',m).value.trim()||null,referencia:$('#f_referencia',m).value.trim()||null,vendedor,dia_contacto:days.join(', '),frecuencia:freqFromDays(days),estado:$('#f_estado',m).value,limite_credito:+$('#f_limite',m).value||0,observaciones:$('#f_obs',m).value,whatsapp:true,credito:(+$('#f_limite',m).value||0)>0,archivado:false};
    if(!row.negocio) return alert('El nombre del negocio es obligatorio.');
    const q=c.id?sb.from('clientes').update(row).eq('id',c.id):sb.from('clientes').insert(row);
    const {error}=await q;
    if(error) return alert(error.message);
    m.remove(); await refreshVisibleModuleV9384(); render(); toast('Cliente guardado');
  };
  const gen=$('#genClientCode',m); if(gen) gen.onclick=()=>{$('#f_codigo',m).value=nextClientCode();};
  const sectorInput=$('#f_sector',m); if(sectorInput) sectorInput.oninput=()=>{const rows=sectorMatches(sectorInput.value);$('#sectorHint',m).textContent=rows.length?'Coincidencias: '+rows.join(' · '):'No hay coincidencia exacta; podrás agregarlo al guardar.';};
  wireEnterFlow(m,['f_codigo','f_estado','f_negocio','f_contacto','f_telefono','f_tipo','f_sector','f_direccion','f_referencia','f_vendedor','f_limite','f_obs','saveClient']);
}
function openCallModal(c=null, call=null){
  if(call && !c) c = call.cliente || state.clientes.find(x=>Number(x.id)===Number(call.cliente_id));
  const isEdit=!!call;
  const selectedResult=call?.resultado||'Contactado';
  const initialTime = call?.hora ? String(call.hora).slice(0,5) : new Date().toTimeString().slice(0,5);
  const body=`<div class="form"><div class="field relative"><label>Cliente</label><input id="callClientText" value="${esc(c?c.codigo+' · '+c.negocio:'')}" placeholder="Buscar nombre del cliente..." ${isEdit?'readonly':''}><input type="hidden" id="callClientId" value="${c?.id||call?.cliente_id||''}"><div id="callSuggest" class="suggest" style="display:none"></div></div><div class="grid3"><div class="field"><label>Fecha</label><input id="callFecha" type="date" value="${String(call?.fecha||state.controlDate||today()).slice(0,10)}"></div><div class="field"><label>Hora</label><input id="callHora" type="time" value="${initialTime}"></div><div class="field"><label>Resultado</label><select id="callResult">${['Pidió','No pidió','No contestó','Reprogramar','Contactado','No disponible'].map(x=>`<option ${x===selectedResult?'selected':''}>${x}</option>`).join('')}</select></div></div><div class="grid2"><div class="field"><label>Monto RD$</label><input id="callMonto" type="number" value="${call?.monto||0}"></div><div class="field"><label>Próximo contacto si aplica</label><input id="callProximo" type="date" value="${String(call?.proximo_contacto||'').slice(0,10)}"></div></div><div class="field"><label>Observación / comentario</label><textarea id="callObs">${esc(call?.observacion||'')}</textarea></div><div class="actions"><button class="btn" id="saveCall">${isEdit?'Guardar cambios':'Guardar gestión'}</button>${!isEdit?'<button class="btn warn" id="createOrderFromCall">Guardar como “Pidió” y crear pedido</button>':''}${isEdit?'<button class="btn danger" id="deleteCall">Revertir gestión</button>':''}</div></div>`;
  const m=openModal(isEdit?'Editar gestión':'Registrar llamada',body,isEdit?'Corrige resultado, monto, hora o comentario sin crear una llamada duplicada.':'Selecciona el cliente y registra el resultado.');
  const callDraftKey = !isEdit ? draftKey('llamada', c?.id || 'nueva') : null;
  if(callDraftKey) attachCallDraft(m, callDraftKey);
  if(!isEdit) setupClientSuggest($('#callClientText',m),$('#callClientId',m),$('#callSuggest',m));
  const prox=$('#callProximo',m);
  if(prox){ prox.onchange=prox.oninput=()=>{ if(prox.value) $('#callResult',m).value='Reprogramar'; }; }
  $('#saveCall',m).onclick=async()=>{
    const cid=$('#callClientId',m).value; if(!cid) return alert('Selecciona un cliente.');
    const cl=state.clientes.find(x=>Number(x.id)===Number(cid)) || c;
    const resultado=$('#callResult',m).value;
    if(resultado==='Reprogramar' && !$('#callProximo',m).value) return alert('Reprogramar requiere fecha de próximo contacto.');
    const row={cliente_id:+cid,fecha:$('#callFecha',m).value||today(),hora:($('#callHora',m).value||new Date().toTimeString().slice(0,5)),vendedor:cl?.vendedor||state.profile.vendedor,resultado,monto:+$('#callMonto',m).value||0,proximo_contacto:$('#callProximo',m).value||null,observacion:$('#callObs',m).value||null};
    const q=isEdit?sb.from('llamadas').update(row).eq('id',call.id):sb.from('llamadas').insert(row);
    const {error}=await q; if(error) return alert(error.message+'\n\nSi dice que no tienes permiso, verifica las políticas RLS de llamadas.');
    if(callDraftKey) clearDraftLocal(callDraftKey);
    m.remove(); await refreshVisibleModuleV9384(); render(); toast(isEdit?'Gestión actualizada':'Llamada registrada');
  };
  const createBtn=$('#createOrderFromCall',m); if(createBtn) createBtn.onclick=async()=>{
    if(createBtn.dataset.busy==='1') return;
    createBtn.dataset.busy='1';
    createBtn.disabled=true;
    const originalText=createBtn.textContent;
    createBtn.textContent='Creando pedido...';
    try{
      const cid=$('#callClientId',m).value;
      if(!cid) throw new Error('Selecciona un cliente para crear el pedido.');
      const cl=state.clientes.find(x=>Number(x.id)===Number(cid));
      if(!cl) throw new Error('No pude encontrar el cliente seleccionado.');
      const obs=($('#callObs',m).value||'').trim();
      const row={cliente_id:+cid,fecha:$('#callFecha',m).value||today(),hora:($('#callHora',m).value||new Date().toTimeString().slice(0,5)),vendedor:cl?.vendedor||state.profile.vendedor,resultado:'Pidió',monto:+$('#callMonto',m).value||0,proximo_contacto:$('#callProximo',m).value||null,observacion:obs||'Pedido creado desde gestión de llamada.'};
      $('#callResult',m).value='Pidió';
      const operationToken=globalThis.crypto?.randomUUID?.();
      if(!operationToken) throw new Error('Este navegador no pudo generar el identificador seguro de la operación. Actualiza la aplicación e inténtalo nuevamente.');
      const extra={initialTotal:+$('#callMonto',m).value||0,initialNotas:obs,fromCall:true,fromCallDraft:{...row,idempotencia_token:operationToken},sourceCallDraftKey:callDraftKey};
      m.remove();
      openOrderForm(null,cl,extra);
      toast('Completa la orden. La gestión y el pedido se guardarán juntos al confirmar.');
    }catch(e){
      alert(e.message||e);
      createBtn.dataset.busy='0';
      createBtn.disabled=false;
      createBtn.textContent=originalText;
    }
  };
  const del=$('#deleteCall',m); if(del) del.onclick=async()=>{ m.remove(); await revertCall(call); };
}
function setupClientSuggest(inp,hid,box){
  try{
    inp.setAttribute('autocomplete','off');
    inp.setAttribute('autocorrect','off');
    inp.setAttribute('autocapitalize','off');
    inp.setAttribute('spellcheck','false');
    inp.setAttribute('data-lpignore','true');
    inp.setAttribute('data-form-type','other');
    inp.name='pc_cliente_busqueda_'+Math.random().toString(36).slice(2);
  }catch(e){}
  let rows=[]; let active=-1;
  const pick=(id)=>{const cl=state.clientes.find(x=>String(x.id)===String(id)); if(!cl) return; inp.value=cl.codigo+' · '+cl.negocio; hid.value=cl.id; box.style.display='none'; active=-1; inp.dispatchEvent(new CustomEvent('client-picked',{detail:cl}));};
  const paint=()=>{ const buttons=$$('[data-pick]',box); buttons.forEach((b,i)=>b.classList.toggle('active',i===active)); const el=buttons[active]; if(el) requestAnimationFrame(()=>el.scrollIntoView({block:'nearest'})); };
  const draw=()=>{ const q=inp.value; rows=state.clientes.filter(x=>matchClientName(x,q)).slice(0,50); active=rows.length?0:-1; box.style.display=q?'block':'none'; box.innerHTML=rows.map((x,i)=>`<button type="button" data-pick="${x.id}" data-pick-idx="${i}"><b>${esc(x.codigo)} · ${esc(x.negocio)}</b><br><span class="hint">${esc(x.contacto||'')} · ${esc(x.telefono||'')} · ${esc(x.sector||'')}</span></button>`).join(''); $$('[data-pick]',box).forEach(b=>{ b.onclick=()=>pick(b.dataset.pick); b.onmouseenter=()=>{active=+b.dataset.pickIdx;paint();}; }); paint(); };
  inp.oninput=draw; inp.onfocus=draw;
  inp.onkeydown=(e)=>{ if(box.style.display==='block' && rows.length){ if(e.key==='ArrowDown'){e.preventDefault(); active=(active+1)%rows.length; paint(); return;} if(e.key==='ArrowUp'){e.preventDefault(); active=(active-1+rows.length)%rows.length; paint(); return;} if(e.key==='Enter'){e.preventDefault(); pick(rows[Math.max(active,0)].id); return;} if(e.key==='Escape'){box.style.display='none'; return;} } if(e.key==='Enter'){e.preventDefault(); inp.dispatchEvent(new CustomEvent('client-enter'));} };
}

function setupProductSuggest(inp,hid,box, opts={}){
  if(!inp || !box) return;
  try{
    inp.setAttribute('autocomplete','off');
    inp.setAttribute('autocorrect','off');
    inp.setAttribute('autocapitalize','off');
    inp.setAttribute('spellcheck','false');
    inp.setAttribute('data-lpignore','true');
    inp.setAttribute('data-form-type','other');
    inp.name='pc_producto_busqueda_'+Math.random().toString(36).slice(2);
  }catch(e){}
  const allowInactive=opts.allowInactive!==false;
  let rows=[]; let active=-1;
  const productLabel=(p)=>[p.codigo,p.nombre].filter(Boolean).join(' · ');
  const pick=(id)=>{
    const pr=state.productos.find(x=>String(x.id)===String(id));
    if(!pr) return;
    inp.value=pr.nombre||'';
    if(hid) hid.value=pr.id;
    box.style.display='none';
    active=-1;
    inp.dispatchEvent(new CustomEvent('product-picked',{detail:pr}));
  };
  const paint=()=>{ const buttons=$$('[data-pick-product]',box); buttons.forEach((b,i)=>b.classList.toggle('active',i===active)); const el=buttons[active]; if(el) requestAnimationFrame(()=>el.scrollIntoView({block:'nearest'})); };
  const draw=()=>{
    const q=inp.value;
    if(hid) hid.value='';
    rows=state.productos.filter(p=>(allowInactive || p.activo!==false) && matchProductName(p,q)).slice(0,80);
    active=rows.length?0:-1;
    box.style.display=q?'block':'none';
    box.innerHTML=rows.length?rows.map((p,i)=>`<button type="button" data-pick-product="${p.id}" data-pick-product-idx="${i}"><b>${esc(productLabel(p))}</b><br><span class="hint">${esc(p.categoria||'Sin categoría')} · ${money(p.precio_defecto||0)} / ${esc(p.unidad||'lb')} · ${esc(weightConfigLabel(p))}${p.activo===false?' · Inactivo':''}</span></button>`).join(''):'<button type="button"><span class="hint">No aparece en catálogo. Verifica el nombre o crea el producto en el módulo Productos.</span></button>';
    $$('[data-pick-product]',box).forEach(b=>{ b.onclick=()=>pick(b.dataset.pickProduct); b.onmouseenter=()=>{active=+b.dataset.pickProductIdx; paint();}; });
    paint();
  };
  inp.oninput=draw; inp.onfocus=draw;
  inp.onkeydown=(e)=>{
    if(box.style.display==='block' && rows.length){
      if(e.key==='ArrowDown'){e.preventDefault(); active=(active+1)%rows.length; paint(); return;}
      if(e.key==='ArrowUp'){e.preventDefault(); active=(active-1+rows.length)%rows.length; paint(); return;}
      if(e.key==='Enter'){e.preventDefault(); pick(rows[Math.max(active,0)].id); return;}
      if(e.key==='Escape'){box.style.display='none'; return;}
    }
    if(e.key==='Enter'){e.preventDefault(); inp.dispatchEvent(new CustomEvent('product-enter'));}
  };
}
function wireEnterFlow(m, ids){
  const focusNext=(idx)=>{
    const nextIds=ids.slice(idx+1);
    for(const nid of nextIds){ const n=$('#'+nid,m); if(n && !n.disabled && n.offsetParent!==null){ setTimeout(()=>focusSelect(n),0); return; } }
    const last=ids[ids.length-1]; const btn=$('#'+last,m); if(btn && btn.tagName==='BUTTON') btn.click();
  };
  ids.forEach((id,idx)=>{
    const el=$('#'+id,m); if(!el) return;
    if(el.tagName==='BUTTON') return;
    el.addEventListener('client-picked',()=>focusNext(idx));
    el.addEventListener('client-enter',()=>focusNext(idx));
    el.addEventListener('product-picked',()=>focusNext(idx));
    el.addEventListener('product-enter',()=>focusNext(idx));
    el.addEventListener('keydown',(e)=>{
      if(e.key!=='Enter') return;
      const tag=(el.tagName||'').toUpperCase();
      const type=String(el.type||'').toLowerCase();
      const suggest=el.parentElement?.querySelector?.('.suggest');
      if(suggest && suggest.style.display==='block') return;
      if(tag==='TEXTAREA' && e.shiftKey) return;
      e.preventDefault();
      if(type==='checkbox') el.checked=!el.checked;
      focusNext(idx);
    });
  });
  const first=$('#'+ids[0],m); if(first) setTimeout(()=>focusSelect(first),80);
}
function findProductIdByName(name){ const n=norm(name||''); const p=state.productos.find(x=>norm(x.nombre)===n) || state.productos.find(x=>norm(x.codigo)===n); return p?.id||''; }
function isInternalOrderItemNote(note=''){
  const n=norm(note);
  return !n || n==='producto no listado' || n==='producto no listado unidad asumida lb';
}
function itemInstruction(item){
  const note=String(item?.notas||'').trim();
  return isInternalOrderItemNote(note) ? '' : note.replace(/^(?:observación|observacion|corte|nota)\s*:\s*/i,'').trim();
}
function itemInstructionHtml(item){
  const note=itemInstruction(item);
  return note ? `<div class="prep-item-note"><b>Obs.</b><span>${esc(note)}</span></div>` : '';
}

function openOrderForm(o=null, client=null, extra={}){
  const existingItems=(o?.items||[]).map(i=>({id:i.id,producto_id:i.producto_id||'',producto_nombre:i.producto_nombre||'',cantidad_pedida:+i.cantidad_pedida||0,unidad:i.unidad||'lb',precio:+i.precio||0,subtotal:+i.subtotal||0,notas:i.notas||'',tipo_despacho_peso:i.tipo_despacho_peso||'',requiere_pesaje:i.requiere_pesaje,peso_estandar_lb:i.peso_estandar_lb,tolerancia_lb:i.tolerancia_lb,suma_peso_final:i.suma_peso_final,permite_fraccion:i.permite_fraccion,cantidad_preparada:i.cantidad_preparada,estado_preparacion:i.estado_preparacion,nota_preparacion:i.nota_preparacion,peso_equivalente_preparado:i.peso_equivalente_preparado,peso_equivalente_solicitado:i.peso_equivalente_solicitado}));
  let lineItems=existingItems.length?existingItems:[];
  let staged={producto_id:'',producto_nombre:'',cantidad_pedida:1,unidad:'lb',precio:0,subtotal:0,notas:'',permite_fraccion:true};
  const deliveryOptions=state.deliverys.filter(d=>d.activo!==false).map(d=>d.nombre);
  const selectedDelivery=o?.delivery_nombre||'';
  const adminAdvanced = !!o && isAdminRole();
  const currentTotal = o?.total_factura||o?.total_estimado||extra.initialTotal||0;
  const initialCustomerType=o?orderCustomerType(o):'Registrado';
  const initialDeliveryMode=o?orderDeliveryMode(o):appCfg('flujos.modalidadPredeterminada','Delivery');
  const allowInternalSales=appCfg('flujos.permitirVentasInternas',true)!==false;
  const scheduleEditable=!o || ['Programada','Pedido recibido'].includes(o.estado) || isAdminRole();
  const adminFields = adminAdvanced ? `<div class="order-section admin-section"><div class="section-title">Datos administrativos</div><div class="hint">Estos campos pertenecen al cierre del flujo. Úsalos solo para correcciones administrativas.</div><div class="grid2"><div class="field"><label>Factura No.</label><input id="ordFactura" value="${esc(o?.factura_no||'')}"></div><div class="field"><label>Delivery</label>${deliveryOptions.length?`<select id="ordDelivery"><option value="">Sin asignar</option>${deliveryOptions.map(n=>`<option ${n===selectedDelivery?'selected':''}>${esc(n)}</option>`).join('')}<option value="__manual__" ${selectedDelivery&&!deliveryOptions.includes(selectedDelivery)?'selected':''}>Otro / manual</option></select><input id="ordDeliveryManual" value="${selectedDelivery&&!deliveryOptions.includes(selectedDelivery)?esc(selectedDelivery):''}" placeholder="Nombre del delivery" style="margin-top:8px;${selectedDelivery&&!deliveryOptions.includes(selectedDelivery)?'':'display:none'}">`:`<input id="ordDelivery" value="${esc(selectedDelivery)}" placeholder="Nombre del delivery">`}</div></div></div>` : `<input type="hidden" id="ordFactura" value="${esc(o?.factura_no||'')}"><input type="hidden" id="ordDelivery" value="${esc(selectedDelivery)}"><input type="hidden" id="ordDeliveryManual" value="">`;
  const body=`<div class="form order-form-pro order-form-r10"><input type="hidden" id="ordTotal" value="${currentTotal}">
    <div class="order-section order-client-section-r10"><div class="section-title">1. Cliente e identificación</div><div class="grid2 order-customer-mode-grid"><div class="field"><label>Tipo de cliente</label><select id="ordCustomerType"><option value="Registrado" ${initialCustomerType==='Registrado'?'selected':''}>Cliente registrado</option><option value="Ocasional" ${initialCustomerType==='Ocasional'?'selected':''}>Cliente ocasional / sin registrar</option><option value="Venta interna" ${initialCustomerType==='Venta interna'?'selected':''}>Venta interna / mostrador</option></select></div><div class="field"><label>Modalidad de entrega</label><select id="ordDeliveryMode"><option value="Delivery" ${initialDeliveryMode==='Delivery'?'selected':''}>Delivery</option><option value="Retiro en negocio" ${initialDeliveryMode==='Retiro en negocio'?'selected':''}>Retiro en negocio</option><option value="No aplica" ${initialDeliveryMode==='No aplica'?'selected':''}>No aplica</option></select></div></div><div id="registeredClientBlock" class="field relative"><label>Cliente registrado</label><input id="ordClientText" autocomplete="off" data-lpignore="true" data-form-type="other" value="${esc(client?client.codigo+' · '+client.negocio:(o?.cliente?o.cliente.codigo+' · '+o.cliente.negocio:''))}" placeholder="Buscar nombre del cliente..."><input type="hidden" id="ordClientId" value="${client?.id||o?.cliente_id||''}"><div id="ordSuggest" class="suggest" style="display:none"></div></div><div id="temporaryClientBlock" style="display:none"><div class="grid2"><div class="field"><label>Nombre del comprador *</label><input id="ordInternalName" maxlength="120" value="${esc(initialCustomerType!=='Registrado'?orderClientName(o):'')}" placeholder="Nombre obligatorio"></div><div class="field"><label>Teléfono</label><input id="ordInternalPhone" maxlength="30" value="${esc(initialCustomerType!=='Registrado'?orderClientPhone(o):'')}" placeholder="Obligatorio para delivery"></div></div><div id="occasionalAddressBlock" style="display:none"><div class="grid2"><div class="field"><label>Sector *</label><input id="ordOccasionalSector" list="orderSectorOptions" value="${esc(isOccasionalCustomer(o)?orderClientSector(o):'')}" placeholder="Escribe para buscar"><datalist id="orderSectorOptions">${sectorValues().map(v=>`<option value="${esc(v)}">`).join('')}</datalist></div><div class="field"><label>Dirección completa *</label><input id="ordOccasionalAddress" value="${esc(isOccasionalCustomer(o)?orderClientAddress(o):'')}" placeholder="Calle, número y ubicación"></div></div><div class="field"><label>Referencia de ubicación</label><input id="ordOccasionalReference" value="${esc(isOccasionalCustomer(o)?orderClientReference(o):'')}" placeholder="Ej.: casa azul, frente a la escuela"></div></div></div><div id="customerFlowNote" class="weight-alert info"></div></div>
    <div class="order-section order-schedule-section-r10"><div class="section-title">2. Programación del pedido</div><div class="grid3"><div class="field"><label>Fecha despacho</label><input id="ordFechaDespacho" type="date" value="${esc(o?.fecha_despacho||today())}" ${scheduleEditable?'':'disabled'}></div><div class="field"><label>Hora despacho</label><input id="ordHoraDespacho" type="time" value="${esc((o?.hora_despacho||'').slice(0,5))}" ${scheduleEditable?'':'disabled'}></div><div class="field"><label>Prioridad</label><select id="ordPrioridad"><option ${(!o?.prioridad||o?.prioridad==='Normal')?'selected':''}>Normal</option><option ${o?.prioridad==='Alta'?'selected':''}>Alta</option><option ${o?.prioridad==='Urgente'?'selected':''}>Urgente</option></select></div></div><div class="grid3 order-type-grid" style="margin-top:12px"><div class="field order-type-main"><label>Tipo de orden</label><select id="ordTipoOrden">${orderTypes().map(t=>`<option value="${esc(t)}" ${(orderType(o||{tipo_orden:extra.tipo_orden||'Pedido normal'})===t)?'selected':''}>${esc(t)}</option>`).join('')}</select></div><div class="field order-flow-detail-r10"><label>Preparación</label><input id="ordReqPrepInfo" readonly></div><div class="field order-flow-detail-r10"><label>Facturación</label><input id="ordReqFactInfo" readonly></div></div><div id="orderTypeNote" class="weight-alert info"></div><div id="programNote" class="weight-alert" style="display:none"><strong>Pedido programado</strong>Esta orden tiene fecha futura. No aparecerá en Carnicería hasta la fecha de despacho.</div>${orderStateControlHtml(o)}</div>
    ${adminFields}
    <div class="order-section order-products-section-r10"><div class="section-title">3. Productos solicitados</div><div class="order-builder professional"><div class="order-entry"><div class="order-stage-grid pro"><div class="field relative wide"><label>Producto</label><input id="newItemName" autocomplete="off" data-lpignore="true" data-form-type="other" placeholder="Buscar producto o escribir manualmente"><input type="hidden" id="newItemPid"><div id="newItemSuggest" class="suggest" style="display:none"></div></div><div class="field"><label>Cantidad</label><input id="newItemQty" type="number" step="0.01" value="1"></div><div class="field"><label>Unidad</label><div id="newItemUnitDisplay" class="calc-box unit-display">lb</div><input id="newItemUnit" value="lb" type="hidden"></div><div class="field"><label>Precio</label><input id="newItemPrice" type="number" step="0.01" value="0"></div></div><div class="field order-item-note-entry"><label>Corte / observación del artículo</label><input id="newItemNote" maxlength="180" placeholder="Ej.: cortar pequeño, moler dos veces, empacar separado"></div><div class="actions" style="margin-top:12px"><button type="button" class="btn dark" id="addStagedItem">Agregar producto</button><button type="button" class="btn gray" id="addManualItem">Agregar no listado</button><button type="button" class="btn gray" id="clearStage">Limpiar entrada</button></div></div><div class="order-total-card order-total-readonly"><div><span class="count" id="orderItemCount">0 productos</span><div class="big-total" id="orderBigTotal">RD$ 0</div><div class="hint">Total estimado automático. No se edita manualmente en creación; Facturación registra la factura final.</div></div></div></div><div id="orderItems" class="order-summary-list professional"></div></div>
    <details class="order-section order-notes-details-r10" ${(o?.nota_programacion||o?.notas||extra.initialNotas)?'open':''}><summary>4. Notas adicionales</summary><div class="order-notes-content-r10"><div class="field"><label>Nota de programación</label><textarea id="ordNotaProgramacion" placeholder="Ejemplo: cliente pidió para el lunes temprano.">${esc(o?.nota_programacion||'')}</textarea></div><div class="field"><label>Notas internas</label><textarea id="ordNotas">${esc(o?.notas||extra.initialNotas||'')}</textarea></div></div></details><button class="btn save-order-btn" id="saveOrder">Guardar orden</button></div>`;
  const m=openModal(o?'Actualizar orden':'Crear orden',body,'Pedido compacto: usa Enter y flechas para capturar más rápido.');
  m.classList.add('order-modal');
  const orderCard=$('.modal-card',m); if(orderCard) orderCard.classList.add('order-modal-card');
  const notesDetails=$('.order-notes-details-r10',m); if(notesDetails && window.matchMedia && window.matchMedia('(min-width:1025px)').matches) notesDetails.open=true;
  setupClientSuggest($('#ordClientText',m),$('#ordClientId',m),$('#ordSuggest',m));
  const syncCustomerModeUi=()=>{
    const type=$('#ordCustomerType',m)?.value||'Registrado';
    const mode=$('#ordDeliveryMode',m);
    const registered=$('#registeredClientBlock',m), temporary=$('#temporaryClientBlock',m), address=$('#occasionalAddressBlock',m), note=$('#customerFlowNote',m);
    const internalSale=type==='Venta interna';
    const occasional=type==='Ocasional';
    const incident=String($('#ordTipoOrden',m)?.value||'').includes('Incidente');
    if(registered) registered.style.display=type==='Registrado'?'block':'none';
    if(temporary) temporary.style.display=type==='Registrado'?'none':'block';
    if(address) address.style.display=occasional?'block':'none';
    if(internalSale && mode){ mode.value='Retiro en negocio'; mode.disabled=true; }
    else if(incident && mode){ mode.value='No aplica'; mode.disabled=true; }
    else if(mode){ mode.disabled=false; if(mode.value==='No aplica') mode.value=appCfg('flujos.modalidadPredeterminada','Delivery'); }
    if(note) note.innerHTML=internalSale?'<strong>Venta interna</strong>El nombre es obligatorio, no crea ficha de cliente, queda al contado y se retira en el negocio.':occasional?'<strong>Cliente ocasional</strong>No crea ficha permanente. Para delivery exige teléfono, sector y dirección; los datos quedan guardados en esta orden.':'<strong>Cliente registrado</strong>Selecciona la modalidad: Delivery o Retiro en negocio.';
  };
  $('#ordCustomerType',m)?.addEventListener('change',syncCustomerModeUi);
  $('#ordDeliveryMode',m)?.addEventListener('change',syncCustomerModeUi);
  syncCustomerModeUi();
  $('#ordClientText',m).addEventListener('client-picked',()=>{ const el=$('#newItemName',m)||$('#ordEstado',m); if(el) setTimeout(()=>el.focus(),0); });
  $('#ordClientText',m).addEventListener('client-enter',()=>{ const el=$('#newItemName',m)||$('#ordEstado',m); if(el) setTimeout(()=>el.focus(),0); });
  const delSel=$('#ordDelivery',m); const manual=$('#ordDeliveryManual',m); if(delSel&&manual) delSel.onchange=()=>{manual.style.display=delSel.value==='__manual__'?'block':'none';};
  const syncScheduleUi=()=>{ const d=$('#ordFechaDespacho',m)?.value||today(); const hoyLocal=today(); const note=$('#programNote',m); if(note) note.style.display=d>hoyLocal?'block':'none'; const st=$('#ordEstado',m); if(st && d>hoyLocal && !o) st.value='Programada'; const info=$('#ordEstadoInfo',m); if(info && !o) info.value=initialOrderStateByDispatch(d); };
  const syncOrderTypeUi=()=>{
    const t=$('#ordTipoOrden',m)?.value||'Pedido normal';
    const r=orderTypeRule(t);
    const prep=$('#ordReqPrepInfo',m), fact=$('#ordReqFactInfo',m), note=$('#orderTypeNote',m);
    if(prep) prep.value=r.prep?'Sí pasa por Carnicería':'No pasa por Carnicería';
    if(fact) fact.value=r.invoice?'Sí pasa por Facturación':'No requiere Facturación';
    if(note){ note.innerHTML=`<strong>${esc(r.label)}</strong>${esc(r.desc)}`; note.className='weight-alert '+(t==='Pedido normal'?'info':(t.includes('Incidente')?'bad':'warn')); }
    const mode=$('#ordDeliveryMode',m); if(mode && t.includes('Incidente')){ mode.value='No aplica'; mode.disabled=true; } else if(mode && ($('#ordCustomerType',m)?.value||'Registrado')!=='Venta interna'){ mode.disabled=false; if(mode.value==='No aplica') mode.value=appCfg('flujos.modalidadPredeterminada','Delivery'); }
    syncCustomerModeUi();
  };
  $('#ordTipoOrden',m)?.addEventListener('change',syncOrderTypeUi);
  $('#ordFechaDespacho',m).onchange=syncScheduleUi; syncScheduleUi(); syncOrderTypeUi();
  const calc=()=>{ lineItems.forEach(it=>{it.subtotal=(+it.cantidad_pedida||0)*(+it.precio||0);}); const total=lineItems.reduce((s,it)=>s+(+it.subtotal||0),0); const inp=$('#ordTotal',m); if(inp) inp.value=Number(total.toFixed(2)); const big=$('#orderBigTotal',m); if(big) big.textContent=money(total); const count=$('#orderItemCount',m); if(count) count.textContent=lineItems.length+' producto'+(lineItems.length===1?'':'s'); return total; };
  const resetStage=()=>{ staged={producto_id:'',producto_nombre:'',cantidad_pedida:1,unidad:'lb',precio:0,subtotal:0,notas:'',permite_fraccion:true}; $('#newItemName',m).value=''; $('#newItemPid',m).value=''; $('#newItemQty',m).value=1; $('#newItemUnit',m).value='lb'; const uDisp=$('#newItemUnitDisplay',m); if(uDisp) uDisp.textContent='lb'; $('#newItemPrice',m).value=0; const note=$('#newItemNote',m); if(note) note.value=''; $('#newItemSuggest',m).style.display='none'; };
  const drawItems=(opts={})=>{
    calc();
    const box=$('#orderItems',m);
    box.innerHTML=lineItems.length?lineItems.map((it,idx)=>{
      const noFrac=it.permite_fraccion===false;
      const note=itemInstruction(it);
      return `<div class="order-row order-row-r10" data-line="${idx}"><div class="order-item-title-r10"><b>${esc(it.producto_nombre||'Producto')}</b><small>${it.producto_id?'Catálogo':'No listado'} · ${esc(it.unidad||'lb')}${noFrac?' · Solo entero':''}</small></div><div class="order-item-mainline-r10"><label><span>Cant.</span><input data-row-qty="${idx}" type="number" step="${noFrac?'1':'0.01'}" value="${it.cantidad_pedida||0}" title="Cantidad"></label><label><span>Precio</span><input data-row-price="${idx}" type="number" step="0.01" value="${it.precio||0}" title="Precio"></label><div class="order-subtotal-r10"><span>Subtotal</span><strong data-row-sub="${idx}">${money(it.subtotal||0)}</strong></div><button type="button" class="btn small danger order-remove-r10" data-row-del="${idx}" aria-label="Quitar ${esc(it.producto_nombre||'producto')}">Quitar</button></div><label class="order-item-note-r10"><span>Observación</span><input data-row-note="${idx}" maxlength="180" value="${esc(note)}" placeholder="Corte, empaque o preparación"></label></div>`;
    }).join(''):'<div class="order-empty">Aún no has agregado productos. Usa el buscador superior para construir la orden.</div>';
    box.title=lineItems.length>5?'Usa la rueda del mouse o desliza para ver más artículos de esta orden.':'';
    $$('[data-row-qty]',m).forEach(inp=>{ inp.oninput=()=>{ lineItems[+inp.dataset.rowQty].cantidad_pedida=+inp.value||0; calc(); const i=+inp.dataset.rowQty; const sub=$(`[data-row-sub="${i}"]`,m); if(sub) sub.textContent=money(lineItems[i].subtotal||0); }; inp.onchange=()=>{ const i=+inp.dataset.rowQty; const item=lineItems[i]; const val=+inp.value||0; if(!validateFractionQty(item,val)){ inp.classList.add('input-error'); inp.value=Math.max(1,Math.round(val||1)); item.cantidad_pedida=+inp.value; alert(noFractionMessage(item.producto_nombre)); } else inp.classList.remove('input-error'); calc(); const sub=$(`[data-row-sub="${i}"]`,m); if(sub) sub.textContent=money(item.subtotal||0); }; });
    $$('[data-row-price]',m).forEach(inp=>inp.oninput=()=>{ lineItems[+inp.dataset.rowPrice].precio=+inp.value||0; calc(); const i=+inp.dataset.rowPrice; const sub=$(`[data-row-sub="${i}"]`,m); if(sub) sub.textContent=money(lineItems[i].subtotal||0); });
    $$('[data-row-note]',m).forEach(inp=>inp.oninput=()=>{ lineItems[+inp.dataset.rowNote].notas=inp.value; });
    $$('[data-row-del]',m).forEach(btn=>btn.onclick=()=>{ lineItems.splice(+btn.dataset.rowDel,1); drawItems(); });
    if(opts.scrollEnd && lineItems.length){
      requestAnimationFrame(()=>{
        try{
          const last=box.querySelector(`[data-line="${lineItems.length-1}"]`);
          if(last) last.scrollIntoView({block:'nearest', inline:'nearest'});
          box.scrollTop=box.scrollHeight;
        }catch(e){}
      });
    }
  };
  const suggest=$('#newItemSuggest',m), nameInp=$('#newItemName',m), qtyInp=$('#newItemQty',m), unitInp=$('#newItemUnit',m), priceInp=$('#newItemPrice',m), noteInp=$('#newItemNote',m), addBtn=$('#addStagedItem',m), manualBtn=$('#addManualItem',m);
  let productSuggestRows=[]; let activeProductIdx=-1;
  const focusSelect=(el)=>{ if(!el) return; setTimeout(()=>{ el.focus(); if(el.select) el.select(); },0); };
  const paintProductSuggest=()=>{ const buttons=$$('[data-stage-product]',suggest); buttons.forEach((b,i)=>b.classList.toggle('active',i===activeProductIdx)); const active=buttons[activeProductIdx]; if(active) requestAnimationFrame(()=>active.scrollIntoView({block:'nearest'})); };
  const pickProduct=(p)=>{ if(!p) return; staged.producto_id=p.id; staged.producto_nombre=p.nombre; staged.unidad=p.unidad||'lb'; staged.precio=+p.precio_defecto||0; Object.assign(staged, productWeightSnapshot(p.id)); nameInp.value=p.nombre; $('#newItemPid',m).value=p.id; unitInp.value=staged.unidad; priceInp.value=staged.precio; suggest.style.display='none'; activeProductIdx=-1; focusSelect(qtyInp); };
  try{ nameInp.setAttribute('autocomplete','off'); nameInp.setAttribute('autocorrect','off'); nameInp.setAttribute('autocapitalize','off'); nameInp.setAttribute('spellcheck','false'); nameInp.setAttribute('data-lpignore','true'); nameInp.setAttribute('data-form-type','other'); nameInp.name='pc_producto_busqueda_'+Math.random().toString(36).slice(2); }catch(e){}
  const drawProductSuggest=()=>{ const q=nameInp.value; staged.producto_nombre=q; staged.producto_id=''; staged.unidad='lb'; staged.precio=0; staged.permite_fraccion=true; $('#newItemPid',m).value=''; unitInp.value='lb'; priceInp.value=0; productSuggestRows=state.productos.filter(p=>p.activo!==false && matchProductName(p,q)).slice(0,80); activeProductIdx=productSuggestRows.length?0:-1; suggest.style.display=q?'block':'none'; suggest.innerHTML=productSuggestRows.length?productSuggestRows.map((p,i)=>`<button type="button" data-stage-product="${p.id}" data-prod-idx="${i}"><b>${esc(p.nombre)}</b><br><span class="hint">${esc(p.codigo||'')} · ${esc(p.categoria||'')} · ${money(p.precio_defecto)} / ${esc(p.unidad||'lb')} · ${esc(weightConfigLabel(p))}</span></button>`).join(''):'<button type="button"><span class="hint">No aparece en catálogo. Puedes agregarlo como no listado y seguir con Enter.</span></button>'; $$('[data-stage-product]',suggest).forEach(b=>{ b.onclick=()=>pickProduct(state.productos.find(x=>x.id==b.dataset.stageProduct)); b.onmouseenter=()=>{activeProductIdx=+b.dataset.prodIdx;paintProductSuggest();}; }); paintProductSuggest(); };
  nameInp.oninput=drawProductSuggest; nameInp.onfocus=drawProductSuggest;
  nameInp.onkeydown=(e)=>{ if(suggest.style.display==='block' && productSuggestRows.length){ if(e.key==='ArrowDown'){e.preventDefault(); activeProductIdx=(activeProductIdx+1)%productSuggestRows.length; paintProductSuggest(); return;} if(e.key==='ArrowUp'){e.preventDefault(); activeProductIdx=(activeProductIdx-1+productSuggestRows.length)%productSuggestRows.length; paintProductSuggest(); return;} if(e.key==='Enter'){e.preventDefault(); pickProduct(productSuggestRows[Math.max(activeProductIdx,0)]); return;} if(e.key==='Escape'){suggest.style.display='none'; return;} } if(e.key==='Enter'){ e.preventDefault(); focusSelect(qtyInp); } };
  qtyInp.onkeydown=(e)=>{ if(e.key==='Enter'){ e.preventDefault(); focusSelect(priceInp); } };
  unitInp.onkeydown=(e)=>{ if(e.key==='Enter'){ e.preventDefault(); focusSelect(priceInp); } };
  priceInp.onkeydown=(e)=>{ if(e.key==='Enter'){ e.preventDefault(); focusSelect(noteInp||addBtn); } };
  if(noteInp) noteInp.onkeydown=(e)=>{ if(e.key==='Enter'){ e.preventDefault(); addBtn.click(); } };
  addBtn.onkeydown=(e)=>{ if(e.key==='Enter'){ e.preventDefault(); addBtn.click(); } };
  manualBtn.onkeydown=(e)=>{ if(e.key==='Enter'){ e.preventDefault(); manualBtn.click(); } };
  $('#clearStage',m).onclick=()=>{ resetStage(); focusSelect(nameInp); };
  const addFromStage=(manualMode=false)=>{ const nombre=String($('#newItemName',m).value||'').trim(); if(!nombre) return alert('Escribe o selecciona un producto.'); const qty=+qtyInp.value||0; if(qty<=0) return alert('La cantidad debe ser mayor que cero.'); const catalogProduct=staged.producto_id?state.productos.find(p=>String(p.id)===String(staged.producto_id)):null; if(catalogProduct && catalogProduct.activo===false) return alert('Este producto está inactivo. Actívalo o selecciona otro producto.'); if(catalogProduct){ const issues=productConfigIssues(catalogProduct); if(issues.length && !confirm('Este producto tiene configuración por revisar:\n- '+issues.join('\n- ')+'\n\nPuedes agregarlo, pero podría afectar el peso calculado o el despacho. ¿Continuar?')) return; } const fixedUnit=catalogProduct?(catalogProduct.unidad||'lb'):'lb'; const snap=manualMode||!staged.producto_id?{tipo_despacho_peso:'Por libra',requiere_pesaje:true,peso_estandar_lb:null,tolerancia_lb:0.25,suma_peso_final:true,permite_fraccion:true}:productWeightSnapshot(staged.producto_id); const item={producto_id:manualMode?null:(staged.producto_id?+staged.producto_id:null),producto_nombre:nombre,cantidad_pedida:qty,unidad:fixedUnit,precio:+priceInp.value||0,subtotal:0,notas:String(noteInp?.value||'').trim()||(manualMode||!staged.producto_id?'Producto no listado · unidad asumida lb':null),...snap}; if(!validateFractionQty(item,qty)) return alert(noFractionMessage(nombre)); lineItems.push(item); resetStage(); drawItems({scrollEnd:true}); focusSelect(nameInp); };
  addBtn.onclick=()=>addFromStage(false);
  manualBtn.onclick=()=>addFromStage(true);
  drawItems(); focusSelect(nameInp);
  const orderDraftKey=draftKey(o?'orden_editar':'orden', o?.id || extra.fromCallDraft?.idempotencia_token || client?.id || 'nueva');
  attachOrderDraft(m, orderDraftKey, ()=>({
    customerType:$('#ordCustomerType',m)?.value||'Registrado', deliveryMode:$('#ordDeliveryMode',m)?.value||'Delivery', internalName:$('#ordInternalName',m)?.value||'', internalPhone:$('#ordInternalPhone',m)?.value||'', occasionalSector:$('#ordOccasionalSector',m)?.value||'', occasionalAddress:$('#ordOccasionalAddress',m)?.value||'', occasionalReference:$('#ordOccasionalReference',m)?.value||'', clientText:$('#ordClientText',m)?.value||'', clientId:$('#ordClientId',m)?.value||'', fechaDespacho:$('#ordFechaDespacho',m)?.value||today(), horaDespacho:$('#ordHoraDespacho',m)?.value||'', prioridad:$('#ordPrioridad',m)?.value||'Normal', total:$('#ordTotal',m)?.value||0, factura:$('#ordFactura',m)?.value||'', delivery:$('#ordDelivery',m)?.value||'', deliveryManual:$('#ordDeliveryManual',m)?.value||'', notaProgramacion:$('#ordNotaProgramacion',m)?.value||'', notas:$('#ordNotas',m)?.value||'', lineItems:lineItems, stage:{name:$('#newItemName',m)?.value||'',pid:$('#newItemPid',m)?.value||'',qty:$('#newItemQty',m)?.value||1,unit:$('#newItemUnit',m)?.value||'lb',price:$('#newItemPrice',m)?.value||0,note:$('#newItemNote',m)?.value||''}
  }), data=>{
    if(data.customerType!==undefined) $('#ordCustomerType',m).value=data.customerType||'Registrado';
    if(data.deliveryMode!==undefined) $('#ordDeliveryMode',m).value=data.deliveryMode||'Delivery';
    if(data.internalName!==undefined) $('#ordInternalName',m).value=data.internalName||'';
    if(data.internalPhone!==undefined) $('#ordInternalPhone',m).value=data.internalPhone||'';
    if(data.occasionalSector!==undefined) $('#ordOccasionalSector',m).value=data.occasionalSector||'';
    if(data.occasionalAddress!==undefined) $('#ordOccasionalAddress',m).value=data.occasionalAddress||'';
    if(data.occasionalReference!==undefined) $('#ordOccasionalReference',m).value=data.occasionalReference||'';
    if(data.clientText!==undefined) $('#ordClientText',m).value=data.clientText||'';
    if(data.clientId!==undefined) $('#ordClientId',m).value=data.clientId||'';
    if(data.fechaDespacho!==undefined) $('#ordFechaDespacho',m).value=data.fechaDespacho||today();
    if(data.horaDespacho!==undefined) $('#ordHoraDespacho',m).value=data.horaDespacho||'';
    if(data.prioridad!==undefined) $('#ordPrioridad',m).value=data.prioridad||'Normal';
    if(data.total!==undefined) $('#ordTotal',m).value=data.total||0;
    if(data.factura!==undefined) $('#ordFactura',m).value=data.factura||'';
    if(data.delivery!==undefined && $('#ordDelivery',m)) $('#ordDelivery',m).value=data.delivery||'';
    if(data.deliveryManual!==undefined && $('#ordDeliveryManual',m)) $('#ordDeliveryManual',m).value=data.deliveryManual||'';
    if(data.notaProgramacion!==undefined) $('#ordNotaProgramacion',m).value=data.notaProgramacion||'';
    if(data.notas!==undefined) $('#ordNotas',m).value=data.notas||'';
    if(Array.isArray(data.lineItems)){ lineItems=data.lineItems; drawItems(); }
    if(data.stage){ $('#newItemName',m).value=data.stage.name||''; $('#newItemPid',m).value=data.stage.pid||''; $('#newItemQty',m).value=data.stage.qty||1; $('#newItemUnit',m).value=data.stage.unit||'lb'; const uDisp=$('#newItemUnitDisplay',m); if(uDisp) uDisp.textContent=data.stage.unit||'lb'; $('#newItemPrice',m).value=data.stage.price||0; if($('#newItemNote',m)) $('#newItemNote',m).value=data.stage.note||''; }
    syncScheduleUi(); syncCustomerModeUi();
  });
  const saveOrderBtn=$('#saveOrder',m);
  saveOrderBtn.onclick=async()=>{
    if(saveOrderBtn.dataset.busy==='1') return;
    saveOrderBtn.dataset.busy='1';
    saveOrderBtn.disabled=true;
    const saveOrderText=saveOrderBtn.textContent;
    saveOrderBtn.textContent='Guardando orden...';
    try{
    const customerType=$('#ordCustomerType',m)?.value||'Registrado';
    const deliveryMode=$('#ordDeliveryMode',m)?.value||'Delivery';
    const cid=$('#ordClientId',m).value;
    const internalName=String($('#ordInternalName',m)?.value||'').trim();
    const occasional=customerType==='Ocasional';
    const occasionalPhone=String($('#ordInternalPhone',m)?.value||'').trim();
    let occasionalSector=String($('#ordOccasionalSector',m)?.value||'').trim();
    const occasionalAddress=String($('#ordOccasionalAddress',m)?.value||'').trim();
    const occasionalReference=String($('#ordOccasionalReference',m)?.value||'').trim();
    if(customerType==='Venta interna' && appCfg('flujos.permitirVentasInternas',true)===false) return alert('Las ventas internas están desactivadas en Configuración.');
    if(customerType==='Registrado' && !cid) return alert('Selecciona un cliente registrado.');
    if(customerType!=='Registrado' && !internalName) return alert('Es obligatorio escribir el nombre del comprador.');
    if(customerType==='Venta interna' && deliveryMode!=='Retiro en negocio') return alert('Las ventas internas solo pueden configurarse como Retiro en negocio.');
    if(occasional && deliveryMode==='Delivery' && !occasionalPhone) return alert('El teléfono es obligatorio para enviar un cliente ocasional por delivery.');
    if(occasional && deliveryMode==='Delivery' && !occasionalSector) return alert('El sector es obligatorio para enviar un cliente ocasional por delivery.');
    if(occasional && deliveryMode==='Delivery' && !occasionalAddress) return alert('La dirección completa es obligatoria para enviar un cliente ocasional por delivery.');
    if(occasional && occasionalSector){ occasionalSector=await ensureSectorCatalog(occasionalSector); if(occasionalSector===null) return; }
    for(const it of lineItems){ if(!validateFractionQty(it,+it.cantidad_pedida||0)) return alert(noFractionMessage(it.producto_nombre)); }
    let clean=lineItems.map(it=>{ const snap=it.producto_id?productWeightSnapshot(it.producto_id):{tipo_despacho_peso:it.tipo_despacho_peso||(String(it.unidad||'lb').toLowerCase()==='lb'?'Por libra':'Unidad peso variable'),requiere_pesaje:true,peso_estandar_lb:it.peso_estandar_lb||null,tolerancia_lb:it.tolerancia_lb||0.25,suma_peso_final:it.suma_peso_final!==false,permite_fraccion:it.permite_fraccion!==false}; const base={producto_id:it.producto_id?+it.producto_id:null,producto_nombre:String(it.producto_nombre||'').trim(),cantidad_pedida:+it.cantidad_pedida||0,unidad:String(it.unidad||'lb').trim(),precio:+it.precio||0,subtotal:(+it.cantidad_pedida||0)*(+it.precio||0),notas:itemInstruction(it)||(it.producto_id?null:'Producto no listado'),cantidad_preparada:it.cantidad_preparada??null,estado_preparacion:it.estado_preparacion||'Pendiente',nota_preparacion:it.nota_preparacion||null,peso_equivalente_preparado:it.peso_equivalente_preparado??null,...snap}; if(base.tipo_despacho_peso==='Unidad peso fijo') base.peso_equivalente_solicitado=Number(((base.cantidad_pedida||0)*(base.peso_estandar_lb||0)).toFixed(3)); else if(base.tipo_despacho_peso==='Por libra') base.peso_equivalente_solicitado=Number((base.cantidad_pedida||0).toFixed(3)); else base.peso_equivalente_solicitado=it.peso_equivalente_solicitado??null; return base; }).filter(it=>it.producto_nombre && it.cantidad_pedida>0);
    if(!clean.length) return alert('Agrega al menos un producto al pedido.');
    const cl=customerType==='Registrado'?state.clientes.find(x=>x.id==cid):null;
    const customerName=customerType==='Registrado'?String(cl?.negocio||'').trim():internalName;
    const customerPhone=customerType==='Registrado'?String(cl?.telefono||'').trim():occasionalPhone;
    const customerSector=customerType==='Registrado'?String(cl?.sector||'').trim():(occasional?occasionalSector:'Mostrador');
    const customerAddress=customerType==='Registrado'?String(cl?.direccion||'').trim():(occasional?occasionalAddress:'');
    const customerReference=customerType==='Registrado'?String(cl?.referencia||'').trim():(occasional?occasionalReference:'');
    if(!customerName) return alert('El nombre del cliente es obligatorio.');
    let deliveryVal=''; const d=$('#ordDelivery',m); if(d){deliveryVal=d.value==='__manual__'?($('#ordDeliveryManual',m)?.value||''):d.value;} else deliveryVal=$('#ordDelivery',m)?.value||'';
    const total=clean.reduce((s,it)=>s+(+it.subtotal||0),0);
    const fechaDespacho=$('#ordFechaDespacho',m).value||today();
    const estadoManual=$('#ordEstado',m)?.value||'';
    const estadoFinal=o ? (estadoManual || o.estado || initialOrderStateByDispatch(fechaDespacho)) : initialOrderStateByDispatch(fechaDespacho);
    const selectedType=$('#ordTipoOrden',m)?.value||o?.tipo_orden||'Pedido normal';
    const typeRule=orderTypeRule(selectedType);
    const pickup=deliveryMode==='Retiro en negocio';
    const noDelivery=deliveryMode==='No aplica';
    const composition=orderCompositionChange(o?.items||[],clean);
    if(o&&composition.changed){
      const reason=await responsibilityDecisionDialog({title:'Modificar composición de una orden procesada',message:'El pesaje anterior será invalidado y la orden volverá a Carnicería.',rows:[['Orden',o.codigo||String(o.id)],['Productos eliminados',composition.removed.map(x=>x?.producto_nombre||'Producto').join(', ')||'—'],['Productos agregados',composition.added.map(x=>x?.producto_nombre||'Producto').join(', ')||'—']]});
      if(!reason) return;
      const recorded=await recordAuditException({...auditOrderFields(o),modulo:'Órdenes',tipo_evento:'Modificación de orden procesada',gravedad:'Crítica',motivo:reason,detalle:{estado_anterior:o.estado,productos_eliminados:composition.removed.map(x=>x?.producto_nombre||'Producto'),productos_agregados:composition.added.map(x=>x?.producto_nombre||'Producto')}});
      if(!recorded) return;
      clean=clean.map(it=>({...it,cantidad_preparada:null,estado_preparacion:'Pendiente',nota_preparacion:null,peso_equivalente_preparado:null}));
    }
    const preparationPatch=orderEditPreparationPatch(o,composition,clean);
    const row={cliente_id:customerType==='Registrado'?+cid:null,tipo_cliente_orden:customerType,cliente_nombre_orden:customerName,cliente_telefono_orden:customerPhone||null,cliente_sector_orden:customerSector||null,cliente_direccion_orden:customerAddress||null,cliente_referencia_orden:customerReference||null,modalidad_entrega:deliveryMode,fecha:o?.fecha||today(),fecha_despacho:fechaDespacho,hora_despacho:$('#ordHoraDespacho',m).value||null,es_programada:fechaDespacho>today(),nota_programacion:$('#ordNotaProgramacion',m).value||null,programada_por:(fechaDespacho>today()?state.user.id:(o?.programada_por||null)),fecha_programacion:(fechaDespacho>today()?(o?.fecha_programacion||new Date().toISOString()):o?.fecha_programacion||null),prioridad:$('#ordPrioridad',m).value||'Normal',tipo_orden:selectedType,requiere_preparacion:typeRule.prep,requiere_facturacion:typeRule.invoice,requiere_delivery:!!typeRule.delivery && !pickup && !noDelivery,canal:customerType==='Venta interna'?'Venta interna':(customerType==='Ocasional'?'Cliente ocasional':(o?.canal||'Manual')),vendedor:cl?.vendedor||state.profile.vendedor,estado:estadoFinal,condicion_pago:customerType==='Venta interna'?'Contado':(o?.condicion_pago||'Crédito'),total_estimado:total,total_factura:+$('#ordTotal',m).value||total,factura_no:$('#ordFactura',m).value||null,delivery_nombre:pickup||noDelivery?null:(deliveryVal||null),zona:customerSector||null,notas:$('#ordNotas',m).value||null,...preparationPatch};
    const removedNames=composition.removed.map(i=>i?.producto_nombre||'Producto').join(', ');
    const historyComment=composition.changed?`Composición modificada después del pesaje${removedNames?`; productos eliminados: ${removedNames}`:''}. Se invalidaron los pesos posteriores y la orden requiere confirmación y nuevo pesaje en Carnicería.`:null;
    const baseObs=String(extra.initialNotas||'').trim();
    const provisionalCode=o?.codigo||'la nueva orden';
    const callObservation=extra.fromCallDraft?(baseObs?baseObs+'\n\n':'')+`Orden ${provisionalCode} creada desde esta gestión. Total: ${money(total)}.`:null;
    const saved=extra.fromCallDraft
      ? await sb.rpc('guardar_orden_desde_llamada_v940r3',{p_llamada:extra.fromCallDraft,p_orden:row,p_items:clean,p_llamada_observacion:callObservation})
      : await sb.rpc('guardar_orden_v9381',{p_orden_id:o?.id||null,p_llamada_id:null,p_orden:row,p_items:clean,p_composicion_cambio:!!(o&&composition.changed),p_comentario:historyComment,p_llamada_observacion:null});
    if(saved.error) return alert('No se pudo guardar la orden completa: '+saved.error.message+'\n\nSi el mensaje indica una actualización pendiente, verifica que esté aplicado el SQL 54 de la V9.4.0 R3.');
    const savedRow=Array.isArray(saved.data)?saved.data[0]:saved.data;
    const orderId=savedRow?.id||o?.id;
    const orderCode=savedRow?.codigo||o?.codigo||('ORD-'+orderId);
    clearDraftLocal(orderDraftKey);
    if(extra.sourceCallDraftKey) clearDraftLocal(extra.sourceCallDraftKey);
    const orderWasUpdate=!!o;
    m.remove(); await refreshVisibleModuleV9384(); render(); toast(extra.fromCallDraft?'Gestión y orden guardadas correctamente':'Orden guardada con '+clean.length+' producto(s)');
    const savedOrder=state.ordenes.find(x=>String(x.id)===String(orderId));
    if(savedOrder) maybeOfferOrderWhatsApp(savedOrder,orderWasUpdate?'actualizacion':'confirmacion');
    }catch(e){
      alert(e?.message||e||'No se pudo guardar la orden.');
    }finally{
      if(saveOrderBtn.isConnected){
        saveOrderBtn.dataset.busy='0';
        saveOrderBtn.disabled=false;
        saveOrderBtn.textContent=saveOrderText;
      }
    }
  };
}


function orderItemsText(o, max=5){ const items=o?.items||[]; if(!items.length) return ''; return items.slice(0,max).map(i=>`${esc(i.producto_nombre)} (${Number(i.cantidad_pedida||0)} ${esc(i.unidad||'')})`).join(' · ')+(items.length>max?' · ...':''); }
function detailPreparedText(i){ const has=i && i.cantidad_preparada!==null && i.cantidad_preparada!==undefined; const estado=esc(i?.estado_preparacion||'Pendiente'); const nota=i?.nota_preparacion?' · '+esc(i.nota_preparacion):''; return has ? `Preparado: ${Number(i.cantidad_preparada||0)} · ${estado}${nota}` : `Pendiente de preparar · ${estado}${nota}`; }
function orderLastPeso(o,tipo){ const ps=state.pesos.filter(p=>Number(p.orden_id)===Number(o?.id) && (!tipo || p.tipo===tipo)); return ps[0]||null; }
function operOrderCard(o){
  const items=o.items||[];
  const prep=orderLastPeso(o,'Preparado');
  const final=orderLastPeso(o,'Entregado a delivery');
  const cls=o.estado==='Facturada'?'facturada':String(o.estado||'').includes('ruta')?'ruta':String(o.estado||'').includes('facturar')?'warn':isFutureDispatch(o)?'warn':'';
  const owner=orderTakenByBadge(o);
  const weight=final?Number(final.libras||0):prep?Number(prep.libras||0):0;
  return `<article class="order-compact-card op-card ${cls} ${orderTypeClass(o)} ${newOrderClass(o,currentModuleOfOrder(o)||'ordenes')}"><div class="order-compact-main"><div class="order-compact-title"><strong>${esc(o.codigo||('ORD-'+o.id))}</strong><b>${esc(orderClientName(o))}</b>${o.prioridad&&o.prioridad!=='Normal'?`<span class="badge bad">${esc(o.prioridad)}</span>`:''}</div><div class="order-compact-meta"><span>Despacho ${shortDate(dispatchDateOf(o))}${o.hora_despacho?' '+esc(String(o.hora_despacho).slice(0,5)):''}</span><span>${items.length} producto(s)</span>${weight?`<span>${final?'Peso final':'Peso prep.'} ${weight} lb</span>`:''}<strong>${money(o.total_factura||o.total_estimado)}</strong></div><div class="order-compact-status">${newOrderBadge(o,currentModuleOfOrder(o)||'ordenes')}${orderDeliveryModeBadge(o)}${orderStatusBadgeHtml(o)}${owner}${o.estado==='Pendiente por existencia'?'<span class="badge warn">No preparar hasta liberar</span>':''}${totalOrderClockBadge(o)}${currentStageClockBadge(o)}</div>${(o.nota_programacion||items.length)?`<details class="order-compact-detail"><summary>Ver productos y observaciones</summary>${o.nota_programacion?`<div class="hint"><b>Programación:</b> ${esc(o.nota_programacion)}</div>`:''}${items.length?`<div class="mini-items">${orderItemsText(o,8)}</div>`:''}</details>`:''}</div><div class="order-compact-actions">${o.estado==='Pendiente por existencia'?`<button class="btn small warn" data-release-stock-order="${o.id}">Liberar a Carnicería</button>`:''}<button class="btn small gray" data-oper-order="${o.id}">Ver</button>${orderWhatsAppManualButton(o)?`<button class="btn small green" data-wa-order="${o.id}" aria-label="WhatsApp">WA</button>`:''}${o.estado==='Anulado'?'':`<details class="order-more"><summary>Más</summary><div class="order-more-menu">${isSpecialOrder(o)?`<button class="btn small" data-special-case="${o.id}">Gestionar caso</button>`:''}${canEditOrderGeneral(o)?`<button class="btn small gray" data-edit-order="${o.id}">Editar</button>`:''}${canDeleteOrder(o)?`<button class="btn small danger" data-cancel-order="${o.id}">${orderHasProgress(o)?'Anular':'Eliminar'}</button>`:''}</div></details>`}</div></article>`;
}
function renderOperPanel(c, title, desc, orders, empty, buttonsFn, searchKey=''){
  const q=searchKey ? (state[searchKey]||'') : '';
  const rows=q ? orders.filter(o=>matchOrder(o,q)) : orders;
  const inputId=searchKey ? 'search_'+searchKey : '';
  c.innerHTML=`<div class="panel"><div class="panel-head"><div><h3>${title}</h3><p>${desc}</p></div><span class="badge info">${rows.length} de ${orders.length} orden(es)</span></div>${searchKey?`<div class="searchbar"><input id="${inputId}" value="${esc(q)}" placeholder="Buscar nombre del cliente..."></div>`:''}<div class="list">${rows.map(o=>`<div class="client-card op-card ${orderTypeClass(o)} ${newOrderClass(o,moduleFromSearchKey(searchKey))}" style="grid-template-columns:1fr auto"><div><div class="client-title">${esc(o.codigo||('ORD-'+o.id))} · ${esc(orderClientName(o))}</div><div class="client-sub">Creada: ${shortDate(o.fecha)} · Despacho: ${shortDate(dispatchDateOf(o))} · ${esc(orderClientPhone(o))} · ${esc(orderClientSector(o))}</div><div class="order-status-line">${newOrderBadge(o,moduleFromSearchKey(searchKey))}${orderCustomerBadge(o)}${orderDeliveryModeBadge(o)}${orderTypeBadge(o)}${specialCaseBadge(o)}${orderStatusBadgeHtml(o)}${scheduleBadge(o)}${stageClockBadge(o,moduleFromSearchKey(searchKey))}<span class="badge">${money(o.total_factura||o.total_estimado)}</span>${o.factura_no?`<span class="badge ok">Factura ${esc(o.factura_no)}</span>`:''}${preparedByDisplay(o)?`<span class="badge warn">Prep. ${esc(preparedByDisplay(o))}</span>`:''}${o.delivery_nombre?`<span class="badge ok">${esc(o.delivery_nombre)}</span>`:''}</div><div class="mini-items">${orderItemsText(o,7)}</div></div><div class="card-actions">${buttonsFn(o)}</div></div>`).join('')||`<div class="empty">${empty}</div>`}</div></div>`;
  if(searchKey){
    const inp=$('#'+inputId);
    if(inp) inp.oninput=e=>{ const pos=e.target.selectionStart||e.target.value.length; state[searchKey]=e.target.value; render(); focusAfterRender(inputId,pos); };
  }
  bindDynamic();
}
function carniceriaProgressHtmlV943(){
  const canChoose=isAdminRole()||isStationAccount();
  const employees=activeEmployees('Carnicería');
  const selected=state.carniceriaProgressEmployeeId===null?'':String(state.carniceriaProgressEmployeeId||carniceriaProgressDefaultEmployeeIdV943()||'');
  const selector=canChoose?`<label class="carn-progress-filter"><span>Despachador</span><select id="carnProgressEmployee" ${state.carniceriaProgressLoading?'disabled':''}>${isAdminRole()?`<option value="" ${selected===''?'selected':''}>Equipo completo</option>`:''}${employees.map(e=>`<option value="${e.id}" ${String(e.id)===selected?'selected':''}>${esc(e.nombre)}</option>`).join('')}</select></label>`:'';
  if(state.carniceriaProgressLoading && !state.carniceriaProgress){
    return `<section class="panel carn-progress-panel" aria-live="polite"><div class="carn-progress-head"><div><span class="section-kicker">Progreso mensual</span><h3>Cargando indicadores…</h3><p>Calculando el mes completo directamente en el servidor.</p></div>${selector}</div><div class="carn-progress-skeleton"><i></i><i></i><i></i><i></i><i></i></div></section>`;
  }
  if(state.carniceriaProgressError){
    return `<section class="panel carn-progress-panel" aria-live="polite"><div class="carn-progress-head"><div><span class="section-kicker">Progreso mensual</span><h3>Indicadores temporalmente no disponibles</h3><p>La cola de Carnicería continúa funcionando normalmente.</p></div>${selector}</div><div class="lock-alert"><b>No se pudo consultar el resumen:</b> ${esc(state.carniceriaProgressError)}</div><button class="btn small gray" data-carn-progress-refresh>Reintentar</button></section>`;
  }
  const p=state.carniceriaProgress||{};
  const label=p.mes_inicio?new Date(String(p.mes_inicio)+'T12:00:00').toLocaleDateString('es-DO',{month:'long',year:'numeric'}):'mes actual';
  const number=(v,digits=0)=>Number(v||0).toLocaleString('es-DO',{minimumFractionDigits:0,maximumFractionDigits:digits});
  const days=Math.max(0,Number(p.dias_transcurridos||0)), totalDays=Math.max(1,Number(p.dias_mes||1));
  const calendarPct=Math.min(100,Math.round((days/totalDays)*100));
  const anomalous=Math.max(0,Number(p.duraciones_atipicas||0));
  const timeNote=anomalous
    ?`${number(anomalous)} ${anomalous===1?'duración atípica excluida':'duraciones atípicas excluidas'}`
    :'Desde tomar hasta finalizar';
  return `<section class="panel carn-progress-panel" aria-live="polite"><div class="carn-progress-head"><div><span class="section-kicker">Progreso mensual · ${esc(label)}</span><h3>${esc(p.empleado_nombre||'Mi progreso')}</h3><p>Clientes únicos y trabajo finalizado; un cliente con varios pedidos se cuenta una sola vez.</p></div><div class="carn-progress-actions">${selector}<button class="btn small gray" data-carn-progress-refresh ${state.carniceriaProgressLoading?'disabled':''}>${state.carniceriaProgressLoading?'Actualizando…':'Actualizar'}</button></div></div><div class="exec-kpi-grid carn-progress-kpis"><div class="exec-kpi primary"><span>Clientes despachados</span><strong>${number(p.clientes_unicos)}</strong><small>Clientes únicos del mes</small></div><div class="exec-kpi"><span>Pedidos preparados</span><strong>${number(p.pedidos_preparados)}</strong><small>Preparaciones finalizadas</small></div><div class="exec-kpi"><span>Libras preparadas</span><strong>${number(p.libras_preparadas,2)} lb</strong><small>Peso real registrado</small></div><div class="exec-kpi"><span>Tiempo promedio</span><strong>${number(p.tiempo_promedio_minutos,1)} min</strong><small>${esc(timeNote)}</small></div><div class="exec-kpi"><span>Preparados hoy</span><strong>${number(p.preparados_hoy)}</strong><small>Fecha de Santo Domingo</small></div></div><div class="carn-month-track"><div><b>Avance del calendario</b><span>Día ${days} de ${totalDays}</span></div><div class="carn-month-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${calendarPct}"><i style="width:${calendarPct}%"></i></div></div></section>`;
}
function renderCarniceria(c){
  const tabs=[['libres','Libres'],['preparacion','En preparación'],['mias','Mis pedidos'],['listas','Listas'],['todas','Todas']];
  const allowed=tabs.map(x=>x[0]);
  const tab=allowed.includes(state.carniceriaTab) ? state.carniceriaTab : 'libres';
  state.carniceriaTab=tab;
  const all=state.ordenes.filter(o=>canShowInCarniceria(o));
  const queueEmployeeId=isStationAccount()?carniceriaProgressDefaultEmployeeIdV943():Number(linkedEmployeeForUser(state.profile)?.id)||null;
  const myQueue=all.filter(o=>isActiveCarnOrder(o) && (
    (queueEmployeeId && Number(o.tomado_por_empleado_id)===Number(queueEmployeeId))
    || (!o.tomado_por_empleado_id && (isCurrentWorker(o.tomado_por) || isCurrentWorker(o.preparado_por) || isCurrentWorker(o.tomado_por_user)))
  ));
  const queueEmployee=activeEmployees('Carnicería').find(e=>Number(e.id)===Number(queueEmployeeId));
  const queueTitle=isStationAccount()&&queueEmployee?`Cola de ${queueEmployee.nombre}`:'Mi cola de trabajo';
  let base=all;
  if(tab==='libres') base=all.filter(o=>['Pedido recibido','Programada'].includes(o.estado) && !o.tomado_por);
  if(tab==='preparacion') base=all.filter(o=>o.estado==='En preparación');
  if(tab==='mias') base=myQueue;
  if(tab==='listas') base=all.filter(o=>['Lista para facturar','Impresa para facturar'].includes(o.estado));
  const q=state.carniceriaSearch||'';
  const rows=q?base.filter(o=>matchOrder(o,q)):base;
  const queueWarn=myQueue.length>=3 ? '<span class="badge bad">Límite alcanzado</span>' : '<span class="badge ok">Disponible</span>';
  c.innerHTML=`${carniceriaProgressHtmlV943()}<div class="panel"><div class="panel-head"><div><h3>Órdenes para carnicería</h3><p>Multi-despachador: inicia en <b>Libres</b>. Las órdenes tomadas siguen visibles, pero quedan bloqueadas para los demás.</p></div><span class="badge info">${rows.length} de ${base.length} orden(es)</span></div><div class="queue-box"><div><b>${esc(queueTitle)}: ${myQueue.length}/3</b><div class="limit">Puedes tomar hasta 3 pedidos al mismo tiempo. Para tomar otro, marca uno como listo o usa “Soltar”.</div></div>${queueWarn}</div><div class="tabs">${tabs.map(([id,n])=>`<button class="tab ${tab===id?'active':''}" data-carn-tab="${id}">${n}</button>`).join('')}</div><div class="searchbar"><input id="search_carniceriaSearch" value="${esc(q)}" placeholder="Buscar nombre del cliente..."></div><div class="list">${rows.map(carniceriaCard).join('')||'<div class="empty">No hay órdenes en esta vista.</div>'}</div></div>`;
  $('#carnProgressEmployee')?.addEventListener('change',async e=>{
    state.carniceriaProgressEmployeeId=e.target.value===''?null:Number(e.target.value);
    state.carniceriaProgressLoadedAt=0;
    state.carniceriaProgress=null;
    state.carniceriaProgressLoading=true;
    renderCarniceria(c);
    await loadCarniceriaProgressV943(true);
    renderCarniceria(c);
  });
  $('[data-carn-progress-refresh]')?.addEventListener('click',async()=>{
    state.carniceriaProgressLoadedAt=0;
    state.carniceriaProgressLoading=true;
    renderCarniceria(c);
    await loadCarniceriaProgressV943(true);
    renderCarniceria(c);
  });
  $$('[data-carn-tab]').forEach(b=>b.onclick=()=>{state.carniceriaTab=b.dataset.carnTab; renderCarniceria($('#content'));});
  const inp=$('#search_carniceriaSearch'); if(inp) inp.oninput=e=>{ const pos=e.target.selectionStart||e.target.value.length; state.carniceriaSearch=e.target.value; renderCarniceria($('#content')); focusAfterRender('search_carniceriaSearch',pos); };
  bindDynamic();
}
function carniceriaCard(o){
  const taken=!!o.tomado_por, editable=canEditCarniceriaOrder(o), releasable=canReleaseCarnOrder(o), done=['Lista para facturar','Impresa para facturar'].includes(o.estado);
  const cls=done?'done':taken?'locked':'free';
  const lock=taken?`<span class="badge warn">${esc(lockText(o))}</span>`:'<span class="badge ok">Libre</span>';
  let buttons='';
  if(done){
    buttons=`<button class="btn small dark" data-print-prep="${o.id}">Imprimir prep.</button><button class="btn small gray" data-oper-order="${o.id}">Ver</button>`;
  }else if(taken){
    buttons=`${editable?`<button class="btn small" data-prep-order="${o.id}">Continuar</button>`:`<button class="btn small gray" data-prep-order="${o.id}">Ver bloqueada</button>`}<button class="btn small dark" data-print-prep="${o.id}">Imprimir prep.</button><button class="btn small gray" data-oper-order="${o.id}">Ver</button>${releasable?`<button class="btn small warn" data-release-order="${o.id}">Soltar</button>`:''}`;
  }else{
    buttons=`<button class="btn small" data-take-order="${o.id}">Tomar pedido</button><button class="btn small dark" data-print-prep="${o.id}">Imprimir prep.</button><button class="btn small gray" data-oper-order="${o.id}">Ver</button>`;
  }
  const age=o.tomado_en ? Math.max(0,Math.round((Date.now()-new Date(o.tomado_en).getTime())/60000)) : null;
  const ageBadge=age!==null?`<span class="badge ${age>45?'bad':'info'}">⏱ ${age} min en cola</span>`:'';
  return `<div class="client-card op-card ${cls} ${newOrderClass(o,'carniceria')}" style="grid-template-columns:1fr auto"><div><div class="client-title">${esc(o.codigo||('ORD-'+o.id))} · ${esc(orderClientName(o))}</div><div class="client-sub">Creada: ${shortDate(o.fecha)} · Despacho: ${shortDate(dispatchDateOf(o))} · ${esc(orderClientPhone(o))} · ${esc(orderClientSector(o))}</div><div class="order-status-line">${newOrderBadge(o,'carniceria')}${orderCustomerBadge(o)}${orderDeliveryModeBadge(o)}${orderTypeBadge(o)}<span class="badge info">${esc(o.estado||'')}</span>${scheduleBadge(o)}${createdClockBadge(o)}${stageClockBadge(o,'carniceria')}${lock}${ageBadge}<span class="badge">${money(o.total_factura||o.total_estimado)}</span>${preparedByDisplay(o)?`<span class="badge warn">Prep. ${esc(preparedByDisplay(o))}</span>`:''}</div><div class="mini-items">${orderItemsText(o,7)}</div></div><div class="card-actions">${buttons}</div></div>`;
}
function invoiceHistoryDate(o){ return dateOnly(o?.facturado_en||o?.actualizado_en||o?.fecha||''); }
function invoiceHistoryOrders(){
  const from=state.facturacionHistoryFrom||'', to=state.facturacionHistoryTo||'', q=state.facturacionHistorySearch||'';
  return state.ordenes.filter(o=>{
    if(!orderRequiresInvoice(o) || (!o.factura_no && !o.facturado_en)) return false;
    const d=invoiceHistoryDate(o);
    if(from && d<from) return false;
    if(to && d>to) return false;
    if(state.facturacionHistoryStatus!=='Todos' && String(o.estado||'')!==state.facturacionHistoryStatus) return false;
    if(state.facturacionHistoryWorker!=='Todos' && workerDisplayName(o.facturado_por)!==state.facturacionHistoryWorker) return false;
    return !q || matchOrder(o,q) || norm(workerDisplayName(o.facturado_por)).includes(norm(q));
  }).sort((a,b)=>String(b.facturado_en||b.actualizado_en||b.fecha||'').localeCompare(String(a.facturado_en||a.actualizado_en||a.fecha||'')));
}
function renderFacturacion(c){
  const pending=state.ordenes.filter(o=>orderRequiresInvoice(o) && QUICK_INVOICE_ALLOWED_STATES.includes(o.estado));
  const tab=state.facturacionTab==='historial'?'historial':'pendientes';
  if(tab==='pendientes'){
    c.innerHTML='<div class="tabs"><button class="tab active" data-fact-tab="pendientes">Pendientes</button><button class="tab" data-fact-tab="historial">Historial</button></div><div id="facturacionTabBody"></div>';
    renderOperPanel($('#facturacionTabBody',c),'Órdenes listas para facturar','Imprime el volante si aplica y marca la orden como facturada con un solo clic.',pending,'No hay órdenes listas para facturación.',o=>`<button class="btn small dark" data-print-order="${o.id}">Imprimir 80mm</button><button class="btn small" data-quick-invoice="${o.id}">Marcar facturada</button><button class="btn small gray" data-oper-order="${o.id}">Ver</button>`,'facturacionSearch');
  }else{
    const rows=invoiceHistoryOrders();
    const allHistorical=state.ordenes.filter(o=>orderRequiresInvoice(o)&&(o.factura_no||o.facturado_en));
    const statuses=[...new Set(allHistorical.map(o=>o.estado).filter(Boolean))].sort();
    const workers=[...new Set(allHistorical.map(o=>workerDisplayName(o.facturado_por)).filter(Boolean))].sort();
    c.innerHTML=`<div class="tabs"><button class="tab" data-fact-tab="pendientes">Pendientes</button><button class="tab active" data-fact-tab="historial">Historial</button></div>
      <div class="panel"><div class="panel-head"><div><h3>Historial de Facturación</h3><p>Consulta permanente por fecha, cliente, orden, factura, estado y responsable.</p></div><span class="badge info">${rows.length} registro(s)</span></div>
      <div class="batch-toolbar fact-history-filters"><div class="field"><label>Desde</label><input id="factHistFrom" type="date" value="${esc(state.facturacionHistoryFrom)}"></div><div class="field"><label>Hasta</label><input id="factHistTo" type="date" value="${esc(state.facturacionHistoryTo)}"></div><div class="field"><label>Estado</label><select id="factHistStatus"><option>Todos</option>${statuses.map(x=>`<option ${state.facturacionHistoryStatus===x?'selected':''}>${esc(x)}</option>`).join('')}</select></div><div class="field"><label>Facturado por</label><select id="factHistWorker"><option>Todos</option>${workers.map(x=>`<option ${state.facturacionHistoryWorker===x?'selected':''}>${esc(x)}</option>`).join('')}</select></div><div class="field wide"><label>Buscar</label><input id="factHistSearch" value="${esc(state.facturacionHistorySearch)}" placeholder="Cliente, orden, factura o responsable..."></div><div class="batch-actions"><button class="btn gray" id="factHistClear">Limpiar filtros</button></div></div>
      <div class="list">${rows.map(o=>`<div class="client-card op-card" style="grid-template-columns:1fr auto"><div><div class="client-title">${esc(o.codigo||('ORD-'+o.id))} · ${esc(orderClientName(o))}</div><div class="client-sub">Factura ${esc(o.factura_no||'—')} · ${o.facturado_en?businessDateTime(o.facturado_en):shortDate(invoiceHistoryDate(o))} · Facturado por ${esc(workerDisplayName(o.facturado_por)||'—')}</div><div class="order-status-line"><span class="badge info">${esc(o.estado||'')}</span><span class="badge ok">${money(o.total_factura||o.total_estimado)}</span>${orderDeliveryModeBadge(o)}${orderBatchBadge(o)}</div><div class="mini-items">${orderItemsText(o,7)}</div></div><div class="card-actions"><button class="btn small dark" data-print-order="${o.id}">Reimprimir 80mm</button><button class="btn small gray" data-oper-order="${o.id}">Ver trazabilidad</button></div></div>`).join('')||'<div class="empty">No hay facturas con esos filtros.</div>'}</div></div>`;
    const rerender=()=>renderFacturacion(c);
    $('#factHistFrom',c).onchange=e=>{state.facturacionHistoryFrom=e.target.value;rerender();};
    $('#factHistTo',c).onchange=e=>{state.facturacionHistoryTo=e.target.value;rerender();};
    $('#factHistStatus',c).onchange=e=>{state.facturacionHistoryStatus=e.target.value;rerender();};
    $('#factHistWorker',c).onchange=e=>{state.facturacionHistoryWorker=e.target.value;rerender();};
    $('#factHistSearch',c).oninput=e=>{const pos=e.target.selectionStart||0;state.facturacionHistorySearch=e.target.value;rerender();focusAfterRender('factHistSearch',pos);};
    $('#factHistClear',c).onclick=()=>{state.facturacionHistoryFrom='';state.facturacionHistoryTo='';state.facturacionHistoryStatus='Todos';state.facturacionHistoryWorker='Todos';state.facturacionHistorySearch='';rerender();};
    bindDynamic();
  }
  $$('[data-fact-tab]',c).forEach(b=>b.onclick=()=>{state.facturacionTab=b.dataset.factTab;renderFacturacion(c);});
}

function validationReadyOrders(){
  return state.ordenes.filter(o=>!isStorePickup(o) && (['Facturada','Validada para delivery'].includes(o.estado) || (!orderRequiresPrep(o) && orderRequiresDelivery(o) && ['Pedido recibido','Validada para delivery'].includes(effectiveOrderState(o)))));
}

function batchCodeFromOrder(o){
  const details=(state.entregaLoteDetalle||[])
    .filter(d=>String(d.orden_id)===String(o?.id))
    .sort((a,b)=>Number(b.id||0)-Number(a.id||0));
  const detalle=details.find(d=>{
    const lot=batchRecordByCode(d.codigo_lote);
    return !lot || String(lot.estado||'').toLowerCase()!=='revertido';
  });
  if(detalle?.codigo_lote) return String(detalle.codigo_lote).toUpperCase();
  const txt=[o?.notas_validacion,o?.notas_liquidacion,o?.notas_estado,o?.notas].filter(Boolean).join(' | ');
  const matches=[...String(txt||'').matchAll(/Lote:\s*((?:LOT|TRF)-[A-Z0-9-]+)/ig)].map(m=>m[1].toUpperCase()).reverse();
  return matches.find(code=>{
    const formalLot=batchRecordByCode(code);
    if(!formalLot) return true;
    if(String(formalLot.estado||'').toLowerCase()==='revertido') return false;
    return batchDetailRowsForCode(code).some(d=>String(d.orden_id)===String(o?.id));
  })||'';
}
function batchRecordByCode(code){ return (state.entregaLotes||[]).find(l=>String(l.codigo_lote).toUpperCase()===String(code||'').toUpperCase()) || null; }
function orderBatchBadge(o){ const code=batchCodeFromOrder(o); return code?`<span class="badge info">${esc(code)}</span>`:''; }
function newBatchCode(){
  const d=new Date();
  const pad=n=>String(n).padStart(2,'0');
  return `LOT-${String(d.getFullYear()).slice(2)}${pad(d.getMonth()+1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function dateInRange(dateStr, from, to){
  if(!dateStr) return true;
  const d=businessDateKey(dateStr);
  return (!from || d>=from) && (!to || d<=to);
}
function validationDateInRange(dateStr, from, to){
  if(!dateStr) return true;
  const d=businessDateKey(dateStr);
  return (!from || d>=from) && (!to || d<=to);
}
function isoAddDays(iso,days){
  const d=new Date(String(iso||today()).slice(0,10)+'T12:00:00Z');
  d.setUTCDate(d.getUTCDate()+Number(days||0));
  return d.toISOString().slice(0,10);
}
function historyPresetRange(preset){
  const current=today();
  if(preset==='ayer'){ const y=isoAddDays(current,-1); return {from:y,to:y}; }
  if(preset==='7dias') return {from:isoAddDays(current,-6),to:current};
  if(preset==='mes') return {from:current.slice(0,8)+'01',to:current};
  return {from:current,to:current};
}
function historyScopeKeys(scope){
  return scope==='delivery'
    ? {from:'deliveryHistoryFrom',to:'deliveryHistoryTo',search:'deliveryHistorySearch',limit:'deliveryHistoryLimit'}
    : {from:'liqHistFrom',to:'liqHistTo',search:'liqHistorySearch',limit:'liquidationHistoryLimit'};
}
function applyHistoryPreset(scope,preset){
  const keys=historyScopeKeys(scope), range=historyPresetRange(preset);
  state[keys.from]=range.from; state[keys.to]=range.to; state[keys.limit]=10;
}
function historyRangeLabel(from,to){
  const label=v=>v?new Date(v+'T12:00:00').toLocaleDateString('es-DO',{day:'2-digit',month:'2-digit',year:'numeric'}):'sin límite';
  return from===to?`Resultados del ${label(from)}`:`Resultados desde ${label(from)} hasta ${label(to)}`;
}
function orderPesoEsperado(o){ const r=validationWeightReference(o); return Number(r.value||0); }
function orderMonto(o){ return Number(o?.total_factura||o?.total_estimado||0); }
function batchSummaryFromOrders(items){
  const moneySum=deliveryMoneySummary(items);
  return {...moneySum,pesoEsperado:items.reduce((s,o)=>s+orderPesoEsperado(o),0),pesoEntregado:items.reduce((s,o)=>s+Number(o.peso_validado||0),0)};
}
function fallbackLiquidationGroups(orders){
  const map=new Map();
  (orders||[]).forEach(o=>{
    const raw=batchCodeFromOrder(o);
    const key=raw || `SIN-LOTE-${o.id}`;
    if(!map.has(key)) map.set(key,{key,code:raw||'SIN-LOTE',items:[]});
    map.get(key).items.push(o);
  });
  return [...map.values()];
}
function lotesFromReceivedOrders(deliveryName='', from='', to='', excludeOrderIds=new Set()){
  const closedOrders=state.ordenes.filter(o=>o.recibido_en && !excludeOrderIds.has(String(o.id)) && (!deliveryName || o.delivery_nombre===deliveryName) && dateInRange(o.recibido_en,from,to));
  return fallbackLiquidationGroups(closedOrders).map(g=>{
    const summary=deliveryMoneySummary(g.items);
    return {
      source:'ordenes', history_key:g.key, codigo_lote:g.code, delivery_nombre:deliveryName||g.items[0]?.delivery_nombre||'',
      fecha_entrega:g.items[0]?.validado_en||g.items[0]?.asignado_delivery_en||'',
      fecha_liquidacion:g.items.reduce((mx,o)=>!mx||String(o.recibido_en)>String(mx)?o.recibido_en:mx,''), cantidad_ordenes:g.items.length,
      total_facturado:summary.total, efectivo_reportado:summary.cobrado, efectivo_recibido:summary.cobrado,
      credito_pendiente:summary.credito+summary.devuelto, no_entregado:summary.noEntregado, diferencia:0, estado:'Cerrado', items:g.items
    };
  });
}
function liquidationHistoryRows(deliveryName='', from='', to=''){
  const rawFormal=(state.liquidacionesLotes||[])
    .filter(l=>(!deliveryName || l.delivery_nombre===deliveryName) && dateInRange(l.fecha_liquidacion||l.creado_en,from,to));
  const formal=consolidateFormalLiquidations(rawFormal).map(l=>({source:'formal',...l}));
  const formalIds=new Set(formal.flatMap(l=>(l.liquidation_ids||[l.id]).map(String)));
  const formalOrderIds=new Set((state.liquidacionLoteDetalle||[]).filter(d=>formalIds.has(String(d.liquidacion_id||''))).map(d=>String(d.orden_id||'')));
  const formalCodes=new Set(formal.map(l=>String(l.codigo_lote||'').toUpperCase()).filter(code=>code && code!=='SIN-LOTE'));
  const fallback=lotesFromReceivedOrders(deliveryName,from,to,formalOrderIds).filter(l=>l.codigo_lote==='SIN-LOTE' || !formalCodes.has(String(l.codigo_lote||'').toUpperCase()));
  return [...formal,...fallback].sort((a,b)=>String(b.fecha_liquidacion||b.creado_en||'').localeCompare(String(a.fecha_liquidacion||a.creado_en||'')));
}
function ordersForBatch(code){
  if(!code || String(code).toUpperCase()==='SIN-LOTE') return [];
  return state.ordenes.filter(o=>String(batchCodeFromOrder(o)||'').toUpperCase()===String(code).toUpperCase());
}
function batchDetailRowsForCode(code){ return (state.entregaLoteDetalle||[]).filter(d=>String(d.codigo_lote).toUpperCase()===String(code||'').toUpperCase()); }

function deliveryRouteSnapshotCompany(){
  const e=appCfg('empresa',{})||{};
  return {nombre:e.nombre||'Productos César',telefono:e.telefono||'',direccion:e.direccion||'',correo:e.correo||'',rnc:e.rnc||'',logoTexto:e.logoTexto||'PC'};
}
function buildDeliveryRouteSnapshot(lote,deliveryName,selected,originalDate=new Date().toISOString(),validatedBy=currentWorkerName()){
  const items=(selected||[]).map(x=>{
    const o=x.o||{}; const cl=o.cliente||{};
    return {orden_id:o.id||null,cliente_id:o.cliente_id||cl.id||null,codigo_orden:o.codigo||'',cliente_nombre:cl.negocio||'Cliente',contacto:cl.contacto||'',telefono:cl.telefono||'',sector:cl.sector||'',direccion:cl.direccion||cl.referencia||'',factura_no:o.factura_no||'',monto_factura:Number((x.amount ?? orderMonto(o)) || 0),peso_esperado:Number((x.expected ?? orderPesoEsperado(o)) || 0),peso_entregado:Number((x.peso ?? o.peso_validado) || 0),estado_original:o.estado||'',productos:(o.items||[]).map(i=>({nombre:i.producto_nombre||'',cantidad:Number((i.cantidad_preparada ?? i.cantidad_pedida) || 0),unidad:i.unidad||''}))};
  });
  return {version:'V9.3.9.0 PWA',codigo_lote:lote,delivery_nombre:deliveryName,fecha_entrega:originalDate,validado_por:validatedBy,empresa:deliveryRouteSnapshotCompany(),items,totales:{cantidad_ordenes:items.length,total_facturado:items.reduce((a,x)=>a+x.monto_factura,0),peso_esperado:items.reduce((a,x)=>a+x.peso_esperado,0),peso_entregado:items.reduce((a,x)=>a+x.peso_entregado,0)}};
}
function normalizeRouteSnapshot(raw){
  if(!raw) return null;
  if(typeof raw==='string'){ try{return JSON.parse(raw);}catch(e){return null;} }
  return typeof raw==='object'?raw:null;
}
function routeItemsFromSnapshot(snapshot){
  const snap=normalizeRouteSnapshot(snapshot); if(!snap?.items?.length) return [];
  return snap.items.map(i=>{ const current=(state.ordenes||[]).find(o=>String(o.id)===String(i.orden_id)); return {o:{id:i.orden_id,codigo:i.codigo_orden,factura_no:i.factura_no,cliente_id:i.cliente_id,cliente:{id:i.cliente_id,negocio:i.cliente_nombre,contacto:i.contacto,telefono:i.telefono,sector:i.sector,direccion:i.direccion},items:i.productos||[],estado:current?.estado||i.estado_original,resultado_entrega:current?.resultado_entrega||null,recibido_en:current?.recibido_en||null,delivery_nombre:current?.delivery_nombre||snap.delivery_nombre},amount:Number(i.monto_factura||0),expected:Number(i.peso_esperado||0),peso:Number(i.peso_entregado||0)}; });
}
function validationBatchRouteItems(lot){
  const code=lot?.codigo_lote||''; const details=batchDetailRowsForCode(code);
  if(details.length) return details.map(d=>{ const o=state.ordenes.find(x=>String(x.id)===String(d.orden_id))||{id:d.orden_id,codigo:d.codigo_orden,factura_no:d.factura_no,cliente_id:d.cliente_id,cliente:{negocio:d.cliente_nombre||'Cliente',telefono:d.telefono||'',sector:d.sector||'',direccion:d.direccion||''},items:[]}; return {o,amount:Number(d.monto_factura||orderMonto(o)||0),expected:Number(d.peso_esperado||orderPesoEsperado(o)||0),peso:Number(d.peso_entregado||o.peso_validado||0)}; });
  const snapItems=routeItemsFromSnapshot(lot?.hoja_ruta_snapshot); if(snapItems.length) return snapItems;
  return ordersForBatch(code).map(o=>({o,amount:orderMonto(o),expected:orderPesoEsperado(o),peso:Number(o.peso_validado||0)}));
}
function validationBatchRows(){
  const formal=(state.entregaLotes||[]).map(l=>({...l,source:'formal'}));
  const codes=new Set(formal.map(l=>String(l.codigo_lote||'').toUpperCase()));
  const byCode={};
  (state.ordenes||[]).forEach(o=>{ const code=batchCodeFromOrder(o); if(!code||codes.has(code)) return; (byCode[code]=byCode[code]||[]).push(o); });
  const fallback=Object.entries(byCode).map(([code,items])=>({source:'reconstruido',codigo_lote:code,delivery_nombre:items[0]?.delivery_nombre||'',fecha_entrega:items[0]?.validado_en||items[0]?.asignado_delivery_en||'',cantidad_ordenes:items.length,peso_esperado:items.reduce((a,o)=>a+orderPesoEsperado(o),0),peso_entregado:items.reduce((a,o)=>a+Number(o.peso_validado||0),0),total_facturado:items.reduce((a,o)=>a+orderMonto(o),0),estado:items.some(o=>!o.recibido_en)?'Abierto':'Cerrado'}));
  return [...formal,...fallback].sort((a,b)=>String(b.fecha_entrega||b.creado_en||'').localeCompare(String(a.fecha_entrega||a.creado_en||'')));
}
function validationBatchLiquidation(lot){ return (state.liquidacionesLotes||[]).find(l=>String(l.codigo_lote||'').toUpperCase()===String(lot?.codigo_lote||'').toUpperCase())||null; }
function validationBatchCurrentState(lot){ const liq=validationBatchLiquidation(lot); if(liq) return 'Liquidado'; const items=validationBatchRouteItems(lot).map(x=>x.o).filter(Boolean); if(items.length && items.every(o=>o.recibido_en||['Cerrado','Cobrado','Entregado a crédito','No entregado','Devuelto parcial'].includes(o.estado))) return 'Pendiente de cierre'; return lot?.estado||'Abierto'; }
function validationHistoryFilteredRows(){
  const from=state.validationHistoryFrom||today(), to=state.validationHistoryTo||today(), del=state.validationHistoryDelivery||'', q=norm(state.validationHistorySearch||'');
  return validationBatchRows().filter(l=>validationDateInRange(l.fecha_entrega||l.creado_en,from,to) && (!del||l.delivery_nombre===del) && (!q || norm(l.codigo_lote).includes(q) || norm(l.delivery_nombre).includes(q) || validationBatchRouteItems(l).some(x=>norm([x.o?.codigo,x.o?.factura_no,x.o?.cliente?.negocio,x.o?.cliente?.telefono].join(' ')).includes(q))));
}
function validationBatchPrintAudit(code){ return (state.entregaDocumentosHistorial||[]).filter(x=>String(x.codigo_lote||'').toUpperCase()===String(code||'').toUpperCase()); }
async function recordDeliveryDocumentEvent(code,tipoDocumento,tipoEvento,metadata={}){
  if(!state.user) return;
  const lot=batchRecordByCode(code); const row={lote_id:lot?.id||null,codigo_lote:code||'REPORTE-DIARIO',tipo_documento:tipoDocumento,tipo_evento:tipoEvento,fecha_evento:new Date().toISOString(),usuario_id:state.user.id,usuario_nombre:currentWorkerName(),fecha_original:metadata.fecha_original||lot?.fecha_entrega||null,filtro_desde:metadata.filtro_desde||null,filtro_hasta:metadata.filtro_hasta||null,metadata};
  const ins=await sb.from('entrega_documentos_historial').insert(row).select('*').single();
  if(ins.error){ console.warn('Auditoría de documento no disponible:',ins.error.message); return; }
  if(ins.data) state.entregaDocumentosHistorial=[ins.data,...(state.entregaDocumentosHistorial||[])];
  if(tipoEvento==='Reimpresión' && lot?.id){ const next=Number(lot.cantidad_reimpresiones||0)+1; const when=new Date().toISOString(); await sb.from('entrega_lotes').update({cantidad_reimpresiones:next,ultima_reimpresion_en:when,ultima_reimpresion_por:state.user.id}).eq('id',lot.id); lot.cantidad_reimpresiones=next; lot.ultima_reimpresion_en=when; lot.ultima_reimpresion_por=state.user.id; }
}

async function saveFormalDeliveryBatch(lote, deliveryName, selected, meta={}){
  const originalDate=meta.originalDate||new Date().toISOString(); const validatedBy=meta.validatedBy||currentWorkerName(); const snapshot=meta.snapshot||buildDeliveryRouteSnapshot(lote,deliveryName,selected,originalDate,validatedBy);
  const basePayload={codigo_lote:lote,delivery_nombre:deliveryName,fecha_entrega:originalDate,cantidad_ordenes:selected.length,peso_esperado:selected.reduce((sum,x)=>sum+Number(x.expected||0),0),peso_entregado:selected.reduce((sum,x)=>sum+Number(x.peso||0),0),total_facturado:selected.reduce((sum,x)=>sum+Number(x.amount||0),0),estado:'Abierto',creado_por:state.user?.id||null};
  let result=await sb.from('entrega_lotes').insert({...basePayload,validado_por:validatedBy,hoja_ruta_snapshot:snapshot}).select('*').single();
  if(result.error){ console.warn('Esquema R5 no disponible; guardando lote compatible:',result.error.message); result=await sb.from('entrega_lotes').insert(basePayload).select('*').single(); }
  const {data,error}=result; if(error){ console.warn('No se guardó lote formal:',error.message); return null; }
  const loteId=data.id;
  const enhancedRows=selected.map(x=>({lote_id:loteId,codigo_lote:lote,orden_id:x.o.id,cliente_id:x.o.cliente_id||null,codigo_orden:x.o.codigo||null,cliente_nombre:x.o.cliente?.negocio||null,telefono:x.o.cliente?.telefono||null,sector:x.o.cliente?.sector||null,direccion:x.o.cliente?.direccion||x.o.cliente?.referencia||null,factura_no:x.o.factura_no||null,monto_factura:Number(x.amount||0),peso_esperado:Number(x.expected||0),peso_entregado:Number(x.peso||0),estado_liquidacion:'Pendiente'}));
  if(enhancedRows.length){ let det=await sb.from('entrega_lote_detalle').insert(enhancedRows); if(det.error){ const basic=enhancedRows.map(({cliente_nombre,telefono,sector,direccion,...r})=>r); det=await sb.from('entrega_lote_detalle').insert(basic); } if(det.error) console.warn('No se guardó detalle de lote:',det.error.message); }
  return data;
}
function validationRowStatusHtml(o,peso){
  const req=orderRequiresFinalWeight(o);
  if(!req) return `<span class="badge ok">No requiere peso</span>`;
  if(!peso) return `<span class="badge warn">Falta peso</span>`;
  const ch=validationWeightCheck(o,peso);
  if(!ch.calc) return `<span class="badge info">Sin referencia</span>`;
  if(ch.level==='ok') return `<span class="badge ok">Peso correcto</span>`;
  if(ch.level==='warn') return `<span class="badge warn">Revisar diferencia</span>`;
  return `<span class="badge bad">Bloqueado por peso</span>`;
}
function renderValidationBatchRow(o){
  const req=orderRequiresFinalWeight(o);
  const ref=validationWeightReference(o);
  const draft=batchDraftRow(o.id);
  const checked=!!draft?.checked;
  const draftWeight=draft && Object.prototype.hasOwnProperty.call(draft,'weight') ? draft.weight : null;
  const draftAmount=draft && Object.prototype.hasOwnProperty.call(draft,'amount') ? draft.amount : null;
  const peso=draftWeight!==null ? draftWeight : (o.peso_validado||'');
  const amount=normalizeValidationInvoiceAmount(draftAmount!==null ? draftAmount : (o.total_factura||o.total_estimado||0));
  const disabledAttr=(req && checked)?'':'disabled';
  return `<div class="batch-row ${orderTypeClass(o)}" data-batch-row="${o.id}" data-amount="${amount}" data-original-amount="${amount}" data-expected="${Number(ref.value||0)}" data-reqpeso="${req?'1':'0'}">
    <div class="batch-check"><input type="checkbox" data-batch-check="${o.id}" ${checked?'checked':''} aria-label="Seleccionar ${esc(orderClientName(o)||'cliente')}"></div>
    <div class="batch-main"><b>${esc(orderClientName(o))}</b><small>${esc(o.codigo||'')} · Factura ${esc(o.factura_no||'—')} · ${esc(orderClientSector(o))}</small><small>${orderTypeBadge(o)}${orderBatchBadge(o)}${stageClockBadge(o,'validacion')}</small></div>
    <div class="batch-num"><span>Esperado</span><b>${ref.value?Number(ref.value).toFixed(2)+' lb':(req?'—':'No pesa')}</b></div>
    <div class="batch-amount"><span>Factura final</span><input class="validation-amount-input" type="number" step="0.01" min="0.01" inputmode="decimal" data-batch-amount="${o.id}" value="${amount||''}" placeholder="Monto"></div>
    <div class="batch-weight"><input type="number" step="0.01" min="0" inputmode="decimal" data-batch-weight="${o.id}" value="${esc(peso)}" ${disabledAttr} placeholder="${req?'Peso entregado':'No pesa'}"></div>
    <div class="batch-status" data-batch-status="${o.id}">${validationRowStatusHtml(o,Number(peso||0))}</div>
    <div class="card-actions mini"><button class="btn small gray" data-oper-order="${o.id}">Ver</button>${(orderRequiresInvoice(o)&&['Facturada','Validada para delivery'].includes(o.estado))?`<button class="btn small warn" data-return-invoice="${o.id}">Reabrir</button>`:''}</div>
  </div>`;
}
function validationHistorySummary(rows){
  return rows.reduce((a,l)=>{ const items=validationBatchRouteItems(l); if(String(l?.estado||'').toLowerCase()==='revertido'){a.revertidos++;return a;} a.lotes++; a.ordenes+=Number(l.cantidad_ordenes||items.length); a.total+=Number(l.total_facturado||items.reduce((s,x)=>s+Number(x.amount||0),0)); a.esperado+=Number(l.peso_esperado||items.reduce((s,x)=>s+Number(x.expected||0),0)); a.entregado+=Number(l.peso_entregado||items.reduce((s,x)=>s+Number(x.peso||0),0)); if(!validationBatchLiquidation(l)) a.pendientes++; return a; },{lotes:0,ordenes:0,total:0,esperado:0,entregado:0,pendientes:0,revertidos:0});
}

function validationLotCorrectionInfo(lot){
  const items=validationBatchRouteItems(lot).map(x=>x.o).filter(Boolean);
  return evaluateLotCorrection({
    lot,
    orders:items,
    hasLiquidation:Boolean(validationBatchLiquidation(lot)),
    canEdit:Boolean(isAdminRole()||puede('validacion',true))
  });
}
function lastLotCorrection(lot){
  return (state.deliveryLotCorrections||[]).find(x=>String(x.lote_id||'')===String(lot?.id||'') || String(x.codigo_lote||'').toUpperCase()===String(lot?.codigo_lote||'').toUpperCase())||null;
}
async function runLotCorrectionV936(lot,action,newDelivery,reason,modal){
  const info=validationLotCorrectionInfo(lot);
  if(!info.allowed) return alert(info.reason||'Este lote ya no puede corregirse.');
  reason=String(reason||'').trim();
  if(reason.length<5) return alert('Escribe un motivo de al menos 5 caracteres.');
  if(action==='cambiar_delivery' && !String(newDelivery||'').trim()) return alert('Selecciona el nuevo responsable.');
  const button=action==='cambiar_delivery'?$('#saveLotDeliveryCorrection',modal):$('#revertDeliveryLot',modal);
  if(button){button.disabled=true;button.textContent=action==='cambiar_delivery'?'Corrigiendo...':'Revirtiendo...';}
  const {data,error}=await sb.rpc('corregir_lote_entrega_v936',{p_lote_id:Number(lot.id),p_accion:action,p_nuevo_delivery:action==='cambiar_delivery'?String(newDelivery).trim():null,p_motivo:reason,p_usuario_nombre:currentWorkerName()});
  if(error){ if(button){button.disabled=false;button.textContent=action==='cambiar_delivery'?'Cambiar responsable':'Revertir lote completo';} return alert('No se pudo corregir el lote: '+error.message); }
  modal?.remove();
  await refreshVisibleModuleV9384();
  renderValidacion($('#content'));
  toast(action==='cambiar_delivery'?`Lote ${lot.codigo_lote} asignado correctamente.`:`Lote ${lot.codigo_lote} revertido a Validación.`);
  return data;
}
function editableOrdersForLot(lot){
  const currentIds=new Set(validationBatchRouteItems(lot).map(x=>String(x.o?.id||'')));
  return validationReadyOrders()
    .filter(o=>!currentIds.has(String(o.id)) && !batchCodeFromOrder(o))
    .sort((a,b)=>String(b.fecha||b.creado_en||'').localeCompare(String(a.fecha||a.creado_en||'')));
}
function lotCompositionOrderRow(x,{current=false}={}){
  const o=x.o||x; const amount=Number(x.amount??orderMonto(o)??0);
  const expected=Number(x.expected??orderPesoEsperado(o)??0);
  const weight=Number(x.peso??o.peso_validado??o.peso_preparado??0);
  const attr=current?'data-lot-current-order':'data-lot-add-order';
  return `<label class="lot-edit-order-row"><input type="checkbox" ${attr}="${esc(o.id)}" ${current?'checked':''}><span><b>${esc(o.codigo||('ORD-'+o.id))} · ${esc(orderClientName(o))}</b><small>${money(amount)} · Esperado ${expected.toFixed(2)} lb · Entregado ${weight.toFixed(2)} lb</small></span><span class="badge ${current?'ok':'info'}">${current?'Incluida':'Disponible'}</span></label>`;
}
async function saveLotCompositionV9379(lot,modal){
  const reason=String($('#correctLotReason',modal)?.value||'').trim();
  if(reason.length<5) return alert('Escribe un motivo de al menos 5 caracteres.');
  const currentItems=validationBatchRouteItems(lot);
  const currentIds=currentItems.map(x=>Number(x.o.id));
  const keptIds=$$('[data-lot-current-order]:checked',modal).map(x=>Number(x.dataset.lotCurrentOrder));
  const addIds=$$('[data-lot-add-order]:checked',modal).map(x=>Number(x.dataset.lotAddOrder));
  const removeIds=currentIds.filter(id=>!keptIds.includes(id));
  if(!addIds.length&&!removeIds.length) return alert('No hiciste cambios en las órdenes del lote.');
  if(keptIds.length+addIds.length<1) return alert('El lote debe conservar al menos una orden. Para retirar todas utiliza Revertir lote completo.');

  const available=editableOrdersForLot(lot);
  const added=addIds.map(id=>available.find(o=>Number(o.id)===id)).filter(Boolean);
  const missing=added.filter(o=>orderRequiresFinalWeight(o)&&Number(o.peso_validado||o.peso_preparado||0)<=0);
  if(missing.length) return alert('Estas órdenes todavía no tienen un peso disponible:\n- '+missing.map(o=>`${o.codigo} · ${orderClientName(o)}`).join('\n- '));
  const invalidAmount=added.filter(o=>orderMonto(o)<=0);
  if(invalidAmount.length) return alert('Estas órdenes no tienen monto de factura válido:\n- '+invalidAmount.map(o=>`${o.codigo} · ${orderClientName(o)}`).join('\n- '));

  const finalItems=[
    ...currentItems.filter(x=>keptIds.includes(Number(x.o.id))),
    ...added.map(o=>({o,amount:orderMonto(o),expected:orderPesoEsperado(o),peso:Number(o.peso_validado||o.peso_preparado||0)}))
  ];
  const snapshot=buildDeliveryRouteSnapshot(
    lot.codigo_lote,
    tripResponsibleName(lot)||lot.delivery_nombre||'',
    finalItems,
    lot.fecha_entrega||lot.creado_en||new Date().toISOString(),
    lot.validado_por||currentWorkerName()
  );
  const btn=$('#saveLotComposition',modal);
  if(btn){btn.disabled=true;btn.textContent='Guardando cambios...';}
  const {data,error}=await sb.rpc('editar_composicion_lote_v9379',{
    p_lote_id:Number(lot.id),
    p_agregar_ordenes:addIds,
    p_retirar_ordenes:removeIds,
    p_motivo:reason,
    p_usuario_nombre:currentWorkerName(),
    p_snapshot:snapshot
  });
  if(error){
    if(btn){btn.disabled=false;btn.textContent='Guardar composición del lote';}
    return alert('No se pudo editar el lote: '+error.message);
  }
  modal?.remove();
  await refreshVisibleModuleV9384();
  renderValidacion($('#content'));
  toast(`Lote ${lot.codigo_lote} actualizado: ${data?.agregadas||0} agregada(s), ${data?.retiradas||0} retirada(s).`);
}
function openLotCorrectionModal(lot){
  const info=validationLotCorrectionInfo(lot);
  if(!info.allowed) return alert(info.reason||'Este lote ya no puede corregirse.');
  if(!state.v936SchemaOk) return alert('Primero ejecuta el SQL 28 de la V9.3.6 en Supabase.');
  const current=tripResponsibleName(lot)||lot.delivery_nombre||'';
  const currentItems=validationBatchRouteItems(lot);
  const available=editableOrdersForLot(lot);
  const body=`<div class="form lot-correction-form"><div class="lock-alert info"><b>${esc(lot.codigo_lote||'Lote')}</b> · Responsable actual: ${esc(current||'—')} · ${info.orders.length} orden(es)</div><details class="lot-edit-section" open><summary>Órdenes incluidas (${currentItems.length})</summary><div class="hint">Desmarca una orden para retirarla del lote y devolverla a Validación.</div><div class="lot-edit-order-list">${currentItems.map(x=>lotCompositionOrderRow(x,{current:true})).join('')}</div></details><details class="lot-edit-section" open><summary>Agregar órdenes disponibles (${available.length})</summary><div class="hint">Solo aparecen órdenes facturadas, sin recepción, resultado ni otro lote activo.</div><div class="lot-edit-order-list">${available.map(o=>lotCompositionOrderRow(o)).join('')||'<div class="empty">No hay órdenes disponibles para agregar.</div>'}</div></details><div class="field"><label>Nuevo responsable, si también deseas cambiarlo</label><select id="correctLotDelivery"><option value="">Conservar responsable actual</option>${tripResponsibleOptions('',RESPONSIBLE_TYPES.DELIVERY)}</select><input id="correctLotDeliveryManual" placeholder="Nombre de la persona responsable" style="display:none;margin-top:8px"><div class="hint">Puede ser delivery, otro empleado o una persona manual/externa.</div></div><div class="field"><label>Motivo obligatorio</label><textarea id="correctLotReason" maxlength="300" placeholder="Ej.: Se agregó una orden que quedó pendiente de este mismo viaje"></textarea></div><div class="lot-correction-actions"><button class="btn" id="saveLotComposition">Guardar composición del lote</button><button class="btn gray" id="saveLotDeliveryCorrection">Cambiar responsable</button><button class="btn danger" id="revertDeliveryLot">Revertir lote completo</button></div><div class="hint">Agregar o retirar recalcula órdenes, pesos y montos. Toda modificación queda registrada en la auditoría privada.</div></div>`;
  const m=openModal('Editar lote',body,'Disponible antes de registrar resultados, recibir o liquidar.');
  wireManual(m,'correctLotDelivery','correctLotDeliveryManual');
  $('#saveLotComposition',m).onclick=()=>saveLotCompositionV9379(lot,m);
  $('#saveLotDeliveryCorrection',m).onclick=()=>{
    const responsible=selectedTripResponsible(m,'correctLotDelivery','correctLotDeliveryManual');
    if(!responsible.name) return alert('Selecciona el nuevo responsable.');
    if(norm(responsible.name)===norm(current)) return alert('Selecciona un responsable diferente al actual.');
    runLotCorrectionV936(lot,'cambiar_delivery',responsible.name,$('#correctLotReason',m).value,m);
  };
  $('#revertDeliveryLot',m).onclick=()=>{ if(confirm(`¿Revertir completamente ${lot.codigo_lote}? Las órdenes volverán a Validación.`)) runLotCorrectionV936(lot,'revertir_lote','',$('#correctLotReason',m).value,m); };
}
function orderTransferInfo(lot,order){
  return canTransferOrder({lot,order,hasLiquidation:Boolean(validationBatchLiquidation(lot)),canEdit:Boolean(isAdminRole()||puede('validacion',true))});
}
function openOrderTransferModal(lot,o){
  const info=orderTransferInfo(lot,o);
  if(!info.allowed) return alert(info.reason||'Esta orden no puede transferirse.');
  if(!state.v9371SchemaOk) return alert('Primero ejecuta el SQL 31 de la V9.3.7.1 en Supabase.');
  const current=tripResponsibleName(lot)||o.delivery_nombre||'';
  const body=`<div class="form transfer-order-form"><div class="lock-alert info"><b>${esc(o.codigo||'Orden')} · ${esc(orderClientName(o))}</b><br>Lote actual: ${esc(lot.codigo_lote||'—')} · Responsable actual: ${esc(current||'—')} · ${money(orderAmount(o))}</div><div class="field"><label>Nuevo responsable del pedido</label><select id="transferResponsible"><option value="">Selecciona responsable</option>${tripResponsibleOptions('',RESPONSIBLE_TYPES.DELIVERY)}</select><input id="transferResponsibleManual" placeholder="Nombre de la persona responsable" style="display:none;margin-top:8px"><div class="hint">Puede ser delivery, otro empleado o una persona manual/externa.</div></div><div class="field"><label>Motivo obligatorio</label><textarea id="transferReason" maxlength="300" placeholder="Ej.: El delivery entregó este pedido a otro compañero que estaba en la calle"></textarea></div><div class="lock-alert warn"><b>La orden se moverá, no se copiará.</b> Se descontará del lote de ${esc(current)} y se creará un viaje de transferencia para el nuevo responsable.</div><button class="btn warn" id="saveOrderTransfer">Confirmar transferencia</button></div>`;
  const m=openModal('Transferir pedido a otro responsable',body,'Disponible antes de que CXC reciba o liquide la orden.');
  wireManual(m,'transferResponsible','transferResponsibleManual');
  $('#saveOrderTransfer',m).onclick=async()=>{
    const responsible=selectedTripResponsible(m,'transferResponsible','transferResponsibleManual');
    const reason=String($('#transferReason',m).value||'').trim();
    if(!responsible.name) return alert('Selecciona el nuevo responsable.');
    if(norm(responsible.name)===norm(current)) return alert('Selecciona un responsable diferente al actual.');
    if(reason.length<5) return alert('Escribe un motivo de al menos 5 caracteres.');
    const btn=$('#saveOrderTransfer',m);btn.disabled=true;btn.textContent='Transfiriendo...';
    const {data,error}=await sb.rpc('transferir_orden_lote_v9371',{
      p_lote_origen_id:Number(lot.id),p_orden_id:Number(o.id),p_responsable_nuevo:responsible.name,
      p_responsable_tipo_nuevo:responsible.type,p_motivo:reason,p_usuario_nombre:currentWorkerName()
    });
    if(error){btn.disabled=false;btn.textContent='Confirmar transferencia';return alert('No se pudo transferir el pedido: '+error.message);}
    m.remove();await refreshVisibleModuleV9384();renderValidacion($('#content'));toast(`Pedido transferido a ${responsible.name} · ${data?.codigo_lote_destino||''}`);
  };
}
function validationHistoryCard(l,index=0,forceOpen=false){
  const items=validationBatchRouteItems(l); const st=validationBatchCurrentState(l); const original=l.fecha_entrega||l.creado_en||''; const audits=validationBatchPrintAudit(l.codigo_lote); const reprints=Number(l.cantidad_reimpresiones||audits.filter(x=>x.tipo_evento==='Reimpresión').length||0);
  const key=lotUiKey('validation',l.codigo_lote,l.id||original); const open=operationalLotOpen('validationLots',key,index,forceOpen); const info=validationLotCorrectionInfo(l); const correction=lastLotCorrection(l);
  const rows=items.map(x=>{ const transfer=orderTransferInfo(l,x.o); return `<div class="liq-order-row"><div><b>${esc(orderClientName(x.o)||'Cliente')}</b><small>${esc(x.o?.codigo||'')} · Factura ${esc(x.o?.factura_no||'—')} · ${money(x.amount||0)} · ${Number(x.peso||0).toFixed(2)} lb</small></div><div class="card-actions"><span class="badge info">${esc(x.o?.estado||'Registrada')}</span>${transfer.allowed?`<button class="btn small warn" data-transfer-lot="${esc(l.id)}" data-transfer-order="${esc(x.o.id)}">Transferir pedido</button>`:''}</div></div>`; }).join('');
  return `<article class="liq-batch-card validation-history-card operational-lot-card ${open?'is-open':'is-collapsed'}" data-validation-lot-key="${esc(key)}"><div class="liq-batch-head operational-lot-head"><button class="history-toggle-btn" type="button" data-validation-lot-toggle="${esc(key)}" aria-expanded="${open?'true':'false'}" title="${open?'Ocultar lote':'Mostrar lote'}"><span>${open?'⌄':'›'}</span></button><div class="history-batch-summary"><div class="client-title">${esc(l.codigo_lote||'SIN-LOTE')}</div><div class="client-sub">${original?businessDateTime(original):'—'} · Responsable: ${esc(tripResponsibleName(l)||'—')} · Validado por: ${esc(l.validado_por||normalizeRouteSnapshot(l.hoja_ruta_snapshot)?.validado_por||'—')}</div><div class="badges"><span class="badge info">${items.length||Number(l.cantidad_ordenes||0)} órdenes</span><span class="badge ok">${money(l.total_facturado||items.reduce((s,x)=>s+Number(x.amount||0),0))}</span><span class="badge">${Number(l.peso_entregado||items.reduce((s,x)=>s+Number(x.peso||0),0)).toFixed(2)} lb</span><span class="badge ${st==='Liquidado'?'ok':(st==='Revertido'?'bad':'warn')}">${esc(st)}</span>${l.es_transferencia?'<span class="badge info">Transferencia recibida</span>':''}${tripResponsibleBadge(l)}${correction?`<span class="badge warn">${correction.accion==='cambiar_delivery'?'Asignación corregida':'Lote revertido'}</span>`:''}${reprints?`<span class="badge warn">${reprints} reimp.</span>`:''}${l.hoja_ruta_snapshot?'<span class="badge ok">Datos congelados</span>':'<span class="badge warn">Reconstruido</span>'}</div></div><div class="card-actions history-card-actions"><button class="btn small gray" data-validation-lot-detail="${esc(l.codigo_lote)}">Ver detalle</button><button class="btn small dark" data-validation-reprint="${esc(l.codigo_lote)}">Reimprimir hoja</button><button class="btn small gray" data-validation-constancia="${esc(l.codigo_lote)}">Imprimir constancia</button>${info.allowed?`<button class="btn small warn" data-correct-validation-lot="${esc(l.id)}">Editar lote</button>`:''}</div></div>${open?`<div class="liq-batch-body operational-lot-body">${rows||'<div class="empty">No hay detalle disponible.</div>'}</div>`:''}</article>`;
}
function renderValidationHistory(c){
  const rows=validationHistoryFilteredRows(); const k=validationHistorySummary(rows); const names=activeDeliveryNames(); const from=state.validationHistoryFrom||today(), to=state.validationHistoryTo||today(); const forceOpen=Boolean(String(state.validationHistorySearch||'').trim());
  const keys=rows.map(l=>lotUiKey('validation',l.codigo_lote,l.id||l.fecha_entrega||l.creado_en));
  c.innerHTML=`<div class="panel validation-history-panel"><div class="panel-head"><div><h3>Historial de entregas a delivery</h3><p>Consulta, reimprime, corrige la composición, asignaciones y documenta lo entregado por Validación.</p></div><span class="badge info">V9.3.7.1</span></div><div class="validation-history-toolbar"><div class="field"><label>Desde</label><input type="date" id="validationHistFrom" value="${esc(from)}"></div><div class="field"><label>Hasta</label><input type="date" id="validationHistTo" value="${esc(to)}"></div><div class="field"><label>Responsable</label><select id="validationHistDelivery"><option value="">Todos</option>${names.map(n=>`<option ${state.validationHistoryDelivery===n?'selected':''}>${esc(n)}</option>`).join('')}</select></div><div class="field"><label>Buscar</label><input id="validationHistSearch" value="${esc(state.validationHistorySearch||'')}" placeholder="Lote, orden, factura o cliente..."></div><div class="batch-actions"><button class="btn gray" data-validation-preset="hoy">Hoy</button><button class="btn gray" data-validation-preset="ayer">Ayer</button><button class="btn gray" data-validation-preset="semana">Esta semana</button><button class="btn dark" id="printValidationDaily">Imprimir reporte</button></div></div><div class="validation-history-kpis"><div class="card kpi"><div class="label">Lotes</div><div class="value">${k.lotes}</div></div><div class="card kpi"><div class="label">Órdenes</div><div class="value">${k.ordenes}</div></div><div class="card kpi"><div class="label">Facturado</div><div class="value">${money(k.total)}</div></div><div class="card kpi"><div class="label">Peso entregado</div><div class="value">${Number(k.entregado.toFixed(2))} lb</div></div><div class="card kpi"><div class="label">Sin liquidar</div><div class="value">${k.pendientes}</div></div></div><div class="${state.v936SchemaOk?'lock-alert ok':'lock-alert warn'}"><b>Correcciones seguras:</b> ${state.v936SchemaOk?'auditoría V9.3.6 disponible para lotes abiertos.':'ejecuta el SQL 28 para habilitar Corregir asignación y Revertir lote.'}</div><div class="history-list-actions"><button class="btn small gray" data-validation-expand-all>Expandir todos</button><button class="btn small gray" data-validation-collapse-all>Ocultar todos</button></div><div class="liq-batch-list">${rows.map((l,i)=>validationHistoryCard(l,i,forceOpen)).join('')||'<div class="empty">No hay entregas registradas para ese rango.</div>'}</div></div>`;
  $('#validationHistFrom').onchange=e=>{state.validationHistoryFrom=e.target.value||today();renderValidacion($('#content'));}; $('#validationHistTo').onchange=e=>{state.validationHistoryTo=e.target.value||today();renderValidacion($('#content'));}; $('#validationHistDelivery').onchange=e=>{state.validationHistoryDelivery=e.target.value;renderValidacion($('#content'));}; $('#validationHistSearch').oninput=e=>{state.validationHistorySearch=e.target.value;renderValidacion($('#content'));focusAfterRender('validationHistSearch',e.target.selectionStart||e.target.value.length);};
  $$('[data-validation-preset]',c).forEach(b=>b.onclick=()=>{ const d=new Date(); if(b.dataset.validationPreset==='ayer') d.setDate(d.getDate()-1); if(b.dataset.validationPreset==='semana'){ const day=(d.getDay()+6)%7; d.setDate(d.getDate()-day); state.validationHistoryFrom=localIsoDate(d); state.validationHistoryTo=today(); } else { const v=localIsoDate(d); state.validationHistoryFrom=v;state.validationHistoryTo=v; } renderValidacion($('#content')); });
  $('#printValidationDaily').onclick=()=>printValidationDailyReport(rows,from,to,state.validationHistoryDelivery||'');
  $$('[data-validation-lot-toggle]',c).forEach(b=>b.onclick=()=>{const key=b.dataset.validationLotToggle;setHistoryOpen('validationLots',key,!historyIsOpen('validationLots',key));renderValidationHistory(c);});
  $('[data-validation-expand-all]',c).onclick=()=>{setOperationalKeysOpen('validationLots',keys,true);renderValidationHistory(c);};
  $('[data-validation-collapse-all]',c).onclick=()=>{setOperationalKeysOpen('validationLots',keys,false);renderValidationHistory(c);};
  $$('[data-validation-reprint]',c).forEach(b=>b.onclick=()=>{ const l=rows.find(x=>String(x.codigo_lote)===String(b.dataset.validationReprint)); if(l) printValidationRouteFromLot(l,true); });
  $$('[data-validation-constancia]',c).forEach(b=>b.onclick=()=>{ const l=rows.find(x=>String(x.codigo_lote)===String(b.dataset.validationConstancia)); if(l) printValidationDeliveryReceipt(l,true); });
  $$('[data-validation-lot-detail]',c).forEach(b=>b.onclick=()=>{ const l=rows.find(x=>String(x.codigo_lote)===String(b.dataset.validationLotDetail)); if(l) openValidationBatchDetail(l); });
  $$('[data-correct-validation-lot]',c).forEach(b=>b.onclick=()=>{const l=rows.find(x=>String(x.id)===String(b.dataset.correctValidationLot));if(l)openLotCorrectionModal(l);});
  $$('[data-transfer-order]',c).forEach(b=>b.onclick=()=>{const l=rows.find(x=>String(x.id)===String(b.dataset.transferLot));const o=state.ordenes.find(x=>String(x.id)===String(b.dataset.transferOrder));if(l&&o)openOrderTransferModal(l,o);});
}
function renderValidationPending(c){
  const base=validationReadyOrders(); const q=state.validacionSearch||''; const orders=base.filter(o=>matchOrder(o,q)); const draft=ensureValidationBatchDraft(); const defaultDel=draft.deliveryValue||state.deliveryFiltro||''; const defaultResponsibleType=draft.responsibleType||inferResponsibleType(draft.deliveryName||defaultDel,state.empleados,deliveryEmployeeNames()); const totalFact=orders.reduce((s,o)=>s+Number(o.total_factura||o.total_estimado||0),0); const totalPeso=orders.reduce((s,o)=>s+Number(validationWeightReference(o).value||0),0);
  c.innerHTML=`<div class="panel validation-batch-panel"><div class="panel-head"><div><h3>Validación por lote y entrega a responsable</h3><p>Selecciona quién llevará el viaje, confirma el monto final de cada factura y registra el peso entregado por cliente.</p></div><span class="badge info">${orders.length} orden(es)</span></div><div class="grid4 compact-kpis"><div class="card kpi"><div class="label">Órdenes listas</div><div class="value">${orders.length}</div></div><div class="card kpi"><div class="label">Monto a validar</div><div class="value" id="validationAmountTotal">${money(totalFact)}</div></div><div class="card kpi"><div class="label">Peso esperado</div><div class="value">${Number(totalPeso.toFixed(2))} lb</div></div><div class="card kpi"><div class="label">Seleccionadas</div><div class="value" id="batchCount">0</div></div></div><div class="batch-toolbar"><div class="field"><label>Responsable del viaje</label><select id="batchDelivery"><option value="">Selecciona responsable</option>${tripResponsibleOptions(defaultDel,defaultResponsibleType)}</select><input id="batchDeliveryManual" value="${esc(draft.manual||'')}" placeholder="Nombre de la persona responsable" style="display:${defaultDel==='__manual__'?'block':'none'};margin-top:8px"><div class="hint">Puede ser delivery, otro empleado o una persona manual/externa.</div></div><div class="field"><label>Buscar cliente</label><input id="validacionSearch" value="${esc(q)}" placeholder="Buscar nombre del cliente..."></div><div class="batch-actions"><button class="btn gray" id="selectAllBatch">Seleccionar visibles</button><button class="btn gray" id="clearBatch">Limpiar</button><button class="btn dark" id="previewBatchRoute">Vista hoja de ruta</button><button class="btn" id="createDeliveryBatch">Crear lote y asignar</button></div></div><div id="batchSummary" class="lock-alert ok">Selecciona las órdenes que llevará el responsable del viaje. El peso se valida individualmente por cliente.</div><div class="batch-table"><div class="batch-head"><span></span><span>Cliente / orden</span><span>Peso esperado</span><span>Monto factura</span><span>Peso entregado</span><span>Estado</span><span>Acciones</span></div>${orders.map(renderValidationBatchRow).join('')||'<div class="empty">No hay órdenes facturadas pendientes de asignar a un responsable.</div>'}</div><div class="section-title">Validación individual</div><div class="hint">También puedes validar una orden individual si no será enviada dentro de un lote.</div><div class="list compact-list">${orders.map(o=>`<div class="client-card op-card ${newOrderClass(o,'validacion')}" style="grid-template-columns:1fr auto"><div><div class="client-title">${esc(o.codigo||'')} · ${esc(orderClientName(o))}</div><div class="client-sub">Factura ${esc(o.factura_no||'—')} · ${money(o.total_factura||o.total_estimado)} · Ref. peso: ${validationWeightReference(o).value||'—'} lb</div><div class="order-status-line">${newOrderBadge(o,'validacion')}${orderCustomerBadge(o)}${orderDeliveryModeBadge(o)}${orderTypeBadge(o)}${specialCaseBadge(o)}${orderStatusBadgeHtml(o)}${stageClockBadge(o,'validacion')}${orderBatchBadge(o)}</div></div><div class="card-actions">${(orderRequiresInvoice(o)&&['Facturada','Validada para delivery'].includes(o.estado))?`<button class="btn small warn" data-return-invoice="${o.id}">Reabrir facturación</button>`:''}<button class="btn small" data-validate-order="${o.id}">Validar individual</button><button class="btn small gray" data-oper-order="${o.id}">Ver</button></div></div>`).join('')||''}</div></div>`;
  bindValidationBatch(c,orders); bindDynamic();
}
function renderPickupValidation(c){
  const q=state.pickupSearch||'';
  const pending=pickupReadyOrders().filter(o=>matchOrder(o,q));
  const delivered=pickupDeliveredOrders().filter(o=>!q||matchOrder(o,q)).slice(0,40);
  const total=pending.reduce((s,o)=>s+orderAmount(o),0);
  c.innerHTML=`<div class="panel pickup-panel"><div class="panel-head"><div><h3>Retiros en negocio</h3><p>Órdenes facturadas que el cliente recoge directamente. No se envían a Delivery ni pasan a Liquidación.</p></div><span class="badge pickup-badge">${pending.length} pendiente(s)</span></div><div class="grid4 compact-kpis"><div class="card kpi"><div class="label">Pendientes</div><div class="value">${pending.length}</div></div><div class="card kpi"><div class="label">Monto</div><div class="value">${money(total)}</div></div><div class="card kpi"><div class="label">Entregadas hoy</div><div class="value">${delivered.filter(o=>dateOnly(o.entregado_mostrador_en)===today()).length}</div></div><div class="card kpi"><div class="label">Ventas internas</div><div class="value">${pending.filter(isInternalSale).length}</div></div></div><div class="pickup-alert"><b>${esc(pickupNoticeText())}</b><span>Confirma quién retiró y quién entregó antes de cerrar la orden.</span></div><div class="searchbar"><input id="pickupSearch" value="${esc(q)}" placeholder="Buscar cliente, orden o factura..."></div><div class="section-title">Pendientes de retiro</div><div class="list">${pending.map(o=>`<div class="client-card op-card store-pickup-order" style="grid-template-columns:1fr auto"><div><div class="client-title">${esc(o.codigo||'')} · ${esc(orderClientName(o))}</div><div class="client-sub">Factura ${esc(o.factura_no||'—')} · ${money(orderAmount(o))} · ${esc(orderClientPhone(o)||'Sin teléfono')}</div><div class="order-status-line">${orderCustomerBadge(o)}${orderDeliveryModeBadge(o)}${orderStatusBadgeHtml(o)}${stageClockBadge(o,'validacion')}</div><div class="mini-items">${orderItemsText(o,7)}</div></div><div class="card-actions"><button class="btn small pickup-confirm-btn" data-confirm-pickup="${o.id}">Confirmar retiro</button><button class="btn small gray" data-print-order="${o.id}">Imprimir orden</button><button class="btn small gray" data-oper-order="${o.id}">Ver</button></div></div>`).join('')||'<div class="empty">No hay retiros pendientes.</div>'}</div><div class="section-title">Retiros entregados recientemente</div><div class="list compact-list">${delivered.map(o=>`<div class="client-card op-card done store-pickup-order" style="grid-template-columns:1fr auto"><div><div class="client-title">${esc(o.codigo||'')} · ${esc(orderClientName(o))}</div><div class="client-sub">Retirado por: ${esc(o.retirado_por||'—')} · Entregado por: ${esc(o.entregado_mostrador_por||'—')} · ${o.entregado_mostrador_en?businessDateTime(o.entregado_mostrador_en):'—'}</div><div class="badges">${orderCustomerBadge(o)}${orderDeliveryModeBadge(o)}<span class="badge ok">Entregada en negocio</span></div></div><div class="card-actions"><button class="btn small gray" data-oper-order="${o.id}">Ver</button></div></div>`).join('')||'<div class="empty">Todavía no hay retiros cerrados.</div>'}</div></div>`;
  $('#pickupSearch',c).oninput=e=>{const pos=e.target.selectionStart||e.target.value.length;state.pickupSearch=e.target.value;renderPickupValidation(c);focusAfterRender('pickupSearch',pos);};
  $$('[data-confirm-pickup]',c).forEach(b=>b.onclick=()=>openPickupConfirmModal(state.ordenes.find(o=>String(o.id)===String(b.dataset.confirmPickup))));
  bindDynamic();
}
function openPickupConfirmModal(o){
  if(!o || !isStorePickup(o)) return;
  const employee=currentWorkerName();
  const body=`<div class="form"><div class="pickup-alert"><b>${esc(pickupNoticeText())}</b><span>${esc(o.codigo||'')} · ${esc(orderClientName(o))} · ${money(orderAmount(o))}</span></div><div class="grid2"><div class="field"><label>Nombre de quien retira *</label><input id="pickupPerson" maxlength="120" placeholder="Nombre y apellido"></div><div class="field"><label>Entregado por *</label><input id="pickupEmployee" value="${esc(employee)}" readonly><div class="hint">Se registra el usuario activo.</div></div></div><div class="field"><label>Observación opcional</label><textarea id="pickupNotes" placeholder="Cédula, vehículo, autorización o detalle de entrega"></textarea></div><button class="btn pickup-confirm-btn" id="savePickup">Confirmar entrega en el negocio</button></div>`;
  const m=openModal('Confirmar retiro en negocio',body,'Esta acción cierra la orden sin enviarla a Delivery ni Liquidación.');
  const person=$('#pickupPerson',m), notes=$('#pickupNotes',m), save=$('#savePickup',m);
  person.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();notes.focus();}};
  notes.onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();save.focus();}};
  save.onclick=async()=>{
    const withdrawnBy=String(person.value||'').trim();
    if(!withdrawnBy) return alert('Es obligatorio registrar el nombre de quien retira.');
    if(!confirm(`Confirmar que ${withdrawnBy} retiró la orden ${o.codigo||o.id} en el negocio?`)) return;
    m.remove();
    await setOrderState(o,'Entregada en negocio',{retirado_por:withdrawnBy,entregado_mostrador_por:employee,entregado_mostrador_en:new Date().toISOString(),notas_retiro:String(notes.value||'').trim()||null,delivery_nombre:null,recibido_en:new Date().toISOString(),notas_estado:'Entregada en el negocio a '+withdrawnBy});
  };
  setTimeout(()=>person.focus(),50);
}
function renderValidacion(c){
  const tabs=[['pendientes','Delivery pendiente'],['retiros','Retiros en negocio'],['historial','Historial de delivery']];
  c.innerHTML=`<div class="tabs validation-tabs">${tabs.map(([id,n])=>`<button class="tab ${state.validacionTab===id?'active':''}" data-validation-tab="${id}">${n}</button>`).join('')}</div><div id="validationBody"></div>`;
  $$('[data-validation-tab]',c).forEach(b=>b.onclick=()=>{state.validacionTab=b.dataset.validationTab;renderValidacion(c);});
  if(state.validacionTab==='historial') renderValidationHistory($('#validationBody',c)); else if(state.validacionTab==='retiros') renderPickupValidation($('#validationBody',c)); else renderValidationPending($('#validationBody',c));
}
function getBatchResponsible(container){ return selectedTripResponsible(container,'batchDelivery','batchDeliveryManual'); }
function getBatchDelivery(container){ return getBatchResponsible(container).name; }

function selectedBatchRows(container,orders){
  return $$('[data-batch-row]',container).filter(row=>$('[data-batch-check]',row)?.checked).map(row=>{
    const id=row.dataset.batchRow;
    const o=orders.find(x=>String(x.id)===String(id));
    const peso=Number($('[data-batch-weight]',row)?.value||0);
    const amount=normalizeValidationInvoiceAmount($('[data-batch-amount]',row)?.value||0);
    return {row,id,o,peso,req:row.dataset.reqpeso==='1',expected:Number(row.dataset.expected||0),amount};
  }).filter(x=>x.o);
}
function updateBatchSummary(container,orders){
  const sel=selectedBatchRows(container,orders);
  const peso=sel.reduce((s,x)=>s+Number(x.peso||0),0);
  const expected=sel.reduce((s,x)=>s+Number(x.expected||0),0);
  const total=sel.reduce((s,x)=>s+Number(x.amount||0),0);
  const count=$('#batchCount',container); if(count) count.textContent=sel.length;
  const visibleTotal=$$('[data-batch-amount]',container).reduce((sum,input)=>sum+normalizeValidationInvoiceAmount(input.value),0);
  const totalKpi=$('#validationAmountTotal',container); if(totalKpi) totalKpi.textContent=money(visibleTotal);
  const box=$('#batchSummary',container); if(box){ box.className='lock-alert '+(sel.length?'ok':''); box.innerHTML=sel.length?`<b>Lote en preparación:</b> ${sel.length} orden(es) · Peso esperado ${Number(expected.toFixed(2))} lb · Peso entregado ${Number(peso.toFixed(2))} lb · Monto final ${money(total)}.`:'Selecciona las órdenes que llevará el responsable. Confirma el monto final y el peso de cada cliente.'; }
}
function validateSelectedBatch(container,orders){
  const selected=selectedBatchRows(container,orders);
  const missing=[], missingAmounts=[], blocked=[], warnings=[];
  selected.forEach(x=>{
    if(!(x.amount>0)) missingAmounts.push(x.o.codigo+' · '+orderClientName(x.o));
    if(x.req && x.peso<=0) missing.push(x.o.codigo+' · '+orderClientName(x.o));
    if(x.peso>0){
      const ch=validationWeightCheck(x.o,x.peso);
      if(ch.calc && ch.level==='block') blocked.push(`${x.o.codigo} · ${orderClientName(x.o)} (${(ch.diff>0?'+':'')+ch.diff} lb)`);
      if(ch.calc && ch.level==='warn') warnings.push(`${x.o.codigo} · ${orderClientName(x.o)} (${(ch.diff>0?'+':'')+ch.diff} lb)`);
    }
  });
  return {selected,missing,missingAmounts,blocked,warnings};
}
function bindValidationBatch(container,orders){
  const delivery=$('#batchDelivery',container), manual=$('#batchDeliveryManual',container);
  if(delivery) delivery.onchange=()=>{ if(manual) manual.style.display=delivery.value==='__manual__'?'block':'none'; state.deliveryFiltro=getBatchDelivery(container)||state.deliveryFiltro; saveBatchDeliveryDraft(container); };
  if(manual) manual.oninput=()=>{ state.deliveryFiltro=getBatchDelivery(container)||state.deliveryFiltro; saveBatchDeliveryDraft(container); };
  $('#validacionSearch',container).oninput=e=>{ const pos=e.target.selectionStart||e.target.value.length; state.validacionSearch=e.target.value; renderValidacion($('#content')); focusAfterRender('validacionSearch',pos); };
  $$('[data-batch-check]',container).forEach(ch=>{
    ch.onchange=()=>{
      const row=ch.closest('[data-batch-row]'), inp=$('[data-batch-weight]',row), amountInp=$('[data-batch-amount]',row);
      if(inp) inp.disabled=!(ch.checked && row.dataset.reqpeso==='1');
      if(ch.checked && amountInp) setTimeout(()=>{amountInp.focus();amountInp.select();},0);
      saveBatchRowDraft(row);
      updateBatchSummary(container,orders);
    };
  });
  $$('[data-batch-amount]',container).forEach(inp=>{
    inp.oninput=()=>{ const row=inp.closest('[data-batch-row]'); row.dataset.amount=String(normalizeValidationInvoiceAmount(inp.value)); saveBatchRowDraft(row); updateBatchSummary(container,orders); };
    inp.addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); const row=inp.closest('[data-batch-row]'); const check=$('[data-batch-check]',row); if(check && !check.checked){ check.checked=true; check.dispatchEvent(new Event('change')); } const weight=$('[data-batch-weight]',row); if(weight && row.dataset.reqpeso==='1'){ weight.disabled=false; setTimeout(()=>{weight.focus();weight.select();},0); } else { const rows=$$('[data-batch-row]',container); const idx=rows.indexOf(row); const next=rows[idx+1]; const nextAmount=next?$('[data-batch-amount]',next):null; if(nextAmount){nextAmount.focus();nextAmount.select();} else $('#createDeliveryBatch',container)?.focus(); } } });
  });
  $$('[data-batch-weight]',container).forEach(inp=>{
    inp.oninput=()=>{ const row=inp.closest('[data-batch-row]'); const o=orders.find(x=>String(x.id)===String(row.dataset.batchRow)); const status=$('[data-batch-status]',row); if(status) status.innerHTML=validationRowStatusHtml(o,Number(inp.value||0)); saveBatchRowDraft(row); updateBatchSummary(container,orders); };
    inp.addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); const rows=$$('[data-batch-row]',container).filter(r=>$('[data-batch-check]',r)?.checked && r.dataset.reqpeso==='1'); const idx=rows.findIndex(r=>r===inp.closest('[data-batch-row]')); const next=rows[idx+1]; if(next){ const ni=$('[data-batch-weight]',next); if(ni){ni.focus();ni.select();} } else { $('#createDeliveryBatch',container)?.focus(); } } });
  });
  $('#selectAllBatch',container).onclick=()=>{ $$('[data-batch-check]',container).forEach(ch=>{ ch.checked=true; const row=ch.closest('[data-batch-row]'), inp=$('[data-batch-weight]',row); if(inp) inp.disabled=row.dataset.reqpeso!=='1'; saveBatchRowDraft(row); }); updateBatchSummary(container,orders); };
  $('#clearBatch',container).onclick=()=>{ $$('[data-batch-check]',container).forEach(ch=>{ ch.checked=false; const row=ch.closest('[data-batch-row]'), inp=$('[data-batch-weight]',row); if(inp){ inp.disabled=true; inp.value=''; } saveBatchRowDraft(row); const status=$('[data-batch-status]',row); const o=orders.find(x=>String(x.id)===String(row.dataset.batchRow)); if(status) status.innerHTML=validationRowStatusHtml(o,0); }); updateBatchSummary(container,orders); };
  $('#previewBatchRoute',container).onclick=()=>{ const val=validateSelectedBatch(container,orders); const del=getBatchDelivery(container)||'—'; if(!val.selected.length) return alert('Selecciona al menos una orden.'); if(val.missingAmounts.length) return alert('Falta el monto final de factura en estas órdenes:\n- '+val.missingAmounts.join('\n- ')); printDeliveryBatchSheet(del,newBatchCode(),val.selected,false); };
  $('#createDeliveryBatch',container).onclick=async()=>{
    const responsible=getBatchResponsible(container);
    if(!responsible.name) return alert('Selecciona la persona responsable del viaje.');
    if(!state.v9371SchemaOk) return alert('Primero ejecuta el SQL 31 de la V9.3.7.1 en Supabase.');
    const val=validateSelectedBatch(container,orders);
    if(!val.selected.length) return alert('Selecciona al menos una orden para el lote.');
    if(val.missingAmounts.length) return alert('Falta el monto final de factura en estas órdenes:\n- '+val.missingAmounts.join('\n- '));
    if(val.missing.length) return alert('Faltan pesos finales en estas órdenes:\n- '+val.missing.join('\n- '));
    if(val.blocked.length) return alert('No se puede crear el lote. Hay diferencias de peso demasiado altas:\n- '+val.blocked.join('\n- '));
    if(val.warnings.length){
      const reason=await responsibilityDecisionDialog({title:'Crear lote con diferencias de peso',message:'Hay órdenes fuera de la tolerancia de aviso.',rows:val.warnings.map((x,i)=>[`Orden ${i+1}`,x])});
      if(!reason) return;
      for(const x of val.selected){
        const check=x.peso>0?validationWeightCheck(x.o,x.peso):null;
        if(check?.level!=='warn') continue;
        const recorded=await recordAuditException({...auditOrderFields(x.o),modulo:'Validación',tipo_evento:'Lote creado con diferencia de peso',gravedad:'Advertencia',motivo:reason,valor_esperado:check.calc,valor_registrado:check.peso,diferencia:check.diff,tolerancia_aviso:check.aviso,tolerancia_maxima:check.max,unidad:'lb',detalle:{responsable:responsible.name,cantidad_ordenes:val.selected.length}});
        if(!recorded) return;
      }
    }
    const lote=newBatchCode();
    const fechaOriginal=new Date().toISOString(); const validadoPor=currentWorkerName();
    const snapshot=buildDeliveryRouteSnapshot(lote,responsible.name,val.selected,fechaOriginal,validadoPor);
    const items=val.selected.map(x=>{
      const check=x.peso>0?validationWeightCheck(x.o,x.peso):null;
      const alerta=check?.calc&&check.level==='warn'?validationWeightAlertText(x.o,x.peso):'';
      return {orden_id:Number(x.o.id),monto:requireValidationInvoiceAmount(x.amount),peso_esperado:Number(x.expected||0),peso_entregado:Number(x.peso||0),alerta};
    });
    const btn=$('#createDeliveryBatch',container); if(btn){btn.disabled=true;btn.textContent='Creando lote...';}
    const {data,error}=await sb.rpc('crear_lote_entrega_v9371',{
      p_codigo_lote:lote,p_responsable_nombre:responsible.name,p_responsable_tipo:responsible.type,
      p_items:items,p_validado_por:validadoPor,p_snapshot:snapshot
    });
    if(error){ if(btn){btn.disabled=false;btn.textContent='Crear lote y asignar';} return alert('No se pudo crear el lote: '+error.message); }
    printDeliveryBatchSheet(responsible.name,lote,val.selected,true,{originalDate:fechaOriginal,validatedBy:validadoPor,reprint:false,responsibleType:responsible.type});
    await recordDeliveryDocumentEvent(lote,'Hoja de ruta','Original',{fecha_original:fechaOriginal,cantidad_ordenes:val.selected.length,responsable_tipo:responsible.type});
    clearValidationBatchDraft();
    await refreshVisibleModuleV9384(); render(); toast(`Lote ${data?.codigo_lote||lote} creado para ${responsible.name}`);
  };
  updateBatchSummary(container,orders);
}
function printDeliveryBatchSheet(deliveryName,lote,items,auto=true,opts={}){
  const originalDate=opts.originalDate||new Date().toISOString(), printDate=new Date().toISOString(), isReprint=opts.reprint===true;
  const rows=items.map(x=>`<tr><td>${esc(x.o.codigo||'')}</td><td>${esc(orderClientName(x.o))}</td><td>${esc(orderClientPhone(x.o))}</td><td>${esc(orderClientSector(x.o)||x.o.cliente?.direccion||'')}</td><td>${esc(x.o.factura_no||'—')}</td><td>${money(x.amount)}</td><td>${x.expected?Number(x.expected).toFixed(2)+' lb':'No pesa'}</td><td>${x.peso?Number(x.peso).toFixed(2)+' lb':'—'}</td><td></td></tr>`).join('');
  const total=items.reduce((sum,x)=>sum+Number(x.amount||0),0), exp=items.reduce((sum,x)=>sum+Number(x.expected||0),0), pes=items.reduce((sum,x)=>sum+Number(x.peso||0),0);
  const copy=isReprint?'<div class="copy">COPIA / REIMPRESIÓN</div>':'';
  const html=`<!doctype html><html><head><meta charset="utf-8"><title>Hoja de ruta ${esc(lote)}</title><style>body{font-family:Arial,sans-serif;color:#111;padding:20px;font-size:12px}h1{font-size:22px;margin:0 0 6px}table{width:100%;border-collapse:collapse;margin-top:12px}th,td{border:1px solid #d1d5db;padding:6px;text-align:left}th{background:#f3f4f6}.tot{font-weight:bold;background:#f8fafc}.sign{display:inline-block;width:240px;border-top:1px solid #000;margin-top:36px;margin-right:40px;padding-top:4px}.copy{border:2px solid #991b1b;color:#991b1b;font-weight:bold;text-align:center;padding:7px;margin:8px 0;font-size:15px}@media print{button{display:none}}</style></head><body>${printCompanyHeader(appCfg('recibos.tituloRuta','Hoja de ruta / lote de entrega'),'Lote de entrega al delivery')}${copy}<p><b>Lote:</b> ${esc(lote)}<br><b>Responsable del viaje:</b> ${esc(deliveryName||'—')}<br><b>Fecha original de entrega:</b> ${businessDateTime(originalDate)}<br><b>Validado por:</b> ${esc(opts.validatedBy||'—')}${isReprint?`<br><b>Reimpreso:</b> ${businessDateTime(printDate)} · ${esc(currentWorkerName())}`:''}</p><p><b>Órdenes:</b> ${items.length} · <b>Total facturado:</b> ${money(total)} · <b>Peso esperado:</b> ${Number(exp.toFixed(2))} lb · <b>Peso entregado:</b> ${Number(pes.toFixed(2))} lb</p><table><thead><tr><th>Orden</th><th>Cliente</th><th>Teléfono</th><th>Sector / dirección</th><th>Factura</th><th>Monto</th><th>Peso esperado</th><th>Peso entregado</th><th>Firma/nota cliente</th></tr></thead><tbody>${rows}<tr class="tot"><td colspan="5">Totales</td><td>${money(total)}</td><td>${Number(exp.toFixed(2))} lb</td><td>${Number(pes.toFixed(2))} lb</td><td></td></tr></tbody></table>${signatureHtml(appCfg('recibos.firmaValidacion','Entregado por validación'))}${signatureHtml(appCfg('recibos.firmaDelivery','Recibido por delivery'))}${printFooterHtml()}<button onclick="window.print()">Imprimir</button>${auto?'<script>setTimeout(()=>window.print(),500)<\/script>':''}</body></html>`;
  const w=window.open('','_blank','width=1000,height=720'); if(!w) return alert('El navegador bloqueó la impresión. Permite ventanas emergentes.'); w.document.open(); w.document.write(html); w.document.close();
}
function printValidationRouteFromLot(lot,auto=true){
  const snap=normalizeRouteSnapshot(lot?.hoja_ruta_snapshot); const items=routeItemsFromSnapshot(snap).length?routeItemsFromSnapshot(snap):validationBatchRouteItems(lot); if(!items.length) return alert('Este lote no tiene detalle disponible para reimprimir.');
  printDeliveryBatchSheet(lot.delivery_nombre,lot.codigo_lote,items,auto,{originalDate:snap?.fecha_entrega||lot.fecha_entrega||lot.creado_en,validatedBy:snap?.validado_por||lot.validado_por||'—',reprint:true});
  recordDeliveryDocumentEvent(lot.codigo_lote,'Hoja de ruta','Reimpresión',{fecha_original:snap?.fecha_entrega||lot.fecha_entrega||null,cantidad_ordenes:items.length});
}
function printValidationDeliveryReceipt(lot,auto=true){
  const snap=normalizeRouteSnapshot(lot?.hoja_ruta_snapshot); const items=validationBatchRouteItems(lot); const total=items.reduce((a,x)=>a+Number(x.amount||0),0), peso=items.reduce((a,x)=>a+Number(x.peso||0),0); const rows=items.map(x=>`<tr><td>${esc(x.o?.codigo||'')}</td><td>${esc(x.o?.cliente?.negocio||'')}</td><td>${esc(x.o?.factura_no||'—')}</td><td>${money(x.amount||0)}</td><td>${Number(x.peso||0).toFixed(2)} lb</td><td>${esc(x.o?.estado||'')}</td></tr>`).join('');
  const html=`<!doctype html><html><head><meta charset="utf-8"><title>Constancia ${esc(lot.codigo_lote)}</title><style>body{font-family:Arial,sans-serif;padding:22px;color:#111;font-size:12px}table{width:100%;border-collapse:collapse;margin-top:14px}th,td{border:1px solid #ddd;padding:7px;text-align:left}th{background:#f3f4f6}.box{border:1px solid #ddd;border-radius:10px;padding:12px;margin:12px 0}.sign{display:inline-block;width:240px;border-top:1px solid #000;margin:40px 35px 0 0;padding-top:4px}@media print{button{display:none}}</style></head><body>${printCompanyHeader('Constancia de entrega a delivery','Historial de Validación')}<div class="box"><b>Lote:</b> ${esc(lot.codigo_lote)}<br><b>Fecha original:</b> ${businessDateTime(snap?.fecha_entrega||lot.fecha_entrega||lot.creado_en)}<br><b>Responsable del viaje:</b> ${esc(tripResponsibleName(lot)||'—')}<br><b>Validado por:</b> ${esc(snap?.validado_por||lot.validado_por||'—')}<br><b>Estado actual:</b> ${esc(validationBatchCurrentState(lot))}</div><p><b>Órdenes:</b> ${items.length} · <b>Total:</b> ${money(total)} · <b>Peso entregado:</b> ${Number(peso.toFixed(2))} lb</p><table><thead><tr><th>Orden</th><th>Cliente</th><th>Factura</th><th>Monto</th><th>Peso</th><th>Estado actual</th></tr></thead><tbody>${rows}</tbody></table>${signatureHtml(appCfg('recibos.firmaValidacion','Entregado por validación'))}${signatureHtml(appCfg('recibos.firmaDelivery','Recibido por delivery'))}${printFooterHtml()}<button onclick="window.print()">Imprimir</button>${auto?'<script>setTimeout(()=>window.print(),500)<\/script>':''}</body></html>`;
  const w=window.open('','_blank','width=950,height=720'); if(!w) return alert('Permite ventanas emergentes para imprimir.'); w.document.write(html);w.document.close(); recordDeliveryDocumentEvent(lot.codigo_lote,'Constancia de entrega','Reimpresión',{fecha_original:snap?.fecha_entrega||lot.fecha_entrega||null,cantidad_ordenes:items.length});
}
function printValidationDailyReport(rows,from,to,deliveryFilter){
  if(!rows.length) return alert('No hay entregas en el rango seleccionado.'); const groups={}; rows.forEach(l=>{const key=l.delivery_nombre||'Sin delivery';(groups[key]=groups[key]||[]).push(l);});
  const sections=Object.entries(groups).map(([delivery,lots])=>{ const sum=validationHistorySummary(lots); const detail=lots.map(l=>`<tr><td>${esc(l.codigo_lote)}</td><td>${new Date(l.fecha_entrega||l.creado_en).toLocaleTimeString('es-DO',{hour:'2-digit',minute:'2-digit'})}</td><td>${Number(l.cantidad_ordenes||validationBatchRouteItems(l).length)}</td><td>${money(l.total_facturado||0)}</td><td>${Number(l.peso_entregado||0).toFixed(2)} lb</td><td>${esc(validationBatchCurrentState(l))}</td></tr>`).join(''); return `<h2>${esc(delivery)}</h2><p><b>Lotes:</b> ${sum.lotes} · <b>Órdenes:</b> ${sum.ordenes} · <b>Total:</b> ${money(sum.total)} · <b>Peso:</b> ${Number(sum.entregado.toFixed(2))} lb</p><table><thead><tr><th>Lote</th><th>Hora</th><th>Órdenes</th><th>Total</th><th>Peso entregado</th><th>Estado</th></tr></thead><tbody>${detail}</tbody></table>`; }).join('');
  const all=validationHistorySummary(rows); const html=`<!doctype html><html><head><meta charset="utf-8"><title>Reporte entregas ${esc(from)}</title><style>body{font-family:Arial,sans-serif;padding:22px;color:#111;font-size:12px}h2{margin-top:24px;border-bottom:2px solid #111;padding-bottom:5px}table{width:100%;border-collapse:collapse;margin:10px 0 18px}th,td{border:1px solid #ddd;padding:7px;text-align:left}th{background:#f3f4f6}.summary{border:1px solid #ddd;padding:12px;border-radius:10px}.sign{display:inline-block;width:220px;border-top:1px solid #000;margin:44px 28px 0 0;padding-top:4px}@media print{button{display:none}}</style></head><body>${printCompanyHeader('Reporte diario de entregas a delivery','Historial de Validación')}<div class="summary"><b>Desde:</b> ${esc(from)} · <b>Hasta:</b> ${esc(to)}${deliveryFilter?' · <b>Delivery:</b> '+esc(deliveryFilter):''}<br><b>Lotes:</b> ${all.lotes} · <b>Órdenes:</b> ${all.ordenes} · <b>Total facturado:</b> ${money(all.total)} · <b>Peso entregado:</b> ${Number(all.entregado.toFixed(2))} lb · <b>Sin liquidar:</b> ${all.pendientes}</div>${sections}${signatureHtml('Entregado por Validación')}${signatureHtml('Revisado por supervisor')}${printFooterHtml()}<button onclick="window.print()">Imprimir</button><script>setTimeout(()=>window.print(),500)<\/script></body></html>`; const w=window.open('','_blank','width=1000,height=720'); if(!w) return alert('Permite ventanas emergentes para imprimir.');w.document.write(html);w.document.close(); recordDeliveryDocumentEvent('REPORTE-DIARIO','Reporte diario','Impresión',{filtro_desde:from,filtro_hasta:to,delivery:deliveryFilter,cantidad_lotes:rows.length});
}
function openValidationBatchDetail(lot){
  const snap=normalizeRouteSnapshot(lot?.hoja_ruta_snapshot); const items=validationBatchRouteItems(lot); const audits=validationBatchPrintAudit(lot.codigo_lote); const rows=items.map(x=>`<div class="kv"><b>${esc(x.o?.codigo||'Orden')}</b><span>${esc(x.o?.cliente?.negocio||'Cliente')} · Factura ${esc(x.o?.factura_no||'—')} · ${money(x.amount||0)} · ${Number(x.peso||0).toFixed(2)} lb · Estado: ${esc(x.o?.estado||'—')}</span></div>`).join(''); const auditRows=audits.slice(0,12).map(a=>`<div class="kv"><b>${businessDateTime(a.fecha_evento)}</b><span>${esc(a.tipo_documento)} · ${esc(a.tipo_evento)} · ${esc(a.usuario_nombre||'Usuario')}</span></div>`).join('');
  const body=`<div class="grid2"><div><div class="section-title">Datos originales</div><div class="kv"><b>Lote</b><span>${esc(lot.codigo_lote)}</span></div><div class="kv"><b>Fecha</b><span>${businessDateTime(snap?.fecha_entrega||lot.fecha_entrega||lot.creado_en)}</span></div><div class="kv"><b>Responsable</b><span>${esc(tripResponsibleName(lot)||'—')} · ${esc(responsibleTypeLabel(tripResponsibleType(tripResponsibleName(lot),lot)))}</span></div><div class="kv"><b>Validado por</b><span>${esc(snap?.validado_por||lot.validado_por||'—')}</span></div></div><div><div class="section-title">Control actual</div><div class="kv"><b>Estado</b><span>${esc(validationBatchCurrentState(lot))}</span></div><div class="kv"><b>Snapshot</b><span>${lot.hoja_ruta_snapshot?'Disponible':'Reconstruido con datos actuales'}</span></div><div class="kv"><b>Reimpresiones</b><span>${Number(lot.cantidad_reimpresiones||audits.filter(a=>a.tipo_evento==='Reimpresión').length||0)}</span></div></div></div><div class="section-title">Órdenes del lote</div>${rows||'<div class="empty">Sin detalle.</div>'}<div class="section-title">Auditoría documental</div>${auditRows||'<div class="empty">Sin impresiones registradas todavía.</div>'}<div class="actions"><button class="btn dark" id="modalValidationReprint">Reimprimir hoja de ruta</button><button class="btn gray" id="modalValidationReceipt">Imprimir constancia</button></div>`;
  const m=openModal('Detalle de entrega',body,'Consulta histórica; no modifica estados ni relojes.'); $('#modalValidationReprint',m).onclick=()=>printValidationRouteFromLot(lot,true); $('#modalValidationReceipt',m).onclick=()=>printValidationDeliveryReceipt(lot,true);
}

function tripResponsibleType(name,lot=null){
  return lot?.responsable_tipo || inferResponsibleType(name,state.empleados,deliveryEmployeeNames());
}
function tripResponsibleName(lot){ return normalizeResponsibleName(lot?.responsable_nombre||lot?.delivery_nombre||''); }
function tripResponsibleBadge(lotOrName,type=''){
  const name=typeof lotOrName==='string'?lotOrName:tripResponsibleName(lotOrName);
  const resolved=type || (typeof lotOrName==='string'?tripResponsibleType(name):tripResponsibleType(name,lotOrName));
  const cls=resolved===RESPONSIBLE_TYPES.MANUAL?'warn':(resolved===RESPONSIBLE_TYPES.EMPLOYEE?'info':'ok');
  return name?`<span class="badge ${cls}">${esc(responsibleTypeLabel(resolved))}</span>`:'';
}
function tripResponsibleOptions(selected='',selectedType=''){
  const current=normalizeResponsibleName(selected);
  const deliveryNames=deliveryEmployeeNames();
  const deliveryKeys=new Set(deliveryNames.map(norm));
  const otherEmployees=activeEmployees('').map(e=>e.nombre).filter(n=>n&&!deliveryKeys.has(norm(n)));
  const employeeKeys=new Set([...deliveryNames,...otherEmployees].map(norm));
  const historicManual=(state.entregaLotes||[])
    .filter(l=>tripResponsibleType(tripResponsibleName(l),l)===RESPONSIBLE_TYPES.MANUAL)
    .map(tripResponsibleName).filter(n=>n&&!employeeKeys.has(norm(n)));
  const knownKeys=new Set([...deliveryNames,...otherEmployees,...historicManual].map(norm));
  const unknown=current&&!knownKeys.has(norm(current))&&current!=='__manual__'?`<option value="${esc(current)}" data-responsible-type="${esc(selectedType||RESPONSIBLE_TYPES.MANUAL)}" selected>${esc(current)} · ${esc(responsibleTypeLabel(selectedType||RESPONSIBLE_TYPES.MANUAL))}</option>`:'';
  const group=(label,names,type)=>names.length?`<optgroup label="${esc(label)}">${[...new Map(names.map(n=>[norm(n),n])).values()].sort((a,b)=>a.localeCompare(b,'es')).map(n=>`<option value="${esc(n)}" data-responsible-type="${type}" ${norm(n)===norm(current)?'selected':''}>${esc(n)}</option>`).join('')}</optgroup>`:'';
  return `${unknown}${group('Deliverys registrados',deliveryNames,RESPONSIBLE_TYPES.DELIVERY)}${group('Otros empleados',otherEmployees,RESPONSIBLE_TYPES.EMPLOYEE)}${group('Responsables manuales recientes',historicManual,RESPONSIBLE_TYPES.MANUAL)}<option value="__manual__" data-responsible-type="${RESPONSIBLE_TYPES.MANUAL}" ${current==='__manual__'?'selected':''}>Otro / manual</option>`;
}
function selectedTripResponsible(container,selectId='batchDelivery',manualId='batchDeliveryManual'){
  const sel=$('#'+selectId,container), manual=$('#'+manualId,container);
  if(!sel) return {name:'',type:RESPONSIBLE_TYPES.MANUAL};
  const isManual=sel.value==='__manual__';
  const name=normalizeResponsibleName(isManual?manual?.value:sel.value);
  const type=isManual?RESPONSIBLE_TYPES.MANUAL:(sel.selectedOptions?.[0]?.dataset?.responsibleType||inferResponsibleType(name,state.empleados,deliveryEmployeeNames()));
  return {name,type};
}
function allTripResponsibleNames(){
  return mergeResponsibleNames({deliveryNames:deliveryEmployeeNames(),employees:state.empleados,lots:state.entregaLotes,orders:state.ordenes,includeClosed:true});
}
function activeDeliveryNames(){ return allTripResponsibleNames(); }
function currentDeliveryName(){
  const keys=currentWorkerKeys();
  const found=activeDeliveryNames().find(n=>keys.includes(norm(n)) || keys.some(k=>norm(n).includes(k) || k.includes(norm(n))));
  return found || currentWorkerName();
}
function selectedDeliveryFilter(){
  const names=activeDeliveryNames();
  if(!isAdminRole() && state.profile?.rol==='Delivery') return currentDeliveryName();
  const active=state.deliveryFiltro||'';
  return active || names[0] || '';
}
function deliveryCanSelect(){ return isAdminRole() || puede('liquidacion',true) || puede('validacion',true); }
function finalDeliveryStates(){ return ['Cobrado','Entregado a crédito','No entregado','Devuelto parcial']; }
function deliveryPendingStates(){ return ['Validada para delivery','Asignada a delivery','En ruta','Cobrado','Entregado a crédito','No entregado','Devuelto parcial']; }
function isFinalDeliveryResult(o){ return finalDeliveryStates().includes(o?.estado) || finalDeliveryStates().includes(o?.resultado_entrega); }
function pendingLiquidationOrders(deliveryName=''){
  return state.ordenes.filter(o=>{
    if(isStorePickup(o)) return false;
    if(o.estado==='Anulado' || o.estado==='Cerrado' || o.recibido_en) return false;
    if(deliveryName && o.delivery_nombre!==deliveryName) return false;
    const code=batchCodeFromOrder(o);
    const lot=code?batchRecordByCode(code):null;
    if(!lot || ['revertido','cerrado'].includes(String(lot.estado||'').toLowerCase())) return false;
    return ['Validada para delivery','Asignada a delivery','En ruta','Cobrado','Entregado a crédito','No entregado','Devuelto parcial'].includes(o.estado);
  });
}
function deliveryStatusBadge(o){
  const res=o.resultado_entrega || (finalDeliveryStates().includes(o.estado)?o.estado:'');
  if(!res) return '';
  const cls=res==='Cobrado'?'ok':(res==='Entregado a crédito'?'info':(res==='No entregado'?'bad':'warn'));
  return `<span class="badge ${cls}">${esc(res)}</span>`;
}
function deliveryMoneySummary(orders){
  return orders.reduce((a,o)=>{
    const total=Number(o.total_factura||o.total_estimado||0);
    const cob=Number(o.monto_cobrado||0);
    const pend=Number(o.monto_pendiente ?? Math.max(total-cob,0));
    const res=(o.resultado_entrega||o.estado)||'';
    a.total+=total;
    if(res==='Cobrado') a.cobrado+=cob||total;
    if(res==='Entregado a crédito'){ a.cobrado+=cob; a.credito+=pend||Math.max(total-cob,0); }
    if(res==='No entregado') a.noEntregado+=total;
    if(res==='Devuelto parcial'){ a.cobrado+=cob; a.devuelto+=pend||Math.max(total-cob,0); }
    if(!isFinalDeliveryResult(o)) a.pendientes++;
    return a;
  },{total:0,cobrado:0,credito:0,noEntregado:0,devuelto:0,pendientes:0});
}
function expectedCashFromOrder(o, selectedResult){
  const total=Number(o?.total_factura||o?.total_estimado||0);
  const res=selectedResult || o?.resultado_entrega || o?.estado || 'Cobrado';
  if(o && (o.monto_cobrado!==undefined && o.monto_cobrado!==null && o.monto_cobrado!=='')) return Number(o.monto_cobrado||0);
  if(res==='Cobrado') return total;
  if(res==='Entregado a crédito' || res==='No entregado') return 0;
  if(res==='Devuelto parcial') return Number(o?.monto_cobrado||0);
  return total;
}
function validateDeliveryCash(resultado,total,cash){
  total=Number(total||0); cash=Number(cash||0);
  if(cash<0) return 'El monto no puede ser negativo.';
  if(resultado==='Cobrado'){
    if(cash+0.01<total) return `Para marcar como Cobrado, el efectivo recibido debe cubrir el total ${money(total)}. Si recibió un abono, usa “Entregado a crédito”.`;
    return '';
  }
  if(resultado==='Entregado a crédito'){
    if(cash>=total-0.01) return 'Si el cliente pagó el total, registra el resultado como Cobrado completo.';
    return '';
  }
  if(resultado==='No entregado'){
    if(cash>0.01) return 'Una orden No entregada no debe registrar cobro. Usa otro resultado si recibió dinero.';
    return '';
  }
  if(resultado==='Devuelto parcial'){
    if(cash>total+0.01) return 'El monto recibido no puede ser mayor que el total de la factura.';
    return '';
  }
  return '';
}
function deliveryActionButtons(o){
  return `<button class="btn small gray" data-oper-order="${o.id}">Ver</button>`;
}
function deliveryActiveGroupCard(g,index=0,forceOpen=false){
  const key=lotUiKey('delivery-active',g.displayCode,g.key); const open=operationalLotOpen('deliveryActive',key,index,forceOpen);
  const title=g.displayCode==='SIN-LOTE'?`Sin lote · ${esc(g.items[0]?.codigo||'Orden')}`:esc(g.displayCode);
  const rows=g.items.map(o=>`<div class="client-card op-card ruta ${newOrderClass(o,'delivery')} operational-order-row"><div><div class="client-title">${esc(orderClientName(o))}</div><div class="client-sub">${esc(orderClientPhone(o))} · ${esc(orderClientSector(o))} · ${money(o.total_factura||o.total_estimado)}</div><div class="badges">${newOrderBadge(o,'delivery')}<span class="badge info">Viaje asignado</span>${orderBatchBadge(o)}${stageClockBadge(o,'delivery')}<span class="badge">${esc(o.codigo)}</span></div><div class="mini-items">${orderItemsText(o,8)}</div></div><div class="card-actions">${deliveryActionButtons(o)}</div></div>`).join('');
  return `<article class="liq-batch-card operational-lot-card ${open?'is-open':'is-collapsed'}"><div class="liq-batch-head operational-lot-head"><button class="history-toggle-btn" type="button" data-delivery-active-toggle="${esc(key)}" aria-expanded="${open?'true':'false'}"><span>${open?'⌄':'›'}</span></button><div class="history-batch-summary"><div class="client-title">${title}</div><div class="client-sub">${g.items.length} cliente(s) asignado(s) · consulta operativa del viaje</div><div class="badges"><span class="badge info">Total ${money(g.total)}</span><span class="badge ok">Solo lectura</span>${tripResponsibleBadge(g.items[0]?.delivery_nombre||'')}</div></div></div>${open?`<div class="operational-lot-body delivery-lot-body">${rows}</div>`:''}</article>`;
}
function renderDelivery(c){
  const names=activeDeliveryNames();
  const filter=selectedDeliveryFilter();
  if(!state.deliveryFiltro&&filter) state.deliveryFiltro=filter;
  const canSelect=deliveryCanSelect();
  const historyAllowed=isAdminRole()||puede('liquidacion');
  if(historyAllowed && state.deliveryTab==='historial'){
    const section=buildHistorySection('delivery',filter);
    c.innerHTML=`<div class="panel"><div class="panel-head"><div><h3>Historial administrativo del delivery</h3><p>Viajes liquidados con fechas dominicanas, lotes plegables y búsqueda completa.</p></div>${canSelect?`<select id="deliveryFiltro" style="max-width:280px"><option value="">Selecciona responsable</option>${names.map(n=>`<option ${n===filter?'selected':''}>${esc(n)}</option>`).join('')}</select>`:`<div class="badge info">${esc(filter||'Tu usuario')}</div>`}</div><div class="tabs delivery-tabs-v934"><button class="tab" data-delivery-tab="activos">Viajes asignados</button><button class="tab active" data-delivery-tab="historial">Historial</button></div>${section.html}</div>`;
    const sel=$('#deliveryFiltro',c); if(sel) sel.onchange=e=>{state.deliveryFiltro=e.target.value;state.deliveryHistoryLimit=10;renderDelivery($('#content'));};
    $$('[data-delivery-tab]',c).forEach(b=>b.onclick=()=>{state.deliveryTab=b.dataset.deliveryTab;renderDelivery($('#content'));});
    bindHistorySection(c,'delivery',filter,section.rows,()=>renderDelivery($('#content')));
    return;
  }
  const base=state.ordenes.filter(o=>!isStorePickup(o) && o.delivery_nombre===filter && !o.recibido_en && ['Asignada a delivery','En ruta','Validada para delivery','Cobrado','Entregado a crédito','No entregado','Devuelto parcial'].includes(o.estado));
  const q=state.deliverySearch||''; const orders=base.filter(o=>matchOrder(o,q));
  const groups=buildOperationalLotGroups(orders,batchCodeFromOrder,orderMonto,()=>false); const forceOpen=Boolean(String(q).trim()); const keys=groups.map(g=>lotUiKey('delivery-active',g.displayCode,g.key));
  const metrics=deliveryReadOnlyMetrics(groups,base);
  c.innerHTML=`<div class="panel"><div class="panel-head"><div><h3>Delivery consultivo · viajes asignados</h3><p>Consulta clientes, teléfonos, sectores, productos y montos. Los resultados y el dinero se registran únicamente en Liquidación / CXC.</p></div>${canSelect?`<select id="deliveryFiltro" style="max-width:280px"><option value="">Selecciona responsable</option>${names.map(n=>`<option ${n===filter?'selected':''}>${esc(n)}</option>`).join('')}</select>`:`<div class="badge info">${esc(filter||'Tu usuario')}</div>`}</div>${historyAllowed?`<div class="tabs delivery-tabs-v934"><button class="tab active" data-delivery-tab="activos">Viajes asignados</button><button class="tab" data-delivery-tab="historial">Historial</button></div>`:''}<div class="lock-alert ok"><b>Solo consulta:</b> el delivery no tiene que marcar ruta, cobros, créditos ni resultados desde el celular.</div><div class="grid4 compact-kpis"><div class="card kpi"><div class="label">Viajes abiertos</div><div class="value">${metrics.openTrips}</div></div><div class="card kpi"><div class="label">Clientes asignados</div><div class="value">${metrics.clients}</div></div><div class="card kpi"><div class="label">Total facturas</div><div class="value">${money(metrics.total)}</div></div><div class="card kpi"><div class="label">Viaje más antiguo</div><div class="value">${metrics.oldestMinutes?metrics.oldestMinutes+' min':'—'}</div></div></div><div class="searchbar"><input id="deliverySearch" value="${esc(q)}" placeholder="Buscar nombre del cliente..."></div><div class="history-list-actions"><button class="btn small gray" data-delivery-expand-all>Expandir todos</button><button class="btn small gray" data-delivery-collapse-all>Ocultar todos</button></div><div class="liq-batch-list operational-lot-list">${groups.map((g,i)=>deliveryActiveGroupCard(g,i,forceOpen)).join('')||'<div class="empty">No hay viajes abiertos asignados a este delivery con esa búsqueda.</div>'}</div></div>`;
  const sel=$('#deliveryFiltro',c); if(sel) sel.onchange=e=>{state.deliveryFiltro=e.target.value; renderDelivery($('#content'));};
  const search=$('#deliverySearch',c); if(search) search.oninput=e=>{ const pos=e.target.selectionStart||e.target.value.length; state.deliverySearch=e.target.value; renderDelivery($('#content')); focusAfterRender('deliverySearch',pos); };
  $$('[data-delivery-tab]',c).forEach(b=>b.onclick=()=>{state.deliveryTab=b.dataset.deliveryTab;renderDelivery($('#content'));});
  $$('[data-delivery-active-toggle]',c).forEach(b=>b.onclick=()=>{const key=b.dataset.deliveryActiveToggle;setHistoryOpen('deliveryActive',key,!historyIsOpen('deliveryActive',key));renderDelivery(c);});
  $('[data-delivery-expand-all]',c)?.addEventListener('click',()=>{setOperationalKeysOpen('deliveryActive',keys,true);renderDelivery(c);});
  $('[data-delivery-collapse-all]',c)?.addEventListener('click',()=>{setOperationalKeysOpen('deliveryActive',keys,false);renderDelivery(c);});
  bindDynamic();
}
function batchDateFromCode(code){
  const m=String(code||'').match(/LOT-(\d{2})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})/);
  if(!m) return '';
  const y=2000+Number(m[1]), mo=Number(m[2])-1, d=Number(m[3]), h=Number(m[4]), mi=Number(m[5]), se=Number(m[6]);
  const dt=new Date(y,mo,d,h,mi,se);
  return isNaN(dt.getTime())?'':dt.toLocaleString('es-DO',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
}
function liquidacionBatchGroups(orders){
  const map=new Map();
  orders.forEach(o=>{
    const code=batchCodeFromOrder(o)||'SIN-LOTE';
    if(!map.has(code)) map.set(code,[]);
    map.get(code).push(o);
  });
  return [...map.entries()].map(([code,items])=>({code,items,summary:deliveryMoneySummary(items),date:code==='SIN-LOTE'?'Órdenes individuales / anteriores':batchDateFromCode(code)})).sort((a,b)=>{
    if(a.code==='SIN-LOTE') return 1;
    if(b.code==='SIN-LOTE') return -1;
    return String(a.code).localeCompare(String(b.code));
  });
}

function deliveryPendingPanelData(){
  return buildPendingDeliveryPanel(state.entregaLotes||[],state.entregaLoteDetalle||[],state.ordenes||[]);
}
function pendingAgeLabel(minutes=0){
  const m=Math.max(0,Number(minutes||0));
  if(m<60) return `${m} min`;
  const h=Math.floor(m/60), rem=m%60;
  return rem?`${h} h ${rem} min`:`${h} h`;
}
function pendingPanelTone(minutes=0,partial=false){
  if(partial) return 'partial';
  if(Number(minutes)>=180) return 'late';
  if(Number(minutes)>=90) return 'warn';
  return 'ok';
}
function deliveryPendingPanelHtml(rows,selected=''){
  const allLots=rows.reduce((s,r)=>s+r.lots,0), allClients=rows.reduce((s,r)=>s+r.pendingClients,0), allAmount=rows.reduce((s,r)=>s+r.pendingAmount,0);
  const all=`<button class="delivery-pending-card-v937 all ${!selected?'selected':''}" type="button" data-liq-delivery-panel=""><b>Todos los responsables</b><span>${allLots} viaje(s) · ${allClients} cliente(s)</span><strong>${money(allAmount)}</strong></button>`;
  const cards=rows.map(r=>`<button class="delivery-pending-card-v937 ${pendingPanelTone(r.oldestMinutes,r.partialLots>0)} ${selected===r.delivery?'selected':''}" type="button" data-liq-delivery-panel="${esc(r.delivery)}"><b>${esc(r.delivery)}</b><span>${r.lots} viaje(s) · ${r.pendingClients} cliente(s) pendiente(s)</span><strong>${money(r.pendingAmount)}</strong><small>Más antiguo: ${pendingAgeLabel(r.oldestMinutes)}${r.partialLots?` · ${r.partialLots} parcial(es)`:''}</small></button>`).join('');
  return `<section class="delivery-pending-panel-v937"><div class="delivery-pending-panel-head"><div><b>Responsables con viajes pendientes de entregar</b><span>Selecciona un responsable para filtrar Liquidación.</span></div><span class="badge info">${allLots} viaje(s) abierto(s)</span></div><div class="delivery-pending-strip-v937">${all}${cards||'<div class="empty compact">No hay viajes pendientes.</div>'}</div></section>`;
}
function lotProgressFromGroup(g){
  const lot=batchRecordByCode(g.code);
  const original=Number(lot?.cantidad_ordenes||g.items.length);
  const pending=g.items.length;
  return {lot,original,pending,received:Math.max(original-pending,0),partial:original>pending};
}
async function receiveOrderCxcV937(o,payload){
  if(!state.v937SchemaOk) throw new Error('Primero ejecuta el SQL 30 de la V9.3.7 en Supabase.');
  const {data,error}=await sb.rpc('recibir_orden_cxc_v9393',{
    p_orden_id:Number(o.id),
    p_resultado:payload.result,
    p_monto_recibido:Number(payload.cash||0),
    p_metodo:payload.method||'Efectivo',
    p_recibido_por:payload.receivedBy||currentWorkerName(),
    p_observacion:payload.note||null
  });
  if(error) throw error;
  return data;
}
async function receiveBatchCxcV9392R2(g,payload){
  if(!state.v937SchemaOk) throw new Error('Primero ejecuta los SQL 30, 45 y 46 en Supabase.');
  const lot=batchRecordByCode(g.code);
  if(!lot?.id) throw new Error('No se encontró el lote formal. Actualiza la pantalla.');
  const {data,error}=await sb.rpc('recibir_lote_cxc_v9393',{
    p_lote_id:Number(lot.id),
    p_items:payload.items,
    p_recibido_por:payload.receivedBy||currentWorkerName(),
    p_observacion:payload.note||null
  });
  if(error) throw error;
  return data;
}
async function consolidateDuplicateLiquidations(code){
  if(!state.v937SchemaOk) return alert('Primero ejecuta el SQL 30 de la V9.3.7 en Supabase.');
  const reason=prompt(`Motivo para consolidar las liquidaciones duplicadas de ${code}:`,'Duplicación accidental detectada en el historial.');
  if(reason===null) return;
  if(String(reason).trim().length<5) return alert('Escribe un motivo de al menos 5 caracteres.');
  const {data,error}=await sb.rpc('consolidar_liquidaciones_duplicadas_v937',{p_codigo_lote:code,p_motivo:reason.trim(),p_usuario_nombre:currentWorkerName()});
  if(error) return alert(error.message);
  await refreshVisibleModuleV9384(); render(); toast(data?.duplicados_eliminados?`Duplicados consolidados: ${data.duplicados_eliminados}`:'El lote ya estaba consolidado.');
}

function liquidacionBatchCard(g,index=0,forceOpen=false){
  const title=g.code==='SIN-LOTE'?'Órdenes sin lote registrado':g.code;
  const progress=lotProgressFromGroup(g);
  const estadoLote=progress.lot?.estado || (progress.partial?'Recibido parcial':'Abierto');
  const key=lotUiKey('liquidacion-pending',g.code,g.code); const open=operationalLotOpen('liquidacionPending',key,index,forceOpen);
  const rows=g.items.map(o=>`<div class="liq-order-row ${newOrderClass(o,'liquidacion')}"><div><b>${esc(orderClientName(o))}</b><small>${esc(o.codigo)} · ${money(o.total_factura||o.total_estimado)} · ${esc(orderClientPhone(o))}</small><div class="badges">${newOrderBadge(o,'liquidacion')}${stageClockBadge(o,'liquidacion')}<span class="badge info">Por cotejar en CXC</span>${orderBatchBadge(o)}</div><div class="mini-items">${orderItemsText(o,5)}</div></div><div class="card-actions"><button class="btn small" data-liquidate-order="${o.id}">Recibir cliente</button><button class="btn small gray" data-oper-order="${o.id}">Ver</button></div></div>`).join('');
  return `<div class="liq-batch-card operational-lot-card ${open?'is-open':'is-collapsed'}"><div class="liq-batch-head operational-lot-head"><button class="history-toggle-btn" type="button" data-liq-pending-toggle="${esc(key)}" aria-expanded="${open?'true':'false'}"><span>${open?'⌄':'›'}</span></button><div class="history-batch-summary"><div class="client-title">${esc(title)}</div><div class="client-sub">${esc(g.date||'')} · ${progress.pending} de ${progress.original} cliente(s) pendientes · Estado: ${esc(estadoLote)}</div><div class="badges"><span class="badge info">Por cotejar ${money(g.summary.total)}</span>${progress.received?`<span class="badge ok">Recibidos ${progress.received}</span>`:''}<span class="badge ${progress.partial?'info':'warn'}">${progress.partial?'Recepción parcial':'Pendiente'}</span></div></div><div class="card-actions history-card-actions"><button class="btn small gray" data-print-liq-batch="${esc(g.code)}">Imprimir lote</button><button class="btn small" data-close-liq-batch="${esc(g.code)}">Recibir pendientes</button></div></div>${open?`<div class="liq-batch-body operational-lot-body">${rows}</div>`:''}</div>`;
}

function historyLotItems(l){
  if(Array.isArray(l?.items) && l.items.length) return l.items;
  const ids=new Set((l?.liquidation_ids||[l?.id]).filter(x=>x!==undefined&&x!==null).map(String));
  const detalle=(state.liquidacionLoteDetalle||[]).filter(d=>ids.has(String(d.liquidacion_id)));
  if(detalle.length){
    const unique=new Map();
    detalle.forEach(d=>{
      const key=String(d.orden_id||d.codigo_orden||d.id);
      if(!unique.has(key) || Number(d.id||0)>Number(unique.get(key)?.id||0)) unique.set(key,d);
    });
    return [...unique.values()].map(d=>{
      const current=(state.ordenes||[]).find(o=>String(o.id)===String(d.orden_id));
      return {...(current||{}),codigo:current?.codigo||d.codigo_orden||d.orden_id,cliente:current?.cliente||{negocio:d.cliente_nombre||''},resultado_entrega:d.resultado_entrega||current?.resultado_entrega,total_factura:Number(d.total_factura||current?.total_factura||0),monto_cobrado:Number(d.monto_cobrado||current?.monto_cobrado||0),monto_pendiente:Number(d.monto_credito||current?.monto_pendiente||0),id:d.orden_id};
    });
  }
  return ordersForBatch(l?.codigo_lote);
}
function orderDeliveryEvidenceDate(o){
  if(!o) return '';
  const direct=o.validado_en||o.asignado_delivery_en||o.entregado_delivery_en||'';
  if(direct) return direct;
  const hist=(state.historialEstados||[]).filter(h=>String(h.orden_id)===String(o.id) && ['Validada para delivery','Asignada a delivery','En ruta'].includes(h.estado_nuevo)).sort((a,b)=>String(a.creado_en||'').localeCompare(String(b.creado_en||'')));
  return hist[0]?.creado_en||'';
}
function historyDeliveryDate(l,items=[]){
  if(l?.fecha_entrega) return l.fecha_entrega;
  const code=String(l?.codigo_lote||'');
  const lot=(state.entregaLotes||[]).find(x=>code && code!=='SIN-LOTE' && String(x.codigo_lote||'').toUpperCase()===code.toUpperCase());
  const snap=normalizeRouteSnapshot(lot?.hoja_ruta_snapshot);
  if(snap?.fecha_entrega) return snap.fecha_entrega;
  if(lot?.fecha_entrega||lot?.creado_en) return lot.fecha_entrega||lot.creado_en;
  const dates=(items||[]).map(orderDeliveryEvidenceDate).filter(Boolean).sort();
  return dates[0]||'';
}
function historyFilteredRows(scope,filter){
  const keys=historyScopeKeys(scope), from=state[keys.from]||today(), to=state[keys.to]||today(), q=state[keys.search]||'';
  return liquidationHistoryRows(filter,from,to).filter(l=>{
    if(!q) return true;
    const items=historyLotItems(l);
    return norm(l.codigo_lote).includes(norm(q)) || norm(l.delivery_nombre).includes(norm(q)) || items.some(o=>matchOrder(o,q));
  });
}
function historyTotals(rows){
  return (rows||[]).reduce((a,l)=>({lotes:a.lotes+1,pedidos:a.pedidos+Number(l.cantidad_ordenes||historyLotItems(l).length),fact:a.fact+Number(l.total_facturado||0),cash:a.cash+Number(l.efectivo_recibido||l.efectivo_reportado||0),cred:a.cred+Number(l.credito_pendiente||0),diff:a.diff+Number(l.diferencia||0)}),{lotes:0,pedidos:0,fact:0,cash:0,cred:0,diff:0});
}
function historyVisualCode(l){ return String(l?.codigo_lote||'').toUpperCase()==='SIN-LOTE'||!l?.codigo_lote?'SIN-LOTE':l.codigo_lote; }
function liquidacionHistoryCard(l,scope='liquidacion'){
  const items=historyLotItems(l), key=historyRowKey(l), open=historyIsOpen(scope,key), code=historyVisualCode(l);
  const delivered=historyDeliveryDate(l,items), liquidated=l.fecha_liquidacion||l.creado_en||'';
  const duplicateCount=Number(l.duplicate_count||1);
  const rows=open?items.map(o=>`<div class="liq-order-row history-compact-order"><div><b>${esc(orderClientName(o)||o.cliente_nombre||'Cliente')}</b><small>${esc(o.codigo||o.codigo_orden||('ORD-'+(o.orden_id||o.id||'')))} · ${esc(o.resultado_entrega||o.estado||'')} · Total ${money(o.total_factura||o.total_estimado||0)}</small><div class="badges"><span class="badge ok">Cobrado ${money(o.monto_cobrado||0)}</span>${Number(o.monto_pendiente||o.monto_credito||0)?`<span class="badge warn">Crédito ${money(o.monto_pendiente||o.monto_credito||0)}</span>`:''}</div></div><div class="card-actions">${o.id?`<button class="btn small gray" data-oper-order="${o.id}">Ver</button>`:''}</div></div>`).join(''):'';
  return `<article class="liq-batch-card closed history-batch-card ${open?'is-open':'is-collapsed'}" data-history-card="${esc(key)}"><div class="liq-batch-head history-batch-head"><button class="history-toggle-btn" type="button" data-history-toggle="${esc(key)}" aria-expanded="${open?'true':'false'}" title="${open?'Ocultar lote':'Mostrar lote'}"><span>${open?'⌄':'›'}</span></button><div class="history-batch-summary"><div class="client-title">${esc(code)} · ${esc(l.delivery_nombre||'')}</div><div class="client-sub">Entregado: ${delivered?businessDateTime(delivered):'—'} · Liquidado: ${liquidated?businessDateTime(liquidated):'—'} · ${Number(l.cantidad_ordenes||items.length)} orden(es)</div><div class="badges"><span class="badge info">Facturas ${money(l.total_facturado||items.reduce((s,o)=>s+orderMonto(o),0))}</span><span class="badge ok">Efectivo ${money(l.efectivo_recibido||l.efectivo_reportado||0)}</span><span class="badge warn">Crédito ${money(l.credito_pendiente||0)}</span>${Number(l.no_entregado||0)?`<span class="badge bad">No entregado ${money(l.no_entregado)}</span>`:''}<span class="badge ${Math.abs(Number(l.diferencia||0))>0.01?'bad':'ok'}">Diferencia ${money(l.diferencia||0)}</span>${duplicateCount>1?`<span class="badge bad">Duplicado detectado ×${duplicateCount}</span>`:''}</div></div><div class="card-actions history-card-actions"><button class="btn small gray" data-print-history-key="${esc(key)}">Reimprimir recibo</button>${duplicateCount>1&&scope==='liquidacion'?`<button class="btn small danger" data-consolidate-duplicate="${esc(code)}">Consolidar duplicados</button>`:''}</div></div>${open?`<div class="liq-batch-body history-batch-body">${rows||'<div class="empty history-empty">No hay detalle formal disponible para este lote.</div>'}</div>`:''}</article>`;
}
function buildHistorySection(scope,filter){
  const keys=historyScopeKeys(scope), from=state[keys.from]||today(), to=state[keys.to]||today(), search=state[keys.search]||'';
  const rows=historyFilteredRows(scope,filter), totals=historyTotals(rows), limit=Math.max(10,Number(state[keys.limit]||10)), visible=rows.slice(0,limit);
  const prefix=scope==='delivery'?'delivery':'liq';
  const kpis=scope==='delivery'
    ? `<div class="grid4 compact-kpis history-kpis-v934"><div class="card kpi"><div class="label">Viajes</div><div class="value">${totals.lotes}</div></div><div class="card kpi"><div class="label">Pedidos</div><div class="value">${totals.pedidos}</div></div><div class="card kpi"><div class="label">Facturado</div><div class="value">${money(totals.fact)}</div></div><div class="card kpi"><div class="label">Efectivo</div><div class="value">${money(totals.cash)}</div></div></div>`
    : `<div class="grid4 compact-kpis history-kpis-v934"><div class="card kpi"><div class="label">Lotes cerrados</div><div class="value">${totals.lotes}</div></div><div class="card kpi"><div class="label">Total facturado</div><div class="value">${money(totals.fact)}</div></div><div class="card kpi"><div class="label">Efectivo recibido</div><div class="value">${money(totals.cash)}</div></div><div class="card kpi"><div class="label">Crédito</div><div class="value">${money(totals.cred)}</div></div></div>`;
  const html=`<div class="history-quick-v934"><button class="btn small gray" data-history-preset="hoy">Hoy</button><button class="btn small gray" data-history-preset="ayer">Ayer</button><button class="btn small gray" data-history-preset="7dias">7 días</button><button class="btn small gray" data-history-preset="mes">Este mes</button></div><div class="history-toolbar-v934"><div class="field"><label>Desde</label><input type="date" id="${prefix}HistFrom" value="${esc(from)}"></div><div class="field"><label>Hasta</label><input type="date" id="${prefix}HistTo" value="${esc(to)}"></div><div class="field history-search-field"><label>Buscar</label><input id="${prefix}HistorySearch" value="${esc(search)}" placeholder="Cliente, lote, factura u orden..."></div><div class="batch-actions"><button class="btn gray" data-history-print="1">Imprimir historial</button></div></div><div class="history-range-summary">${esc(historyRangeLabel(from,to))} · Mostrando ${Math.min(visible.length,rows.length)} de ${rows.length} lote(s)</div>${kpis}<div class="history-list-actions"><button class="btn small gray" data-history-expand-all="1">Expandir todos</button><button class="btn small gray" data-history-collapse-all="1">Ocultar todos</button></div><div class="liq-batch-list history-list-v934">${visible.map(l=>liquidacionHistoryCard(l,scope)).join('')||'<div class="empty">No hay liquidaciones cerradas en ese rango.</div>'}</div>${rows.length>visible.length?`<div class="history-more-wrap"><button class="btn gray" data-history-more="1">Mostrar 10 más (${visible.length} de ${rows.length})</button></div>`:''}`;
  return {html,rows,from,to};
}
function bindHistorySection(c,scope,filter,rows,rerender){
  const keys=historyScopeKeys(scope), prefix=scope==='delivery'?'delivery':'liq';
  const from=$(`#${prefix}HistFrom`,c), to=$(`#${prefix}HistTo`,c), search=$(`#${prefix}HistorySearch`,c);
  if(from) from.onchange=e=>{state[keys.from]=e.target.value||today();state[keys.limit]=10;rerender();};
  if(to) to.onchange=e=>{state[keys.to]=e.target.value||today();state[keys.limit]=10;rerender();};
  if(search) search.oninput=e=>{const pos=e.target.selectionStart||e.target.value.length;state[keys.search]=e.target.value;state[keys.limit]=10;rerender();focusAfterRender(`${prefix}HistorySearch`,pos);};
  $$('[data-history-preset]',c).forEach(b=>b.onclick=()=>{applyHistoryPreset(scope,b.dataset.historyPreset);rerender();});
  $$('[data-history-toggle]',c).forEach(b=>b.onclick=()=>{const key=b.dataset.historyToggle;setHistoryOpen(scope,key,!historyIsOpen(scope,key));rerender();});
  const expand=$('[data-history-expand-all]',c); if(expand) expand.onclick=()=>{setHistoryRowsOpen(scope,rows,true);rerender();};
  const collapse=$('[data-history-collapse-all]',c); if(collapse) collapse.onclick=()=>{setHistoryRowsOpen(scope,rows,false);rerender();};
  const more=$('[data-history-more]',c); if(more) more.onclick=()=>{state[keys.limit]=Number(state[keys.limit]||10)+10;rerender();};
  const print=$('[data-history-print]',c); if(print) print.onclick=()=>printHistorySummary(filter,rows,state[keys.from],state[keys.to]);
  $$('[data-print-history-key]',c).forEach(b=>b.onclick=()=>{const l=rows.find(x=>historyRowKey(x)===b.dataset.printHistoryKey);if(l) printLiquidationReceipt(l.delivery_nombre,historyVisualCode(l),historyLotItems(l),{efectivo_recibido:l.efectivo_recibido||l.efectivo_reportado,recibido_por:l.recibido_por||'',observacion:l.observacion||''},false);});
  $$('[data-consolidate-duplicate]',c).forEach(b=>b.onclick=()=>consolidateDuplicateLiquidations(b.dataset.consolidateDuplicate));
  try{bindDynamic();}catch(err){console.error('bindHistorySection',err);}
}
function cxcTabsHtml(active='pendientes'){
  const tabs=[
    ['pendientes','Pendientes de liquidación'],
    ['cxc','Cuentas por cobrar'],
    ['historial','Historial de liquidaciones'],
    ['cxc_historial','Historial de cobros']
  ];
  return `<div class="tabs cxc-tabs-v940">${tabs.map(([id,label])=>`<button class="tab ${active===id?'active':''}" data-liqtab="${id}">${label}</button>`).join('')}</div>`;
}
function cxcFilteredRows(){
  const q=norm(state.cxcSearch||'');
  return (state.cxcSaldos||[]).filter(row=>{
    const balance=Number(row.saldo_pendiente||0);
    const late=Number(row.dias_atraso||0)>0 && balance>0.01;
    if(state.cxcStatusFilter==='Pendientes' && balance<=0.01) return false;
    if(state.cxcStatusFilter==='Vencidas' && !late) return false;
    if(state.cxcStatusFilter==='Pagadas' && balance>0.01) return false;
    if(state.cxcAgingFilter!=='Todas' && row.antiguedad!==state.cxcAgingFilter) return false;
    if(!q) return true;
    return norm([
      row.cliente_nombre,row.cliente_codigo,row.cliente_telefono,
      row.orden_codigo,row.factura_no,row.estado_cxc,row.antiguedad
    ].join(' ')).includes(q);
  });
}
function cxcAccountCard(group){
  const openRows=group.rows.filter(row=>Number(row.saldo_pendiente||0)>0.01);
  const oldest=Math.max(...group.rows.map(row=>Number(row.dias_atraso||0)),0);
  const orders=group.rows.map(row=>{
    const balance=Number(row.saldo_pendiente||0);
    const tone=balance<=0.01?'ok':Number(row.dias_atraso||0)>0?'bad':'warn';
    return `<div class="cxc-invoice-row-v940">
      <div><b>${esc(row.factura_no||row.orden_codigo||'Factura')}</b><small>${esc(row.orden_codigo||'')} · Crédito ${money(row.saldo_inicial_cxc||0)} · Abonado ${money(row.abonado_cxc||0)}</small></div>
      <div><span class="badge ${tone}">${esc(row.antiguedad||row.estado_cxc||'')}</span><small>Vence ${shortDate(row.cxc_vencimiento)}${Number(row.dias_atraso||0)>0?` · ${Number(row.dias_atraso)} día(s)`:''}</small></div>
      <div class="cxc-balance-cell"><small>Saldo</small><strong>${money(balance)}</strong></div>
      <div class="card-actions"><button class="btn small gray" data-cxc-due="${row.orden_id}">Vencimiento</button></div>
    </div>`;
  }).join('');
  return `<details class="cxc-account-card-v940">
    <summary><div><b>${esc(group.cliente_nombre)}</b><small>${esc(group.cliente_codigo||'')} · ${esc(group.cliente_telefono||'')} · ${group.rows.length} factura(s)</small></div><div class="badges"><span class="badge warn">Saldo ${money(group.saldo)}</span>${group.vencido>0?`<span class="badge bad">Vencido ${money(group.vencido)}</span>`:'<span class="badge ok">Al día</span>'}${oldest>0?`<span class="badge bad">${oldest} días</span>`:''}</div></summary>
    <div class="cxc-account-body-v940">${orders}<div class="actions cxc-account-actions-v940">${openRows.length&&puede('liquidacion',true)?`<button class="btn" data-cxc-pay="${esc(group.key)}">Registrar cobro</button>`:''}<button class="btn gray" data-cxc-client="${group.cliente_id||''}" ${group.cliente_id?'':'disabled'}>Ver cliente</button></div></div>
  </details>`;
}
function cxcSchemaWarning(){
  return `<div class="panel"><div class="lock-alert warn"><b>Cuentas por cobrar todavía no está habilitado.</b><br>Ejecuta el SQL 51 de la V9.4.0 en Supabase y luego pulsa Actualizar.</div>${cxcTabsHtml(state.liquidacionTab)}</div>`;
}
function bindCxcNavigation(c){
  $$('[data-liqtab]',c).forEach(b=>b.onclick=async()=>{
    state.liquidacionTab=b.dataset.liqtab;
    if(['cxc','cxc_historial'].includes(state.liquidacionTab)) await ensureCxcDataV940();
    setupLiveUpdates();
    renderLiquidacion($('#content'));
  });
}
function renderCxcAccounts(c){
  if(!state.cxcSchemaOk){c.innerHTML=cxcSchemaWarning();bindCxcNavigation(c);return;}
  const filtered=cxcFilteredRows();
  const groups=groupCxcAccounts(filtered);
  const summary=cxcPortfolioSummary((state.cxcSaldos||[]).filter(row=>Number(row.saldo_pendiente||0)>0.01));
  c.innerHTML=`<div class="panel"><div class="panel-head"><div><h3>Cuentas por cobrar</h3><p>Cartera separada del flujo operativo, con saldos por factura, vencimiento y antigüedad.</p></div><button class="btn gray" id="refreshCxcV940">Actualizar cartera</button></div>
  ${cxcTabsHtml('cxc')}
  <div class="grid4 compact-kpis"><div class="card kpi"><div class="label">Clientes con saldo</div><div class="value">${summary.clientes}</div></div><div class="card kpi"><div class="label">Facturas abiertas</div><div class="value">${summary.facturas}</div></div><div class="card kpi"><div class="label">Total por cobrar</div><div class="value">${money(summary.saldo)}</div></div><div class="card kpi"><div class="label">Total vencido</div><div class="value">${money(summary.vencido)}</div></div></div>
  <div class="cxc-toolbar-v940"><div class="field"><label>Buscar</label><input id="cxcSearch" value="${esc(state.cxcSearch||'')}" placeholder="Cliente, factura u orden..."></div><div class="field"><label>Estado</label><select id="cxcStatus"><option ${state.cxcStatusFilter==='Pendientes'?'selected':''}>Pendientes</option><option ${state.cxcStatusFilter==='Vencidas'?'selected':''}>Vencidas</option><option ${state.cxcStatusFilter==='Pagadas'?'selected':''}>Pagadas</option><option ${state.cxcStatusFilter==='Todas'?'selected':''}>Todas</option></select></div><div class="field"><label>Antigüedad</label><select id="cxcAging"><option ${state.cxcAgingFilter==='Todas'?'selected':''}>Todas</option><option ${state.cxcAgingFilter==='Al día'?'selected':''}>Al día</option><option ${state.cxcAgingFilter==='1-30 días'?'selected':''}>1-30 días</option><option ${state.cxcAgingFilter==='31-60 días'?'selected':''}>31-60 días</option><option ${state.cxcAgingFilter==='+60 días'?'selected':''}>+60 días</option><option ${state.cxcAgingFilter==='Pagado'?'selected':''}>Pagado</option></select></div></div>
  <div class="lock-alert ok"><b>Aplicación controlada:</b> puedes distribuir el cobro manualmente por factura o usar “más antiguas primero”. El sistema no permite cobrar por encima del saldo.</div>
  <div class="cxc-account-list-v940">${groups.map(cxcAccountCard).join('')||'<div class="empty">No hay cuentas que coincidan con los filtros.</div>'}</div></div>`;
  bindCxcNavigation(c);
  $('#refreshCxcV940',c).onclick=async()=>{await ensureCxcDataV940(true);renderLiquidacion(c);toast('Cartera actualizada');};
  const search=$('#cxcSearch',c); search.oninput=e=>{const pos=e.target.selectionStart||e.target.value.length;state.cxcSearch=e.target.value;renderLiquidacion(c);focusAfterRender('cxcSearch',pos);};
  $('#cxcStatus',c).onchange=e=>{state.cxcStatusFilter=e.target.value;renderLiquidacion(c);};
  $('#cxcAging',c).onchange=e=>{state.cxcAgingFilter=e.target.value;renderLiquidacion(c);};
  $$('[data-cxc-pay]',c).forEach(b=>b.onclick=()=>{
    const group=groupCxcAccounts(state.cxcSaldos||[]).find(x=>x.key===b.dataset.cxcPay);
    if(group) openCxcPaymentModal(group);
  });
  $$('[data-cxc-due]',c).forEach(b=>b.onclick=()=>{
    const row=(state.cxcSaldos||[]).find(x=>String(x.orden_id)===String(b.dataset.cxcDue));
    if(row) updateCxcDueDate(row);
  });
  $$('[data-cxc-client]',c).forEach(b=>b.onclick=()=>{
    const client=(state.clientes||[]).find(x=>String(x.id)===String(b.dataset.cxcClient));
    if(client) openClientFicha(client);
  });
}
function cxcApplicationsForReceipt(cobroId){
  return (state.cxcAplicaciones||[]).filter(a=>String(a.cobro_id)===String(cobroId));
}
function cxcReceiptOrderRow(orderId){
  return (state.cxcSaldos||[]).find(row=>String(row.orden_id)===String(orderId))||{};
}
function printCxcReceipt(cobro,applications=[],auto=true){
  const rows=(applications||[]).map(app=>{
    const order=cxcReceiptOrderRow(app.orden_id);
    return `<tr><td>${esc(order.factura_no||order.orden_codigo||app.orden_id)}</td><td>${shortDate(order.cxc_vencimiento||app.vencimiento)}</td><td>${money(app.saldo_antes)}</td><td>${money(app.monto_aplicado||app.monto)}</td><td>${money(app.saldo_despues)}</td></tr>`;
  }).join('');
  const total=(applications||[]).reduce((s,a)=>s+Number(a.monto_aplicado||a.monto||0),0);
  const html=`<!doctype html><html><head><meta charset="utf-8"><title>${esc(cobro.numero_recibo||'Recibo CXC')}</title><style>body{font-family:Arial,sans-serif;font-size:12px;color:#111;padding:20px}table{width:100%;border-collapse:collapse;margin-top:12px}th,td{border:1px solid #bbb;padding:7px;text-align:left}th{background:#e8eef7}.box{border:1px solid #999;border-radius:8px;padding:10px;margin:10px 0}.total{font-size:16px;font-weight:bold}@media print{button{display:none}}</style></head><body>${printCompanyHeader('Recibo de cobro CXC','Cobro posterior aplicado a facturas')}<div class="box"><b>Recibo:</b> ${esc(cobro.numero_recibo||'—')}<br><b>Cliente:</b> ${esc(cobro.cliente_nombre||'—')}<br><b>Fecha:</b> ${businessDateTime(cobro.fecha_cobro||new Date())}<br><b>Método:</b> ${esc(cobro.metodo||'—')}${cobro.referencia?`<br><b>Referencia:</b> ${esc(cobro.referencia)}`:''}<br><b>Recibido por:</b> ${esc(cobro.recibido_por||'—')}</div><p class="total">Monto recibido: ${money(cobro.monto_total||total)}</p><table><thead><tr><th>Factura / orden</th><th>Vencimiento</th><th>Saldo anterior</th><th>Aplicado</th><th>Saldo restante</th></tr></thead><tbody>${rows}<tr><th colspan="3">Total aplicado</th><th>${money(total)}</th><th></th></tr></tbody></table>${cobro.observacion?`<p><b>Observación:</b> ${esc(cobro.observacion)}</p>`:''}${signatureHtml('Firma recibido por CXC')}${signatureHtml('Firma / constancia del cliente')}${printFooterHtml()}<button onclick="window.print()">Imprimir</button>${auto?'<script>setTimeout(()=>window.print(),400)<\/script>':''}</body></html>`;
  const w=window.open('','_blank','width=900,height=750');
  if(!w) return alert('El navegador bloqueó la ventana de impresión.');
  w.document.open();w.document.write(html);w.document.close();
}
function renderCxcHistory(c){
  if(!state.cxcSchemaOk){c.innerHTML=cxcSchemaWarning();bindCxcNavigation(c);return;}
  const q=norm(state.cxcHistorySearch||'');
  const rows=(state.cxcCobros||[]).filter(r=>!q||norm([r.numero_recibo,r.cliente_nombre,r.metodo,r.referencia,r.recibido_por,r.estado].join(' ')).includes(q));
  const visible=rows.slice(0,Math.max(20,Number(state.cxcHistoryLimit||20)));
  const active=rows.filter(r=>r.estado==='Activo');
  const collected=active.reduce((s,r)=>s+Number(r.monto_total||0),0);
  c.innerHTML=`<div class="panel"><div class="panel-head"><div><h3>Historial de cobros CXC</h3><p>Recibos numerados, facturas aplicadas y reversiones conservadas.</p></div></div>${cxcTabsHtml('cxc_historial')}<div class="grid3 compact-kpis"><div class="card kpi"><div class="label">Recibos activos</div><div class="value">${active.length}</div></div><div class="card kpi"><div class="label">Cobrado</div><div class="value">${money(collected)}</div></div><div class="card kpi"><div class="label">Reversados</div><div class="value">${rows.filter(r=>r.estado==='Reversado').length}</div></div></div><div class="searchbar"><input id="cxcHistorySearch" value="${esc(state.cxcHistorySearch||'')}" placeholder="Recibo, cliente, método o referencia..."></div><div class="cxc-receipt-list-v940">${visible.map(r=>{
    const apps=cxcApplicationsForReceipt(r.id);
    return `<article class="cxc-receipt-card-v940 ${r.estado==='Reversado'?'reversed':''}"><div><b>${esc(r.numero_recibo)}</b><small>${businessDateTime(r.fecha_cobro)} · ${esc(r.cliente_nombre)} · ${esc(r.metodo)}${r.referencia?' · Ref. '+esc(r.referencia):''}</small><div class="badges"><span class="badge ${r.estado==='Activo'?'ok':'bad'}">${esc(r.estado)}</span><span class="badge info">${apps.length} factura(s)</span>${r.motivo_reversion?`<span class="badge bad">${esc(r.motivo_reversion)}</span>`:''}</div></div><strong>${money(r.monto_total)}</strong><div class="card-actions"><button class="btn small gray" data-cxc-print="${r.id}">Reimprimir</button>${r.estado==='Activo'&&isAuditAdministrator(state.profile?.rol)?`<button class="btn small danger" data-cxc-reverse="${r.id}">Reversar</button>`:''}</div></article>`;
  }).join('')||'<div class="empty">No hay recibos que coincidan con la búsqueda.</div>'}</div>${rows.length>visible.length?`<div class="history-more-wrap"><button class="btn gray" id="moreCxcHistory">Mostrar 20 más</button></div>`:''}</div>`;
  bindCxcNavigation(c);
  const search=$('#cxcHistorySearch',c);search.oninput=e=>{const pos=e.target.selectionStart||e.target.value.length;state.cxcHistorySearch=e.target.value;state.cxcHistoryLimit=20;renderLiquidacion(c);focusAfterRender('cxcHistorySearch',pos);};
  $('#moreCxcHistory',c)?.addEventListener('click',()=>{state.cxcHistoryLimit=Number(state.cxcHistoryLimit||20)+20;renderLiquidacion(c);});
  $$('[data-cxc-print]',c).forEach(b=>b.onclick=()=>{
    const receipt=(state.cxcCobros||[]).find(r=>String(r.id)===String(b.dataset.cxcPrint));
    if(receipt) printCxcReceipt(receipt,cxcApplicationsForReceipt(receipt.id),false);
  });
  $$('[data-cxc-reverse]',c).forEach(b=>b.onclick=()=>reverseCxcReceipt(Number(b.dataset.cxcReverse)));
}
async function updateCxcDueDate(row){
  const next=prompt(`Nueva fecha de vencimiento para ${row.factura_no||row.orden_codigo}:`,row.cxc_vencimiento||today());
  if(next===null) return;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(next)) return alert('Escribe la fecha en formato AAAA-MM-DD.');
  const reason=prompt('Motivo del cambio de vencimiento:','Acuerdo actualizado con el cliente.');
  if(reason===null) return;
  if(reason.trim().length<5) return alert('El motivo debe tener al menos 5 caracteres.');
  const {error}=await sb.rpc('actualizar_vencimiento_cxc_v940',{p_orden_id:Number(row.orden_id),p_vencimiento:next,p_motivo:reason.trim()});
  if(error) return alert(error.message);
  await ensureCxcDataV940(true);renderLiquidacion($('#content'));toast('Vencimiento actualizado con trazabilidad.');
}
async function reverseCxcReceipt(id){
  const receipt=(state.cxcCobros||[]).find(r=>Number(r.id)===Number(id));
  if(!receipt) return alert('No se encontró el recibo.');
  const reason=prompt(`Reversar ${receipt.numero_recibo} por ${money(receipt.monto_total)}.\n\nEscribe el motivo:`);
  if(reason===null) return;
  if(reason.trim().length<5) return alert('El motivo debe tener al menos 5 caracteres.');
  if(!confirm(`¿Confirmas la reversión de ${receipt.numero_recibo}?\n\nLos saldos se restituirán y el recibo quedará marcado como Reversado.`)) return;
  const {error}=await sb.rpc('reversar_cobro_cxc_v940',{p_cobro_id:Number(id),p_motivo:reason.trim()});
  if(error) return alert(error.message);
  await ensureCxcDataV940(true);renderLiquidacion($('#content'));toast('Cobro reversado; los saldos fueron restituidos.');
}
function openCxcPaymentModal(group){
  const rows=group.rows.filter(row=>Number(row.saldo_pendiente||0)>0.01).sort((a,b)=>String(a.cxc_vencimiento||'').localeCompare(String(b.cxc_vencimiento||'')));
  if(!rows.length) return alert('Este cliente no tiene facturas pendientes.');
  const body=`<div class="form cxc-payment-form-v940"><div class="client-card" style="grid-template-columns:1fr"><div><div class="client-title">${esc(group.cliente_nombre)}</div><div class="client-sub">${esc(group.cliente_codigo||'')} · ${esc(group.cliente_telefono||'')} · Saldo total ${money(group.saldo)}</div></div></div><div class="grid3"><div class="field"><label>Aplicación</label><select id="cxcApplyMode"><option value="oldest">Más antiguas primero</option><option value="manual">Manual por factura</option></select></div><div class="field"><label>Monto recibido</label><input id="cxcPayAmount" type="number" min="0.01" step="0.01" placeholder="0.00"></div><div class="field"><label>Método</label><select id="cxcPayMethod"><option>Efectivo</option><option>Transferencia</option><option>Mixto</option></select></div></div><div class="field" id="cxcReferenceField" hidden><label>Referencia / comprobante</label><input id="cxcPayReference" placeholder="Obligatoria para transferencia o mixto"></div><div class="cxc-apply-list-v940">${rows.map(row=>`<div class="cxc-apply-row-v940" data-cxc-apply-row="${row.orden_id}"><div><b>${esc(row.factura_no||row.orden_codigo)}</b><small>Vence ${shortDate(row.cxc_vencimiento)} · ${esc(row.antiguedad)} · saldo ${money(row.saldo_pendiente)}</small></div><input type="number" step="0.01" min="0" max="${Number(row.saldo_pendiente||0)}" value="0" data-cxc-manual="${row.orden_id}" disabled><strong data-cxc-after="${row.orden_id}">${money(row.saldo_pendiente)}</strong></div>`).join('')}</div><div class="grid3 compact-kpis"><div class="card kpi"><div class="label">Recibido</div><div class="value" id="cxcAppliedTotal">${money(0)}</div></div><div class="card kpi"><div class="label">Facturas aplicadas</div><div class="value" id="cxcAppliedCount">0</div></div><div class="card kpi"><div class="label">Saldo del cliente</div><div class="value" id="cxcClientAfter">${money(group.saldo)}</div></div></div><div id="cxcPayValidation" class="lock-alert warn">Digita el monto recibido.</div><div class="grid2"><div class="field"><label>Recibido por</label><select id="cxcPayBy">${employeeOptions('CXC',currentWorkerName())}</select>${manualInput('cxcPayByManual')}</div><div class="field"><label>Observación</label><textarea id="cxcPayNote" placeholder="Opcional"></textarea></div></div><button class="btn" id="saveCxcPayment">Registrar cobro y generar recibo</button></div>`;
  const m=openModal('Registrar cobro de CXC',body,'El recibo mostrará saldo anterior, monto aplicado y saldo restante por factura.');
  wireManual(m,'cxcPayBy','cxcPayByManual');
  const mode=$('#cxcApplyMode',m),amount=$('#cxcPayAmount',m),method=$('#cxcPayMethod',m),reference=$('#cxcPayReference',m),validation=$('#cxcPayValidation',m);
  function readApplications(){
    if(mode.value==='oldest') return allocateCxcOldest(Number(amount.value||0),rows);
    return normalizeManualCxcApplications(rows.map(row=>({orden_id:row.orden_id,monto:Number($(`[data-cxc-manual="${row.orden_id}"]`,m)?.value||0),saldo_pendiente:Number(row.saldo_pendiente||0)})));
  }
  function paint(){
    const manual=mode.value==='manual';
    amount.readOnly=manual;
    $$('[data-cxc-manual]',m).forEach(inp=>inp.disabled=!manual);
    let apps=[],error='';
    try{apps=readApplications();}catch(err){error=err.message||String(err);}
    const total=cxcApplicationsTotal(apps);
    if(manual) amount.value=total?total.toFixed(2):'';
    const byId=new Map(apps.map(app=>[String(app.orden_id),app]));
    rows.forEach(row=>{
      const app=byId.get(String(row.orden_id));
      const input=$(`[data-cxc-manual="${row.orden_id}"]`,m);
      if(!manual&&input) input.value=app?app.monto.toFixed(2):'0';
      const after=$(`[data-cxc-after="${row.orden_id}"]`,m);
      if(after) after.textContent=money(app?app.saldo_despues:row.saldo_pendiente);
    });
    $('#cxcAppliedTotal',m).textContent=money(total);
    $('#cxcAppliedCount',m).textContent=String(apps.length);
    $('#cxcClientAfter',m).textContent=money(Math.max(group.saldo-total,0));
    const referenceRequired=['Transferencia','Mixto'].includes(method.value);
    $('#cxcReferenceField',m).hidden=!referenceRequired;
    if(!error&&total<=0) error='Digita o distribuye un monto mayor que cero.';
    if(!error&&referenceRequired&&reference.value.trim().length<3) error='La referencia es obligatoria para este método.';
    validation.className='lock-alert '+(error?'warn':'ok');
    validation.textContent=error||`Aplicación válida: ${money(total)} en ${apps.length} factura(s).`;
    return {apps,total,error};
  }
  mode.onchange=()=>{if(mode.value==='manual') amount.value='';paint();};
  amount.oninput=paint;method.onchange=paint;reference.oninput=paint;
  $$('[data-cxc-manual]',m).forEach(inp=>inp.oninput=paint);
  $('#saveCxcPayment',m).onclick=async()=>{
    const calc=paint();if(calc.error) return alert(calc.error);
    const by=getSelectManual(m,'cxcPayBy','cxcPayByManual');if(!by) return alert('Selecciona quién recibió el cobro.');
    const btn=$('#saveCxcPayment',m);btn.disabled=true;btn.textContent='Registrando cobro...';
    const payload=calc.apps.map(app=>({orden_id:app.orden_id,monto:app.monto}));
    const {data,error}=await sb.rpc('registrar_cobro_cxc_v940',{
      p_cliente_clave:group.key,p_monto:calc.total,p_metodo:method.value,
      p_referencia:reference.value.trim()||null,p_recibido_por:by,
      p_observacion:$('#cxcPayNote',m).value.trim()||null,p_aplicaciones:payload
    });
    if(error){btn.disabled=false;btn.textContent='Registrar cobro y generar recibo';return alert(error.message);}
    const printApps=calc.apps.map(app=>({orden_id:app.orden_id,monto_aplicado:app.monto,saldo_antes:app.saldo_antes,saldo_despues:app.saldo_despues,vencimiento:rows.find(r=>Number(r.orden_id)===Number(app.orden_id))?.cxc_vencimiento}));
    const receipt={...data,fecha_cobro:new Date().toISOString(),cliente_nombre:group.cliente_nombre,observacion:$('#cxcPayNote',m).value.trim()};
    m.remove();await ensureCxcDataV940(true);renderLiquidacion($('#content'));printCxcReceipt(receipt,printApps,true);toast(`Cobro registrado: ${data.numero_recibo}`);
  };
  paint();focusAndSelect(amount);
}
function renderLiquidacionHistorial(c, filter){
  const names=activeDeliveryNames(), section=buildHistorySection('liquidacion',filter);
  c.innerHTML=`<div class="panel"><div class="panel-head"><div><h3>Historial de liquidaciones</h3><p>${section.rows.length} lote(s) cerrado(s). Una sola liquidación formal por viaje, fechas dominicanas y detalle plegable.</p></div>${deliveryCanSelect()?`<select id="liquidDelivery" style="max-width:280px"><option value="">Todos los responsables</option>${names.map(n=>`<option ${n===filter?'selected':''}>${esc(n)}</option>`).join('')}</select>`:`<div class="badge info">${esc(filter||'Tu usuario')}</div>`}</div>${cxcTabsHtml('historial')}${section.html}<div class="${state.v937SchemaOk?'lock-alert ok':'lock-alert warn'}"><b>Control V9.3.7:</b> ${state.v937SchemaOk?'unicidad por lote, cierre transaccional y auditoría de consolidaciones activos.':'ejecuta el SQL 30 para prevenir y corregir liquidaciones duplicadas.'}</div></div>`;
  wireLiquidacionCommon(c,section.rows);
  bindHistorySection(c,'liquidacion',filter,section.rows,()=>renderLiquidacion($('#content')));
}
function wireLiquidacionCommon(c, rows){
  const sel=$('#liquidDelivery',c); if(sel) sel.onchange=e=>{state.liquidacionDeliveryFilter=e.target.value; renderLiquidacion($('#content'));};
  const search=$('#liquidacionSearch',c); if(search) search.oninput=e=>{ const pos=e.target.selectionStart||e.target.value.length; state.liquidacionSearch=e.target.value; renderLiquidacion($('#content')); focusAfterRender('liquidacionSearch',pos); };
  $$('[data-liqtab]',c).forEach(b=>b.onclick=async()=>{state.liquidacionTab=b.dataset.liqtab;if(['cxc','cxc_historial'].includes(state.liquidacionTab)) await ensureCxcDataV940();setupLiveUpdates();renderLiquidacion($('#content'));});
  $$('[data-liq-delivery-panel]',c).forEach(b=>b.onclick=()=>{state.liquidacionDeliveryFilter=b.dataset.liqDeliveryPanel||'';renderLiquidacion($('#content'));});
  try{ bindDynamic(); }catch(err){ console.error('bindDynamic/liquidacion',err); }
}
function bindLiquidacionActionButtons(c, filter, orders, groups){
  const safe=(fn)=>async()=>{ try{ await fn(); }catch(err){ console.error(err); alert('No pude ejecutar esta acción de Liquidación: '+(err?.message||err)); } };
  const printBtn=$('#printLiqSummary',c);
  if(printBtn) printBtn.onclick=safe(()=>printLiquidationSummary(filter||'Todos los responsables',orders));
  $$('[data-liquidate-order]',c).forEach(b=>{
    b.onclick=safe(()=>{
      const o=state.ordenes.find(x=>String(x.id)===String(b.dataset.liquidateOrder));
      if(!o) return alert('No encontré esta orden. Actualiza la pantalla e intenta nuevamente.');
      openLiquidacionOrdenModal(o);
    });
  });
  $$('[data-print-liq-batch]',c).forEach(b=>{
    b.onclick=safe(()=>{
      const code=b.dataset.printLiqBatch;
      const g=(groups||[]).find(x=>String(x.code)===String(code));
      if(!g) return alert('No encontré este lote. Actualiza la pantalla e intenta nuevamente.');
      printLiquidationSummary((filter||g.items[0]?.delivery_nombre||'Delivery')+' · '+(code==='SIN-LOTE'?'Sin lote':code),g.items);
    });
  });
  $$('[data-close-liq-batch]',c).forEach(b=>{
    b.onclick=safe(()=>{
      const code=b.dataset.closeLiqBatch;
      const g=(groups||[]).find(x=>String(x.code)===String(code));
      if(!g) return alert('No encontré este lote. Actualiza la pantalla e intenta nuevamente.');
      openCloseBatchLiquidationModal(g.items[0]?.delivery_nombre||filter, g);
    });
  });
}
function renderLiquidacion(c){
  const names=activeDeliveryNames();
  const filter=deliveryCanSelect() ? (state.liquidacionDeliveryFilter||'') : currentDeliveryName();
  if(state.liquidacionTab==='cxc') return renderCxcAccounts(c);
  if(state.liquidacionTab==='cxc_historial') return renderCxcHistory(c);
  if(state.liquidacionTab==='historial') return renderLiquidacionHistorial(c, filter);
  const canSelect=deliveryCanSelect();
  const base=pendingLiquidationOrders(filter);
  const q=state.liquidacionSearch||''; const orders=base.filter(o=>matchOrder(o,q) || norm(batchCodeFromOrder(o)).includes(norm(q)));
  const groups=liquidacionBatchGroups(orders);
  const pendingTotal=orders.reduce((s,o)=>s+orderMonto(o),0);
  const panelRows=deliveryPendingPanelData();
  const panelHtml=deliveryPendingPanelHtml(panelRows,filter);
  const visiblePanelRows=filter?panelRows.filter(r=>r.delivery===filter):panelRows;
  const partialLots=visiblePanelRows.reduce((s,r)=>s+r.partialLots,0);
  c.innerHTML=`<div class="panel"><div class="panel-head"><div><h3>Liquidación / CXC centralizada por lote</h3><p>${orders.length} de ${base.length} cliente(s) pendientes. CXC registra directamente cobro, crédito, devolución o no entrega.</p></div>${canSelect?`<select id="liquidDelivery" style="max-width:280px"><option value="">Todos los responsables</option>${names.map(n=>`<option ${n===filter?'selected':''}>${esc(n)}</option>`).join('')}</select>`:`<div class="badge info">${esc(filter||'Tu usuario')}</div>`}</div>
  ${cxcTabsHtml('pendientes')}
  ${panelHtml}
  <div class="searchbar"><input id="liquidacionSearch" value="${esc(q)}" placeholder="Buscar nombre del cliente, lote u orden..."></div>
  <div class="grid4 compact-kpis"><div class="card kpi"><div class="label">Viajes pendientes</div><div class="value">${groups.length}</div></div><div class="card kpi"><div class="label">Clientes pendientes</div><div class="value">${orders.length}</div></div><div class="card kpi"><div class="label">Monto por cotejar</div><div class="value">${money(pendingTotal)}</div></div><div class="card kpi"><div class="label">Viajes parciales</div><div class="value">${partialLots}</div></div></div>
  <div class="${state.v937SchemaOk?'lock-alert ok':'lock-alert warn'}"><b>Liquidación independiente:</b> ${state.v937SchemaOk?'el módulo Delivery es solo consulta; CXC recibe cada cliente o todo el lote y el último cliente cierra el viaje automáticamente.':'ejecuta el SQL 30 antes de recibir clientes o lotes.'}</div>
  <div class="actions" style="justify-content:flex-end;margin:10px 0"><button class="btn gray" id="printLiqSummary">Imprimir resumen pendiente</button></div>
  <div class="history-list-actions"><button class="btn small gray" data-liq-pending-expand-all>Expandir todos</button><button class="btn small gray" data-liq-pending-collapse-all>Ocultar todos</button></div><div class="liq-batch-list operational-lot-list">${groups.map((g,i)=>liquidacionBatchCard(g,i,Boolean(String(q).trim()))).join('')||'<div class="empty">No hay clientes pendientes de recibir con esa búsqueda.</div>'}</div></div>`;
  const liqKeys=groups.map(g=>lotUiKey('liquidacion-pending',g.code,g.code));
  $$('[data-liq-pending-toggle]',c).forEach(b=>b.onclick=()=>{const key=b.dataset.liqPendingToggle;setHistoryOpen('liquidacionPending',key,!historyIsOpen('liquidacionPending',key));renderLiquidacion(c);});
  $('[data-liq-pending-expand-all]',c)?.addEventListener('click',()=>{setOperationalKeysOpen('liquidacionPending',liqKeys,true);renderLiquidacion(c);});
  $('[data-liq-pending-collapse-all]',c)?.addEventListener('click',()=>{setOperationalKeysOpen('liquidacionPending',liqKeys,false);renderLiquidacion(c);});
  try{ wireLiquidacionCommon(c, groups); }catch(err){ console.error('wireLiquidacionCommon',err); }
  bindLiquidacionActionButtons(c, filter, orders, groups);
}
async function setOrderState(o, estado, extra={}){
  if(!o) return false;
  const old=o.estado;
  const comentario=extra.notas_estado||'Cambio desde sistema';
  const clean={...extra}; delete clean.notas_estado;
  const {error}=await sb.rpc('cambiar_estado_orden_v9382',{p_orden_id:o.id,p_estado_esperado:old,p_estado_nuevo:estado,p_cambios:clean,p_comentario:comentario,p_modulo:currentModuleOfOrder(o)||'ordenes'});
  if(error){ alert('No se pudo cambiar el estado: '+error.message+'\n\nVerifica que aplicaste el SQL 40 de la actualización anterior.'); return false; }
  await refreshVisibleModuleV9384(); render(); toast('Orden actualizada: '+estado); return true;
}
function employeeOptions(area, selected=''){ return employeeOptionsForArea(area, selected, {fallbackAll:false, placeholder:'Selecciona'}); }
function employeeOptionsWithDefault(area, selected=''){ return employeeOptionsForArea(area, selected, {fallbackAll:false, placeholder:'Selecciona'}); }
function deliverySelect(selected=''){ const sel=String(selected||'').trim(); const names=deliveryEmployeeNames(); const canonical=canonicalEmployeeName(sel,'Delivery')||sel; return `<option value="">Sin asignar</option>${canonical&&!names.some(n=>norm(n)===norm(canonical))&&canonical!=='__manual__'?`<option selected>${esc(canonical)}</option>`:''}${names.map(n=>`<option ${norm(n)===norm(canonical)?'selected':''}>${esc(n)}</option>`).join('')}<option value="__manual__" ${sel==='__manual__'?'selected':''}>Otro / manual</option>`; }
function manualInput(id, placeholder='Nombre manual'){ return `<input id="${id}" placeholder="${placeholder}" style="margin-top:8px;display:none">`; }
function getSelectManual(m, selectId, manualId){ const s=$('#'+selectId,m), man=$('#'+manualId,m); return s.value==='__manual__' ? (man.value||'').trim() : s.value; }
function wireManual(m, selectId, manualId){ const s=$('#'+selectId,m), man=$('#'+manualId,m); if(!s||!man) return; s.onchange=()=>{man.style.display=s.value==='__manual__'?'block':'none';}; }
async function openTakeOrderModal(o){
  if(!o) return;
  await refreshVisibleModuleV9384();
  o=state.ordenes.find(x=>String(x.id)===String(o.id))||o;
  if(o.tomado_por){
    if(!canEditCarniceriaOrder(o)) return alert(`Esta orden ya está siendo preparada por ${workerDisplayName(o.tomado_por)}${o.tomado_en?' desde '+new Date(o.tomado_en).toLocaleTimeString('es-DO',{hour:'2-digit',minute:'2-digit'}):''}. Puedes verla, pero no modificarla.`);
    return openPreparacionModal(o);
  }
  const nombreFijo=currentWorkerName();
  const currentCount=isStationAccount()?0:carnQueueCount(nombreFijo);
  if(currentCount>=3 && !isAdminRole()) return alert(`No puedes tomar más pedidos. Ya tienes ${currentCount}/3 pedidos en cola. Finaliza o suelta uno antes de tomar otro.`);
  const workerField=workerSelectHtml('Carnicería','takeBy','Despachador que toma el pedido',o.tomado_por||nombreFijo);
  const body=`<div class="form"><div class="client-card" style="grid-template-columns:1fr"><div><div class="client-title">${esc(o.codigo)} · ${esc(orderClientName(o))}</div><div class="client-sub">${orderItemsText(o,10)}</div></div></div><div class="queue-box"><div><b id="takeQueueLabel">${isStationAccount()?'Selecciona el empleado para consultar su cola':`Tu cola actual: ${currentCount}/3`}</b><div class="limit">La regla evita que un despachador tome más de 3 pedidos a la vez.</div></div></div>${workerField}<div class="lock-alert ok">Al tomar el pedido quedará visible para todos y bloqueado para el empleado seleccionado. La cuenta de estación también quedará registrada.</div><button class="btn" id="confirmTake">Tomar pedido y preparar</button></div>`;
  const m=openModal('Tomar pedido',body,'Evita que otro despachador prepare la misma orden.');
  if(isAdminRole()&&!isStationAccount()) wireManual(m,'takeBy','takeByManual');
  if(isStationAccount()){
    $('#takeBy',m)?.addEventListener('change',()=>{
      const emp=activeEmployees('Carnicería').find(e=>norm(e.nombre)===norm($('#takeBy',m).value));
      const count=emp?carnQueueCountByEmployeeId(emp.id):0;
      $('#takeQueueLabel',m).textContent=emp?`${emp.nombre}: ${count}/3 pedidos en cola`:'Selecciona el empleado para consultar su cola';
    });
  }
  $('#confirmTake',m).onclick=async()=>{
    const nombre=workerValueFromModal(m,'takeBy');
    if(!nombre) return alert('No pude identificar el usuario que toma el pedido. Revisa el nombre del perfil.');
    const employee=isStationAccount()?activeEmployees('Carnicería').find(e=>norm(e.nombre)===norm(nombre)):linkedEmployeeForUser(state.profile);
    if(isStationAccount()&&!employee) return alert('Selecciona un empleado activo habilitado para trabajar en Carnicería.');
    await refreshVisibleModuleV9384();
    const fresh=state.ordenes.find(x=>String(x.id)===String(o.id));
    if(fresh?.tomado_por && !canEditCarniceriaOrder(fresh)) return alert(`Esta orden ya fue tomada por ${workerDisplayName(fresh.tomado_por)}. No se puede tomar de nuevo.`);
    const qCount=employee?.id?carnQueueCountByEmployeeId(employee.id):carnQueueCount(nombre);
    if(!fresh?.tomado_por && qCount>=3) return alert(`${nombre} ya tiene ${qCount}/3 pedidos en cola. Debe finalizar o soltar uno antes de tomar otro.`);
    const old=fresh?.estado||o.estado;
    const {data:takenRows,error}=await sb.rpc('tomar_orden_v9397',{
      p_orden_id:o.id,
      p_estado_esperado:old,
      p_empleado_id:employee?.id||null,
      p_nombre:nombre,
      p_comentario:`Orden tomada por ${nombre}${isStationAccount()?` desde la estación ${currentUserEmail()}`:''}`
    });
    if(error) return alert(error.message+'\n\nLa autorización se valida con el empleado activo, su área principal y sus áreas adicionales.');
    if(!takenRows?.length){
      await refreshVisibleModuleV9384();
      const winner=state.ordenes.find(x=>String(x.id)===String(o.id));
      return alert(winner?.tomado_por
        ? `Esta orden acaba de ser tomada por ${workerDisplayName(winner.tomado_por)}. No se puede tomar dos veces.`
        : 'La orden cambió mientras confirmabas. Actualiza y vuelve a intentarlo.');
    }
    m.remove(); await refreshVisibleModuleV9384(); render(); const updated=state.ordenes.find(x=>String(x.id)===String(o.id)); openPreparacionModal(updated);
  };
}

async function openReleaseOrderModal(o){
  if(!o) return alert('No encontré la orden.');
  if(!o.tomado_por) return alert('Esta orden no está tomada por ningún despachador.');
  if(!canReleaseCarnOrder(o)) return alert(`Solo ${workerDisplayName(o.tomado_por)}, administrador o supervisor puede soltar esta orden.`);
  const body=`<div class="form"><div class="lock-alert"><b>${esc(lockText(o))}</b><br>Al soltarla, volverá a quedar disponible para que otro despachador la tome. Se limpiará el “preparado por” y los avances no finalizados de carnicería.</div><div class="field"><label>Motivo</label><select id="relMotivo"><option>Tomado por error</option><option>Despachador ocupado</option><option>Cambio de prioridad</option><option>Pedido en espera</option><option>Otro</option></select></div><div class="field"><label>Comentario opcional</label><textarea id="relNota" placeholder="Detalle si aplica"></textarea></div><button class="btn warn" id="confirmRelease">Soltar pedido</button></div>`;
  const m=openModal('Soltar / liberar pedido',body,'La orden seguirá visible en Carnicería, quedará libre y sin preparado asignado.');
  $('#confirmRelease',m).onclick=async()=>{
    const motivo=$('#relMotivo',m).value + ($('#relNota',m).value?': '+$('#relNota',m).value:'');
    const old=o.estado;
    const {error}=await sb.rpc('liberar_orden_v9382',{p_orden_id:o.id,p_estado_esperado:old,p_motivo:motivo});
    if(error) return alert('No se pudo liberar la orden: '+error.message+'\n\nVerifica que aplicaste el SQL 40 de la actualización anterior.');
    m.remove(); await refreshVisibleModuleV9384(); render(); toast('Pedido liberado. Otro despachador puede tomarlo.');
  };
}

function prepQty(i){ return i.cantidad_preparada!==null && i.cantidad_preparada!==undefined && i.cantidad_preparada!=='' ? Number(i.cantidad_preparada) : ''; }

function productByDetail(i){ return i?.producto_id ? state.productos.find(p=>String(p.id)===String(i.producto_id)) : null; }
function productWeightTypeFromProduct(p){
  const explicit=p?.tipo_despacho_peso || p?.tipo_peso;
  if(explicit) return explicit;
  if(p && p.requiere_pesaje===false && p.suma_peso_final===false) return 'No pesa';
  return String(p?.unidad||'').toLowerCase()==='lb'?'Por libra':'Unidad peso variable';
}
function detailWeightProduct(i){ return productByDetail(i); }
function detailWeightType(i){ const p=detailWeightProduct(i); return p ? productWeightTypeFromProduct(p) : (i?.tipo_despacho_peso || 'Por libra'); }
function detailStdWeight(i){ const p=detailWeightProduct(i); const v=p ? p.peso_estandar_lb : i?.peso_estandar_lb; return Number(v)||0; }
function detailTolerance(i){ const p=detailWeightProduct(i); const v=p ? p.tolerancia_lb : i?.tolerancia_lb; return Number(v)||0.25; }
function detailSumsWeight(i){ const p=detailWeightProduct(i); const v=p ? p.suma_peso_final : i?.suma_peso_final; return v!==false; }
function isWholeQty(n){ const v=Number(n); return Number.isFinite(v) && Math.abs(v-Math.round(v))<0.000001; }
function productAllowsFraction(p){
  if(p && p.permite_fraccion!==undefined && p.permite_fraccion!==null) return p.permite_fraccion!==false;
  const type=productWeightTypeFromProduct(p), u=String(p?.unidad||'').toLowerCase();
  if(type==='Por libra' || ['lb','lbs','libra','libras'].includes(u)) return true;
  if(type==='Unidad peso fijo' || type==='No pesa') return false;
  return true;
}
function detailAllowsFraction(i){ const p=detailWeightProduct(i); const v=p ? p.permite_fraccion : i?.permite_fraccion; return v!==undefined && v!==null ? v!==false : productAllowsFraction(p); }
function validateFractionQty(item,qty){ return detailAllowsFraction(item) || isWholeQty(qty); }
function noFractionMessage(name){ return `El artículo "${name||'seleccionado'}" no se despacha al granel. Debe usar cantidad entera: 1, 2, 3...`; }
function detailRequiresWeight(i){ const p=detailWeightProduct(i); const v=p ? p.requiere_pesaje : i?.requiere_pesaje; return v!==false; }
function requestedWeightEquivalent(i){
  const qty=Number(i?.cantidad_pedida||0), type=detailWeightType(i), std=detailStdWeight(i);
  if(!detailSumsWeight(i) || type==='No pesa') return 0;
  if(type==='Unidad peso fijo') return qty*std;
  if(type==='Unidad peso variable') return 0;
  return qty;
}
function preparedWeightEquivalent(i, qty){
  const val=Number(qty ?? prepQty(i) ?? 0), type=detailWeightType(i), std=detailStdWeight(i);
  if(!detailSumsWeight(i) || type==='No pesa') return 0;
  if(type==='Unidad peso fijo') return val*std;
  if(type==='Unidad peso variable') return val;
  return val;
}
function productByName(name){
  const n=norm(name);
  return state.productos.find(p=>norm(p.nombre)===n) || state.productos.find(p=>norm(p.nombre).includes(n) || n.includes(norm(p.nombre)));
}
function productEquivalentWeight(p, qty){
  const val=Number(qty||0);
  if(!p) return val;
  const type=productWeightTypeFromProduct(p);
  const sums=p.suma_peso_final!==false;
  if(!sums || type==='No pesa') return 0;
  if(type==='Unidad peso fijo') return val*(Number(p.peso_estandar_lb||0)||0);
  if(type==='Unidad peso variable') return val;
  return val;
}
function substituteQtyFromNote(note=''){
  const m=String(note||'').match(/Cantidad sustituta:\s*([0-9]+(?:[.,][0-9]+)?)/i);
  return m ? Number(String(m[1]).replace(',','.')) : '';
}
function weightConfigLabel(p){
  const type=productWeightTypeFromProduct(p);
  if(type==='Unidad peso fijo') return `Unidad fija · ${Number(p?.peso_estandar_lb||0)} lb c/u`;
  if(type==='Unidad peso variable') return 'Unidad variable · pide peso real';
  if(type==='No pesa') return 'No suma al peso';
  return 'Por libra';
}
function prepInputLabel(i){
  const type=detailWeightType(i);
  if(type==='Unidad peso fijo') return 'unid.';
  if(type==='Unidad peso variable') return 'lb reales';
  if(type==='No pesa') return i.unidad||'';
  return i.unidad||'lb';
}
function detailWeightHelp(i){
  const type=detailWeightType(i), std=detailStdWeight(i), req=requestedWeightEquivalent(i);
  if(type==='Unidad peso fijo') return `1 unidad = ${Number(std||0)} lb · esperado ${Number(req.toFixed(2))} lb`;
  if(type==='Unidad peso variable') return 'Registra el peso real en libras de la pieza/unidad despachada.';
  if(type==='No pesa') return 'Este producto no suma al peso final.';
  return 'Producto por libra: lo preparado equivale a su peso en lb.';
}

function prepExpectedEquivalentFromRow(row){
  if(!row) return 0;
  const qty=Number(row.dataset.pedidoQty||0);
  const tipo=row.dataset.tipoPeso||'Por libra';
  const std=Number(row.dataset.pesoStd||0);
  if(row.dataset.sumaPeso==='false' || tipo==='No pesa') return 0;
  if(tipo==='Unidad peso fijo') return qty*std;
  if(tipo==='Por libra') return qty;
  return 0;
}
function prepEquivalentFromRow(row, qty){
  if(!row) return 0;
  const stateSel=$('[data-prepstate]',row);
  if(stateSel?.value==='Sustituido'){
    const subName=$('[data-prepsub]',row)?.value||'';
    const subQty=Number($('[data-prepsubqty]',row)?.value||0);
    if(subName && subQty>0) return productEquivalentWeight(productByName(subName), subQty);
  }
  const tipo=row.dataset.tipoPeso||'Por libra';
  const std=Number(row.dataset.pesoStd||0);
  if(row.dataset.sumaPeso==='false' || tipo==='No pesa') return 0;
  if(tipo==='Unidad peso fijo') return qty*std;
  if(tipo==='Unidad peso variable') return qty;
  return qty;
}
function prepAutoStateForRow(row){
  if(!row) return;
  const qtyInput=$('[data-prepqty]',row), stateSel=$('[data-prepstate]',row);
  if(!qtyInput || !stateSel) return;
  if(String(qtyInput.value||'').trim()===''){
    if(stateSel.value!=='Sustituido') stateSel.value='Pendiente';
    updatePrepSubstituteVisibility(row.closest('.modal')||document);
    return;
  }
  const qty=Number(qtyInput.value||0);
  const tipo=row.dataset.tipoPeso||'Por libra';
  const tol=Number(row.dataset.tolerancia||0.25)||0.25;
  const expected=prepExpectedEquivalentFromRow(row);
  const equiv=prepEquivalentFromRow(row, qty);
  let newState=stateSel.value;
  if(qty<=0) newState='Sin existencia';
  else if(expected>0){
    newState = equiv >= (expected - tol) ? 'Preparado' : 'Parcial';
  }else if(tipo==='Unidad peso variable' || tipo==='No pesa'){
    newState='Preparado';
  }else{
    newState='Preparado';
  }
  if(stateSel.value!=='Sustituido') stateSel.value=newState;
  updatePrepSubstituteVisibility(row.closest('.modal')||document);
}
function substituteProductOptions(selected=''){
  return '<option value="">Selecciona sustituto...</option>' + state.productos.filter(p=>p.activo!==false).map(p=>`<option value="${esc(p.nombre)}" ${String(selected)===String(p.nombre)?'selected':''}>${esc(p.nombre)}${p.unidad?` · ${esc(p.unidad)}`:''}</option>`).join('');
}
function updatePrepSubstituteVisibility(scope=document){
  $$('[data-detail-id]',scope).forEach(row=>{
    const sel=$('[data-prepstate]',row), box=$('[data-substitute-box]',row);
    if(!box || !sel) return;
    box.style.display = sel.value==='Sustituido' ? 'block' : 'none';
  });
}
function focusAndSelect(el){ if(!el) return; setTimeout(()=>{ el.focus(); if(el.select) el.select(); },0); }
function wirePrepKeyboardFlow(m){
  const qtyInputs=$$('[data-prepqty]',m);
  qtyInputs.forEach((inp,idx)=>{
    inp.addEventListener('keydown',e=>{
      if(e.key==='Enter'){
        e.preventDefault();
        prepAutoStateForRow(inp.closest('[data-detail-id]'));
        const next=qtyInputs[idx+1] || $('#prepPeso',m);
        focusAndSelect(next);
      }
    });
  });
  const peso=$('#prepPeso',m), paq=$('#prepPaq',m), notas=$('#prepNotas',m), save=$('#savePrep',m), draft=$('#savePrepDraft',m);
  if(peso) peso.addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); focusAndSelect(paq); } });
  if(paq) paq.addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); focusAndSelect(notas); } });
  if(notas) notas.addEventListener('keydown',e=>{ if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); focusAndSelect(save); } });
  [draft,save].forEach(btn=>btn&&btn.addEventListener('keydown',e=>{
    if(e.key==='ArrowLeft' || e.key==='ArrowRight'){
      e.preventDefault();
      if(document.activeElement===save) focusAndSelect(draft); else focusAndSelect(save);
    }
    if(e.key==='Enter'){ e.preventDefault(); btn.click(); }
  }));
}
function prepTotalEquivalentFromModal(m){
  let total=0;
  $$('[data-detail-id]',m).forEach(row=>{
    const qty=Number($('[data-prepqty]',row)?.value||0);
    total+=Number(prepEquivalentFromRow(row,qty)||0);
  });
  return Number(total.toFixed(2));
}
function updatePrepWeightUi(m){
  const total=prepTotalEquivalentFromModal(m);
  const inp=$('#prepPeso',m);
  const real=Number(inp?.value||0);
  let summary=`Calculado: <b>${total} lb</b>`;
  if(real>0){
    const chk=weightControlCheck(total,real);
    const cls=chk.level==='block'?'peso-bad':(chk.level==='warn'?'peso-warn':'');
    summary+=` · Balanza: <b>${chk.peso} lb</b> · <span class="${cls}">Dif. ${chk.diff>0?'+':''}${chk.diff} lb</span>`;
  }
  const box=$('#prepPesoResumen',m); if(box) box.innerHTML=summary;
  $$('[data-detail-id]',m).forEach(row=>{
    const qty=Number($('[data-prepqty]',row)?.value||0);
    const tipo=row.dataset.tipoPeso||'Por libra', std=Number(row.dataset.pesoStd||0), pedido=Number(row.dataset.pedidoQty||0), tol=Number(row.dataset.tolerancia||0.25);
    const equiv=prepEquivalentFromRow(row,qty);
    const eqEl=$('[data-peso-equiv]',row); if(eqEl) eqEl.textContent=`${Number(equiv.toFixed(2))} lb`;
    const req=(row.dataset.sumaPeso==='false'||tipo==='No pesa')?0:(tipo==='Unidad peso fijo'?pedido*std:(tipo==='Unidad peso variable'?0:pedido));
    const diffEl=$('[data-prep-diff]',row);
    if(diffEl){
      const estado=$('[data-prepstate]',row)?.value||'';
      const unit=String(row.dataset.unidad||'').trim()||'unid.';
      const setDiff=(text,kind='ok')=>{
        diffEl.textContent=text;
        diffEl.className=`prep-diff prep-shortage-value-r10 prep-shortage-value-r101 ${kind==='bad'?'peso-bad':kind==='warn'?'peso-warn':'is-ok'}`;
      };
      if(estado==='Sustituido'){
        setDiff('Sustituido','warn');
      }else if(tipo==='Unidad peso fijo' || tipo==='No pesa'){
        const qtyDiff=qty-pedido;
        if(Math.abs(qtyDiff)>0.001){
          const amount=Math.abs(Number(qtyDiff.toFixed(2)));
          setDiff(`${qtyDiff<0?'Faltan':'Sobran'} ${amount} ${unit}` , qtyDiff<0?'bad':'warn');
        }else setDiff('—');
      }else if(tipo==='Unidad peso variable'){
        setDiff(qty>0?'Peso real':'—');
      }else{
        const diff=equiv-req;
        if(req>0 && Math.abs(diff)>tol) setDiff(`${diff<0?'Faltan':'Sobran'} ${Math.abs(Number(diff.toFixed(2)))} lb`,diff<0?'bad':'warn');
        else setDiff('—');
      }
    }
  });
}
function productWeightSnapshot(productId){
  const p=state.productos.find(x=>String(x.id)===String(productId));
  const tipo=productWeightTypeFromProduct(p);
  const noPesa=tipo==='No pesa';
  return {
    tipo_despacho_peso: tipo,
    requiere_pesaje: noPesa ? false : (p?.requiere_pesaje!==false),
    peso_estandar_lb: Number(p?.peso_estandar_lb||0)||null,
    tolerancia_lb: Number(p?.tolerancia_lb||0.25)||0.25,
    suma_peso_final: noPesa ? false : (p?.suma_peso_final!==false),
    permite_fraccion: productAllowsFraction(p)
  };
}

function prepDetailPayload(m){
  const lines=[];
  for(const row of $$('[data-detail-id]',m)){
    const id=row.dataset.detailId;
    const qtyRaw=String($('[data-prepqty]',row)?.value||'').trim();
    let estado=$('[data-prepstate]',row).value||'Pendiente';
    let qty=qtyRaw==='' ? 0 : (+qtyRaw||0);
    if(row.dataset.permiteFraccion==='false' && qtyRaw!=='' && !isWholeQty(qty)) throw new Error(noFractionMessage($('.prod-name',row)?.textContent||'Artículo'));
    const pedido=+row.dataset.pedidoQty||0;
    const tipo=row.dataset.tipoPeso||'Por libra';
    const pesoStd=+row.dataset.pesoStd||0;
    const suma=row.dataset.sumaPeso!=='false';
    let equiv=prepEquivalentFromRow(row, qty);
    const esperado=suma ? (tipo==='Unidad peso fijo'?pedido*pesoStd:(tipo==='Por libra'?pedido:0)) : 0;
    if(estado==='Pendiente') estado = qtyRaw==='' ? 'Pendiente' : (qty<=0 ? 'Sin existencia' : (esperado>0 && equiv<esperado ? 'Parcial' : 'Preparado'));
    if(qtyRaw!=='' && qty<=0 && estado!=='Sustituido') estado='Sin existencia';
    let nota=null;
    if(estado==='Sustituido'){
      const sub=$('[data-prepsub]',row)?.value||'';
      const subQtyRaw=String($('[data-prepsubqty]',row)?.value||'').trim();
      const subQty=+subQtyRaw||0;
      if(!sub) throw new Error('Selecciona el artículo sustituto para '+($('.prod-name',row)?.textContent||'este artículo')+'.');
      if(subQty<=0) throw new Error('Indica la cantidad del artículo sustituto para '+($('.prod-name',row)?.textContent||'este artículo')+'.');
      const subUnit=productByName(sub)?.unidad||'';
      nota='Sustituido por: '+sub+' · Cantidad sustituta: '+subQty+(subUnit?' '+subUnit:'');
      equiv=productEquivalentWeight(productByName(sub),subQty);
      qty=qtyRaw==='' ? 0 : qty;
    }
    lines.push({id:+id,cantidad_preparada:qtyRaw===''&&estado==='Pendiente'?null:qty,estado_preparacion:estado,nota_preparacion:nota,peso_equivalente_preparado:Number(equiv.toFixed(3)),peso_equivalente_solicitado:Number(esperado.toFixed(3))});
  }
  return lines;
}
function prepRowsHtml(o, disabled=false){
  const opts=['Pendiente','Preparado','Parcial','Sin existencia','Sustituido'];
  const items=o.items||[];
  if(!items.length) return '<div class="empty">Esta orden no tiene artículos detallados.</div>';
  return `<div class="prep-detail-list prep-detail-r8">${items.map(i=>{
    const st=i.estado_preparacion||'Pendiente';
    const no=prepStatusClass(st);
    const d=disabled?'disabled':'';
    const tipo=detailWeightType(i);
    const std=detailStdWeight(i);
    const suma=detailSumsWeight(i);
    const tol=detailTolerance(i);
    const prep=prepQty(i);
    const equiv=preparedWeightEquivalent(i,prep);
    const allowFrac=detailAllowsFraction(i);
    const rawNota=String(i.nota_preparacion||'');
    const subMatch=rawNota.match(/Sustituido por:\s*([^·]+)/i);
    const subSelected=subMatch?subMatch[1].trim():'';
    const subQty=substituteQtyFromNote(rawNota);
    const instruction=itemInstruction(i);
    return `<div class="prep-row prep-row-r8 prep-row-r101 ${no}" data-detail-id="${i.id}" data-tipo-peso="${esc(tipo)}" data-peso-std="${std}" data-suma-peso="${suma}" data-tolerancia="${tol}" data-pedido-qty="${Number(i.cantidad_pedida||0)}" data-unidad="${esc(i.unidad||'')}" data-permite-fraccion="${allowFrac}"><div class="prep-product-line"><b class="prod-name">${esc(i.producto_nombre)}</b>${allowFrac?'':'<span class="prep-mini-flag">Solo entero</span>'}</div><div class="prep-compact-grid prep-compact-grid-r10 prep-compact-grid-r101"><div class="prep-compact-cell prep-requested prep-requested-r101"><span>Solicitado</span><strong data-pedido="${Number(i.cantidad_pedida||0)}">${Number(i.cantidad_pedida||0)} ${esc(i.unidad||'')}</strong></div><label class="prep-compact-cell prep-prepared-r10 prep-prepared-r101"><span>Preparado</span><div class="prep-input-unit"><input ${d} data-prepqty type="number" step="${allowFrac?'0.01':'1'}" value="${prep===''?'':prep}" placeholder="0"><em>${esc(prepInputLabel(i))}</em></div></label><label class="prep-compact-cell prep-state-cell prep-state-r101"><span>Estado</span><select ${d} data-prepstate>${opts.map(x=>`<option ${x===st?'selected':''}>${x}</option>`).join('')}</select></label><div class="prep-compact-cell prep-shortage-cell-r10 prep-shortage-cell-r101"><span>Faltante</span><small data-prep-diff class="prep-diff prep-shortage-value-r10 prep-shortage-value-r101">—</small></div></div>${instruction?`<div class="prep-item-note prep-item-note-r101"><b>Obs.</b><span>${esc(instruction)}</span></div>`:''}<div data-substitute-box class="prep-substitute prep-substitute-r8" style="${st==='Sustituido'?'':'display:none'}"><select ${d} data-prepsub>${substituteProductOptions(subSelected)}</select><input ${d} data-prepsubqty type="number" step="0.01" value="${subQty===''?'':subQty}" placeholder="Cantidad sustituta"></div><span data-peso-equiv class="prep-equivalent-meta">${Number(equiv.toFixed(2))} lb</span></div>`;
  }).join('')}</div>`;
}

async function printPreparationTicket(o){
  if(!o) return;
  const now=new Date();
  const items=o.items||[];
  const lines=items.map(i=>{ const st=i.estado_preparacion||''; const qty=i.cantidad_preparada!==null&&i.cantidad_preparada!==undefined?i.cantidad_preparada:''; const instruction=itemInstruction(i); return `<tr><td>${esc(Number(i.cantidad_pedida||0))}</td><td>${esc(i.unidad||'')}</td><td>${esc(i.producto_nombre||'')}${instruction?`<br><span class="small"><b>Obs.:</b> ${esc(instruction)}</span>`:''}${st?`<br><span class="small">${esc(st)}${qty!==''?' · prep. '+esc(qty):''}</span>`:''}</td></tr>`; }).join('');
  const titlePx=Math.max(14,Math.min(28,Number(appCfg('impresion.tamanoTituloPx',18))||18)); const detailPx=Math.max(10,Math.min(20,Number(appCfg('impresion.tamanoDetallePx',12))||12)); const pickupAlert=isStorePickup(o)&&appCfg('impresion.mostrarAvisoRetiro',true)!==false?`<div class="print-pickup-alert">${esc(pickupNoticeText())}</div>`:''; const html=`<!doctype html><html><head><meta charset="utf-8"><title>${esc(o.codigo||'Preparación')}</title><style>@page{size:80mm auto;margin:3mm}body{width:74mm;margin:0;font-family:Arial,sans-serif;font-size:${detailPx}px;color:#000}.center{text-align:center}.line{border-top:1px dashed #000;margin:6px 0}h2{font-size:${titlePx}px;margin:0 0 3px}.small{font-size:${Math.max(9,detailPx-2)}px}.print-pickup-alert{border:3px solid #000;padding:7px 5px;margin:7px 0;text-align:center;font-size:${Math.max(titlePx,18)}px;font-weight:950;line-height:1.05}table{width:100%;border-collapse:collapse}td{vertical-align:top;padding:2px 0}.b{font-weight:bold}.sign{border-top:1px solid #000;margin-top:14px;padding-top:2px}@media print{button{display:none}}.lock-alert{background:#fff8e6;border:1px solid #fbbf24;color:#92400e;border-radius:16px;padding:12px 14px;font-size:13px;font-weight:800;line-height:1.35}.lock-alert.ok{background:#ecfdf5;border-color:#86efac;color:#047857}.lock-alert.bad{background:#fff1f2;border-color:#fecdd3;color:#991b1b}.queue-box{background:#fff;border:1px solid #e5e7eb;border-radius:18px;padding:12px 14px;display:flex;gap:10px;align-items:center;justify-content:space-between;box-shadow:0 8px 18px rgba(17,24,39,.05);margin:10px 0 14px}.queue-box b{font-size:16px}.queue-box .limit{font-size:12px;color:#64748b}.op-card.locked{background:#fffbeb;border-color:#fbbf24}.op-card.free{background:#fff}.op-card.done{background:#ecfdf5;border-color:#86efac}.btn.danger,.btn.danger:hover{background:#dc2626;color:white}.btn.outline{background:#fff;color:#111827;border:1px solid #d1d5db}.input-error{border-color:#ef4444!important;box-shadow:0 0 0 3px rgba(239,68,68,.14)!important}.no-granel-note{display:inline-block;margin-top:4px;color:#991b1b;font-weight:900;font-size:11px}
    .live-bar{background:#fff;border:1px solid var(--line);border-radius:18px;padding:12px 14px;margin:-6px 0 16px;display:flex;justify-content:space-between;align-items:center;gap:12px;box-shadow:var(--shadow2);flex-wrap:wrap}.live-left{display:flex;align-items:center;gap:9px;flex-wrap:wrap}.live-dot{width:10px;height:10px;border-radius:999px;background:#94a3b8;box-shadow:0 0 0 4px rgba(148,163,184,.15)}.live-dot.on{background:#10b981;box-shadow:0 0 0 4px rgba(16,185,129,.15)}.live-dot.warn{background:#f59e0b;box-shadow:0 0 0 4px rgba(245,158,11,.15)}.live-dot.bad{background:#ef4444;box-shadow:0 0 0 4px rgba(239,68,68,.15)}.live-title{font-weight:950}.live-sub{font-size:12px;color:var(--muted);font-weight:700}.live-notice{border:1px solid #bfdbfe;background:#eff6ff;border-radius:14px;padding:9px 11px;font-size:12px;color:#1e40af;font-weight:800}.live-notice b{display:block;color:#111827;margin-bottom:2px}.live-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
  </style></head><body><div class="center"><h2>PRODUCTOS CÉSAR</h2><div class="b">ORDEN DE PREPARACIÓN</div><div>${esc(o.codigo||'')}</div></div>${pickupAlert}<div class="line"></div><div>Fecha orden: ${shortDate(o.fecha)}</div><div>Fecha despacho: ${shortDate(dispatchDateOf(o))} ${o.hora_despacho?esc(String(o.hora_despacho).slice(0,5)):''}</div><div>Impreso: ${businessDateTime(now)}</div>${isFutureDispatch(o)?'<div class="b">NO DESPACHAR HOY</div>':''}<div class="line"></div><div class="b">CLIENTE</div><div>${esc(orderClientName(o))}</div><div>Tel: ${esc(orderClientPhone(o))}</div><div>Sector: ${esc(orderClientSector(o))}</div>${occasionalPrintBlock(o)}<div class="line"></div><div>Tomado por: ${esc(workerDisplayName(o.tomado_por||o.preparado_por)||'________________')}</div><div>Hora tomada: ${o.tomado_en?businessDateTime(o.tomado_en):'________________'}</div><div class="line"></div><div class="b">DETALLE SIN PRECIOS</div><table>${lines}</table><div class="line"></div>${o.notas?`<div>Notas: ${esc(o.notas)}</div>`:''}${o.nota_programacion?`<div>Programación: ${esc(o.nota_programacion)}</div>`:''}<div class="sign">Peso final</div><div class="sign">Paquetes</div><div class="sign">Firma despacho</div><button onclick="window.print()">Imprimir</button><script>setTimeout(()=>window.print(),400)<\/script></body></html>`;
  const w=window.open('','_blank','width=420,height=720'); if(!w) return alert('El navegador bloqueó la ventana de impresión. Permite popups para esta página.'); w.document.open(); w.document.write(html); w.document.close();
  const {error}=await sb.rpc('registrar_impresion_preparacion_v942',{
    p_orden_id:o.id,
    p_estado_esperado:o.estado
  });
  if(error) appAlert('El volante se abrió, pero no se pudo registrar la impresión de forma segura.\n\n'+error.message,'Impresión no auditada');
  await refreshVisibleModuleV9384(); render();
}
function shortageFollowupDialog(o,lines){
  const missing=lines.filter(x=>x.estado_preparacion==='Sin existencia').map(x=>{
    const item=(o.items||[]).find(i=>String(i.id)===String(x.id));
    return item ? `${item.producto_nombre} · ${Number(item.cantidad_pedida||0)} ${item.unidad||''}` : 'Artículo sin existencia';
  });
  if(!missing.length) return Promise.resolve({create:false,date:null,note:null});
  return new Promise(resolve=>{
    const tomorrow=new Date(Date.now()+86400000).toISOString().slice(0,10);
    const body=`<div class="form"><div class="lock-alert"><b>${missing.length} artículo(s) quedaron sin existencia.</b><br>Para que no se escape el servicio, puedes crear ahora una orden pendiente vinculada a ${esc(o.codigo||'la orden original')}.</div><div class="order-scroll">${missing.map(x=>`<div class="kv"><b>Faltante</b><span>${esc(x)}</span></div>`).join('')}</div><div class="grid2"><div class="field"><label>Fecha estimada</label><input id="stockPendingDate" type="date" value="${tomorrow}"></div><div class="field"><label>Observación</label><input id="stockPendingNote" placeholder="Ej. avisar al cliente al recibir"></div></div><div class="actions"><button class="btn gray" id="skipStockPending">Continuar sin crear</button><button class="btn" id="createStockPending">Crear orden pendiente</button></div></div>`;
    const m=openModal('Dar seguimiento a artículos faltantes',body,'La orden original continuará únicamente con lo preparado.');
    let done=false;
    const finish=value=>{ if(done) return; done=true; m.remove(); resolve(value); };
    $('#skipStockPending',m).onclick=()=>finish({create:false,date:null,note:null});
    $('#createStockPending',m).onclick=()=>{
      const date=$('#stockPendingDate',m).value;
      if(!date) return alert('Indica una fecha estimada de disponibilidad.');
      finish({create:true,date,note:$('#stockPendingNote',m).value||null});
    };
    $('.modal-x',m)?.addEventListener('click',()=>finish({create:false,date:null,note:null}),{once:true});
  });
}
function openPreparacionModal(o){
  if(!o) return;
  const locked=o.tomado_por && !canEditCarniceriaOrder(o);
  const prepByField=locked ? `<div class="field"><label>Despachador responsable</label><input id="prepBy" value="${esc(workerDisplayName(o.tomado_por)||currentWorkerName())}" readonly></div>` : workerSelectHtml('Carnicería','prepBy','Despachador responsable',o.tomado_por||currentWorkerName());
  const body=`<div class="form prep-form-r8 prep-form-r10 prep-form-r101"><div class="prep-order-summary"><div><b>${esc(o.codigo)} · ${esc(orderClientName(o))}</b><span>${(o.items||[]).length} artículo(s)</span></div><span class="badge info">${esc(o.estado||'Pedido recibido')}</span></div>${isStorePickup(o)?`<div class="pickup-alert"><b>${esc(pickupNoticeText())}</b><span>Preparar para entrega directa en el mostrador.</span></div>`:''}${o.tomado_por?`<div class="lock-alert prep-lock-r8 ${locked?'':'ok'}"><b>${esc(lockText(o))}</b>${locked?'<br>Solo lectura.':'<br>Pedido asignado a este despachador.'}</div>`:''}<div class="actions prep-top-actions"><button class="btn gray small" id="printPrepNow">Imprimir 80mm</button>${canReleaseCarnOrder(o)?`<button class="btn warn small" id="releaseFromPrep">Soltar</button>`:""}</div>${prepRowsHtml(o,locked)}<div id="prepPesoResumen" class="prep-weight-box prep-weight-r8">Calculado: <b>0 lb</b></div><div class="grid3 prep-footer-grid">${prepByField}<div class="field"><label>Peso balanza</label><input id="prepPeso" ${locked?'disabled readonly':''} type="number" step="0.01" value="${locked?(o.peso_preparado||''):''}" placeholder="0"></div><div class="field"><label>Paquetes</label><input id="prepPaq" ${locked?'disabled':''} type="number" value="${o.paquetes_preparados||1}"></div></div><div class="field prep-general-note"><label>Observación general</label><textarea id="prepNotas" ${locked?'disabled':''} placeholder="Opcional">${esc(o.notas_preparacion||'')}</textarea></div>${locked?'':`<div class="actions prep-save-actions"><button class="btn gray" id="savePrepDraft">Guardar avance</button><button class="btn" id="savePrep">Lista para facturar</button></div>`}</div>`;
  const m=openModal('Preparar / pesar orden',body, locked?'Modo lectura: orden tomada por otro despachador.':'Detalle por artículo, faltantes y pesaje.');
  m.classList.add('prep-modal-r8','prep-modal-r10','prep-modal-r101'); const prepCard=$('.modal-card',m); if(prepCard) prepCard.classList.add('prep-modal-card-r8','prep-modal-card-r10','prep-modal-card-r101');
  if(!locked && isAdminRole()) wireManual(m,'prepBy','prepByManual');
  updatePrepWeightUi(m);
  if(!locked){
    $$('[data-prepqty]',m).forEach(el=>el.addEventListener('input',()=>{ prepAutoStateForRow(el.closest('[data-detail-id]')); updatePrepWeightUi(m); }));
    $$('[data-prepqty]',m).forEach(el=>el.addEventListener('change',()=>{ const row=el.closest('[data-detail-id]'); if(row?.dataset.permiteFraccion==='false' && !isWholeQty(+el.value||0)){ el.classList.add('input-error'); alert(noFractionMessage($('.prod-name',row)?.textContent||'Artículo')); el.value=Math.max(1,Math.round(+el.value||1)); } else el.classList.remove('input-error'); prepAutoStateForRow(row); updatePrepWeightUi(m); }));
    $$('[data-prepstate]',m).forEach(el=>el.addEventListener('change',()=>{ updatePrepSubstituteVisibility(m); updatePrepWeightUi(m); if(el.value==='Sustituido') focusAndSelect($('[data-prepsub]',el.closest('[data-detail-id]'))); }));
    $$('[data-prepsub]',m).forEach(el=>el.addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); const row=el.closest('[data-detail-id]'); focusAndSelect($('[data-prepsubqty]',row)); } }));
    $$('[data-prepsubqty]',m).forEach(el=>{ el.addEventListener('input',()=>updatePrepWeightUi(m)); el.addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); const row=el.closest('[data-detail-id]'); const nextRow=row?.nextElementSibling; focusAndSelect(nextRow ? $('[data-prepqty]',nextRow) : $('#prepPeso',m)); } }); });
    wirePrepKeyboardFlow(m);
    updatePrepSubstituteVisibility(m);
    const pesoRealInput=$('#prepPeso',m); if(pesoRealInput) pesoRealInput.addEventListener('input',()=>updatePrepWeightUi(m));
    const prepDraftKey=draftKey('preparacion', o.id);
    attachPrepDraft(m, prepDraftKey, ()=>({
      prepBy:$('#prepBy',m)?.value||'', prepByManual:$('#prepByManual',m)?.value||'', peso:$('#prepPeso',m)?.value||'', paquetes:$('#prepPaq',m)?.value||'', notas:$('#prepNotas',m)?.value||'', rows:$$('[data-detail-id]',m).map(r=>({id:r.dataset.detailId,qty:$('[data-prepqty]',r)?.value||'',estado:$('[data-prepstate]',r)?.value||'',sustituto:$('[data-prepsub]',r)?.value||'',sustitutoQty:$('[data-prepsubqty]',r)?.value||''}))
    }), data=>{
      if(data.prepBy!==undefined && $('#prepBy',m)) $('#prepBy',m).value=data.prepBy||'';
      if(data.prepByManual!==undefined && $('#prepByManual',m)) $('#prepByManual',m).value=data.prepByManual||'';
      if(data.peso!==undefined) $('#prepPeso',m).value=data.peso||'';
      if(data.paquetes!==undefined) $('#prepPaq',m).value=data.paquetes||1;
      if(data.notas!==undefined) $('#prepNotas',m).value=data.notas||'';
      (data.rows||[]).forEach(x=>{ const r=$(`[data-detail-id="${x.id}"]`,m); if(!r) return; if($('[data-prepqty]',r)) $('[data-prepqty]',r).value=x.qty??''; if($('[data-prepstate]',r)) $('[data-prepstate]',r).value=x.estado||'Pendiente'; if($('[data-prepsub]',r)) $('[data-prepsub]',r).value=x.sustituto||''; if($('[data-prepsubqty]',r)) $('[data-prepsubqty]',r).value=x.sustitutoQty||''; }); updatePrepSubstituteVisibility(m); updatePrepWeightUi(m);
    });
  }
  $('#printPrepNow',m).onclick=()=>printPreparationTicket(o);
  const relBtn=$('#releaseFromPrep',m); if(relBtn) relBtn.onclick=()=>openReleaseOrderModal(o);
  if(locked) return;
  const prepMissingItems=()=>{
    const missing=[];
    $$('[data-detail-id]',m).forEach(row=>{
      const name=$('.prod-name',row)?.textContent||'Artículo';
      const estado=$('[data-prepstate]',row)?.value||'Pendiente';
      const qtyRaw=String($('[data-prepqty]',row)?.value||'').trim();
      if(estado==='Sustituido'){
        if(!($('[data-prepsub]',row)?.value||'')) missing.push(name+' · falta sustituto');
        if((+($('[data-prepsubqty]',row)?.value||0))<=0) missing.push(name+' · falta cantidad sustituta');
      }else if(qtyRaw===''){
        missing.push(name);
      }
    });
    return missing;
  };
  const updateDetailsAndOrder=async(final=false)=>{
    updatePrepWeightUi(m);
    const prepBy=workerValueFromModal(m,'prepBy')||o.tomado_por||currentWorkerName();
    const pesoCalculado=prepTotalEquivalentFromModal(m);
    const pesoReal=+$('#prepPeso',m).value||0;
    const paquetes=+$('#prepPaq',m).value||null;
    const notas=$('#prepNotas',m).value||null;
    if(!prepBy) return alert('No pude identificar el despachador responsable.');
    if(final){ const missing=prepMissingItems(); if(missing.length) return alert('Faltan artículos por preparar o resolver:\n- '+missing.join('\n- ')+'\n\nCompleta la cantidad preparada, marca 0 si no hay existencia o registra sustitución.'); }
    const requierePeso=normalizeWeightConfig(state.weightConfig||{}).exigirPesoReal && orderRequiresRealWeightFromModal(m);
    if(final && requierePeso && pesoReal<=0) return alert('Debes registrar el peso real del pedido antes de enviarlo a facturación.');
    let auditWeightCheck=null, auditWeightReason='';
    if(final && requierePeso && pesoCalculado>0 && pesoReal>0){
      const chk=weightControlCheck(pesoCalculado,pesoReal);
      if(chk.level==='block'){ await weightDiffDialog(chk); return; }
      if(chk.level==='warn'){ auditWeightReason=await weightDiffDialog(chk); if(!auditWeightReason) return; auditWeightCheck=chk; }
    }
    if(auditWeightCheck){
      const recorded=await recordAuditException({...auditOrderFields(o),modulo:'Carnicería',tipo_evento:'Diferencia de peso en preparación',gravedad:'Advertencia',motivo:auditWeightReason,valor_esperado:auditWeightCheck.calc,valor_registrado:auditWeightCheck.peso,diferencia:auditWeightCheck.diff,tolerancia_aviso:auditWeightCheck.aviso,tolerancia_maxima:auditWeightCheck.max,unidad:'lb',detalle:{despachador:prepBy,paquetes}});
      if(!recorded) return;
    }
    let prepLines;
    try{ prepLines=prepDetailPayload(m); }catch(err){ return alert(err.message); }
    const montoPreparado=invoiceExpectedAmountFromModal(m,o);
    const workBase={tomado_por:o.tomado_por||prepBy,tomado_en:o.tomado_en||new Date().toISOString(),tomado_por_user:o.tomado_por_user||state.user.id,peso_preparado:pesoReal||null,peso_calculado_preparado:pesoCalculado||null,paquetes_preparados:paquetes,notas_preparacion:notas,total_estimado:montoPreparado||o.total_estimado||0};
    let followup={create:false,date:null,note:null};
    if(final) followup=await shortageFollowupDialog(o,prepLines);
    const saved=final
      ? await sb.rpc('guardar_preparacion_faltantes_v9391',{p_orden_id:o.id,p_lineas:prepLines,p_cabecera:workBase,p_generar_pendiente:followup.create,p_fecha_estimada:followup.date,p_observacion:followup.note})
      : await sb.rpc('guardar_preparacion_v9381',{p_orden_id:o.id,p_lineas:prepLines,p_cabecera:workBase,p_final:false});
    if(saved.error) return alert('No se pudo guardar la preparación completa: '+saved.error.message+'\n\nVerifica que aplicaste los SQL 44 y 50.');
    clearDraftLocal(draftKey('preparacion', o.id));
    m.remove(); await refreshVisibleModuleV9384(); render();
    const pendingCode=saved.data?.pendiente_codigo;
    toast(final
      ? (pendingCode?`Orden enviada a Facturación y ${pendingCode} creada para los faltantes.`:'Orden preparada y enviada a Facturación.')
      : 'Avance guardado. La orden aún no está marcada como preparada.');
  };
  $('#savePrepDraft',m).onclick=()=>updateDetailsAndOrder(false);
  $('#savePrep',m).onclick=()=>updateDetailsAndOrder(true);
}
function invoiceExpectedAmount(o){
  return calculatePreparedInvoiceAmount(o,{
    substitutePriceByName:(name,item)=>Number(productByName(name||'')?.precio_defecto)||Number(item?.precio)||0
  });
}

async function quickInvoiceOrder(o,button){
  if(!o) return alert('No encontré la orden. Actualiza la pantalla e intenta nuevamente.');
  if(button?.dataset.processing==='1') return;
  const fresh=state.ordenes.find(x=>String(x.id)===String(o.id))||o;
  let transition;
  try{
    const amount=invoiceExpectedAmount(fresh);
    const preparedWeight=Number(fresh.peso_preparado || orderLastPeso(fresh,'Preparado')?.libras || 0);
    transition=buildQuickInvoiceTransition(fresh,{
      workerName:currentWorkerName(),
      nowIso:new Date().toISOString(),
      amount,
      preparedWeight,
      storePickup:isStorePickup(fresh),
      internalSale:isInternalSale(fresh)
    });
  }catch(err){
    return alert(err.message||String(err));
  }

  const originalText=button?.textContent||'Marcar facturada';
  if(button){
    button.dataset.processing='1';
    button.disabled=true;
    button.textContent='Procesando...';
  }

  try{
    const {estado:ignoredState,...quickChanges}=transition.payload;
    const {data,error}=await sb.rpc('cambiar_estado_orden_v9382',{p_orden_id:fresh.id,p_estado_esperado:transition.oldState,p_estado_nuevo:transition.nextState,p_cambios:quickChanges,p_comentario:transition.comment,p_modulo:'facturacion'});

    if(error) throw error;
    if(!Array.isArray(data) || data.length!==1){
      throw new Error('La orden cambió de estado en otro equipo. Actualiza la pantalla antes de continuar.');
    }

    await refreshVisibleModuleV9384();
    render();
    toast(transition.nextState==='Lista para retiro'
      ? 'Orden facturada y enviada a Retiros.'
      : 'Orden facturada y enviada a Validación.');
  }catch(err){
    console.error('quickInvoiceOrder',err);
    alert('No se pudo marcar la orden como facturada. '+(err.message||err));
    if(button?.isConnected){
      button.dataset.processing='0';
      button.disabled=false;
      button.textContent=originalText;
    }
  }
}

function invoiceExpectedAmountFromModal(m,o){
  let total=0;
  $$('[data-detail-id]',m).forEach(row=>{
    const id=row.dataset.detailId;
    const item=(o?.items||[]).find(i=>String(i.id)===String(id));
    if(!item) return;
    const estado=$('[data-prepstate]',row)?.value||'Pendiente';
    if(estado==='Sin existencia') return;
    if(estado==='Sustituido'){
      const sub=$('[data-prepsub]',row)?.value||'';
      const subQty=+($('[data-prepsubqty]',row)?.value||0);
      const p=productByName(sub);
      total += subQty * (Number(p?.precio_defecto)||Number(item.precio)||0);
      return;
    }
    const raw=String($('[data-prepqty]',row)?.value||'').trim();
    const qty=raw==='' ? Number(item.cantidad_pedida||0) : Number(raw||0);
    total += qty * Number(item.precio||0);
  });
  return Number(total.toFixed(2));
}
function normalizeInvoiceConfig(cfg={}){ const d={avisoMonto:100,avisoPct:2,maxMonto:1000,maxPct:10,metodo:'mayor',exigirPesoFacturado:true,avisoPesoLb:0.5,avisoPesoPct:2,maxPesoLb:3,maxPesoPct:8,metodoPeso:'mayor'}; return {avisoMonto:Number(cfg.avisoMonto??d.avisoMonto)||d.avisoMonto,avisoPct:Number(cfg.avisoPct??d.avisoPct)||d.avisoPct,maxMonto:Number(cfg.maxMonto??d.maxMonto)||d.maxMonto,maxPct:Number(cfg.maxPct??d.maxPct)||d.maxPct,metodo:cfg.metodo||d.metodo,exigirPesoFacturado:cfg.exigirPesoFacturado!==false,avisoPesoLb:Number(cfg.avisoPesoLb??d.avisoPesoLb)||d.avisoPesoLb,avisoPesoPct:Number(cfg.avisoPesoPct??d.avisoPesoPct)||d.avisoPesoPct,maxPesoLb:Number(cfg.maxPesoLb??d.maxPesoLb)||d.maxPesoLb,maxPesoPct:Number(cfg.maxPesoPct??d.maxPesoPct)||d.maxPesoPct,metodoPeso:cfg.metodoPeso||d.metodoPeso}; }
function invoiceToleranceValue(expected, amount, pct, metodo='mayor'){ const byAmount=Number(amount)||0, byPct=(Number(expected)||0)*(Number(pct)||0)/100; if(metodo==='monto') return byAmount; if(metodo==='porcentaje') return byPct; return Math.max(byAmount,byPct); }
function invoiceAmountCheck(expected, actual){ const cfg=normalizeInvoiceConfig(appCfg('facturacion',{})); const exp=Number(expected)||0, act=Number(actual)||0, diff=Number((act-exp).toFixed(2)), abs=Math.abs(diff); if(!exp || !act) return {cfg,expected:exp,actual:act,diff,abs,aviso:0,max:0,level:'ok'}; const aviso=invoiceToleranceValue(exp,cfg.avisoMonto,cfg.avisoPct,cfg.metodo); const max=invoiceToleranceValue(exp,cfg.maxMonto,cfg.maxPct,cfg.metodo); const level=abs>max?'block':(abs>aviso?'warn':'ok'); return {cfg,expected:exp,actual:act,diff,abs,aviso:Number(aviso.toFixed(2)),max:Number(max.toFixed(2)),level}; }
function invoiceAmountAlertHtml(expected, actual){ const chk=invoiceAmountCheck(expected, actual); if(!chk.expected) return `<div class="lock-alert ok">No hay monto esperado para comparar.</div>`; if(!chk.actual) return `<div class="lock-alert bad">Debes registrar el monto de la factura.</div>`; const diffTxt=(chk.diff>0?'+':'')+money(chk.diff).replace(appCfg('empresa.moneda','RD$')+' ',''); const base=`Monto esperado ${money(chk.expected)} · factura ${money(chk.actual)} · diferencia ${diffTxt}`; if(chk.level==='ok') return `<div class="lock-alert ok">${esc(base)}. Dentro de tolerancia.</div>`; if(chk.level==='warn') return `<div class="lock-alert">${esc(base)}. Requiere revisión antes de guardar.</div>`; return `<div class="lock-alert bad">${esc(base)}. Supera la tolerancia máxima y no puede continuar.</div>`; }
function invoiceAmountDiffDialog(check){
  if(check.level==='block'){ alert('El monto de factura supera la tolerancia máxima. Debes corregirlo antes de continuar.'); return Promise.resolve(null); }
  return responsibilityDecisionDialog({title:'Verificar monto de factura',message:'El monto facturado tiene una diferencia fuera de la tolerancia de aviso.',rows:[['Monto esperado',money(check.expected)],['Monto factura',money(check.actual)],['Diferencia',`${check.diff>0?'+':''}${money(check.diff)}`],['Tolerancia aviso',money(check.aviso)],['Tolerancia máxima',money(check.max)]]});
}

function invoiceWeightToleranceValue(expected, lb, pct, metodo='mayor'){
  const byLb=Number(lb)||0, byPct=(Number(expected)||0)*(Number(pct)||0)/100;
  if(metodo==='libras') return byLb;
  if(metodo==='porcentaje') return byPct;
  return Math.max(byLb,byPct);
}
function invoiceWeightCheck(expected, actual){
  const cfg=normalizeInvoiceConfig(appCfg('facturacion',{}));
  const exp=Number(expected)||0, act=Number(actual)||0, diff=Number((act-exp).toFixed(2)), abs=Math.abs(diff);
  if(!exp && cfg.exigirPesoFacturado) return {cfg,expected:exp,actual:act,diff,abs,aviso:0,max:0,level:act>0?'warn':'block',reason:'missing_expected'};
  if(!exp) return {cfg,expected:exp,actual:act,diff,abs,aviso:0,max:0,level:'ok'};
  if(!act) return {cfg,expected:exp,actual:act,diff,abs,aviso:0,max:0,level:cfg.exigirPesoFacturado?'block':'ok',reason:'missing_actual'};
  const aviso=invoiceWeightToleranceValue(exp,cfg.avisoPesoLb,cfg.avisoPesoPct,cfg.metodoPeso);
  const max=invoiceWeightToleranceValue(exp,cfg.maxPesoLb,cfg.maxPesoPct,cfg.metodoPeso);
  const level=abs>max?'block':(abs>aviso?'warn':'ok');
  return {cfg,expected:exp,actual:act,diff,abs,aviso:Number(aviso.toFixed(2)),max:Number(max.toFixed(2)),level};
}
function invoiceWeightAlertHtml(expected, actual){
  const chk=invoiceWeightCheck(expected, actual);
  if(chk.reason==='missing_expected') return `<div class="lock-alert bad">No hay peso preparado de Carnicería para comparar. Devuelve o revisa la orden antes de facturar.</div>`;
  if(chk.reason==='missing_actual') return `<div class="lock-alert bad">Debes registrar el peso facturado antes de pasar a Validación.</div>`;
  if(!chk.expected && !chk.actual) return `<div class="lock-alert ok">Esta orden no tiene peso de Carnicería para comparar.</div>`;
  const diffTxt=(chk.diff>0?'+':'')+chk.diff+' lb';
  const base=`Peso preparado ${chk.expected||0} lb · peso facturado ${chk.actual||0} lb · diferencia ${diffTxt}`;
  if(chk.level==='ok') return `<div class="lock-alert ok">${esc(base)}. Dentro de tolerancia.</div>`;
  if(chk.level==='warn') return `<div class="lock-alert">${esc(base)}. Requiere revisión antes de guardar.</div>`;
  return `<div class="lock-alert bad">${esc(base)}. Supera la tolerancia máxima y no puede continuar.</div>`;
}
function invoiceWeightDiffDialog(check){
  if(check.level==='block'){ alert('El peso facturado supera la tolerancia máxima. Debes corregirlo antes de continuar.'); return Promise.resolve(null); }
  return responsibilityDecisionDialog({title:'Verificar peso facturado',message:'El peso facturado tiene una diferencia fuera de la tolerancia de aviso.',rows:[['Peso preparado',`${check.expected||0} lb`],['Peso facturado',`${check.actual||0} lb`],['Diferencia',`${check.diff>0?'+':''}${check.diff} lb`],['Tolerancia aviso',`${check.aviso||0} lb`],['Tolerancia máxima',`${check.max||0} lb`]]});
}

function openFacturaModal(o){
  if(!o) return;
  const canChooseBy=isAdminRole() || puede('configuracion');
  const defaultBy=o.facturado_por || currentWorkerName();
  const montoEsperado=invoiceExpectedAmount(o);
  const pesoEsperado=Number(o.peso_preparado || orderLastPeso(o,'Preparado')?.libras || o.peso_facturado || 0);
  const byField=canChooseBy ? `<select id="facBy">${employeeOptionsWithDefault('Facturación',defaultBy)}</select>${manualInput('facByManual')}` : `<input id="facBy" readonly value="${esc(defaultBy)}"><div class="hint">Se usa tu usuario de acceso.</div>`;
  const body=`<div class="form invoice-form"><div class="client-card" style="grid-template-columns:1fr"><div><div class="client-title">${esc(o.codigo)} · ${esc(orderClientName(o))}</div><div class="client-sub">Monto esperado: ${money(montoEsperado)} · Peso preparado: ${pesoEsperado?pesoEsperado+' lb':'—'} · ${orderItemsText(o,7)}</div></div></div><div class="grid2"><div class="field"><label>Facturado por</label>${byField}</div><div class="field"><label>No. factura</label><input id="facNo" value="${esc(o.factura_no||'')}" placeholder="Número de factura"></div></div><div class="grid3"><div class="field"><label>Monto factura</label><input id="facMonto" type="number" step="0.01" value="${o.total_factura||montoEsperado||0}"><div class="hint">Debe coincidir con el monto actualizado por Carnicería.</div></div><div class="field"><label>Peso facturado</label><input id="facPeso" type="number" step="0.01" value="${o.peso_facturado||pesoEsperado||''}"><div class="hint">Debe coincidir con el peso preparado en Carnicería.</div></div><div class="field"><label>Condición</label><select id="facCond"><option ${o.condicion_pago==='Crédito'?'selected':''}>Crédito</option><option ${o.condicion_pago==='Contado'?'selected':''}>Contado</option></select></div></div><div id="facMontoAlert">${invoiceAmountAlertHtml(montoEsperado, o.total_factura||montoEsperado||0)}</div><div id="facPesoAlert">${invoiceWeightAlertHtml(pesoEsperado, o.peso_facturado||pesoEsperado||0)}</div>${isStorePickup(o)?`<div class="pickup-alert"><b>${esc(pickupNoticeText())}</b><span>Después de facturar quedará Lista para retiro y no pasará a Delivery ni Liquidación.</span></div>`:''}<button class="btn" id="saveFac">${isStorePickup(o)?'Guardar factura y pasar a retiros':'Guardar factura y pasar a validación'}</button></div>`;
  const m=openModal('Registrar factura',body,'Flujo rápido: facturado por → factura → monto → peso → condición → guardar.');
  if(canChooseBy) wireManual(m,'facBy','facByManual');
  const facBy=$('#facBy',m), facNo=$('#facNo',m), facMonto=$('#facMonto',m), facPeso=$('#facPeso',m), facCond=$('#facCond',m), save=$('#saveFac',m);
  const focusEl=el=>{ if(!el) return; setTimeout(()=>{el.focus(); if(el.select) el.select();},0); };
  const updateMontoAlert=()=>{ const box=$('#facMontoAlert',m); if(box) box.innerHTML=invoiceAmountAlertHtml(montoEsperado,+facMonto.value||0); };
  const updatePesoAlert=()=>{ const box=$('#facPesoAlert',m); if(box) box.innerHTML=invoiceWeightAlertHtml(pesoEsperado,+facPeso.value||0); };
  facMonto.oninput=updateMontoAlert;
  facPeso.oninput=updatePesoAlert;
  if(facBy) facBy.addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); focusEl(facNo); } });
  if(facNo) facNo.addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); focusEl(facMonto); } });
  if(facMonto) facMonto.addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); focusEl(facPeso); } });
  if(facPeso) facPeso.addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); focusEl(facCond); } });
  if(facCond) facCond.addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); focusEl(save); } });
  if(save) save.addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); save.click(); } });
  save.onclick=async()=>{
    const by=canChooseBy?getSelectManual(m,'facBy','facByManual'):String(facBy.value||'').trim();
    if(!by) return alert('Selecciona quién facturó.');
    if(!facNo.value.trim()) return alert('Registra el número de factura.');
    const monto=+facMonto.value||0;
    if(monto<=0) return alert('Registra el monto de la factura.');
    const chk=invoiceAmountCheck(montoEsperado,monto);
    let alertaMonto='';
    if(chk.level==='block'){
      await invoiceAmountDiffDialog(chk);
      return;
    }
    if(chk.level==='warn'){
      const reason=await invoiceAmountDiffDialog(chk);
      if(!reason) return;
      const recorded=await recordAuditException({...auditOrderFields(o),modulo:'Facturación',tipo_evento:'Diferencia en monto de factura',gravedad:'Advertencia',motivo:reason,valor_esperado:chk.expected,valor_registrado:chk.actual,diferencia:chk.diff,tolerancia_aviso:chk.aviso,tolerancia_maxima:chk.max,unidad:'RD$',detalle:{factura:facNo.value, facturado_por:by}});
      if(!recorded) return;
      alertaMonto=`Monto facturado bajo responsabilidad. Esperado ${money(montoEsperado)}, registrado ${money(monto)}.`;
    }
    const peso=+facPeso.value||0;
    const reqPesoFact=normalizeInvoiceConfig(appCfg('facturacion',{})).exigirPesoFacturado && (orderRequiresFinalWeight(o) || pesoEsperado>0);
    if(reqPesoFact && peso<=0) return alert('Registra el peso facturado antes de pasar a Validación.');
    const chkPeso=invoiceWeightCheck(pesoEsperado,peso);
    let alertaPeso='';
    if(reqPesoFact && chkPeso.level==='block'){
      await invoiceWeightDiffDialog(chkPeso);
      return;
    }
    if(reqPesoFact && chkPeso.level==='warn'){
      const reason=await invoiceWeightDiffDialog(chkPeso);
      if(!reason) return;
      const recorded=await recordAuditException({...auditOrderFields(o),modulo:'Facturación',tipo_evento:'Diferencia de peso facturado',gravedad:'Advertencia',motivo:reason,valor_esperado:chkPeso.expected,valor_registrado:chkPeso.actual,diferencia:chkPeso.diff,tolerancia_aviso:chkPeso.aviso,tolerancia_maxima:chkPeso.max,unidad:'lb',detalle:{factura:facNo.value, facturado_por:by}});
      if(!recorded) return;
      alertaPeso=`Peso facturado bajo responsabilidad. Preparado ${pesoEsperado} lb, facturado ${peso} lb.`;
    }
    if(peso>0) await sb.from('orden_pesos').insert({orden_id:o.id,tipo:'Facturado',libras:peso,notas:alertaPeso||'Peso facturado',creado_por:state.user.id});
    m.remove();
    const nextState=isStorePickup(o)?'Lista para retiro':'Facturada';
    await setOrderState(o,nextState,{facturado_por:by,facturado_en:new Date().toISOString(),factura_no:facNo.value||null,total_factura:monto,peso_facturado:peso||null,condicion_pago:isInternalSale(o)?'Contado':(facCond.value||'Crédito'),delivery_nombre:isStorePickup(o)?null:o.delivery_nombre,notas_estado:[alertaMonto,alertaPeso,isStorePickup(o)?'Lista para retiro en negocio':'Facturada'].filter(Boolean).join(' · ')});
  };
  focusEl(facBy);
}

function specialCaseEmployeeOptions(selected=''){
  const rows=state.empleados.filter(e=>e.activo!==false);
  const names=[...new Set([...rows.map(e=>e.nombre), ...activeDeliveryNames(), currentWorkerName()].filter(Boolean))];
  const sel=String(selected||'').trim();
  return `<option value="">Sin asignar</option>${names.map(n=>`<option ${norm(n)===norm(sel)?'selected':''}>${esc(n)}</option>`).join('')}<option value="__manual__">Otro / manual</option>`;
}
function specialCasePatchFromModal(m,o){
  const type=$('#caseType',m)?.value||orderType(o);
  const rule=orderTypeRule(type);
  const reqDelivery=$('#caseReqDelivery',m)?.checked || !!rule.delivery;
  const status=$('#caseStatus',m)?.value||'Abierto';
  const resp=$('#caseResp',m)?.value==='__manual__'?($('#caseRespManual',m)?.value||'').trim():($('#caseResp',m)?.value||'');
  const notas=[`Tipo caso: ${type}`,`Estado caso: ${status}`,`Responsable: ${resp||'Sin asignar'}`,$('#caseAction',m)?.value?`Acción: ${$('#caseAction',m).value}`:'',$('#casePick',m)?.value?`Recoger: ${$('#casePick',m).value}`:'',$('#caseGive',m)?.value?`Entregar/cambiar: ${$('#caseGive',m).value}`:'',$('#caseResolution',m)?.value?`Resolución: ${$('#caseResolution',m).value}`:''].filter(Boolean).join('\n');
  const patch={tipo_orden:type,requiere_preparacion:!!rule.prep,requiere_facturacion:!!rule.invoice,requiere_delivery:!!reqDelivery,modalidad_entrega:reqDelivery?'Delivery':'No aplica',delivery_nombre:reqDelivery?(o?.delivery_nombre||null):null,estado_caso_especial:status,responsable_caso:resp||null,accion_caso:$('#caseAction',m)?.value||null,producto_recoger:$('#casePick',m)?.value||null,producto_entregar:$('#caseGive',m)?.value||null,monto_ajuste:Number($('#caseAmount',m)?.value||0),fecha_compromiso:$('#caseDue',m)?.value||null,requiere_nota_credito:!!$('#caseCredit',m)?.checked,resolucion_caso:$('#caseResolution',m)?.value||null,notas:[o?.notas||'',`[${businessDateTime(new Date())}] ${notas}`].filter(Boolean).join('\n')};
  if(reqDelivery && ['Abierto','En revisión','Asignado a delivery'].includes(status) && !['Asignada a delivery','En ruta','Cobrado','Entregado a crédito','No entregado','Devuelto parcial','Anulado'].includes(o?.estado||'')) patch.estado='Validada para delivery';
  if(['Resuelto','Cerrado'].includes(status)) patch.estado=o?.estado==='Anulado'?'Anulado':(o?.estado||'Pedido recibido');
  return patch;
}
async function saveSpecialCasePatch(o,patch,comentario){
  return await sb.rpc('actualizar_caso_especial_v942',{
    p_orden_id:o.id,
    p_estado_esperado:o.estado,
    p_actualizado_en_esperado:o.actualizado_en||null,
    p_cambios:patch,
    p_comentario:comentario||'Seguimiento actualizado'
  });
}
function openSpecialCaseQuickModal(){
  const rows=state.clientes.filter(c=>c.archivado!==true).slice(0,2000);
  const body=`<div class="form"><div class="grid2"><div class="field"><label>Cliente</label><input id="quickCaseClientText" list="quickCaseClients" placeholder="Buscar cliente..."><datalist id="quickCaseClients">${rows.map(c=>`<option value="${esc(c.negocio)}" data-id="${c.id}">${esc(c.codigo||'')} ${esc(c.telefono||'')}</option>`).join('')}</datalist></div><div class="field"><label>Tipo de caso</label><select id="quickCaseType">${orderTypes().filter(x=>x!=='Pedido normal').map(x=>`<option>${esc(x)}</option>`).join('')}</select></div></div><div class="grid2"><div class="field"><label>Responsable</label><select id="quickCaseResp">${specialCaseEmployeeOptions(currentWorkerName())}</select><input id="quickCaseRespManual" placeholder="Nombre manual" style="display:none;margin-top:8px"></div><div class="field"><label>Fecha compromiso</label><input id="quickCaseDue" type="date" value="${today()}"></div></div><div class="field"><label>Detalle / acción requerida</label><textarea id="quickCaseAction" placeholder="Ej: recoger mercancía, cambiar producto, revisar reclamo, emitir crédito..."></textarea></div><div class="grid2"><div class="field"><label>Producto a recoger</label><input id="quickCasePick" placeholder="Opcional"></div><div class="field"><label>Producto a entregar / cambio</label><input id="quickCaseGive" placeholder="Opcional"></div></div><label class="checkline"><input type="checkbox" id="quickCaseReqDelivery"> Requiere delivery/recogida</label><label class="checkline"><input type="checkbox" id="quickCaseCredit"> Puede requerir nota de crédito</label><button class="btn" id="saveQuickCase">Crear caso especial</button></div>`;
  const m=openModal('Nuevo caso especial',''+body,'Para devoluciones, cambios o reclamos. Queda visible en Órdenes → Devol./Incid.');
  wireManual(m,'quickCaseResp','quickCaseRespManual');
  const sync=()=>{ const t=$('#quickCaseType',m).value; $('#quickCaseReqDelivery',m).checked=orderTypeRule(t).delivery; };
  $('#quickCaseType',m).onchange=sync; sync();
  $('#saveQuickCase',m).onclick=async()=>{
    const name=$('#quickCaseClientText',m).value.trim();
    const cl=state.clientes.find(c=>norm(c.negocio)===norm(name)) || state.clientes.find(c=>norm(c.codigo)===norm(name) || norm(c.telefono)===norm(name));
    if(!cl) return alert('Selecciona un cliente válido.');
    const type=$('#quickCaseType',m).value, rule=orderTypeRule(type), reqDelivery=$('#quickCaseReqDelivery',m).checked || rule.delivery;
    const resp=$('#quickCaseResp',m).value==='__manual__'?($('#quickCaseRespManual',m).value||'').trim():$('#quickCaseResp',m).value;
    const action=$('#quickCaseAction',m).value.trim();
    if(!action) return alert('Describe la acción requerida para el caso.');
    const r=await sb.rpc('crear_caso_especial_v9397',{p_caso:{
      cliente_id:cl.id,
      tipo_orden:type,
      requiere_delivery:!!reqDelivery,
      responsable_caso:resp||null,
      accion_caso:action,
      producto_recoger:$('#quickCasePick',m).value||null,
      producto_entregar:$('#quickCaseGive',m).value||null,
      fecha_compromiso:$('#quickCaseDue',m).value||null,
      requiere_nota_credito:$('#quickCaseCredit',m).checked
    }});
    if(r.error) return alert(r.error.message+'\n\nVerifica que aplicaste el SQL 50 de la V9.3.9.7.');
    m.remove(); await refreshVisibleModuleV9384(); state.orderView='especiales'; render(); toast('Caso especial creado');
  };
}
function openSpecialCaseModal(o){
  if(!o) return alert('No encontré este caso.');
  const hist=specialCaseHistoryFor(o);
  const body=`<div class="form"><div class="client-card" style="grid-template-columns:1fr"><div><div class="client-title">${esc(o.codigo||('ORD-'+o.id))} · ${esc(orderClientName(o))}</div><div class="client-sub">${esc(orderType(o))} · Estado operativo: ${esc(o.estado||'')} · Factura ${esc(o.factura_no||'—')}</div><div class="badges">${orderCustomerBadge(o)}${orderDeliveryModeBadge(o)}${orderTypeBadge(o)}${specialCaseBadge(o)}${o.requiere_nota_credito?'<span class="badge warn">Nota crédito</span>':''}</div></div></div><div class="grid3"><div class="field"><label>Tipo</label><select id="caseType">${orderTypes().filter(x=>x!=='Pedido normal').map(x=>`<option ${orderType(o)===x?'selected':''}>${esc(x)}</option>`).join('')}</select></div><div class="field"><label>Estado del caso</label><select id="caseStatus">${specialCaseStates().map(x=>`<option ${specialCaseStatus(o)===x?'selected':''}>${esc(x)}</option>`).join('')}</select></div><div class="field"><label>Fecha compromiso</label><input id="caseDue" type="date" value="${esc(o.fecha_compromiso||today())}"></div></div><div class="grid2"><div class="field"><label>Responsable</label><select id="caseResp">${specialCaseEmployeeOptions(o.responsable_caso||currentWorkerName())}</select><input id="caseRespManual" placeholder="Nombre manual" style="display:none;margin-top:8px"></div><div class="field"><label>Monto ajuste / crédito</label><input id="caseAmount" type="number" step="0.01" value="${Number(o.monto_ajuste||0)}"></div></div><div class="grid2"><div class="field"><label>Producto a recoger</label><input id="casePick" value="${esc(o.producto_recoger||'')}"></div><div class="field"><label>Producto a entregar / cambio</label><input id="caseGive" value="${esc(o.producto_entregar||'')}"></div></div><div class="field"><label>Acción requerida</label><textarea id="caseAction">${esc(o.accion_caso||'')}</textarea></div><div class="field"><label>Resolución / comentario</label><textarea id="caseResolution">${esc(o.resolucion_caso||'')}</textarea></div><div class="grid2"><label class="checkline"><input type="checkbox" id="caseReqDelivery" ${orderRequiresDelivery(o)?'checked':''}> Requiere delivery/recogida</label><label class="checkline"><input type="checkbox" id="caseCredit" ${o.requiere_nota_credito?'checked':''}> Requiere nota de crédito / ajuste</label></div><div class="lock-alert info"><b>Conexión operativa:</b> si marcas que requiere delivery, el caso pasa a Validación/Delivery para recogida o entrega. Si queda resuelto/cerrado, se conserva en historial.</div><div class="section-title">Historial del caso</div>${hist.slice(0,8).map(h=>`<div class="kv"><b>${businessDateTime(h.creado_en)}</b><span>${esc(h.estado_caso||'')} · ${esc(h.comentario||'')}</span></div>`).join('')||'<div class="empty">Sin historial estructurado. Ejecuta SQL V9.1 para historial formal.</div>'}<button class="btn" id="saveSpecialCase">Guardar seguimiento</button></div>`;
  const m=openModal('Gestionar devolución / cambio / incidencia',body,'V9.1 · seguimiento conectado a delivery, liquidación, cliente y auditoría.');
  wireManual(m,'caseResp','caseRespManual');
  $('#saveSpecialCase',m).onclick=async()=>{
    const patch=specialCasePatchFromModal(m,o);
    const comentario=$('#caseResolution',m).value||$('#caseAction',m).value||'Seguimiento actualizado';
    const r=await saveSpecialCasePatch(o,patch,comentario);
    if(r.error) return alert(r.error.message);
    m.remove(); await refreshVisibleModuleV9384(); render(); toast('Caso actualizado');
  };
}
function printSpecialCasesReport(){
  const rows=state.ordenes.filter(o=>isSpecialOrder(o) && o.estado!=='Anulado');
  const html=`<!doctype html><html><head><meta charset="utf-8"><title>Casos especiales</title><style>body{font-family:Arial,sans-serif;padding:20px;color:#111}h1{margin:0 0 6px}table{width:100%;border-collapse:collapse;margin-top:16px;font-size:12px}th,td{border:1px solid #ddd;padding:7px;text-align:left}th{background:#f3f4f6}.sign{display:inline-block;width:240px;border-top:1px solid #000;margin-top:36px;margin-right:40px}@media print{button{display:none}}</style></head><body><h1>Reporte de devoluciones, cambios e incidencias</h1><p><b>Fecha:</b> ${businessDateTime(new Date())} · <b>Total:</b> ${rows.length}</p><table><thead><tr><th>Orden</th><th>Cliente</th><th>Tipo</th><th>Estado caso</th><th>Responsable</th><th>Compromiso</th><th>Acción</th><th>Ajuste</th></tr></thead><tbody>${rows.map(o=>`<tr><td>${esc(o.codigo||'')}</td><td>${esc(orderClientName(o))}</td><td>${esc(orderType(o))}</td><td>${esc(specialCaseStatus(o))}</td><td>${esc(o.responsable_caso||'')}</td><td>${esc(o.fecha_compromiso||'')}</td><td>${esc(o.accion_caso||'')}</td><td>${money(o.monto_ajuste||0)}</td></tr>`).join('')}</tbody></table><div class="sign">Revisado por</div><button onclick="window.print()">Imprimir</button><script>setTimeout(()=>window.print(),500)<\/script></body></html>`;
  const w=window.open('','_blank','width=1000,height=720'); if(!w) return alert('Permite ventanas emergentes para imprimir.'); w.document.open(); w.document.write(html); w.document.close();
}

function openReturnToInvoiceModal(o){
  if(!o) return;
  if(!orderRequiresInvoice(o)) return alert('Esta orden no requiere facturación.');
  const body=`<div class="form"><div class="client-card" style="grid-template-columns:1fr"><div><div class="client-title">${esc(o.codigo)} · ${esc(orderClientName(o))}</div><div class="client-sub">Factura actual: ${esc(o.factura_no||'—')} · ${money(o.total_factura||o.total_estimado)} · Estado: ${esc(o.estado||'')}</div></div></div><div class="warning"><b>La orden volverá a Facturación.</b><br>Se mantendrá la factura registrada como referencia, pero quedará pendiente de corregir/guardar nuevamente. Todo se registrará en el historial.</div><div class="field"><label>Motivo de devolución</label><textarea id="returnReason" placeholder="Ej: número de factura incorrecto, monto mal registrado, peso facturado incorrecto..."></textarea></div><button class="btn warn" id="confirmReturnInvoice">Devolver a Facturación</button></div>`;
  const m=openModal('Devolver orden a Facturación',body,'Úsalo solo cuando haya error en factura antes de entregar a delivery.');
  const reason=$('#returnReason',m); const btn=$('#confirmReturnInvoice',m);
  reason.addEventListener('keydown',e=>{ if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); btn.focus(); } });
  btn.addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); btn.click(); } });
  btn.onclick=async()=>{
    const motivo=String(reason.value||'').trim();
    if(!motivo) return alert('Escribe el motivo para dejar evidencia en historial.');
    m.remove();
    await setOrderState(o,'Impresa para facturar',{notas_estado:'Devuelta desde Validación a Facturación. Motivo: '+motivo});
  };
  setTimeout(()=>reason.focus(),0);
}
function openValidacionModal(o){
  if(!o) return;
  const canChooseBy=isAdminRole() || puede('configuracion');
  const defaultBy=o.validado_por || currentWorkerName();
  const defaultMonto=normalizeValidationInvoiceAmount(o.total_factura||o.total_estimado||0);
  const defaultPeso=o.peso_validado||'';
  const reqPeso=orderRequiresFinalWeight(o);
  const ref=validationWeightReference(o);
  const byField=canChooseBy
    ? `<select id="valBy">${employeeOptionsWithDefault('Validación',defaultBy)}</select>${manualInput('valByManual')}`
    : `<input id="valBy" readonly value="${esc(defaultBy)}"><div class="hint">Se usa tu usuario de acceso. No puedes validar a nombre de otro empleado.</div>`;
  const body=`<div class="form validation-form"><div class="client-card" style="grid-template-columns:1fr"><div><div class="client-title">${esc(o.codigo)} · ${esc(orderClientName(o))}</div><div class="client-sub">Factura ${esc(o.factura_no||'—')} · Monto actual ${money(defaultMonto)}${ref.value?` · Ref. peso: ${ref.value} lb`:''}</div></div></div><div class="grid4 validation-individual-grid"><div class="field"><label>Validado / entregado por</label>${byField}</div><div class="field validation-final-amount"><label>Monto final de factura *</label><input id="valMonto" type="number" step="0.01" min="0.01" inputmode="decimal" value="${defaultMonto||''}" placeholder="Monto correcto"><div class="hint">Este será el monto definitivo para Delivery y Liquidación.</div></div><div class="field"><label>Peso final entregado</label><input id="valPeso" type="number" step="0.01" min="0" inputmode="decimal" value="${defaultPeso}" placeholder="Escribe peso final${reqPeso?' obligatorio':''}"><div class="hint">${reqPeso?'Obligatorio porque la orden incluye productos que suman peso.':'No obligatorio si todos los productos no pesan.'}</div></div><div class="field"><label>Responsable del viaje</label><select id="valDelivery"><option value="">Selecciona responsable</option>${tripResponsibleOptions(o.delivery_nombre||'',inferResponsibleType(o.delivery_nombre,state.empleados,deliveryEmployeeNames()))}</select>${manualInput('valDeliveryManual','Nombre de la persona responsable')}<div class="hint">Delivery, otro empleado o manual/externo.</div></div></div><div class="lock-alert ok"><b>Control financiero:</b> el monto que confirmes aquí reemplaza el monto previo de la orden y será usado en el lote, Delivery, Liquidación, reportes y recibos.</div><div id="valPesoAlert">${validationWeightAlertHtml(o,defaultPeso)}</div><div class="field"><label>Observación</label><textarea id="valNotas" placeholder="Opcional"></textarea></div><button class="btn" id="saveVal">Validar monto, peso y asignar responsable</button></div>`;
  const m=openModal('Validar y asignar responsable',body,'Flujo rápido: monto final → peso final → responsable → observación → confirmar.');
  if(canChooseBy) wireManual(m,'valBy','valByManual');
  wireManual(m,'valDelivery','valDeliveryManual');
  const valBy=$('#valBy',m), valMonto=$('#valMonto',m), valPeso=$('#valPeso',m), valDelivery=$('#valDelivery',m), valNotas=$('#valNotas',m), save=$('#saveVal',m);
  const updateAlert=()=>{$('#valPesoAlert',m).innerHTML=validationWeightAlertHtml(o,+valPeso.value||0);};
  valPeso.oninput=updateAlert;
  const focusEl=el=>{ if(!el) return; setTimeout(()=>{el.focus(); if(el.select) el.select();},0); };
  if(valBy) valBy.addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); focusEl(valMonto); } });
  if(valMonto) valMonto.addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); focusEl(reqPeso?valPeso:valDelivery); } });
  if(valPeso) valPeso.addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); focusEl(valDelivery); } });
  if(valDelivery) valDelivery.addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); focusEl(valNotas); } });
  if(valNotas) valNotas.addEventListener('keydown',e=>{ if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); focusEl(save); } });
  if(save) save.addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); save.click(); } });
  save.onclick=async()=>{
    const by=canChooseBy?getSelectManual(m,'valBy','valByManual'):String(valBy.value||'').trim();
    const responsible=selectedTripResponsible(m,'valDelivery','valDeliveryManual');
    const del=responsible.name;
    let monto=0;
    try{ monto=requireValidationInvoiceAmount(valMonto.value); }catch(err){ return alert(err.message||err); }
    const peso=+valPeso.value||0;
    if(!by) return alert('Selecciona quién realizó la validación.');
    if(!del) return alert('Selecciona el responsable que llevará esta orden.');
    if(reqPeso && peso<=0) return alert('Debes registrar el peso final entregado antes de asignar esta orden al responsable del viaje.');
    let alerta='';
    if(peso>0){
      const check=validationWeightCheck(o,peso);
      if(check.calc && check.level==='block'){
        await validationWeightDiffDialog(check);
        return;
      }
      if(check.calc && check.level==='warn'){
        const reason=await validationWeightDiffDialog(check);
        if(!reason) return;
        const recorded=await recordAuditException({...auditOrderFields(o),modulo:'Validación',tipo_evento:'Diferencia de peso final',gravedad:'Advertencia',motivo:reason,valor_esperado:check.calc,valor_registrado:check.peso,diferencia:check.diff,tolerancia_aviso:check.aviso,tolerancia_maxima:check.max,unidad:'lb',detalle:{responsable:del,validado_por:by}});
        if(!recorded) return;
        alerta=validationWeightAlertText(o,peso);
      }
    }
    const obs=valNotas.value||'';
    const notaPeso=[obs,alerta].filter(Boolean).join(' | ');
    if(!state.v9371SchemaOk) return alert('Primero ejecuta el SQL 31 de la V9.3.7.1 en Supabase.');
    const lote=newBatchCode(); const fechaOriginal=new Date().toISOString();
    const selected=[{o,amount:monto,peso,expected:Number(ref.value||0)}];
    const snapshot=buildDeliveryRouteSnapshot(lote,del,selected,fechaOriginal,by);
    save.disabled=true; save.textContent='Validando...';
    const {data,error}=await sb.rpc('crear_lote_entrega_v9371',{
      p_codigo_lote:lote,p_responsable_nombre:del,p_responsable_tipo:responsible.type,
      p_items:[{orden_id:Number(o.id),monto,peso_esperado:Number(ref.value||0),peso_entregado:peso,alerta:notaPeso}],
      p_validado_por:by,p_snapshot:snapshot
    });
    if(error){save.disabled=false;save.textContent='Validar monto, peso y asignar responsable';return alert('No se pudo validar la orden: '+error.message);}
    m.remove(); await refreshVisibleModuleV9384(); render(); toast(`Orden asignada a ${del} en ${data?.codigo_lote||lote}`);
  };
  focusEl(valMonto);
}
function montoCobradoDefault(res,total,o={}){
  if(res==='Cobrado') return Number(o.monto_cobrado||total||0);
  if(res==='Entregado a crédito' || res==='No entregado') return 0;
  if(res==='Devuelto parcial') return Number(o.monto_cobrado||0);
  return Number(total||0);
}
function updateResultMoney(m,total){
  const res=$('#delRes',m)?.value || $('#liqRes',m)?.value || 'Cobrado';
  const inp=$('#delCobrado',m) || $('#liqCobrado',m);
  if(!inp) return;
  if(res==='Cobrado' && (!inp.value || Number(inp.value)===0)) inp.value=Number(total||0);
  if(res==='Entregado a crédito' || res==='No entregado') inp.value=0;
}
function bindEnterFlow(nodes){
  nodes.filter(Boolean).forEach((el,idx)=>{
    el.addEventListener('keydown',e=>{
      if(e.key==='Enter' && !(el.tagName==='TEXTAREA' && e.shiftKey)){
        e.preventDefault();
        const next=nodes[idx+1];
        if(next){ focusAndSelect(next); } else if(el.click){ el.click(); }
      }
    });
  });
}
function openDeliveryResultModal(o, defaultRes='Cobrado'){
  if(!o) return;
  const total=Number(o.total_factura||o.total_estimado||0);
  const res=finalDeliveryStates().includes(defaultRes)?defaultRes:'Cobrado';
  const initialCash=(res==='Cobrado')?total:montoCobradoDefault(res,total,o);
  const body=`<div class="form"><div class="client-card" style="grid-template-columns:1fr"><div><div class="client-title">${esc(o.codigo)} · ${esc(orderClientName(o))}</div><div class="client-sub">Delivery: ${esc(o.delivery_nombre||'')} · Factura ${money(total)} · ${orderItemsText(o,8)}</div></div></div><div class="grid3"><div class="field"><label>Resultado de entrega</label><select id="delRes"><option value="Cobrado" ${res==='Cobrado'?'selected':''}>Entregado y cobrado</option><option value="Entregado a crédito" ${res==='Entregado a crédito'?'selected':''}>Abono / entregado a crédito</option><option value="No entregado" ${res==='No entregado'?'selected':''}>No entregado</option><option value="Devuelto parcial" ${res==='Devuelto parcial'?'selected':''}>Devuelto parcial</option></select></div><div class="field"><label id="delCashLabel">Dinero recibido del cliente</label><input id="delCobrado" type="number" step="0.01" value="${initialCash}"></div><div class="field"><label>Forma de pago</label><select id="delMetodo"><option>Efectivo</option><option>Transferencia</option><option>Mixto</option><option>Crédito</option><option>No aplica</option></select></div></div><div class="grid4 compact-kpis"><div class="card kpi"><div class="label">Total factura</div><div class="value">${money(total)}</div></div><div class="card kpi"><div class="label">Se reportará cobrado</div><div class="value" id="delApplied">${money(total)}</div></div><div class="card kpi"><div class="label">Cambio al cliente</div><div class="value" id="delChange">${money(0)}</div></div><div class="card kpi"><div class="label">Queda a crédito</div><div class="value" id="delPending">${money(0)}</div></div></div><div id="delSummary" class="lock-alert ok"></div><div class="field"><label>Observación</label><textarea id="delNotas" placeholder="Opcional; úsalo si no entregó, crédito o devolución parcial"></textarea></div><button class="btn" id="saveDelResult">Registrar resultado</button></div>`;
  const m=openModal('Registrar entrega del delivery',body,'Caja rápida: resultado → dinero recibido/abono → forma de pago → registrar.');
  const resEl=$('#delRes',m), cashEl=$('#delCobrado',m), metEl=$('#delMetodo',m), notas=$('#delNotas',m), btn=$('#saveDelResult',m), sum=$('#delSummary',m), cashLabel=$('#delCashLabel',m);
  const appliedEl=$('#delApplied',m), changeEl=$('#delChange',m), pendingEl=$('#delPending',m);
  function calc(){
    const r=resEl.value;
    let cash=Number(cashEl.value||0);
    let applied=0, change=0, pendiente=0;
    cashEl.disabled=false;
    if(r==='Cobrado'){
      cashLabel.textContent='Dinero recibido del cliente';
      applied=total;
      change=Math.max(cash-total,0);
      pendiente=0;
    }else if(r==='Entregado a crédito'){
      cashLabel.textContent='Abono recibido';
      applied=Math.max(Math.min(cash,total),0);
      change=0;
      pendiente=Math.max(total-applied,0);
    }else if(r==='No entregado'){
      cashLabel.textContent='Monto recibido';
      cashEl.value=0; cash=0; cashEl.disabled=true;
      applied=0; change=0; pendiente=total;
    }else{
      cashLabel.textContent='Monto recibido';
      applied=Math.max(Math.min(cash,total),0);
      change=0;
      pendiente=Math.max(total-applied,0);
    }
    return {r,cash,applied,change,pendiente};
  }
  function paint(){
    const x=calc();
    appliedEl.textContent=money(x.applied);
    changeEl.textContent=money(x.change);
    pendingEl.textContent=money(x.pendiente);
    const err=validateDeliveryCash(x.r,total,x.cash);
    sum.className='lock-alert '+(err?'bad':'ok');
    sum.innerHTML=err?esc(err):`Caja correcta. Factura ${money(total)} · se reportará cobrado ${money(x.applied)}${x.change>0?' · devolver al cliente '+money(x.change):''}${x.pendiente>0?' · crédito pendiente '+money(x.pendiente):''}.`;
  }
  resEl.onchange=()=>{ if(resEl.value==='Cobrado') cashEl.value=total; if(resEl.value==='No entregado') cashEl.value=0; if(resEl.value==='Entregado a crédito' && Number(cashEl.value||0)>=total) cashEl.value=0; paint(); };
  cashEl.oninput=paint; paint();
  bindEnterFlow([resEl,cashEl,metEl,notas,btn]); focusAndSelect(cashEl);
  btn.onclick=async()=>{
    const x=calc();
    const err=validateDeliveryCash(x.r,total,x.cash);
    if(err) return alert(err);
    const notasExtra=[];
    if(x.r==='Cobrado' && x.change>0) notasExtra.push(`Cliente entregó ${money(x.cash)}; devolver ${money(x.change)}.`);
    if(x.r==='Entregado a crédito') notasExtra.push(`Abono recibido ${money(x.applied)}; saldo a crédito ${money(x.pendiente)}.`);
    const notasVal=[notas.value||'',...notasExtra].filter(Boolean).join(' | ')||null;
    await sb.from('orden_entregas').insert({orden_id:o.id,resultado:x.r,monto_cobrado:x.applied,monto_pendiente:x.pendiente,notas:notasVal,creado_por:state.user.id});
    m.remove();
    await setOrderState(o,x.r,{resultado_entrega:x.r,monto_cobrado:x.applied,monto_pendiente:x.pendiente,notas_liquidacion:notasVal,notas_estado:`Resultado reportado por delivery: ${x.r}. Efectivo a entregar a CXC: ${money(x.applied)}`});
  };
}
function partialReturnOriginalWeight(o){
  return Number(o?.peso_validado||orderLastPeso(o,'Entregado a delivery')?.libras||orderLastPeso(o,'Preparado')?.libras||0);
}
function partialReturnRowsHtml(o){
  return (o.items||[]).filter(i=>deliveredQuantity(i)>0).map(i=>{
    const max=deliveredQuantity(i), price=Number(i.precio||0);
    return `<div class="partial-return-row" data-return-detail="${i.id}" data-return-name="${esc(i.producto_nombre||'Producto')}" data-return-max="${max}" data-return-price="${price}">
      <label class="check-cell"><input type="checkbox" data-return-check><span></span></label>
      <div><b>${esc(i.producto_nombre||'Producto')}</b><small>Entregado: ${max} ${esc(i.unidad||'')} · Precio ${money(price)}</small></div>
      <div class="field compact"><label>Cantidad devuelta</label><input type="number" min="0" max="${max}" step="0.001" data-return-qty disabled></div>
      <div class="field compact"><label>Peso devuelto (lb)</label><input type="number" min="0" step="0.001" data-return-weight disabled></div>
      <div class="field compact"><label>Destino</label><select data-return-destination disabled><option value="Revision">Pendiente de revisión</option><option value="Inventario">Reintegrar a inventario</option><option value="Merma">Merma / dañado</option></select></div>
      <div class="field compact"><label>Motivo</label><input data-return-reason placeholder="Motivo obligatorio" disabled></div>
    </div>`;
  }).join('');
}
async function receivePartialReturnV9392(o,payload){
  const {data,error}=await sb.rpc('registrar_devolucion_parcial_v9392',{
    p_orden_id:Number(o.id),
    p_lineas:payload.rows,
    p_monto_recibido:Number(payload.cash||0),
    p_metodo:payload.method||'Efectivo',
    p_recibido_por:payload.receivedBy||currentWorkerName(),
    p_observacion:payload.note||null
  });
  if(error) throw error;
  return data;
}
function openLiquidacionOrdenModal(o){
  if(!o) return;
  if(!state.v937SchemaOk) return alert('Primero ejecuta el SQL 30 de la V9.3.7 en Supabase.');
  const total=Number(o.total_factura||o.total_estimado||0);
  const defaultRes=['Cobrado','Entregado a crédito','No entregado','Devuelto parcial'].includes(o.resultado_entrega)?o.resultado_entrega:'Cobrado';
  const initialCash=defaultRes==='Cobrado'?total:Number(o.monto_cobrado||0);
  const body=`<div class="form"><div class="client-card" style="grid-template-columns:1fr"><div><div class="client-title">${esc(orderClientName(o))}</div><div class="client-sub">${esc(o.codigo)} · Lote ${esc(batchCodeFromOrder(o)||'—')} · Delivery ${esc(o.delivery_nombre||'—')} · Factura ${money(total)}</div></div></div>
  <div class="lock-alert ok"><b>CXC decide el resultado final:</b> este registro no depende de botones ni reportes realizados por el delivery.</div>
  <div class="grid3"><div class="field"><label>Resultado final</label><select id="liqRes"><option value="Cobrado" ${defaultRes==='Cobrado'?'selected':''}>Cobrado completo</option><option value="Entregado a crédito" ${defaultRes==='Entregado a crédito'?'selected':''}>Abono / entregado a crédito</option><option value="No entregado" ${defaultRes==='No entregado'?'selected':''}>No entregado</option><option value="Devuelto parcial" ${defaultRes==='Devuelto parcial'?'selected':''}>Devuelto parcial</option></select></div><div class="field"><label>Monto recibido en CXC</label><input id="liqCobrado" type="number" step="0.01" min="0" value="${initialCash}"></div><div class="field"><label>Método</label><select id="liqMetodo"><option>Efectivo</option><option>Transferencia</option><option>Mixto</option><option>Crédito</option><option>No aplica</option></select></div></div>
  <section id="partialReturnPanel" class="partial-return-panel" hidden><div class="lock-alert warn"><b>Selecciona exactamente lo que regresó.</b> La factura original se conserva; el sistema calculará el valor devuelto, el total neto entregado y el nuevo peso.</div><div class="partial-return-head"><span></span><span>Artículo</span><span>Cantidad</span><span>Peso</span><span>Destino</span><span>Motivo</span></div>${partialReturnRowsHtml(o)||'<div class="empty">Esta orden no tiene artículos entregados disponibles para devolver.</div>'}<div class="grid4 compact-kpis"><div class="card kpi"><div class="label">Factura original</div><div class="value">${money(total)}</div></div><div class="card kpi"><div class="label">Valor devuelto</div><div class="value" id="returnAmount">${money(0)}</div></div><div class="card kpi"><div class="label">Total neto</div><div class="value" id="returnNet">${money(total)}</div></div><div class="card kpi"><div class="label">Peso neto</div><div class="value" id="returnNetWeight">${partialReturnOriginalWeight(o).toFixed(2)} lb</div></div></div><div id="returnValidation" class="lock-alert warn">Selecciona al menos un artículo devuelto.</div></section>
  <div class="grid3 compact-kpis"><div class="card kpi"><div class="label">Factura</div><div class="value">${money(total)}</div></div><div class="card kpi"><div class="label">Recibido</div><div class="value" id="liqReceivedNow">${money(initialCash)}</div></div><div class="card kpi"><div class="label">Pendiente / devolución</div><div class="value" id="liqFinalCredit">${money(Math.max(total-initialCash,0))}</div></div></div>
  <div id="liqSummary" class="lock-alert ok"></div><div class="grid2"><div class="field"><label>Recibido por</label><select id="liqBy">${employeeOptions('CXC',currentWorkerName())}</select>${manualInput('liqByManual')}</div><div class="field"><label id="liqNotesLabel">Observación</label><textarea id="liqNotas" placeholder="Opcional"></textarea></div></div><button class="btn" id="saveLiq">Recibir cliente</button></div>`;
  const m=openModal('Recibir cliente en Liquidación / CXC',body,'Si seleccionas No entregado, la orden regresará a Validación para reasignación.');
  wireManual(m,'liqBy','liqByManual');
  const res=$('#liqRes',m), cash=$('#liqCobrado',m), method=$('#liqMetodo',m), notes=$('#liqNotas',m), btn=$('#saveLiq',m), summary=$('#liqSummary',m), received=$('#liqReceivedNow',m), pending=$('#liqFinalCredit',m);
  const returnPanel=$('#partialReturnPanel',m);
  function readReturn(){
    const rows=$$('[data-return-detail]',m).filter(row=>$('[data-return-check]',row)?.checked).map(row=>({
      detalle_id:Number(row.dataset.returnDetail),name:row.dataset.returnName,maxQty:Number(row.dataset.returnMax||0),
      qty:Number($('[data-return-qty]',row)?.value||0),price:Number(row.dataset.returnPrice||0),
      weight:Number($('[data-return-weight]',row)?.value||0),destino:$('[data-return-destination]',row)?.value||'Revision',
      motivo:($('[data-return-reason]',row)?.value||'').trim()
    }));
    if(rows.some(r=>r.motivo.length<3)) throw new Error('Escribe el motivo de cada artículo devuelto.');
    return calculatePartialReturn(total,rows);
  }
  function paintReturn(){
    const active=res.value==='Devuelto parcial'; returnPanel.hidden=!active;
    if(!active) return null;
    try{
      const value=readReturn(), originalWeight=partialReturnOriginalWeight(o), netWeight=netDeliveredWeight(originalWeight,value.returnedWeight);
      $('#returnAmount',m).textContent=money(value.returnedAmount); $('#returnNet',m).textContent=money(value.netTotal); $('#returnNetWeight',m).textContent=`${netWeight.toFixed(2)} lb`;
      const v=$('#returnValidation',m); v.className='lock-alert ok'; v.innerHTML=`Devolución válida: ${money(value.returnedAmount)} · total neto ${money(value.netTotal)} · peso neto ${netWeight.toFixed(2)} lb.`;
      if(Math.abs(Number(cash.value||0)-value.netTotal)>0.01) cash.value=value.netTotal;
      return {...value,netWeight};
    }catch(err){
      $('#returnAmount',m).textContent=money(0); $('#returnNet',m).textContent=money(total);
      const v=$('#returnValidation',m); v.className='lock-alert warn'; v.textContent=err.message||String(err);
      return {error:err.message||String(err)};
    }
  }
  function calc(){
    try{
      if(res.value==='Devuelto parcial'){
        const ret=readReturn();
        const cashValue=Number(cash.value||0);
        if(Math.abs(cashValue-ret.netTotal)>0.01) throw new Error(`Para una devolución parcial sin crédito, el monto recibido debe ser ${money(ret.netTotal)}.`);
        return {total:ret.netTotal,result:res.value,cash:cashValue,pending:0,returnData:ret,error:''};
      }
      return {...calculateCentralReceipt(total,res.value,Number(cash.value||0)),error:''};
    }catch(err){return {total,result:res.value,cash:Number(cash.value||0),pending:0,error:err.message||String(err)};}
  }
  function paint(){ const x=calc(); received.textContent=money(x.cash); pending.textContent=money(x.pending); summary.className='lock-alert '+(x.error?'bad':'ok'); summary.innerHTML=x.error?esc(x.error):`Recepción válida. Se registrará ${money(x.cash)}${x.pending?` y quedará ${money(x.pending)} pendiente / devolución`:''}.`; return x; }
  res.onchange=()=>{
    if(res.value==='Cobrado') cash.value=total;
    if(res.value==='No entregado') cash.value=0;
    if(res.value==='Entregado a crédito'&&Number(cash.value||0)>=total) cash.value=0;
    const noEntregado=res.value==='No entregado';
    const label=$('#liqNotesLabel',m);
    if(label) label.textContent=noEntregado?'Motivo de no entrega (obligatorio)':'Observación';
    notes.placeholder=noEntregado?'Ej.: cliente cerrado, dirección incorrecta o rechazó el pedido...':'Opcional';
    paintReturn(); paint();
  };
  $$('[data-return-check]',m).forEach(ch=>ch.onchange=()=>{
    const row=ch.closest('[data-return-detail]');
    $$('input,select',row).filter(el=>el!==ch).forEach(el=>el.disabled=!ch.checked);
    if(ch.checked){
      $('[data-return-qty]',row).value=row.dataset.returnMax||'';
      $('[data-return-weight]',row).value=row.dataset.returnMax||'';
      focusAndSelect($('[data-return-qty]',row));
    }
    paintReturn(); paint();
  });
  $$('[data-return-qty],[data-return-weight],[data-return-destination],[data-return-reason]',m).forEach(el=>el.addEventListener(el.tagName==='SELECT'?'change':'input',()=>{paintReturn();paint();}));
  cash.oninput=paint; paint();
  bindEnterFlow([res,cash,method,$('#liqBy',m),notes,btn]); focusAndSelect(cash);
  btn.onclick=async()=>{
    const by=getSelectManual(m,'liqBy','liqByManual'); if(!by) return alert('Selecciona quién recibe al delivery.');
    if(res.value==='No entregado' && notes.value.trim().length<3) return alert('Indica el motivo por el cual el pedido no fue entregado.');
    const x=paint(); if(x.error) return alert(x.error);
    btn.disabled=true; btn.textContent='Procesando...';
    try{
      const result=x.result==='Devuelto parcial'
        ? await receivePartialReturnV9392(o,{rows:x.returnData.rows.map(r=>({detalle_id:r.detalle_id,cantidad:r.qty,peso:r.weight,destino:r.destino,motivo:r.motivo})),cash:x.cash,method:method.value,receivedBy:by,note:notes.value||''})
        : await receiveOrderCxcV937(o,{result:x.result,cash:x.cash,method:method.value,receivedBy:by,note:notes.value||''});
      m.remove(); await refreshVisibleModuleV9384(); render();
      toast(x.result==='No entregado'
        ? 'Pedido devuelto a Validación para reasignación.'
        : (result?.lote_cerrado?`Cliente recibido. Lote ${result.codigo_lote} cerrado.`:`Cliente recibido. Quedan ${result?.pendientes??0} pendiente(s) en el lote.`));
    }catch(err){ btn.disabled=false; btn.textContent='Recibir cliente'; alert(err?.message||String(err)); }
  };
}

function liquidationOrderFinancial(o){
  const total=orderMonto(o);
  const result=o?.resultado_entrega || o?.estado || '';
  let reported=Number(o?.monto_cobrado||0);
  if(result==='Cobrado' && reported<=0) reported=total;
  if(result==='No entregado') reported=0;
  let credit=Number(o?.monto_pendiente ?? Math.max(total-reported,0));
  if(result==='Cobrado') credit=0;
  if(result==='No entregado') credit=0;
  if(result==='Entregado a crédito') credit=Math.max(total-reported,0);
  return {total,result,reported,credit};
}
function liquidationRowType(o){
  const f=liquidationOrderFinancial(o);
  if(f.result==='No entregado') return 'no_entregado';
  if(f.result==='Entregado a crédito' && f.reported<=0.01) return 'credito';
  if(f.result==='Entregado a crédito' && f.reported>0.01) return 'abono_credito';
  if(f.result==='Devuelto parcial') return 'parcial';
  return 'contado';
}
function liquidationRowLabel(type){
  return {contado:'Contado',abono_credito:'Abono + crédito',credito:'Crédito',parcial:'Devuelto parcial',no_entregado:'No entregado'}[type] || 'Pendiente';
}
function liquidationRowAmountDefault(o){
  const f=liquidationOrderFinancial(o);
  const type=liquidationRowType(o);
  if(type==='contado') return f.reported||f.total;
  if(type==='abono_credito' || type==='parcial') return f.reported;
  return 0;
}
function liquidationDefaultFinalResult(o){
  const f=liquidationOrderFinancial(o);
  if(['Cobrado','Entregado a crédito','No entregado','Devuelto parcial'].includes(f.result)) return f.result;
  return 'Cobrado';
}
function liquidationFinalResultOptions(selected){
  const opts=['Cobrado','Entregado a crédito','Devuelto parcial','No entregado'];
  const labels={'Cobrado':'Cobrado completo','Entregado a crédito':'Crédito / abono','Devuelto parcial':'Devuelto parcial','No entregado':'No entregado'};
  return opts.map(o=>`<option value="${o}" ${o===selected?'selected':''}>${labels[o]}</option>`).join('');
}

function openBatchPartialReturnModal(o,draft,onSave){
  const total=Number(o.total_factura||o.total_estimado||0);
  const originalWeight=partialReturnOriginalWeight(o);
  const saved=new Map((draft?.rows||[]).map(r=>[String(r.detalle_id),r]));
  const itemRows=(o.items||[]).filter(i=>deliveredQuantity(i)>0).map(i=>{
    const max=deliveredQuantity(i), price=Number(i.precio||0), measure=partialReturnMeasure(i), prev=saved.get(String(i.id));
    return `<div class="batch-return-item" data-return-detail="${i.id}" data-return-name="${esc(i.producto_nombre||'Producto')}" data-return-max="${max}" data-return-price="${price}">
      <label class="check-cell"><input type="checkbox" data-return-check ${prev?'checked':''}><span></span></label>
      <div class="batch-return-product"><b>${esc(i.producto_nombre||'Producto')}</b><small>Entregado: ${max} ${esc(i.unidad||'')} · ${money(price)}/${esc(i.unidad||'')}</small></div>
      <div class="field compact"><label>${esc(measure.label)}</label><div class="return-measure-control"><input type="number" min="0" max="${max}" step="${measure.step}" data-return-measure value="${prev?.qty??''}" ${prev?'':'disabled'}><span>${esc(measure.unit)}</span></div></div>
      <div class="field compact"><label>Destino</label><select data-return-destination ${prev?'':'disabled'}><option value="Revision" ${prev?.destino==='Revision'?'selected':''}>Pendiente de revisión</option><option value="Inventario" ${prev?.destino==='Inventario'?'selected':''}>Reintegrar</option><option value="Merma" ${prev?.destino==='Merma'?'selected':''}>Merma / dañado</option></select></div>
      <div class="field compact"><label>Motivo</label><input data-return-reason value="${esc(prev?.motivo||'')}" placeholder="Motivo obligatorio" ${prev?'':'disabled'}></div>
    </div>`;
  }).join('');
  const body=`<div class="form batch-return-form">
    <div class="client-card" style="grid-template-columns:1fr"><div><div class="client-title">${esc(orderClientName(o))}</div><div class="client-sub">${esc(o.codigo)} · Lote ${esc(batchCodeFromOrder(o)||'—')} · Factura ${money(total)}</div></div></div>
    <div class="lock-alert warn"><b>Devolución parcial dentro del lote.</b> El resultado está bloqueado. Aquí solo se prepara el detalle; el cliente se confirmará junto con todo el lote.</div>
    <div class="grid2"><div class="field"><label>Resultado final</label><select disabled><option>Devuelto parcial</option></select></div><div class="field"><label>Efectivo esperado</label><input id="batchReturnCash" value="${Number(draft?.cash??total).toFixed(2)}" disabled></div></div>
    <section class="partial-return-panel"><div class="batch-return-list">${itemRows||'<div class="empty">Esta orden no tiene artículos disponibles para devolver.</div>'}</div>
      <div class="grid4 compact-kpis"><div class="card kpi"><div class="label">Factura original</div><div class="value">${money(total)}</div></div><div class="card kpi"><div class="label">Valor devuelto</div><div class="value" id="batchReturnAmount">${money(0)}</div></div><div class="card kpi"><div class="label">Total neto</div><div class="value" id="batchReturnNet">${money(total)}</div></div><div class="card kpi"><div class="label">Peso neto</div><div class="value" id="batchReturnNetWeight">${originalWeight.toFixed(2)} lb</div></div></div>
      <div id="batchReturnValidation" class="lock-alert warn">Selecciona al menos un artículo devuelto.</div>
    </section>
    <div class="actions"><button class="btn" id="saveBatchReturnDraft">Guardar devolución y volver al lote</button><button class="btn gray" id="cancelBatchReturnDraft">Cancelar y volver al lote</button></div>
  </div>`;
  const detailModal=openModal('Detalle de devolución parcial',body,'La factura y el pesaje originales se conservan para auditoría.');
  detailModal.classList.add('batch-return-modal');
  function read(requireReason=false){
    const rows=$$('[data-return-detail]',detailModal).filter(row=>$('[data-return-check]',row)?.checked).map(row=>{
      const item=(o.items||[]).find(i=>String(i.id)===String(row.dataset.returnDetail))||{};
      const qty=Number($('[data-return-measure]',row)?.value||0);
      return {detalle_id:Number(row.dataset.returnDetail),name:row.dataset.returnName,maxQty:Number(row.dataset.returnMax||0),
        qty,price:Number(row.dataset.returnPrice||0),weight:returnedWeightForMeasure(item,qty),
        destino:$('[data-return-destination]',row)?.value||'Revision',motivo:($('[data-return-reason]',row)?.value||'').trim()};
    });
    const value=calculatePartialReturn(total,rows);
    const missingReasons=rows.filter(r=>r.motivo.length<3);
    if(requireReason && missingReasons.length) throw new Error(`Escribe el motivo de ${missingReasons.map(r=>r.name).join(', ')}.`);
    return {...value,missingReasons};
  }
  function paint(){
    try{
      const value=read(), netWeight=netDeliveredWeight(originalWeight,value.returnedWeight);
      $('#batchReturnAmount',detailModal).textContent=money(value.returnedAmount);
      $('#batchReturnNet',detailModal).textContent=money(value.netTotal);
      $('#batchReturnNetWeight',detailModal).textContent=`${netWeight.toFixed(2)} lb`;
      $('#batchReturnCash',detailModal).value=value.netTotal.toFixed(2);
      const v=$('#batchReturnValidation',detailModal);
      if(value.missingReasons.length){
        v.className='lock-alert warn';
        v.innerHTML=`Cálculo actualizado. Para guardar, escribe el motivo de: <b>${esc(value.missingReasons.map(r=>r.name).join(', '))}</b>.`;
      }else{
        v.className='lock-alert ok'; v.innerHTML=`Devolución válida: <b>${money(value.returnedAmount)}</b> · neto ${money(value.netTotal)} · peso devuelto ${value.returnedWeight.toFixed(2)} lb.`;
      }
      return {...value,netWeight};
    }catch(err){
      $('#batchReturnAmount',detailModal).textContent=money(0); $('#batchReturnNet',detailModal).textContent=money(total);
      $('#batchReturnNetWeight',detailModal).textContent=`${originalWeight.toFixed(2)} lb`; $('#batchReturnCash',detailModal).value=total.toFixed(2);
      const v=$('#batchReturnValidation',detailModal); v.className='lock-alert warn'; v.textContent=err.message||String(err);
      return {error:err.message||String(err)};
    }
  }
  $$('[data-return-check]',detailModal).forEach(ch=>ch.onchange=()=>{
    const row=ch.closest('[data-return-detail]');
    $$('input,select',row).filter(el=>el!==ch).forEach(el=>el.disabled=!ch.checked);
    if(ch.checked){ const input=$('[data-return-measure]',row); if(!input.value) input.value=row.dataset.returnMax||''; focusAndSelect(input); }
    paint();
  });
  $$('[data-return-measure],[data-return-destination],[data-return-reason]',detailModal).forEach(el=>el.addEventListener(el.tagName==='SELECT'?'change':'input',paint));
  $('#cancelBatchReturnDraft',detailModal).onclick=()=>detailModal.remove();
  $('#saveBatchReturnDraft',detailModal).onclick=()=>{
    const save=$('#saveBatchReturnDraft',detailModal);
    try{
      const preview=paint(); if(preview.error) throw new Error(preview.error);
      const value=read(true);
      save.disabled=true; save.textContent='Guardando...';
      onSave({...value,netWeight:netDeliveredWeight(originalWeight,value.returnedWeight),cash:value.netTotal,result:'Devuelto parcial'});
      detailModal.remove();
    }catch(err){
      const v=$('#batchReturnValidation',detailModal); v.className='lock-alert bad'; v.textContent=err.message||String(err);
      const missing=$$('[data-return-reason]',detailModal).find(el=>!el.disabled && el.value.trim().length<3);
      if(missing){ missing.classList.add('input-error'); missing.focus(); }
      save.disabled=false; save.textContent='Guardar devolución y volver al lote';
    }
  };
  paint();
}

function openCloseBatchLiquidationModal(deliveryName,g){
  const orders=g.items||[];
  const summary=deliveryMoneySummary(orders);
  const partialDrafts=new Map();
  const rows=orders.map(o=>{
    const f=liquidationOrderFinancial(o);
    const type=liquidationRowType(o);
    const defaultCash=liquidationRowAmountDefault(o);
    const defaultResult=liquidationDefaultFinalResult(o);
    const note=type==='contado'?'Debe cotejarse con el efectivo físico.':type==='credito'?'Cerrar manualmente como crédito o digitar abono si trajo dinero.':type==='abono_credito'?'Cotejar abono y confirmar saldo pendiente.':type==='no_entregado'?'Confirmar que no se recibe dinero.':'Revisar diferencia/devolución.';
    return `<div class="liq-check-row" data-liq-row="${o.id}">
      <label class="check-cell"><input type="checkbox" data-batch-check="${o.id}"><span></span></label>
      <div class="liq-check-main"><b>${esc(orderClientName(o))}</b><small>${esc(o.codigo||'')} · Factura ${esc(o.factura_no||'—')} · ${esc(orderClientPhone(o))}</small><div class="badges"><span class="badge ${type==='contado'?'ok':type==='credito'?'info':type==='no_entregado'?'bad':'warn'}">${esc(liquidationRowLabel(type))}</span><span class="badge info">${esc(f.result||'Resultado')}</span>${f.credit?`<span class="badge warn">Crédito inicial ${money(f.credit)}</span>`:''}</div><div class="batch-row-result"><label>Resultado CXC</label><select data-batch-result="${o.id}">${liquidationFinalResultOptions(defaultResult)}</select><span data-batch-partial-slot="${o.id}">${defaultResult==='Devuelto parcial'?`<button type="button" class="btn small warn" data-batch-partial="${o.id}">Detallar artículos</button>`:''}</span></div><div class="hint">${esc(note)}</div></div>
      <div class="liq-check-num"><label>Factura</label><strong>${money(f.total)}</strong></div>
      <div class="liq-check-num"><label>Efectivo/abono</label><input type="number" step="0.01" min="0" data-batch-cash="${o.id}" value="${Number(defaultCash||0)}" disabled></div>
      <div class="liq-check-num"><label>Crédito/devolución</label><strong data-batch-credit="${o.id}">${money(f.credit)}</strong></div>
      <div class="liq-check-status" data-batch-status="${o.id}">Sin cotejar</div>
    </div>`;
  }).join('');
  const body=`<div class="form batch-liquidation-form"><div class="client-card" style="grid-template-columns:1fr"><div><div class="client-title">${esc(g.code)} · ${esc(deliveryName||'')}</div><div class="client-sub">Recepción por lote/viaje. Coteja ventas de contado, confirma créditos y luego genera el recibo.</div></div></div>
  <div class="grid4 compact-kpis"><div class="card kpi"><div class="label">Monto por cotejar</div><div class="value">${money(summary.total)}</div></div><div class="card kpi"><div class="label">Efectivo confirmado</div><div class="value">${money(0)}</div></div><div class="card kpi"><div class="label">Crédito / devolución</div><div class="value">${money(0)}</div></div><div class="card kpi"><div class="label">Clientes pendientes</div><div class="value">${orders.length}</div></div></div>
  <div class="lock-alert ok"><b>Cotejo por lote:</b> aparecen todas las ventas del lote: contado, crédito, abonos, devoluciones y no entregados. Marca cada cliente para habilitar su efectivo/abono. Las ventas al contado suman caja; las ventas a crédito se cierran manualmente o se abonan si el delivery trae dinero.</div>
  <div class="batch-toolbar"><div class="batch-actions"><button type="button" class="btn gray" id="checkCashRows">Cotejar contado</button><button type="button" class="btn gray" id="checkCreditRows">Cerrar créditos</button><button type="button" class="btn gray" id="clearBatchChecks">Limpiar cotejo</button></div></div>
  <div class="liq-check-scroll"><div class="liq-check-head"><span></span><span>Cliente / orden</span><span>Factura</span><span>Efectivo / abono</span><span>Crédito / devolución</span><span>Estado</span></div>
  <div class="liq-check-list">${rows}</div></div>
  <div class="grid4 compact-kpis"><div class="card kpi"><div class="label">Cotejados</div><div class="value" id="batchCheckedCount">0/${orders.length}</div></div><div class="card kpi"><div class="label">Efectivo cotejado</div><div class="value" id="batchCashTotal">${money(0)}</div></div><div class="card kpi"><div class="label">Crédito / devolución final</div><div class="value" id="batchCreditTotal">${money(0)}</div></div><div class="card kpi"><div class="label">Pendientes</div><div class="value" id="batchUncheckedCount">${orders.length}</div></div></div>
  <div class="grid2"><div class="field"><label>Recibido por</label><select id="batchBy">${employeeOptions('CXC',currentWorkerName())}</select>${manualInput('batchByManual')}</div><div class="field"><label>Observación del cierre</label><textarea id="batchObs" placeholder="Opcional"></textarea></div></div>
  <div id="batchCloseSummary" class="lock-alert warn"></div><div class="actions"><button class="btn" id="saveBatchClose">Cerrar lote y generar recibo</button><button class="btn gray" id="previewBatchReceipt">Vista recibo</button></div></div>`;
  const m=openModal('Recibir lote por cotejo',body,'Caja CXC: contado, crédito y abonos revisados cliente por cliente.');
  m.classList.add('liquidacion-lote-modal');
  const modalCard=$('.modal-card',m); if(modalCard) modalCard.classList.add('liquidacion-lote-card');
  wireManual(m,'batchBy','batchByManual');
  const orderById=id=>orders.find(o=>String(o.id)===String(id));
  function rowCalc(o){
    const f=liquidationOrderFinancial(o);
    const type=liquidationRowType(o);
    const input=$(`[data-batch-cash="${o.id}"]`,m);
    const resultSel=$(`[data-batch-result="${o.id}"]`,m);
    const checked=$(`[data-batch-check="${o.id}"]`,m)?.checked;
    const selectedResult=resultSel?.value || liquidationDefaultFinalResult(o);
    if(input) input.disabled = !checked || selectedResult==='No entregado' || selectedResult==='Devuelto parcial';
    let cash=Number(input?.value||0);
    if(selectedResult==='No entregado'){ cash=0; if(input) input.value=0; }
    let err='';
    if(cash<0) err='No puede ser negativo.';
    if(cash>f.total+0.01) err='Mayor que factura.';
    if(selectedResult==='Cobrado' && Math.abs(cash-f.total)>0.01) err='Cobrado debe igualar factura.';
    if(selectedResult==='Entregado a crédito' && cash>f.total+0.01) err='Abono mayor que factura.';
    if(selectedResult==='No entregado' && cash>0.01) err='No entregado no recibe efectivo.';
    const returnDraft=partialDrafts.get(String(o.id));
    if(selectedResult==='Devuelto parcial'){
      if(!returnDraft) err='Pulsa “Detallar artículos” y guarda la devolución.';
      else { cash=Number(returnDraft.cash||0); if(input) input.value=cash.toFixed(2); }
    }
    let finalCredit=0;
    let returnAmount=0;
    let finalResult=selectedResult;
    if(selectedResult==='Cobrado'){ finalCredit=0; returnAmount=0; }
    else if(selectedResult==='Entregado a crédito'){ finalCredit=Math.max(f.total-cash,0); }
    else if(selectedResult==='Devuelto parcial'){ returnAmount=Number(returnDraft?.returnedAmount||0); finalCredit=returnAmount; }
    else if(selectedResult==='No entregado'){ finalCredit=0; }
    return {checked,cash,err,finalCredit,returnAmount,finalResult,total:f.total,type,selectedResult,initial:f,returnDraft};
  }
  function paint(){
    let checkedCount=0,cashTotal=0,creditTotal=0,errors=[],unchecked=[];
    orders.forEach(o=>{
      const x=rowCalc(o);
      const status=$(`[data-batch-status="${o.id}"]`,m), credit=$(`[data-batch-credit="${o.id}"]`,m), row=$(`[data-liq-row="${o.id}"]`,m);
      if(x.checked){ checkedCount++; cashTotal+=x.cash; creditTotal+=x.finalCredit; }
      else unchecked.push(o);
      if(credit) credit.textContent=money(x.finalCredit);
      if(row) row.classList.toggle('selected',!!x.checked);
      if(status){
        if(!x.checked){ status.className='liq-check-status'; status.textContent='Sin cotejar'; }
        else if(x.err){ status.className='liq-check-status bad'; status.textContent=x.err; errors.push(`${o.cliente?.negocio||o.codigo}: ${x.err}`); }
        else if(x.finalResult==='Devuelto parcial'){ status.className='liq-check-status warn'; status.textContent=x.returnAmount>0.01?'Devolución registrada':'Devuelto parcial'; }
        else if(x.finalResult==='Entregado a crédito' && x.cash<=0.01){ status.className='liq-check-status info'; status.textContent='Crédito cerrado'; }
        else if(x.finalResult==='No entregado'){ status.className='liq-check-status warn'; status.textContent='No entregado confirmado'; }
        else { status.className='liq-check-status ok'; status.textContent=x.finalCredit>0.01?'Abono cotejado':'Efectivo cotejado'; }
      }
    });
    $('#batchCheckedCount',m).textContent=`${checkedCount}/${orders.length}`;
    $('#batchUncheckedCount',m).textContent=String(unchecked.length);
    $('#batchCashTotal',m).textContent=money(cashTotal);
    $('#batchCreditTotal',m).textContent=money(creditTotal);
    const msg=$('#batchCloseSummary',m);
    if(errors.length){ msg.className='lock-alert bad'; msg.innerHTML='<b>Revisar:</b><br>'+errors.map(esc).join('<br>'); }
    else if(unchecked.length){ msg.className='lock-alert warn'; msg.innerHTML=`Faltan ${unchecked.length} cliente(s) por cotejar antes de cerrar el lote.`; }
    else { msg.className='lock-alert ok'; msg.innerHTML=`Lote cotejado. Efectivo a recibir: <b>${money(cashTotal)}</b>. Crédito final: <b>${money(creditTotal)}</b>.`; }
    return {checkedCount,cashTotal,creditTotal,errors,unchecked};
  }
  $$('[data-batch-check]',m).forEach(ch=>ch.onchange=()=>{ paint(); if(ch.checked){ const inp=$(`[data-batch-cash="${ch.dataset.batchCheck}"]`,m); if(inp && !inp.disabled) focusAndSelect(inp); } });
  $$('[data-batch-cash]',m).forEach(inp=>inp.oninput=paint);
  $$('[data-batch-result]',m).forEach(sel=>sel.onchange=()=>{
    const o=orderById(sel.dataset.batchResult);
    const inp=$(`[data-batch-cash="${sel.dataset.batchResult}"]`,m);
    const detailSlot=$(`[data-batch-partial-slot="${sel.dataset.batchResult}"]`,m);
    const total=liquidationOrderFinancial(o).total;
    if(inp) inp.value=cashValueAfterCxcResultChange(total,sel.value,inp.value);
    if(sel.value!=='Devuelto parcial') partialDrafts.delete(String(sel.dataset.batchResult));
    if(detailSlot) detailSlot.innerHTML=sel.value==='Devuelto parcial'?`<button type="button" class="btn small warn" data-batch-partial="${sel.dataset.batchResult}">Detallar artículos</button>`:'';
    paint();
    if(inp && !inp.disabled) focusAndSelect(inp);
  });
  m.addEventListener('click',e=>{
    const detailBtn=e.target.closest('[data-batch-partial]');
    if(!detailBtn || !m.contains(detailBtn)) return;
    const o=orderById(detailBtn.dataset.batchPartial);
    if(!o) return alert('No se encontró la orden para detallar la devolución.');
    const id=String(o.id);
    openBatchPartialReturnModal(o,partialDrafts.get(id),draft=>{
      partialDrafts.set(id,draft);
      const sel=$(`[data-batch-result="${o.id}"]`,m); if(sel) sel.value='Devuelto parcial';
      const ch=$(`[data-batch-check="${o.id}"]`,m); if(ch) ch.checked=true;
      const inp=$(`[data-batch-cash="${o.id}"]`,m); if(inp) inp.value=Number(draft.cash||0).toFixed(2);
      paint();
      toast('Devolución guardada en el cotejo. Continúa con los demás clientes del lote.');
    });
  });
  $('#checkCashRows',m).onclick=()=>{ orders.forEach(o=>{ const t=liquidationRowType(o); if(['contado','abono_credito','parcial'].includes(t)){ const ch=$(`[data-batch-check="${o.id}"]`,m); if(ch) ch.checked=true; } }); paint(); };
  $('#checkCreditRows',m).onclick=()=>{ orders.forEach(o=>{ const t=liquidationRowType(o); if(['credito','no_entregado'].includes(t)){ const ch=$(`[data-batch-check="${o.id}"]`,m); if(ch) ch.checked=true; } }); paint(); };
  $('#clearBatchChecks',m).onclick=()=>{ $$('[data-batch-check]',m).forEach(ch=>ch.checked=false); paint(); };
  function buildResults(){ return orders.map(o=>({o,...rowCalc(o)})); }
  $('#previewBatchReceipt',m).onclick=()=>{
    const r=buildResults();
    const previewOrders=r.map(x=>({...x.o,estado:x.finalResult,resultado_entrega:x.finalResult,monto_cobrado:x.cash,monto_pendiente:x.finalCredit}));
    printLiquidationReceipt(deliveryName,g.code,previewOrders,{efectivo_recibido:r.reduce((s,x)=>s+x.cash,0),recibido_por:getSelectManual(m,'batchBy','batchByManual'),observacion:$('#batchObs',m).value||''},false);
  };
  $('#saveBatchClose',m).onclick=async()=>{
    const recibido_por=getSelectManual(m,'batchBy','batchByManual'); if(!recibido_por) return alert('Selecciona quién recibe la liquidación.');
    const summaryNow=paint();
    if(summaryNow.unchecked.length) return alert('No puedes recibir los pendientes del lote. Faltan clientes por cotejar:\n\n'+summaryNow.unchecked.map(o=>'- '+(o.cliente?.negocio||o.codigo)).join('\n'));
    if(summaryNow.errors.length) return alert('Hay errores de caja:\n\n'+summaryNow.errors.join('\n'));
    const obs=$('#batchObs',m).value||'';
    const results=buildResults();
    if(results.some(x=>x.finalResult==='No entregado') && obs.trim().length<3)
      return alert('Indica en la observación del cierre el motivo de los pedidos no entregados.');
    const items=results.map(x=>({orden_id:Number(x.o.id),resultado:x.finalResult,monto_recibido:Number(x.cash||0),metodo:'Efectivo',observacion:obs,
      lineas:x.finalResult==='Devuelto parcial' ? x.returnDraft.rows.map(r=>({detalle_id:r.detalle_id,cantidad:r.qty,peso:r.weight,destino:r.destino,motivo:r.motivo})) : undefined}));
    const save=$('#saveBatchClose',m); save.disabled=true; save.textContent='Procesando lote...';
    try{
      const response=await receiveBatchCxcV9392R2(g,{items,receivedBy:recibido_por,note:obs});
      const finalOrders=results.map(x=>({...x.o,estado:x.finalResult,resultado_entrega:x.finalResult,monto_cobrado:x.cash,monto_pendiente:x.finalCredit,
        monto_devuelto:x.returnAmount||0,total_neto_liquidacion:x.returnDraft?.netTotal??x.total,peso_devuelto:x.returnDraft?.returnedWeight||0,peso_neto_entregado:x.returnDraft?.netWeight??partialReturnOriginalWeight(x.o)}));
      m.remove();
      printLiquidationReceipt(deliveryName,g.code,finalOrders,{efectivo_recibido:summaryNow.cashTotal,recibido_por,observacion:obs},true);
      await refreshVisibleModuleV9384(); render();
      toast(response?.no_entregados_a_validacion
        ? `Lote cerrado. ${response.no_entregados_a_validacion} pedido(s) regresaron a Validación.`
        : `Lote ${response?.codigo_lote||g.code} recibido y cerrado sin duplicados.`);
    }catch(err){ save.disabled=false; save.textContent='Recibir y cerrar lote'; alert(err?.message||String(err)); }
  };
  paint();
}

function printLiquidationReceipt(deliveryName,code,orders,recibo={},auto=true){
  const summary=deliveryMoneySummary(orders);
  const rows=orders.map(o=>{ const result=o.resultado_entrega||o.estado||''; const pending=Number(o.monto_pendiente||0); const credit=result==='Entregado a crédito'?pending:0; const notDelivered=result==='No entregado'?orderMonto(o):(result==='Devuelto parcial'?pending:0); return `<tr><td>${esc(o.codigo||'')}</td><td>${esc(orderClientName(o))}</td><td>${esc(o.factura_no||'—')}</td><td>${esc(result)}</td><td>${money(orderMonto(o))}</td><td>${money(o.monto_cobrado||0)}</td><td>${money(credit)}</td><td>${money(notDelivered)}</td></tr>`; }).join('');
  const diff=Number(recibo.efectivo_recibido||0)-summary.cobrado;
  const html=`<!doctype html><html><head><meta charset="utf-8"><title>Recibo ${esc(code)}</title><style>body{font-family:Arial,sans-serif;font-size:12px;color:#111;padding:20px}h1{font-size:20px;margin:0 0 8px}table{width:100%;border-collapse:collapse;margin-top:12px}th,td{border:1px solid #ddd;padding:6px;text-align:left}th{background:#f3f4f6}.tot{font-weight:bold;background:#f8fafc}.sign{border-top:1px solid #000;margin-top:38px;padding-top:4px;width:240px;display:inline-block;margin-right:40px}.box{border:1px solid #ddd;border-radius:10px;padding:10px;margin:10px 0}@media print{button{display:none}}</style></head><body>${printCompanyHeader(appCfg('recibos.tituloLiquidacion','Recibo de liquidación'),'Cierre formal de lote/viaje')}<div class="box"><b>Lote/Viaje:</b> ${esc(code)}<br><b>Responsable del viaje:</b> ${esc(deliveryName||'—')}<br><b>Fecha:</b> ${businessDateTime(new Date())}<br><b>Recibido por:</b> ${esc(recibo.recibido_por||'—')}</div><p><b>Órdenes:</b> ${orders.length} · <b>Total facturado:</b> ${money(summary.total)} · <b>Efectivo recibido:</b> ${money(recibo.efectivo_recibido||0)} · <b>Crédito:</b> ${money(summary.credito)} · <b>No entregado / devuelto:</b> ${money(summary.noEntregado+summary.devuelto)} · <b>Diferencia:</b> ${money(diff)}</p><table><thead><tr><th>Orden</th><th>Cliente</th><th>Factura</th><th>Resultado</th><th>Total</th><th>Cobrado</th><th>Crédito</th><th>No entregado / devuelto</th></tr></thead><tbody>${rows}<tr class="tot"><td colspan="4">Totales</td><td>${money(summary.total)}</td><td>${money(summary.cobrado)}</td><td>${money(summary.credito)}</td><td>${money(summary.noEntregado+summary.devuelto)}</td></tr></tbody></table>${recibo.observacion?`<p><b>Observación:</b> ${esc(recibo.observacion)}</p>`:''}${signatureHtml(appCfg('recibos.firmaDelivery','Firma delivery'))}${signatureHtml(appCfg('recibos.firmaRecibido','Firma recibido por CXC'))}${printFooterHtml()}<button onclick="window.print()">Imprimir</button>${auto?'<script>setTimeout(()=>window.print(),400)<\/script>':''}</body></html>`;
  const w=window.open('','_blank','width=950,height=750'); if(!w) return alert('El navegador bloqueó la ventana de impresión.'); w.document.open(); w.document.write(html); w.document.close();
}
function printHistorySummary(deliveryName,rows,from='',to=''){
  const htmlRows=rows.map(l=>`<tr><td>${esc(historyVisualCode(l))}</td><td>${esc(l.delivery_nombre||deliveryName||'')}</td><td>${l.fecha_liquidacion?businessDateTime(l.fecha_liquidacion):'—'}</td><td>${Number(l.cantidad_ordenes||historyLotItems(l).length)}</td><td>${money(l.total_facturado||0)}</td><td>${money(l.efectivo_recibido||l.efectivo_reportado||0)}</td><td>${money(l.credito_pendiente||0)}</td><td>${money(l.diferencia||0)}</td></tr>`).join('');
  const range=(from||to)?`<br><b>Rango:</b> ${esc(historyRangeLabel(from,to))}`:'';
  const html=`<!doctype html><html><head><meta charset="utf-8"><title>Historial liquidaciones</title><style>body{font-family:Arial,sans-serif;font-size:12px;padding:20px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:6px;text-align:left}th{background:#f3f4f6}@media print{button{display:none}}</style></head><body>${printCompanyHeader(appCfg('recibos.tituloHistorial','Historial de liquidaciones'),'Liquidaciones cerradas')}<p><b>Delivery:</b> ${esc(deliveryName||'Todos')} · <b>Impreso:</b> ${businessDateTime(new Date())}${range}</p><table><thead><tr><th>Lote</th><th>Delivery</th><th>Liquidado</th><th>Órdenes</th><th>Total</th><th>Efectivo</th><th>Crédito</th><th>Diferencia</th></tr></thead><tbody>${htmlRows}</tbody></table>${printFooterHtml()}<button onclick="window.print()">Imprimir</button><script>setTimeout(()=>window.print(),400)<\/script></body></html>`;
  const w=window.open('','_blank','width=950,height=750'); if(!w) return alert('El navegador bloqueó la ventana de impresión.'); w.document.open(); w.document.write(html); w.document.close();
}
function verifyRouteClose(deliveryName,orders){
  const faltan=orders.filter(o=>!isFinalDeliveryResult(o));
  if(faltan.length) return alert('No puedes cerrar la ruta todavía. Faltan pedidos con resultado final:\n\n'+faltan.map(o=>'- '+(o.cliente?.negocio||o.codigo)).join('\n'));
  alert(`Ruta lista para recibir/cerrar. Delivery: ${deliveryName||'—'}\nÓrdenes: ${orders.length}\nAhora confirma cada recepción o imprime el resumen para constancia.`);
}
function printLiquidationSummary(deliveryName,orders){
  const summary=deliveryMoneySummary(orders);
  const rows=orders.map(o=>`<tr><td>${esc(o.codigo||'')}</td><td>${esc(orderClientName(o))}</td><td>${esc(o.resultado_entrega||o.estado||'Pendiente')}</td><td>${money(o.total_factura||o.total_estimado)}</td><td>${money(o.monto_cobrado||0)}</td></tr>`).join('');
  const html=`<!doctype html><html><head><meta charset="utf-8"><title>Liquidación ${esc(deliveryName||'')}</title><style>body{font-family:Arial,sans-serif;font-size:12px;color:#111;padding:20px}h1{font-size:20px}table{width:100%;border-collapse:collapse;margin-top:12px}th,td{border:1px solid #ddd;padding:6px;text-align:left}.tot{font-weight:bold;background:#f3f4f6}.sign{border-top:1px solid #000;margin-top:34px;padding-top:4px;width:240px;display:inline-block;margin-right:40px}@media print{button{display:none}}</style></head><body>${printCompanyHeader('Resumen de liquidación','Recepción de delivery')}<p><b>Responsable del viaje:</b> ${esc(deliveryName||'—')}<br><b>Fecha:</b> ${businessDateTime(new Date())}</p><p><b>Órdenes:</b> ${orders.length} · <b>Total esperado:</b> ${money(summary.total)} · <b>Cobrado reportado:</b> ${money(summary.cobrado)} · <b>Crédito:</b> ${money(summary.credito)}</p><table><thead><tr><th>Orden</th><th>Cliente</th><th>Resultado</th><th>Total</th><th>Cobrado</th></tr></thead><tbody>${rows}<tr class="tot"><td colspan="3">Totales</td><td>${money(summary.total)}</td><td>${money(summary.cobrado)}</td></tr></tbody></table>${signatureHtml(appCfg('recibos.firmaRecibido','Recibido por'))}${signatureHtml(appCfg('recibos.firmaDelivery','Delivery'))}${printFooterHtml()}<button onclick="window.print()">Imprimir</button><script>setTimeout(()=>window.print(),400)<\/script></body></html>`;
  const w=window.open('','_blank','width=800,height=700'); if(!w) return alert('El navegador bloqueó la ventana de impresión.'); w.document.open(); w.document.write(html); w.document.close();
}
function openOrderStatusModal(o){ if(!o) return; const pesos=state.pesos.filter(p=>Number(p.orden_id)===Number(o.id)); const hist=state.historialEstados.filter(h=>Number(h.orden_id)===Number(o.id)); const pesoAlert=weightAlertText(o,o.peso_validado); const body=`<div class="grid2"><div><div class="section-title">Datos de orden</div><div class="kv"><b>Cliente</b><span>${esc(orderClientName(o))}</span></div><div class="kv"><b>Tipo cliente</b><span>${esc(orderCustomerType(o))}</span></div><div class="kv"><b>Modalidad</b><span>${esc(orderDeliveryMode(o))}</span></div><div class="kv"><b>Estado</b><span>${esc(o.estado||'')} ${scheduleBadge(o)}</span></div><div class="kv"><b>Fecha despacho</b><span>${shortDate(dispatchDateOf(o))}${o.hora_despacho?' · '+esc(String(o.hora_despacho).slice(0,5)):''}${o.nota_programacion?' · '+esc(o.nota_programacion):''}</span></div><div class="kv"><b>Tomado por</b><span>${esc(workerDisplayName(o.tomado_por)||'—')}${o.tomado_en?' · '+businessDateTime(o.tomado_en):''}</span></div><div class="kv"><b>Preparado por</b><span>${preparedByDisplay(o)?esc(preparedByDisplay(o)):'—'}${!orderPreparationFinalized(o)&&o.tomado_por?' <small style="color:#64748b">(aún en preparación)</small>':''}</span></div><div class="kv"><b>Facturado por</b><span>${esc(workerDisplayName(o.facturado_por)||'—')} · ${esc(o.factura_no||'')}</span></div><div class="kv"><b>Validado / entregado por</b><span>${esc(workerDisplayName(o.validado_por)||'—')}${o.validado_en?' · '+businessDateTime(o.validado_en):''}</span></div><div class="kv"><b>Delivery</b><span>${esc(isStorePickup(o)?'No aplica · retiro en negocio':(o.delivery_nombre||'—'))}</span></div>${o.retirado_por?`<div class="kv"><b>Retirado por</b><span>${esc(o.retirado_por)} · ${o.entregado_mostrador_en?businessDateTime(o.entregado_mostrador_en):''}</span></div>`:''}<div class="kv"><b>Total</b><span>${money(o.total_factura||o.total_estimado)}</span></div></div><div><div class="section-title">Pesajes</div>${pesoAlert?`<div class="kv alert-row"><b>Alerta</b><span>${esc(pesoAlert)}</span></div>`:''}${pesos.map(p=>`<div class="kv"><b>${esc(p.tipo)}</b><span>${Number(p.libras||0)} lb ${p.paquetes?`· ${p.paquetes} paquete(s)`:''}${p.notas?` · ${esc(p.notas)}`:''}</span></div>`).join('')||'<div class="empty">Sin pesajes.</div>'}</div></div><div class="section-title">Cronómetros por etapa</div>${stageTimersHtml(o)}<div class="section-title">Detalle</div><div class="order-scroll">${(o.items||[]).map(i=>`<div class="order-row ${prepStatusClass(i.estado_preparacion)}"><div class="order-main"><b class="prod-name">${esc(i.producto_nombre)}</b><small>${esc(i.unidad)} · Solicitado: ${Number(i.cantidad_pedida||0)} · ${detailPreparedText(i)}</small></div><span>${Number(i.cantidad_pedida||0)}</span><span>${i.cantidad_preparada!==null&&i.cantidad_preparada!==undefined?Number(i.cantidad_preparada):'—'}</span><span>${esc(i.estado_preparacion||'Pendiente')}</span></div>`).join('')}</div>${isSpecialOrder(o)?`<div class="section-title">Seguimiento especial</div><div class="kv"><b>Estado caso</b><span>${esc(specialCaseStatus(o))}</span></div><div class="kv"><b>Responsable</b><span>${esc(o.responsable_caso||'—')}</span></div><div class="kv"><b>Acción requerida</b><span>${esc(o.accion_caso||'—')}</span></div><div class="kv"><b>Recoger</b><span>${esc(o.producto_recoger||'—')}</span></div><div class="kv"><b>Entregar/cambio</b><span>${esc(o.producto_entregar||'—')}</span></div><div class="kv"><b>Ajuste/crédito</b><span>${money(o.monto_ajuste||0)} ${o.requiere_nota_credito?'· requiere nota de crédito':''}</span></div><div class="actions"><button class="btn" data-special-case="${o.id}">Gestionar caso</button></div>`:''}<div class="section-title">Historial de estados</div>${hist.slice(0,12).map(h=>`<div class="kv"><b>${businessDateTime(h.creado_en)}</b><span>${esc(h.estado_anterior||'—')} → <b>${esc(h.estado_nuevo)}</b>${h.comentario?' · '+esc(h.comentario):''}</span></div>`).join('')||'<div class="empty">Sin historial todavía.</div>'}<div class="actions" style="margin-top:16px">${orderWhatsAppManualButton(o)}${(puede('carniceria')||puede('ordenes')||isAdminRole())?`<button class="btn gray" data-print-prep="${o.id}">Imprimir preparación</button>`:''}${(puede('facturacion')||puede('ordenes')||isAdminRole())?`<button class="btn gray" data-print-order="${o.id}">Imprimir facturación 80mm</button>`:''}${o.estado==='Anulado'?'':`${canEditOrderGeneral(o)?`<button class="btn gray" data-edit-order="${o.id}">Editar orden</button>`:''}${canDeleteOrder(o)?`<button class="btn danger" data-cancel-order="${o.id}">${orderHasProgress(o)?'Anular orden':'Eliminar orden'}</button>`:''}`}</div>`; const m=openModal('Trazabilidad de orden',body); bindDynamic(); }
async function printOrderTicket(o){ if(!o) return; const prepPeso=orderLastPeso(o,'Preparado'); const finalPeso=orderLastPeso(o,'Entregado a delivery'); const now=new Date(); const titlePx=Math.max(14,Math.min(28,Number(appCfg('impresion.tamanoTituloPx',18))||18)); const detailPx=Math.max(10,Math.min(20,Number(appCfg('impresion.tamanoDetallePx',12))||12)); const pickupAlert=isStorePickup(o)&&appCfg('impresion.mostrarAvisoRetiro',true)!==false?`<div class="print-pickup-alert">${esc(pickupNoticeText())}</div>`:''; const items=o.items||[]; const lines=items.map(i=>{ const st=i.estado_preparacion||''; if(st==='Sin existencia') return `<tr><td>0</td><td>${esc(i.unidad||'')}</td><td>${esc(i.producto_nombre||'')}<br><span class="small">SIN EXISTENCIA</span></td></tr>`; const qty=i.cantidad_preparada!==null&&i.cantidad_preparada!==undefined?i.cantidad_preparada:i.cantidad_pedida; return `<tr><td>${esc(Number(qty||0))}</td><td>${esc(i.unidad||'')}</td><td>${esc(i.producto_nombre||'')}${st&&st!=='Preparado'?`<br><span class="small">${esc(st)}</span>`:''}</td></tr>`; }).join(''); const html=`<!doctype html><html><head><meta charset="utf-8"><title>${esc(o.codigo||'Orden')}</title><style>@page{size:80mm auto;margin:3mm}body{width:74mm;margin:0;font-family:Arial,sans-serif;font-size:${detailPx}px;color:#000}.center{text-align:center}.line{border-top:1px dashed #000;margin:6px 0}h2{font-size:${titlePx}px;margin:0 0 3px}.small{font-size:${Math.max(9,detailPx-2)}px}.print-pickup-alert{border:3px solid #000;padding:7px 5px;margin:7px 0;text-align:center;font-size:${Math.max(titlePx,18)}px;font-weight:950;line-height:1.05}table{width:100%;border-collapse:collapse}td{vertical-align:top;padding:2px 0}.b{font-weight:bold}.foot{margin-top:10px}.sign{border-top:1px solid #000;margin-top:14px;padding-top:2px}@media print{button{display:none}}.lock-alert{background:#fff8e6;border:1px solid #fbbf24;color:#92400e;border-radius:16px;padding:12px 14px;font-size:13px;font-weight:800;line-height:1.35}.lock-alert.ok{background:#ecfdf5;border-color:#86efac;color:#047857}.lock-alert.bad{background:#fff1f2;border-color:#fecdd3;color:#991b1b}.queue-box{background:#fff;border:1px solid #e5e7eb;border-radius:18px;padding:12px 14px;display:flex;gap:10px;align-items:center;justify-content:space-between;box-shadow:0 8px 18px rgba(17,24,39,.05);margin:10px 0 14px}.queue-box b{font-size:16px}.queue-box .limit{font-size:12px;color:#64748b}.op-card.locked{background:#fffbeb;border-color:#fbbf24}.op-card.free{background:#fff}.op-card.done{background:#ecfdf5;border-color:#86efac}.btn.danger,.btn.danger:hover{background:#dc2626;color:white}.btn.outline{background:#fff;color:#111827;border:1px solid #d1d5db}.input-error{border-color:#ef4444!important;box-shadow:0 0 0 3px rgba(239,68,68,.14)!important}.no-granel-note{display:inline-block;margin-top:4px;color:#991b1b;font-weight:900;font-size:11px}
    .live-bar{background:#fff;border:1px solid var(--line);border-radius:18px;padding:12px 14px;margin:-6px 0 16px;display:flex;justify-content:space-between;align-items:center;gap:12px;box-shadow:var(--shadow2);flex-wrap:wrap}.live-left{display:flex;align-items:center;gap:9px;flex-wrap:wrap}.live-dot{width:10px;height:10px;border-radius:999px;background:#94a3b8;box-shadow:0 0 0 4px rgba(148,163,184,.15)}.live-dot.on{background:#10b981;box-shadow:0 0 0 4px rgba(16,185,129,.15)}.live-dot.warn{background:#f59e0b;box-shadow:0 0 0 4px rgba(245,158,11,.15)}.live-dot.bad{background:#ef4444;box-shadow:0 0 0 4px rgba(239,68,68,.15)}.live-title{font-weight:950}.live-sub{font-size:12px;color:var(--muted);font-weight:700}.live-notice{border:1px solid #bfdbfe;background:#eff6ff;border-radius:14px;padding:9px 11px;font-size:12px;color:#1e40af;font-weight:800}.live-notice b{display:block;color:#111827;margin-bottom:2px}.live-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
  </style></head><body><div class="center"><h2>${esc(appCfg('empresa.nombre','PRODUCTOS CÉSAR'))}</h2><div class="b">${esc(appCfg('recibos.tituloOrden','ORDEN PARA FACTURAR'))}</div><div>${esc(o.codigo||'')}</div>${appCfg('empresa.telefono','')?`<div class="small">Tel: ${esc(appCfg('empresa.telefono',''))}</div>`:''}</div>${pickupAlert}<div class="line"></div><div>Fecha orden: ${shortDate(o.fecha)}</div><div>Fecha despacho: ${shortDate(dispatchDateOf(o))} ${o.hora_despacho?esc(String(o.hora_despacho).slice(0,5)):''}</div><div>Impreso: ${businessDateTime(now)}</div><div>Estado: ${esc(o.estado||'')}</div>${isFutureDispatch(o)?'<div class="b">NO DESPACHAR HOY</div>':''}<div class="line"></div><div class="b">CLIENTE</div><div>${esc(orderClientName(o))}</div><div>${esc(o.cliente?.contacto||'')}</div><div>Tel: ${esc(orderClientPhone(o))}</div><div>Sector: ${esc(orderClientSector(o))}</div>${occasionalPrintBlock(o)}<div class="line"></div><div class="b">PREPARACIÓN</div><div>Preparado por: ${esc(preparedByDisplay(o)||'—')}</div><div>Peso pedido: ${esc(o.peso_preparado||prepPeso?.libras||'—')} lb</div><div>Paquetes: ${esc(o.paquetes_preparados||prepPeso?.paquetes||'—')}</div><div>Peso final: ${esc(o.peso_validado||finalPeso?.libras||'—')} lb</div><div class="line"></div><div class="b">DETALLE DE ORDEN</div><table>${lines}</table><div class="line"></div><div>Total estimado: ${money(o.total_factura||o.total_estimado)}</div>${o.notas?`<div>Notas: ${esc(o.notas)}</div>`:''}<div class="foot"><div class="sign">${esc(appCfg('recibos.firmaFacturacion','Facturado por'))}</div><div class="sign">No. Factura</div><div class="sign">Validado por</div><div class="sign">Archivo / firma</div>${appCfg('recibos.pie','')?`<div class="small center">${esc(appCfg('recibos.pie',''))}</div>`:''}</div><button onclick="window.print()">Imprimir</button><script>setTimeout(()=>window.print(),400)<\/script></body></html>`; const w=window.open('','_blank','width=420,height=720'); if(!w) return alert('El navegador bloqueó la ventana de impresión. Permite popups para esta página.'); w.document.open(); w.document.write(html); w.document.close(); const count=(+o.cantidad_impresiones||0)+1; const nextEstado = o.estado==='Lista para facturar' ? 'Impresa para facturar' : o.estado;
  const printed=await sb.rpc('cambiar_estado_orden_v9382',{p_orden_id:o.id,p_estado_esperado:o.estado,p_estado_nuevo:nextEstado,p_cambios:{cantidad_impresiones:count,ultima_impresion:new Date().toISOString(),impreso_por:state.user.id},p_comentario:nextEstado!==o.estado?'Impresión de volante 80 mm':'Reimpresión de volante 80 mm',p_modulo:'facturacion'});
  if(printed.error) alert('La impresión se abrió, pero no se pudo registrar: '+printed.error.message);
  await refreshVisibleModuleV9384(); render(); }
function renderConfigEmpleados(c){
  const areas=employeeAreas();
  const linked=(state.empleados||[]).filter(e=>!!linkedUserForEmployee(e)).length;
  const without=(state.empleados||[]).filter(e=>e.activo!==false&&!linkedUserForEmployee(e)).length;
  c.innerHTML=`<div class="panel-head"><div><h3>Empleados operativos</h3><p>Fuente única de identidad operativa. Desde aquí puedes ver qué empleado tiene acceso al CRM y cuál todavía no está vinculado.</p></div><button class="btn" id="newEmp">+ Empleado</button></div>
  <div class="grid3 compact-kpis" style="margin-bottom:14px"><div class="card"><h3>${activeEmployees('').length}</h3><p class="hint">empleados activos</p></div><div class="card"><h3>${linked}</h3><p class="hint">con acceso vinculado</p></div><div class="card"><h3 class="${without?'bad-text':''}">${without}</h3><p class="hint">activos sin usuario</p></div></div>
  <div class="stage-report-grid" style="margin-bottom:14px">${areas.map(a=>{const n=activeEmployees(a).length; return n?`<div class="stage-report"><b>${esc(a)}</b><strong>${n}</strong><small>activo(s)</small></div>`:''}).join('')}</div>
  <div class="list">${state.empleados.map(e=>{const usr=linkedUserForEmployee(e);const extra=employeeOperationalAreas(e).filter(a=>norm(a)!==norm(e.area));return `<div class="client-card"><div><div class="client-title" style="font-size:16px">${esc(e.nombre)}</div><div class="badges"><span class="badge info">Principal: ${esc(e.area)}</span>${extra.map(a=>`<span class="badge">${esc(a)}</span>`).join('')}<span class="badge ${e.activo?'ok':'bad'}">${e.activo?'Activo':'Inactivo'}</span>${usr?'<span class="badge ok">Acceso CRM vinculado</span>':'<span class="badge warn">Sin usuario vinculado</span>'}</div>${extra.length?`<div class="hint">También puede trabajar en: ${extra.map(esc).join(' · ')}</div>`:''}${usr?`<div class="hint">Usuario: ${esc(usr.correo||usr.email||usr.nombre||usr.id)} · Rol: ${esc(usr.rol||'Sin perfil')} · ${usr.activo!==false?'acceso activo':'acceso inactivo'}</div>`:''}${e.observaciones?`<div class="hint">${esc(e.observaciones)}</div>`:''}</div><div class="card-actions"><button class="btn small gray" data-emp-edit="${e.id}">Editar empleado</button>${usr?`<button class="btn small dark" data-emp-user="${e.id}">Ver usuario</button>`:`<button class="btn small" data-emp-link="${e.id}">Vincular usuario</button>`}<button class="btn small ${e.activo?'warn':'green'}" data-emp-toggle="${e.id}">${e.activo?'Desactivar':'Activar'}</button></div></div>`;}).join('')||'<div class="empty">No hay empleados operativos registrados.</div>'}</div>`;
  $('#newEmp').onclick=()=>openEmpleadoForm();
  $$('[data-emp-edit]').forEach(b=>b.onclick=()=>openEmpleadoForm(employeeById(b.dataset.empEdit)));
  $$('[data-emp-user]').forEach(b=>b.onclick=()=>{const e=employeeById(b.dataset.empUser),u=linkedUserForEmployee(e);if(u) openUserPerms(u);});
  $$('[data-emp-link]').forEach(b=>b.onclick=()=>openEmployeeUserLink(employeeById(b.dataset.empLink)));
  $$('[data-emp-toggle]').forEach(b=>b.onclick=()=>toggleEmpleado(employeeById(b.dataset.empToggle)));
}
function openEmployeeUserLink(e){
  if(!e) return;
  const candidates=(state.usuarios||[]).filter(u=>!u.empleado_id&&accountTypeOf(u)!=='estacion');
  if(!candidates.length) return alert('No hay usuarios personales disponibles sin empleado. Primero crea la credencial en Supabase Authentication y actualiza Usuarios.');
  const body=`<div class="form"><div class="success"><b>Empleado:</b> ${esc(e.nombre)} · ${esc(e.area)}</div><div class="field"><label>Usuario personal disponible</label><select id="linkEmployeeUser"><option value="">Selecciona</option>${candidates.map(u=>`<option value="${u.id}">${esc(u.nombre||u.correo||u.id)} · ${esc(u.correo||u.rol||'')}</option>`).join('')}</select></div><button class="btn" id="continueEmployeeLink">Continuar y revisar permisos</button></div>`;
  const m=openModal('Vincular empleado con usuario',body,'El vínculo final se confirma en el editor de Usuarios.');
  $('#continueEmployeeLink',m).onclick=()=>{const u=state.usuarios.find(x=>sameUserId(x.id,$('#linkEmployeeUser',m).value));if(!u)return alert('Selecciona un usuario.');m.remove();openUserPerms(u,e.id);};
}
function openEmpleadoForm(e={}){
  const areas=employeeAreas();
  const linkedUser=e?.id?linkedUserForEmployee(e):null;
  const currentExtras=splitEmployeeAreas(e.areas_adicionales);
  const body=`<div class="form"><div class="grid2"><div class="field"><label>Nombre</label><input id="empNombre" value="${esc(e.nombre||'')}"></div><div class="field"><label>Área principal</label><select id="empArea">${areas.map(a=>`<option ${a===e.area?'selected':''}>${a}</option>`).join('')}</select><div class="hint">Define su puesto habitual y sugiere el rol del usuario; no cambia permisos automáticamente.</div></div></div><div class="field"><label>Áreas operativas adicionales</label><div class="employee-area-grid">${areas.map(a=>`<label class="employee-area-option"><input type="checkbox" data-emp-extra-area value="${esc(a)}" ${currentExtras.some(x=>norm(x)===norm(a))?'checked':''}><span>${esc(a)}</span></label>`).join('')}</div><div class="hint">Marca otras áreas donde este empleado puede trabajar. Ejemplo: un Delivery también puede quedar habilitado para Carnicería y aparecer en la estación compartida.</div></div><div class="field"><label>Estado</label><select id="empActivo"><option value="true" ${e.activo!==false?'selected':''}>Activo</option><option value="false" ${e.activo===false?'selected':''}>Inactivo</option></select></div>${linkedUser?`<div class="success"><b>Acceso vinculado:</b> ${esc(linkedUser.correo||linkedUser.nombre||linkedUser.id)}. Las áreas adicionales no cambian su rol ni sus permisos del CRM. Al desactivar al empleado también se desactivará su acceso.</div>`:''}<div class="field"><label>Observaciones</label><textarea id="empObs">${esc(e.observaciones||'')}</textarea></div><button class="btn" id="saveEmp">Guardar empleado</button></div>`;
  const m=openModal(e.id?'Editar empleado':'Nuevo empleado operativo',body);
  const syncExtraAreas=()=>{
    const primary=$('#empArea',m).value;
    $$('[data-emp-extra-area]',m).forEach(ch=>{const isPrimary=norm(ch.value)===norm(primary);ch.disabled=isPrimary;if(isPrimary)ch.checked=false;});
  };
  $('#empArea',m).addEventListener('change',syncExtraAreas);
  syncExtraAreas();
  $('#saveEmp',m).onclick=async()=>{
    const primary=$('#empArea',m).value;
    const extras=$$('[data-emp-extra-area]',m).filter(ch=>ch.checked&&!ch.disabled&&norm(ch.value)!==norm(primary)).map(ch=>ch.value);
    const row={nombre:$('#empNombre',m).value.trim(),area:primary,areas_adicionales:extras,activo:$('#empActivo',m).value==='true',observaciones:$('#empObs',m).value||null};
    if(!row.nombre) return alert('Nombre obligatorio.');
    if(linkedUser&&e.activo!==false&&!row.activo){const ok=confirm(`Este empleado tiene el usuario ${linkedUser.correo||linkedUser.nombre||''} vinculado. Al desactivarlo, también perderá acceso al CRM. ¿Continuar?`);if(!ok)return;}
    const q=e.id?sb.from('empleados_operativos').update(row).eq('id',e.id):sb.from('empleados_operativos').insert(row);
    const {error}=await q; if(error) return alert(error.message);
    if(linkedUser){
      const patch={nombre:row.nombre,vendedor:row.nombre,actualizado_en:new Date().toISOString()};
      if(!row.activo) patch.activo=false;
      const p=await sb.from('perfiles').update(patch).eq('id',linkedUser.id);
      if(p.error) console.warn('No se sincronizó el perfil desde frontend:',p.error.message);
    }
    m.remove(); await refreshVisibleModuleV9384(); render(); toast(linkedUser?'Empleado y usuario sincronizados':'Empleado guardado');
  };
  wireEnterFlow(m,['empNombre','empArea','empActivo','empObs','saveEmp']);
}
async function toggleEmpleado(e){
  if(!e) return;
  const linkedUser=linkedUserForEmployee(e);
  const activating=e.activo===false;
  if(!activating){
    const detail=linkedUser?`\n\nTambién se desactivará el acceso CRM de ${linkedUser.correo||linkedUser.nombre||'este usuario'}.`:'';
    if(!confirm(`¿Desactivar a ${e.nombre}?${detail}\n\nNo se borrará su historial.`)) return;
  }
  const r=await sb.from('empleados_operativos').update({activo:activating,actualizado_en:new Date().toISOString()}).eq('id',e.id);
  if(r.error) return alert(r.error.message);
  if(!activating&&linkedUser){const p=await sb.from('perfiles').update({activo:false,actualizado_en:new Date().toISOString()}).eq('id',linkedUser.id);if(p.error)console.warn(p.error.message);}
  await refreshVisibleModuleV9384(); render();
  toast(activating?(linkedUser?'Empleado reactivado; revisa manualmente si también reactivas su usuario.':'Empleado activado'):'Empleado y acceso desactivados');
}
function fieldWithAdd(id,label,catId,selected){
  return `<div class="field"><label>${label}</label><div class="inline-select-add"><select id="${id}">${optionList(catId,selected)}</select><button type="button" class="btn gray small" data-add-form-cat="${catId}" data-select-target="${id}">+</button></div><div class="hint">Conectado a Configuración → Catálogos.</div></div>`;
}
function openProductForm(p={}){
  const tipos=['Por libra','Unidad peso fijo','Unidad peso variable','No pesa'];
  const body=`<div class="form"><div class="grid2"><div class="field"><label>Código</label><input id="p_codigo" value="${esc(p.codigo||'')}"></div><div class="field"><label>Estado</label><select id="p_activo"><option value="true" ${p.activo!==false?'selected':''}>Activo</option><option value="false" ${p.activo===false?'selected':''}>Inactivo</option></select></div></div><div class="field"><label>Nombre</label><input id="p_nombre" value="${esc(p.nombre||'')}"></div><div class="grid2">${fieldWithAdd('p_cat','Categoría','categoria_producto',p.categoria)}${fieldWithAdd('p_unidad','Unidad de venta','unidad_producto',p.unidad||'lb')}</div><div class="field"><label>Precio defecto</label><input id="p_precio" type="number" step="0.01" value="${p.precio_defecto||0}"></div><div class="section-title">Configuración de despacho / peso</div><div class="grid3"><div class="field"><label>Tipo de peso</label><select id="p_tipo_peso">${tipos.map(t=>`<option ${t===productWeightTypeFromProduct(p)?'selected':''}>${t}</option>`).join('')}</select></div><div class="field"><label>Peso estándar por unidad (lb)</label><input id="p_peso_std" type="number" step="0.001" value="${p.peso_estandar_lb||''}" placeholder="Ej: 3.5"></div><div class="field"><label>Tolerancia permitida (lb)</label><input id="p_tol" type="number" step="0.01" value="${p.tolerancia_lb||0.25}"></div></div><div class="grid3"><div class="field"><label>Requiere pesaje</label><select id="p_req"><option value="true" ${p.requiere_pesaje!==false?'selected':''}>Sí</option><option value="false" ${p.requiere_pesaje===false?'selected':''}>No</option></select></div><div class="field"><label>Suma al peso final</label><select id="p_suma"><option value="true" ${p.suma_peso_final!==false?'selected':''}>Sí</option><option value="false" ${p.suma_peso_final===false?'selected':''}>No</option></select></div><div class="field"><label>Permitir ajustar en carnicería</label><select id="p_ajustar"><option value="true" ${p.permitir_ajustar_peso!==false?'selected':''}>Sí</option><option value="false" ${p.permitir_ajustar_peso===false?'selected':''}>No</option></select></div></div><div class="field"><label>¿Permite despacho al granel / fraccionado?</label><select id="p_fraccion"><option value="true" ${productAllowsFraction(p)?'selected':''}>Sí, permite 1.5 / 2.75</option><option value="false" ${!productAllowsFraction(p)?'selected':''}>No, solo unidades enteras</option></select><div class="hint">Usa “No” para salami/piezas enteras. Si el despachador escribe 1.5, el sistema lo bloqueará.</div></div><div class="success"><b>Recomendación:</b> productos como salami entero deben ir como Unidad peso fijo + unidad + No fraccionado. Carnes y longanizas deben ir Por libra + permite fracción.</div><div class="field"><label>Observaciones</label><textarea id="p_obs">${esc(p.observaciones||'')}</textarea></div><button class="btn" id="saveProduct">Guardar producto</button></div>`;
  const m=openModal(p.id?'Editar producto':'Nuevo producto',body,'Configura cómo Carnicería debe calcular el peso interno de este producto.');
  $$('[data-add-form-cat]',m).forEach(b=>b.onclick=()=>addCatalogFromProductForm(m,b.dataset.addFormCat,b.dataset.selectTarget));
  $('#saveProduct',m).onclick=async()=>{
    const row={codigo:$('#p_codigo',m).value.trim()||null,nombre:$('#p_nombre',m).value.trim(),categoria:$('#p_cat',m).value,unidad:$('#p_unidad',m).value||'lb',precio_defecto:+$('#p_precio',m).value||0,activo:$('#p_activo',m).value==='true',tipo_despacho_peso:$('#p_tipo_peso',m).value,requiere_pesaje:$('#p_req',m).value==='true',peso_estandar_lb:+$('#p_peso_std',m).value||null,tolerancia_lb:+$('#p_tol',m).value||0.25,suma_peso_final:$('#p_suma',m).value==='true',permitir_ajustar_peso:$('#p_ajustar',m).value==='true',permite_fraccion:$('#p_fraccion',m).value==='true',observaciones:$('#p_obs',m).value||null};
    if(!row.nombre) return alert('Nombre requerido.');
    if(row.tipo_despacho_peso==='Unidad peso fijo' && !row.peso_estandar_lb) return alert('Para unidad con peso fijo debes colocar el peso estándar en lb.');
    const q=p.id?sb.from('productos_despacho').update(row).eq('id',p.id):sb.from('productos_despacho').insert(row);
    const {error}=await q;
    if(error) return alert(error.message);
    m.remove(); await refreshVisibleModuleV9384(); render(); toast('Producto guardado');
  };
}

function openProductActions(p){
  if(!p) return;
  const issues=productConfigIssues(p);
  const used=productHasOrders(p);
  const body=`<div class="form">
    <div class="client-card" style="grid-template-columns:1fr;align-items:start">
      <div><b>${esc(p.codigo||'')} · ${esc(p.nombre||'')}</b><br><small>${esc(p.categoria||'Sin categoría')} · ${esc(p.unidad||'Sin unidad')} · ${esc(weightConfigLabel(p))}</small></div>
      <div class="badges"><span class="badge ${p.activo!==false?'ok':'bad'}">${p.activo!==false?'Activo':'Inactivo'}</span>${productConfigBadge(p)}${used?'<span class="badge warn">Tiene historial</span>':'<span class="badge ok">Sin órdenes vinculadas</span>'}</div>
    </div>
    ${issues.length?`<div class="weight-alert"><strong>Revisar configuración</strong>${esc(issues.join(' · '))}</div>`:`<div class="weight-ok">Configuración de despacho sin alertas visibles.</div>`}
    <div class="grid2">
      <button class="btn gray" id="actEditProduct">Editar producto</button>
      <button class="btn ${p.activo!==false?'warn':'green'}" id="actToggleProduct">${p.activo!==false?'Desactivar producto':'Activar producto'}</button>
    </div>
    <div class="section-title">Zona administrativa</div>
    <div class="hint">Eliminar definitivo solo se recomienda para productos creados por error y sin historial. Si el producto ya se usó en órdenes, el sistema recomendará desactivarlo.</div>
    <button class="btn danger" id="actDeleteProduct">Eliminar definitivo</button>
  </div>`;
  const m=openModal('Acciones del producto',body,'Centraliza acciones para mantener la tabla limpia y evitar eliminaciones por error.');
  $('#actEditProduct',m).onclick=()=>{m.remove(); openProductForm(p);};
  $('#actToggleProduct',m).onclick=async()=>{m.remove(); await toggleProduct(p);};
  $('#actDeleteProduct',m).onclick=async()=>{m.remove(); await deleteProduct(p);};
}

async function toggleProduct(p){
  if(!p) return;
  const nuevo = p.activo===false;
  const msg = nuevo ? `¿Activar el producto "${p.nombre}" nuevamente?` : `¿Desactivar el producto "${p.nombre}"? No se borrará del historial, pero no quedará como activo para pedidos.`;
  if(!confirm(msg)) return;
  const {error}=await sb.from('productos_despacho').update({activo:nuevo}).eq('id',p.id);
  if(error) return alert(error.message);
  await refreshVisibleModuleV9384(); render(); toast(nuevo?'Producto activado':'Producto desactivado');
}
async function deleteProduct(p){
  if(!p) return;
  if(productHasOrders(p)){
    const soft=confirm(`El producto "${p.nombre}" ya tiene órdenes vinculadas.\n\nNo conviene eliminarlo porque puede afectar reportes e historial.\n\n¿Deseas desactivarlo para que no siga disponible en pedidos?`);
    if(soft){
      const r=await sb.from('productos_despacho').update({activo:false}).eq('id',p.id);
      if(r.error) return alert(r.error.message);
      await refreshVisibleModuleV9384(); render(); toast('Producto desactivado');
    }
    return;
  }
  const typed=prompt(`Eliminar definitivamente el producto "${p.nombre}"?\n\nEsta acción solo debe usarse para productos creados por error.\nEscribe ELIMINAR para confirmar.`);
  if(String(typed||'').trim().toUpperCase()!=='ELIMINAR') return;
  const {error}=await sb.from('productos_despacho').delete().eq('id',p.id);
  if(error){
    const soft=confirm('No se pudo eliminar definitivamente. Es posible que el producto tenga historial relacionado.\n\n¿Deseas desactivarlo para que no aparezca como producto activo?');
    if(soft){
      const r=await sb.from('productos_despacho').update({activo:false}).eq('id',p.id);
      if(r.error) return alert(r.error.message);
      await refreshVisibleModuleV9384(); render(); toast('Producto desactivado');
    } else alert(error.message);
    return;
  }
  await refreshVisibleModuleV9384(); render(); toast('Producto eliminado definitivamente');
}

function downloadClienteTemplate(){ sheetExport('plantilla_clientes_productos_cesar.xlsx',[{codigo:'CL-999',negocio:'COLMADO EJEMPLO',contacto:'JUAN',tipo:'Colmado',sector:'San Marcos',telefono:'809-000-0000',vendedor:'Cesar',dias_contacto:'Lunes, Jueves',frecuencia_automatica:'2 veces por semana',estado:'Activo',whatsapp:true,credito:false,limite_credito:0,observaciones:''}]); }
function downloadProductoTemplate(){ sheetExport('plantilla_productos_productos_cesar.xlsx',[{codigo:'PR-999',nombre:'Longaniza ejemplo',categoria:'Carnes',unidad:'lb',precio:100,tipo_despacho_peso:'Por libra',peso_estandar_lb:'',requiere_pesaje:true,suma_peso_final:true,tolerancia_lb:0.25,permitir_ajustar_peso:true,permite_fraccion:true,activo:true,observaciones:''},{codigo:'PR-998',nombre:'Salami ejemplo',categoria:'Embutidos',unidad:'unidad',precio:300,tipo_despacho_peso:'Unidad peso fijo',peso_estandar_lb:3.5,requiere_pesaje:false,suma_peso_final:true,tolerancia_lb:0.25,permitir_ajustar_peso:false,permite_fraccion:false,activo:true,observaciones:'1 unidad = 3.5 lb; no se vende al granel'}]); }
function exportClientes(rows){ sheetExport('clientes_productos_cesar.xlsx', rows.map(c=>({codigo:c.codigo,negocio:c.negocio,contacto:c.contacto,tipo:c.tipo,sector:c.sector,telefono:c.telefono,vendedor:c.vendedor,dias_contacto:contactDaysText(c),frecuencia_automatica:freqFromDays(contactDaysOf(c)),estado:c.estado,whatsapp:c.whatsapp,credito:c.credito,limite_credito:c.limite_credito,observaciones:c.observaciones}))); }
function exportProductos(rows){ sheetExport('productos_productos_cesar.xlsx', rows.map(p=>({codigo:p.codigo,nombre:p.nombre,categoria:p.categoria,unidad:p.unidad,precio:p.precio_defecto,tipo_despacho_peso:productWeightTypeFromProduct(p),peso_estandar_lb:p.peso_estandar_lb,requiere_pesaje:p.requiere_pesaje!==false,suma_peso_final:p.suma_peso_final!==false,tolerancia_lb:p.tolerancia_lb||0.25,permitir_ajustar_peso:p.permitir_ajustar_peso!==false,permite_fraccion:productAllowsFraction(p),activo:p.activo,observaciones:p.observaciones}))); }
const MAX_XLSX_IMPORT_BYTES=2*1024*1024;
const MAX_XLSX_IMPORT_ROWS=5000;
const MAX_XLSX_IMPORT_COLUMNS=50;
const FORBIDDEN_XLSX_HEADERS=new Set(['__proto__','prototype','constructor']);
function safeXlsxCell(value){
  return typeof value==='string' ? value.slice(0,2000) : value;
}
async function readXlsx(file){
  if(!file) return [];
  try{
    const name=String(file.name||'').toLowerCase();
    if(!/\.(xlsx|xls)$/.test(name)) throw new Error('Solo se permiten archivos .xlsx o .xls.');
    if(Number(file.size||0)>MAX_XLSX_IMPORT_BYTES) throw new Error('El archivo supera el límite de 2 MB.');
    const data=await file.arrayBuffer();
    const wb=XLSX.read(data,{
      type:'array',dense:true,cellFormula:false,cellHTML:false,cellNF:false,
      cellStyles:false,bookVBA:false,sheetRows:MAX_XLSX_IMPORT_ROWS+2
    });
    const ws=wb.Sheets[wb.SheetNames[0]];
    if(!ws) throw new Error('El archivo no contiene una hoja válida.');
    const range=XLSX.utils.decode_range(ws['!ref']||'A1:A1');
    if(range.e.c+1>MAX_XLSX_IMPORT_COLUMNS) throw new Error('El archivo supera el límite de 50 columnas.');
    const matrix=XLSX.utils.sheet_to_json(ws,{header:1,defval:'',raw:true,blankrows:false});
    if(matrix.length>MAX_XLSX_IMPORT_ROWS+1) throw new Error('El archivo supera el límite de 5,000 filas.');
    if(!matrix.length) return [];
    const headers=matrix[0].slice(0,MAX_XLSX_IMPORT_COLUMNS).map(x=>String(x??'').trim().slice(0,100));
    return matrix.slice(1).map(cells=>{
      const row=Object.create(null);
      headers.forEach((header,index)=>{
        if(header && !FORBIDDEN_XLSX_HEADERS.has(header.toLowerCase())) row[header]=safeXlsxCell(cells[index]);
      });
      return row;
    });
  }catch(error){
    console.error('Importación Excel rechazada:',error);
    alert(error?.message||'No se pudo leer el archivo Excel de forma segura.');
    return [];
  }
}
function val(row,names){ const keys=Object.keys(row); for(const n of names){ const k=keys.find(k=>norm(k)===norm(n)); if(k) return row[k]; } return ''; }
async function importClientes(file){ const rows=await readXlsx(file); if(!rows.length) return; const payload=rows.map(r=>({codigo:String(val(r,['codigo','código'])).trim(),negocio:String(val(r,['negocio','cliente'])).trim(),contacto:String(val(r,['contacto'])).trim(),tipo:String(val(r,['tipo','tipo_negocio'])).trim()||'Otro',sector:String(val(r,['sector','zona'])).trim(),telefono:String(val(r,['telefono','teléfono'])).trim(),vendedor:String(val(r,['vendedor'])).trim()||state.profile.vendedor||'Cesar',dia_contacto:(String(val(r,['dias_contacto','días_contacto','dia_contacto','día','dia'])).trim()||'Lunes'),frecuencia:freqFromDays(splitContactDays(String(val(r,['dias_contacto','días_contacto','dia_contacto','día','dia'])).trim()||'Lunes')),estado:String(val(r,['estado'])).trim()||'Activo',whatsapp:String(val(r,['whatsapp'])).toLowerCase()!=='false',credito:String(val(r,['credito','crédito'])).toLowerCase()==='true',limite_credito:+val(r,['limite_credito','límite_credito'])||0,observaciones:String(val(r,['observaciones'])).trim(),archivado:false})).filter(x=>x.codigo&&x.negocio); if(!payload.length) return alert('No encontré filas válidas.'); const {error}=await sb.from('clientes').upsert(payload,{onConflict:'codigo'}); if(error) return alert(error.message); await sb.from('importaciones_log').insert({tipo:'clientes',archivo:file.name,importados:payload.length,detalle:{filas:rows.length},usuario:state.user.id}); await refreshVisibleModuleV9384(); render(); toast('Clientes importados/actualizados: '+payload.length); }
async function importProductos(file){
  const rows=await readXlsx(file); if(!rows.length) return;
  const payloadRaw=rows.map((r,i)=>({
    _fila:i+2,
    codigo:String(val(r,['codigo','código'])).trim(),
    nombre:String(val(r,['nombre','producto'])).trim(),
    categoria:String(val(r,['categoria','categoría'])).trim()||'Otros',
    unidad:String(val(r,['unidad'])).trim()||'lb',
    precio_defecto:+val(r,['precio','precio_defecto'])||0,
    tipo_despacho_peso:String(val(r,['tipo_despacho_peso','tipo_peso','tipo de peso'])).trim() || (String(val(r,['unidad'])).trim().toLowerCase()==='lb'?'Por libra':'Unidad peso variable'),
    peso_estandar_lb:+val(r,['peso_estandar_lb','peso_estandar','peso estándar lb'])||null,
    requiere_pesaje:String(val(r,['requiere_pesaje','requiere pesaje'])).toLowerCase()!=='false',
    suma_peso_final:String(val(r,['suma_peso_final','suma al peso final'])).toLowerCase()!=='false',
    tolerancia_lb:+val(r,['tolerancia_lb','tolerancia'])||0.25,
    permitir_ajustar_peso:String(val(r,['permitir_ajustar_peso','permitir ajustar'])).toLowerCase()!=='false',
    permite_fraccion:String(val(r,['permite_fraccion','permite fraccion','permite fracciones','despacho_al_granel','al granel'])).toLowerCase()!=='false',
    activo:String(val(r,['activo'])).toLowerCase()!=='false',
    observaciones:String(val(r,['observaciones'])).trim()
  })).filter(x=>x.nombre);
  if(!payloadRaw.length) return alert('No encontré filas válidas.');

  // Deduplicar dentro del Excel por NOMBRE. Si el archivo trae el mismo producto dos veces,
  // se conserva la última fila para evitar que la importación se detenga por duplicados.
  const seenFile=new Map(), duplicadosExcel=[];
  payloadRaw.forEach(item=>{
    const k=norm(item.nombre);
    if(seenFile.has(k)) duplicadosExcel.push(item.nombre);
    seenFile.set(k,item);
  });
  const payload=Array.from(seenFile.values());
  const existingByName=new Map(state.productos.map(p=>[norm(p.nombre),p]));
  const usedCodes=new Set(state.productos.map(p=>String(p.codigo||'').trim()).filter(Boolean));
  const nuevos=payload.filter(x=>!existingByName.has(norm(x.nombre)));
  const existentes=payload.filter(x=>existingByName.has(norm(x.nombre)));
  const salamis=payload.filter(x=>norm(x.nombre).includes('salami')).length;

  const body=`<div class="form">
    <div class="card" style="box-shadow:none">
      <h3 style="margin:0 0 8px">Importación inteligente de productos</h3>
      <p class="hint">El sistema comparará por <b>nombre del producto</b>. Así evita que choquen códigos viejos como PR-001 y permite subir solo los artículos que faltan.</p>
      <div class="grid3">
        <div class="kpi"><div class="label">Filas válidas</div><div class="value">${payload.length}</div></div>
        <div class="kpi"><div class="label">Nuevos</div><div class="value">${nuevos.length}</div></div>
        <div class="kpi"><div class="label">Ya existen</div><div class="value">${existentes.length}</div></div>
      </div>
      <div class="badges" style="margin-top:10px"><span class="badge info">${salamis} salami(s) detectados</span>${duplicadosExcel.length?`<span class="badge warn">${duplicadosExcel.length} duplicado(s) dentro del Excel</span>`:''}</div>
    </div>
    <div class="section-title">Elige cómo importar</div>
    <button class="btn green" id="impNew">Agregar solo productos que NO están en el catálogo</button>
    <button class="btn warn" id="impUpdate">Actualizar existentes y agregar faltantes</button>
    <button class="btn dark" id="impReplace">Reemplazar catálogo operativo</button>
    <div class="hint"><b>Reemplazar catálogo operativo</b> no borra productos usados en órdenes: actualiza/agrega los del Excel y desactiva los que no estén en el archivo, para no dañar historial.</div>
  </div>`;
  const m=openModal('Importar catálogo de productos',body,'Vista previa antes de subir al sistema');
  $('#impNew',m).onclick=()=>runProductImport(file, payload, 'new', m);
  $('#impUpdate',m).onclick=()=>runProductImport(file, payload, 'update', m);
  $('#impReplace',m).onclick=()=>runProductImport(file, payload, 'replace', m);
}
function nextProductCode(usedCodes){
  let max=0;
  usedCodes.forEach(c=>{ const m=String(c).match(/^PR-(\d+)$/i); if(m) max=Math.max(max,+m[1]); });
  let n=max+1, code='';
  do { code='PR-'+String(n++).padStart(3,'0'); } while(usedCodes.has(code));
  usedCodes.add(code); return code;
}
function safeProductCode(preferred, usedCodes){
  const code=String(preferred||'').trim();
  if(code && !usedCodes.has(code)){ usedCodes.add(code); return code; }
  return nextProductCode(usedCodes);
}
async function runProductImport(file, payload, mode, modalEl){
  const btns=$$('button',modalEl); btns.forEach(b=>b.disabled=true);
  const existingByName=new Map(state.productos.map(p=>[norm(p.nombre),p]));
  const usedCodes=new Set(state.productos.map(p=>String(p.codigo||'').trim()).filter(Boolean));
  let insertados=0, actualizados=0, omitidos=0, desactivados=0, errores=[];
  const fileNameSet=new Set(payload.map(p=>norm(p.nombre)));

  for(const item of payload){
    try{
      const existing=existingByName.get(norm(item.nombre));
      if(existing){
        if(mode==='new'){ omitidos++; continue; }
        const row={
          codigo: existing.codigo || safeProductCode(item.codigo, usedCodes),
          nombre:item.nombre,
          categoria:item.categoria,
          unidad:item.unidad,
          precio_defecto:item.precio_defecto,
          tipo_despacho_peso:item.tipo_despacho_peso,
          peso_estandar_lb:item.peso_estandar_lb,
          requiere_pesaje:item.requiere_pesaje,
          suma_peso_final:item.suma_peso_final,
          tolerancia_lb:item.tolerancia_lb,
          permitir_ajustar_peso:item.permitir_ajustar_peso,
          permite_fraccion:item.permite_fraccion,
          activo:item.activo,
          observaciones:item.observaciones
        };
        const r=await sb.from('productos_despacho').update(row).eq('id',existing.id);
        if(r.error) throw r.error;
        actualizados++;
      } else {
        const row={...item}; delete row._fila;
        row.codigo=safeProductCode(row.codigo, usedCodes);
        const r=await sb.from('productos_despacho').insert(row);
        if(r.error) throw r.error;
        insertados++;
      }
    }catch(e){ errores.push((item.codigo||item.nombre)+': '+(e.message||e)); }
  }

  if(mode==='replace'){
    const toDisable=state.productos.filter(p=>p.activo!==false && !fileNameSet.has(norm(p.nombre)));
    for(const p of toDisable){
      try{
        const r=await sb.from('productos_despacho').update({activo:false}).eq('id',p.id);
        if(r.error) throw r.error;
        desactivados++;
      }catch(e){ errores.push('Desactivar '+(p.nombre||p.codigo)+': '+(e.message||e)); }
    }
  }

  await sb.from('importaciones_log').insert({
    tipo:'productos',archivo:file.name,importados:insertados+actualizados,
    detalle:{modo:mode,filas_excel:payload.length,insertados,actualizados,omitidos,desactivados,errores},usuario:state.user.id
  });
  modalEl.remove();
  await refreshVisibleModuleV9384(); render();
  const msg=`Importación finalizada\n\nInsertados: ${insertados}\nActualizados: ${actualizados}\nOmitidos por existir: ${omitidos}\nDesactivados: ${desactivados}\nErrores: ${errores.length}`;
  if(errores.length) alert(msg+'\n\nPrimeros errores:\n'+errores.slice(0,8).join('\n'));
  else alert(msg);
}


sb.auth.onAuthStateChange((event,session)=>{
  if(event==='PASSWORD_RECOVERY'){
    state.session=session; state.user=session?.user||null;
    setTimeout(()=>renderPasswordRecovery(),0);
  }
});

initPwa();
init();

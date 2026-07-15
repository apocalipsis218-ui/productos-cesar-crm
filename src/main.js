import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import './styles.css';

window.XLSX = XLSX;

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://jmcbaduxjrzfnesbslmp.supabase.co";
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "sb_publishable_vDa5BC-V1yFLF_WfEpPt5g_eouthjCT";
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
const $ = (s,el=document)=>el.querySelector(s);
const $$ = (s,el=document)=>Array.from(el.querySelectorAll(s));
const root = $('#root');
const money = n => (appCfg('empresa.moneda','RD$') + ' ' + (Number(n)||0).toLocaleString('es-DO',{maximumFractionDigits:2}));
function localIsoDate(d=new Date()){
  const x = new Date(d.getTime() - d.getTimezoneOffset()*60000);
  return x.toISOString().slice(0,10);
}
const today = () => localIsoDate();
const esc = v => String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const norm = v => String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const onlyNum = v => String(v||'').replace(/\D/g,'');
const shortDate = iso => iso ? new Date(String(iso).slice(0,10)+'T12:00:00').toLocaleDateString('es-DO',{day:'2-digit',month:'short',year:'numeric'}) : '—';
const dayName = iso => ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'][new Date(String(iso||today()).slice(0,10)+'T12:00:00').getDay()] || '';
const callTime = l => { const raw=l?.hora || l?.creado_en || l?.created_at; if(!raw) return ''; try{ const d=String(raw).includes('T')?new Date(raw):new Date('1970-01-01T'+String(raw).slice(0,5)+':00'); return d.toLocaleTimeString('es-DO',{hour:'2-digit',minute:'2-digit'}); }catch(e){ return String(raw).slice(0,5); } };
function loadUi(){ const def={theme:'red',density:'normal',font:'normal',radius:'normal',menuStyle:'executive',menuSubtitles:true,layoutWidth:'wide',panelStyle:'executive'}; try{return {...def,...(JSON.parse(localStorage.getItem('pc_ui_v32')||'{}'))};}catch(e){return def;} }
function applyUi(){ if(!document.body) return; document.body.className=document.body.className.replace(/\b(theme|density|font|radius|menu|layout|panel)-\S+/g,'').trim(); document.body.classList.add('theme-'+state.ui.theme,'density-'+state.ui.density,'font-'+state.ui.font,'radius-'+state.ui.radius,'menu-'+(state.ui.menuStyle||'executive'),'layout-'+(state.ui.layoutWidth||'wide'),'panel-'+(state.ui.panelStyle||'executive')); }
function saveUi(){ localStorage.setItem('pc_ui_v32',JSON.stringify(state.ui)); applyUi(); toast('Estilo actualizado'); }
function defaultWeightConfig(){ return {exigirPesoReal:true,avisoLb:0.5,avisoPct:2,maxLb:3,maxPct:8,metodo:'mayor'}; }
function normalizeWeightConfig(cfg={}){ const d=defaultWeightConfig(); return {exigirPesoReal:cfg.exigirPesoReal!==false,avisoLb:Number(cfg.avisoLb??d.avisoLb)||d.avisoLb,avisoPct:Number(cfg.avisoPct??d.avisoPct)||d.avisoPct,maxLb:Number(cfg.maxLb??d.maxLb)||d.maxLb,maxPct:Number(cfg.maxPct??d.maxPct)||d.maxPct,metodo:cfg.metodo||d.metodo}; }
function loadWeightConfigLocal(){ try{return normalizeWeightConfig(JSON.parse(localStorage.getItem('pc_weight_config_v72')||'{}'));}catch(e){return defaultWeightConfig();} }
function saveWeightConfigLocal(cfg){ localStorage.setItem('pc_weight_config_v72',JSON.stringify(normalizeWeightConfig(cfg))); }

function defaultSystemConfig(){ return {
  empresa:{nombre:'Productos César',telefono:'',direccion:'',correo:'',rnc:'',moneda:'RD$',logoTexto:'PC',logoUrl:'',subtitulo:'CRM · Despacho · CXC'},
  menu:{mostrarIconos:true,mostrarSubtitulos:true,menuCompacto:false,modulosActivos:{}},
  alertas:{sonidoDefault:false,parpadeoNuevas:true,revisionSegundos:30,carniceriaMaxMin:45,facturacionMaxMin:30,validacionMaxMin:30,deliveryMaxMin:120,liquidacionMaxMin:60},
  impresion:{mostrarLogo:true,mostrarTelefono:true,mostrarDireccion:true,ticketCarniceria:'80mm',ticketFacturacion:'80mm',pieTicket:'Documento interno de trabajo'},
  recibos:{tituloOrden:'Orden para facturar',tituloRuta:'Hoja de ruta / lote de entrega',tituloLiquidacion:'Recibo de liquidación',tituloHistorial:'Historial de liquidaciones',mostrarLogo:true,mostrarTelefono:true,mostrarDireccion:true,mostrarRnc:false,mostrarCorreo:false,mostrarFecha:true,pie:'Documento interno de Productos César',firmaDelivery:'Firma delivery',firmaRecibido:'Firma recibido por',firmaValidacion:'Entregado por validación',firmaFacturacion:'Facturado por'},
  respaldo:{recordatorioActivo:true,frecuencia:'Semanal',incluirCatalogos:true,incluirOrdenes:true,incluirClientes:true,incluirConfiguracion:true,ultimoManual:''},
  atajos:{activos:true,nuevaOrden:'Ctrl+Alt+O',clientes:'Ctrl+Alt+C',liquidacion:'Ctrl+Alt+L',productividad:'Ctrl+Alt+P',buscar:'Ctrl+Alt+F',guardar:'Ctrl+S',cerrar:'Esc'},
  facturacion:{avisoMonto:100,avisoPct:2,maxMonto:1000,maxPct:10,metodo:'mayor',exigirPesoFacturado:true,avisoPesoLb:0.5,avisoPesoPct:2,maxPesoLb:3,maxPesoPct:8,metodoPeso:'mayor'},
  seguridad:{soloAdminEliminar:true,confirmarAnular:true,bloquearOperativos:true,mostrarBotonEliminarSoloReciente:true}
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
  const payload={fecha:new Date().toISOString(),version:'V9.2.12',empresa:cfg.empresa,configuracion:cfg,clientes:state.clientes||[],ordenes:(state.ordenes||[]).map(o=>({codigo:o.codigo,fecha:o.fecha,estado:o.estado,cliente:o.cliente?.negocio,total:o.total_factura||o.total_estimado,delivery:o.delivery_nombre,lote:o.lote_codigo})),productos:state.productos||[],empleados:state.empleadosOperativos||[],usuarios:state.usuarios||[],liquidaciones:state.liquidacionesLotes||[]};
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
    const go=p=>{ e.preventDefault(); state.page=p; render(); };
    if(k==='o') return go('ordenes');
    if(k==='c') return go('clientes');
    if(k==='l') return go('liquidacion');
    if(k==='p') return go('productividad');
    if(k==='f'){ e.preventDefault(); const input=document.querySelector('input[type="search"], input[placeholder*="Buscar"], #globalSearch, #search, #validacionSearch'); input?.focus(); input?.select?.(); }
  });
}

function pollSeconds(){ const n=Number(appCfg('alertas.revisionSegundos',30)); return Math.max(10, Math.min(300, n||30)); }
function moduleEnabled(id){ const map=appCfg('menu.modulosActivos',{}); return map && Object.prototype.hasOwnProperty.call(map,id) ? map[id]!==false : true; }

const VALIDATION_BATCH_DRAFT_KEY='pc_validacion_lote_draft_v9081';
function emptyValidationBatchDraft(){ return {date:today(),deliveryValue:'',deliveryName:'',manual:'',rows:{}}; }
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
  saveValidationBatchDraftLocal();
}
function saveBatchRowDraft(row){
  if(!row) return;
  const d=ensureValidationBatchDraft();
  const id=String(row.dataset.batchRow||'');
  if(!id) return;
  const checked=!!$('[data-batch-check]',row)?.checked;
  const weight=String($('[data-batch-weight]',row)?.value||'').trim();
  if(checked || weight){ d.rows[id]={checked,weight,updatedAt:new Date().toISOString()}; }
  else { delete d.rows[id]; }
  saveValidationBatchDraftLocal();
}
function clearValidationBatchDraft(){ state.validationBatchDraft=emptyValidationBatchDraft(); saveValidationBatchDraftLocal(); }

const state = {session:null,user:null,profile:null,page:'inicio',clientes:[],llamadas:[],productos:[],ordenes:[],cobranza:[],plantillas:[],catalogos:{},deliverys:[],empleados:[],pesos:[],entregas:[],pagos:[],historialEstados:[],entregaLotes:[],entregaLoteDetalle:[],liquidacionesLotes:[],liquidacionLoteDetalle:[],casosHistorial:[],liquidacionSchemaOk:false,specialSearch:'',specialStatusFilter:'Todos',specialTypeFilter:'Todos',modulos:[],permisos:[],usuarios:[],usuarioModulos:[],errors:[],filter:'Todos',clientSearch:'',productSearch:'',productFilter:'Todos',productCategoryFilter:'Todas',productUnitFilter:'Todas',productWeightFilter:'Todos',modal:null,configTab:'general',controlTab:'gestiones',controlDate:today(),agendaDate:today(),callSearch:'',followPage:0,followSize:8,deliveryFiltro:'',orderSearch:'',carniceriaSearch:'',facturacionSearch:'',validacionSearch:'',deliverySearch:'',liquidacionSearch:'',liquidacionTab:'pendientes',liqHistFrom:today(),liqHistTo:today(),deliveryHistoryFrom:today(),deliveryHistoryTo:today(),orderView:'hoy',carniceriaTab:'libres',ui:loadUi(),weightConfig:loadWeightConfigLocal(),systemConfig:loadSystemConfigLocal(),liveStatus:'inactivo',liveLastRefresh:null,liveNotices:[],liveUnread:0,liveSound:localStorage.getItem('pc_live_sound_v61')==='1',liveLoading:false,liveFlashOrders:{},reportRange:'mes',prodMonth:String(new Date().getMonth()+1),prodYear:String(new Date().getFullYear()),prodRole:'Todos',auditSearch:'',auditType:'todos',alertSearch:'',alertLevel:'todos',kanbanSearch:'',kanbanClosedLimit:10,kanbanClosedHidden:false,kanbanHistorySearch:'',kanbanHistoryPeriod:'todos',kanbanHistoryStatus:'Todos',kanbanHistoryFrom:'',kanbanHistoryTo:'',kanbanHistoryPage:0,kanbanHistoryPageSize:25,validationBatchDraft:loadValidationBatchDraftLocal()};
const navItems = [
  ['inicio','Inicio','Resumen general'],['control','Control','Llamadas y gestiones'],['clientes','Clientes','Ficha y WhatsApp'],['ordenes','Órdenes','Panel completo'],
  ['carniceria','Carnicería','Preparar y pesar'],['facturacion','Facturación','Imprimir y facturar'],['validacion','Validación','Entregar a delivery'],['delivery','Delivery','Mis pedidos'],['liquidacion','Liquidación','Cobros y CXC'],['alertas','Alertas','Centro operativo'],['kanban','Kanban','Tablero de órdenes'],
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
function renderBottomNav(items){
  return items.slice(0,5).map(([id,n])=>`<button data-page="${id}" class="${state.page===id?'active':''}"><span>${navIcon(id)}</span>${n}</button>`).join('');
}

function toast(t){ const d=document.createElement('div'); d.className='toast'; d.textContent=t; document.body.appendChild(d); setTimeout(()=>d.remove(),3600); }
function nivelModulo(id){
  if(!state.profile || state.profile.activo===false) return 'none';
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

let liveChannel=null, livePollTimer=null, liveRefreshTimer=null;
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
  if(future || estado==='Programada') return 'ordenes';
  if(!rule.prep && estado==='Pedido recibido') return rule.delivery ? 'validacion' : 'ordenes';
  if(['Pedido recibido','En preparación'].includes(estado)) return 'carniceria';
  if(['Lista para facturar','Impresa para facturar'].includes(estado)) return rule.invoice ? 'facturacion' : 'validacion';
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
  try{
    liveChannel=sb.channel('productos_cesar_ordenes_v61_'+state.user.id)
      .on('postgres_changes',{event:'*',schema:'public',table:'ordenes'},handleLiveOrderChange)
      .on('postgres_changes',{event:'*',schema:'public',table:'orden_detalle'},p=>handleLiveAuxChange(p,'Detalle de orden actualizado'))
      .on('postgres_changes',{event:'*',schema:'public',table:'orden_pesos'},p=>handleLiveAuxChange(p,'Pesaje actualizado'))
      .on('postgres_changes',{event:'*',schema:'public',table:'orden_entregas'},p=>handleLiveAuxChange(p,'Entrega actualizada'))
      .on('postgres_changes',{event:'*',schema:'public',table:'orden_pagos'},p=>handleLiveAuxChange(p,'Pago actualizado'))
      .on('postgres_changes',{event:'*',schema:'public',table:'orden_estados_historial'},p=>handleLiveAuxChange(p,'Historial actualizado'))
      .subscribe(status=>{
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
  if(livePollTimer){ clearInterval(livePollTimer); livePollTimer=null; }
  if(liveRefreshTimer){ clearTimeout(liveRefreshTimer); liveRefreshTimer=null; }
  state.liveStatus='inactivo';
}
function startLivePolling(){
  if(livePollTimer) clearInterval(livePollTimer);
  livePollTimer=setInterval(()=>{ if(state.user) refreshLiveData('Revisión automática',false); },pollSeconds()*1000);
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
  }
  pushLiveNotice(title,msg,target);
  scheduleLiveRefresh('Realtime: '+title);
}
function handleLiveAuxChange(payload,msg){
  scheduleLiveRefresh(msg);
}
function scheduleLiveRefresh(reason='Actualización en vivo'){
  if(liveRefreshTimer) clearTimeout(liveRefreshTimer);
  liveRefreshTimer=setTimeout(()=>refreshLiveData(reason,true),900);
}
async function refreshLiveData(reason='Actualización',fromRealtime=false){
  if(!state.user || state.liveLoading) return;
  state.liveLoading=true;
  try{
    await loadAll();
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
  return `<div class="live-bar"><div class="live-left"><span class="live-dot ${liveStatusClass()}" id="liveDot"></span><div><div class="live-title"><span id="liveStatusText">${esc(liveStatusText())}</span>${state.liveUnread?` · <span class="badge info" id="liveUnread">${state.liveUnread} nueva(s)</span>`:''}</div><div class="live-sub">Última actualización: <span id="liveTime">${esc(liveTimeTxt())}</span> · Revisión de respaldo cada ${pollSeconds()} segundos</div></div>${latest?`<div class="live-notice"><b>${esc(latest.title)}</b>${esc(latest.msg)}</div>`:''}</div><div class="live-actions"><button class="btn small gray" id="liveRefreshNow">Actualizar ahora</button><button class="btn small ${state.liveSound?'green':'gray'}" id="liveSoundBtn">${state.liveSound?'Sonido activo':'Activar sonido'}</button>${state.liveNotices?.length?'<button class="btn small gray" id="liveClearBtn">Limpiar avisos</button>':''}</div></div>`;
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
  const {data:{session}} = await sb.auth.getSession(); state.session=session; state.user=session?.user||null;
  if(!session) return renderLogin();
  await loadAll(); setupLiveUpdates(); render();
}
async function loadAll(){
  state.errors=[];
  const uid = state.user.id;
  const prof = await safe(sb.from('perfiles').select('*').eq('id',uid).maybeSingle(),'perfil');
  const email=(state.user?.email||'').toLowerCase();
  state.profile=prof.data || (email==='apocalipsis218@gmail.com' ? {id:uid,nombre:'César',rol:'Gerente',vendedor:'Cesar',activo:true} : {id:uid,nombre:state.user.email,rol:'Sin perfil',vendedor:null,activo:false});
  const [mods,perms,ums,cats,items,pls,clientes,llamadas,productos,ordenes,cobranza,usuarios,deliverys,empleados,pesos,entregas,pagos,historialEstados,sistemaCfg,entregaLotes,entregaLoteDetalle,liquidacionesLotes,liquidacionLoteDetalle,casosHistorial] = await Promise.all([
    safe(sb.from('modulos_sistema').select('*').order('orden'),'módulos'),
    safe(sb.from('roles_permisos').select('*'),'permisos'),
    safe(sb.from('usuario_modulos').select('*'),'permisos usuario'),
    safe(sb.from('catalogos').select('*').eq('activo',true).order('orden'),'catálogos'),
    safe(sb.from('catalogo_items').select('*').eq('activo',true).order('orden'),'items catálogo'),
    safe(sb.from('plantillas_whatsapp').select('*').order('orden'),'plantillas'),
    safe(sb.from('clientes').select('*').eq('archivado',false).order('codigo',{ascending:true}).limit(2000),'clientes'),
    safe(sb.from('llamadas').select('*, cliente:clientes(id,codigo,negocio,contacto,telefono,sector,tipo,vendedor)').order('id',{ascending:false}).limit(1000),'llamadas'),
    safe(sb.from('productos_despacho').select('*').order('nombre').limit(1000),'productos'),
    safe(sb.from('ordenes').select('*, cliente:clientes(codigo,negocio,contacto,telefono,sector), items:orden_detalle(*)').order('id',{ascending:false}).limit(500),'órdenes'),
    safe(sb.from('cobranza').select('*').order('id',{ascending:false}).limit(1000),'cobranza'),
    safe(sb.from('perfiles').select('*').order('nombre'),'usuarios'),
    safe(sb.from('deliverys_config').select('*').order('nombre'),'deliverys'),
    safe(sb.from('empleados_operativos').select('*').order('area').order('nombre'),'empleados operativos'),
    safe(sb.from('orden_pesos').select('*').order('creado_en',{ascending:false}).limit(1500),'pesos'),
    safe(sb.from('orden_entregas').select('*').order('creado_en',{ascending:false}).limit(1500),'entregas'),
    safe(sb.from('orden_pagos').select('*').order('creado_en',{ascending:false}).limit(1500),'pagos'),
    safe(sb.from('orden_estados_historial').select('*').order('creado_en',{ascending:false}).limit(2000),'historial de estados'),
    safe(sb.from('sistema_configuracion').select('*').in('clave',['control_peso','empresa','menu','alertas','impresion','recibos','respaldo','atajos','facturacion','seguridad','incentivos']),'configuración sistema'),
    optionalSafe(sb.from('entrega_lotes').select('*').order('creado_en',{ascending:false}).limit(500),'entrega_lotes'),
    optionalSafe(sb.from('entrega_lote_detalle').select('*').order('id',{ascending:false}).limit(2000),'entrega_lote_detalle'),
    optionalSafe(sb.from('liquidaciones_lotes').select('*').order('fecha_liquidacion',{ascending:false}).limit(500),'liquidaciones_lotes'),
    optionalSafe(sb.from('liquidacion_lote_detalle').select('*').order('id',{ascending:false}).limit(3000),'liquidacion_lote_detalle'),
    optionalSafe(sb.from('orden_casos_historial').select('*').order('creado_en',{ascending:false}).limit(2000),'orden_casos_historial')
  ]);
  state.modulos=mods.data; state.permisos=perms.data; state.usuarioModulos=ums.data; state.plantillas=pls.data; state.clientes=clientes.data; state.llamadas=llamadas.data; state.productos=productos.data; state.ordenes=ordenes.data; state.cobranza=cobranza.data; state.usuarios=usuarios.data; state.deliverys=deliverys.data; state.empleados=empleados.data; state.pesos=pesos.data; state.entregas=entregas.data; state.pagos=pagos.data; state.historialEstados=historialEstados.data; state.entregaLotes=entregaLotes.data; state.entregaLoteDetalle=entregaLoteDetalle.data; state.liquidacionesLotes=liquidacionesLotes.data; state.liquidacionLoteDetalle=liquidacionLoteDetalle.data; state.casosHistorial=casosHistorial.data||[]; state.liquidacionSchemaOk=!entregaLotes.error && !liquidacionesLotes.error;
  state.catalogos={}; cats.data.forEach(c=>state.catalogos[c.id]=[]); items.data.forEach(i=>{ if(!state.catalogos[i.catalogo_id]) state.catalogos[i.catalogo_id]=[]; state.catalogos[i.catalogo_id].push(i); });
  if(sistemaCfg?.data?.length){
    const byKey=Object.fromEntries(sistemaCfg.data.map(r=>[r.clave,r.valor]));
    if(byKey.control_peso){ state.weightConfig=normalizeWeightConfig(byKey.control_peso); saveWeightConfigLocal(state.weightConfig); }
    const cfgPatch={}; ['empresa','menu','alertas','impresion','recibos','respaldo','atajos','facturacion','seguridad','incentivos'].forEach(k=>{ if(byKey[k]!==undefined && byKey[k]!==null) cfgPatch[k]=byKey[k]; });
    const sys=normalizeSystemConfig({...state.systemConfig,...cfgPatch});
    state.systemConfig=sys; saveSystemConfigLocal(sys);
    if(sys.alertas?.sonidoDefault===true && localStorage.getItem('pc_live_sound_v61')===null) state.liveSound=true;
  }
}
function renderLogin(){
  root.innerHTML = `<div class="login"><div class="login-card"><div class="logo">PC</div><h2 style="text-align:center;margin:0 0 6px">Sistema Productos César</h2><p style="text-align:center;color:var(--muted);margin:0 0 22px">Entrada por empleado · permisos por módulo</p><div id="loginError"></div><div class="form"><div class="field"><label>Correo del empleado</label><input id="email" placeholder="empleado@correo.com" autocomplete="username"></div><div class="field"><label>Contraseña</label><input id="pass" type="password" autocomplete="current-password" placeholder="Contraseña asignada"></div><button class="btn" id="loginBtn">Entrar al sistema</button><button class="btn gray" id="forgotBtn" type="button">Enviar enlace para recuperar contraseña</button><div class="hint" style="text-align:center">El correo y contraseña se crean en Supabase Auth. Los módulos se asignan en Configuración → Usuarios y módulos.</div></div></div></div>`;
  const doLogin = async()=>{
    const email=$('#email').value.trim(), password=$('#pass').value;
    if(!email || !password){ $('#loginError').innerHTML=`<div class="error">Escribe correo y contraseña.</div>`; return; }
    $('#loginBtn').disabled=true; $('#loginBtn').textContent='Entrando...';
    const {data,error}=await sb.auth.signInWithPassword({email,password});
    $('#loginBtn').disabled=false; $('#loginBtn').textContent='Entrar al sistema';
    if(error) $('#loginError').innerHTML=`<div class="error">${esc(error.message)}</div>`;
    else {state.session=data.session; state.user=data.user; await loadAll(); setupLiveUpdates(); render();}
  };
  $('#loginBtn').onclick = doLogin;
  $('#pass').onkeydown = e=>{ if(e.key==='Enter') doLogin(); };
  $('#forgotBtn').onclick = async()=>{
    const email=$('#email').value.trim();
    if(!email){ $('#loginError').innerHTML=`<div class="error">Escribe el correo primero.</div>`; return; }
    const {error}=await sb.auth.resetPasswordForEmail(email,{redirectTo:location.origin});
    $('#loginError').innerHTML = error ? `<div class="error">${esc(error.message)}</div>` : `<div class="success">Se envió el enlace de recuperación al correo indicado.</div>`;
  };
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
  root.innerHTML = `<div class="shell"><aside class="sidebar"><div class="brand"><div class="logo">${esc(appCfg('empresa.logoTexto','PC'))}</div><div><h1>${esc(appCfg('empresa.nombre','Sistema Productos César'))}</h1><p>V9.2.12 · ${esc(appCfg('empresa.subtitulo','CRM · Despacho · CXC'))}</p></div></div><nav class="nav">${renderSideNav(visibleNav)}</nav><div class="side-card"><b>V9.2.12 Kanban optimizado</b><br>Cerradas limitadas, historial paginado y desplazamiento interno por columna.</div></aside><main class="main"><div class="top"><div class="title"><h2>${titleOf(state.page)}</h2><p>${subtitleOf(state.page)}</p></div><div class="user-pill"><span title="${esc(currentUserEmail())}">${esc(currentWorkerName())} · ${esc(state.profile?.rol||'')}</span><button id="myAccessBtn" class="gray">Mi acceso</button><button id="refreshBtn">Actualizar</button><button id="logoutBtn" class="dark">Salir</button></div></div>${state.errors.length?`<div class="error"><b>Avisos:</b><br>${state.errors.map(esc).join('<br>')}<br><small>Si falta una tabla o no ves clientes, ejecuta el SQL V5.5.1 de mapeo de roles.</small></div>`:''}${liveStatusHtml()}<div id="content"></div></main><nav class="bottom-nav">${renderBottomNav(visibleNav)}</nav></div>`;
  setupKeyboardShortcuts();
  $$('[data-page]').forEach(b=>b.onclick=()=>{state.page=b.dataset.page; render();});
  $('#myAccessBtn').onclick=()=>openMyAccess();
  $('#logoutBtn').onclick=async()=>{await sb.auth.signOut(); teardownLiveUpdates(); state.session=null; state.user=null; renderLogin();};
  $('#refreshBtn').onclick=async()=>{await loadAll(); state.liveLastRefresh=new Date().toISOString(); render(); toast('Datos actualizados');};
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
  }catch(err){
    console.error('Error renderizando módulo', state.page, err);
    c.innerHTML=`<div class="panel"><div class="empty"><b>No se pudo cargar este módulo.</b><br>${esc(err?.message||err)}<br><br><button class="btn" id="recoverModuleBtn">Reintentar</button> <button class="btn gray" id="goOrdersFallback">Ir a órdenes</button></div></div>`;
    const retry=$('#recoverModuleBtn'); if(retry) retry.onclick=()=>renderPage();
    const go=$('#goOrdersFallback'); if(go) go.onclick=()=>{state.page='ordenes'; render();};
  }
}
function lastCall(clienteId){return state.llamadas.find(l=>Number(l.cliente_id)===Number(clienteId));}
function daysSince(iso){ if(!iso) return null; return Math.max(0,Math.floor((Date.now()-new Date(String(iso).slice(0,10)+'T12:00:00').getTime())/86400000)); }
function matchText(obj,q,fields){ q=norm(q); if(!q) return true; return fields.some(f=>norm(obj[f]).includes(q)); }
function matchClientName(cl,q){ q=norm(q); if(!q) return true; return norm(cl?.negocio).includes(q); }
function matchProductName(p,q){ q=norm(q); if(!q) return true; return norm(p?.nombre).includes(q); }
function matchOrder(o,q){ q=norm(q); if(!q) return true; return norm(o?.cliente?.negocio).includes(q); }
function dateOnly(v){ return String(v||'').slice(0,10); }
function dispatchDateOf(o){ return dateOnly(o?.fecha_despacho || o?.fecha || today()); }
function isFutureDispatch(o){ const d=dispatchDateOf(o); return d && d>today(); }
function isDueDispatch(o){ const d=dispatchDateOf(o); return !d || d<=today(); }
function isLateDispatch(o){ const d=dispatchDateOf(o); return d && d<today() && !['Cobrado','Entregado a crédito','No entregado','Devuelto parcial','Cerrado','Anulado'].includes(o?.estado); }
function isScheduledOrder(o){ return o?.estado==='Programada' || o?.es_programada===true || isFutureDispatch(o); }
function scheduleBadge(o){ const d=dispatchDateOf(o); if(o?.estado==='Anulado') return ''; if(isFutureDispatch(o)) return `<span class="badge info">Programada: ${shortDate(d)}</span><span class="badge warn">NO DESPACHAR HOY</span>`; if(isLateDispatch(o) && !isOrderInProcess(o)) return `<span class="badge bad">Programada atrasada: ${shortDate(d)}</span>`; if(o?.estado==='Programada' && isDueDispatch(o)) return `<span class="badge ok">Para preparar hoy</span>`; return d && d!==dateOnly(o?.fecha) ? `<span class="badge info">Despacho: ${shortDate(d)}</span>` : ''; }
function canShowInCarniceria(o){ if(o?.estado==='Anulado') return false; if(!orderRequiresPrep(o)) return false; if(isFutureDispatch(o)) return false; return ['Pedido recibido','En preparación','Programada','Lista para facturar','Impresa para facturar'].includes(o?.estado); }
function looksEmail(v){ return /@/.test(String(v||'')); }
function currentUserEmail(){ return String(state.user?.email||state.profile?.correo||'').trim(); }
function cleanName(v){ const x=String(v||'').trim(); return x && !looksEmail(x) ? x : ''; }
function currentWorkerName(){
  const email=currentUserEmail();
  const nombre=cleanName(state.profile?.nombre);
  const vendedor=cleanName(state.profile?.vendedor);
  const meta=cleanName(state.user?.user_metadata?.full_name || state.user?.user_metadata?.name);
  const emp=state.empleados.find(e=>norm(e.correo||e.email||e.usuario||'')===norm(email));
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
function workerSelectHtml(area,id,label,selected){ return isAdminRole() ? `<div class="field"><label>${esc(label)}</label><select id="${id}">${employeeOptions(area,selected||currentWorkerName())}</select>${manualInput(id+'Manual')}</div>` : fixedWorkerHtml(id,label,currentWorkerName()); }
function workerValueFromModal(m,id){ return isAdminRole() ? getSelectManual(m,id,id+'Manual') : currentWorkerName(); }
function lockText(o){ return o?.tomado_por ? `En preparación por ${workerDisplayName(o.tomado_por)}${o.tomado_en?' desde '+new Date(o.tomado_en).toLocaleTimeString('es-DO',{hour:'2-digit',minute:'2-digit'}):''}` : 'Libre para tomar'; }
function isActiveCarnOrder(o){ return o && o.estado==='En preparación' && !!o.tomado_por; }
function carnQueueCount(nombre){
  const n=norm(nombre); if(!n) return 0;
  const currentKeys=currentWorkerKeys();
  const isMe=currentKeys.includes(n);
  return state.ordenes.filter(o=>isActiveCarnOrder(o) && (isMe ? (isCurrentWorker(o.tomado_por)||isCurrentWorker(o.preparado_por)||isCurrentWorker(o.tomado_por_user)) : norm(o.tomado_por)===n)).length;
}
function myCarnQueueCount(){ return state.ordenes.filter(o=>isActiveCarnOrder(o) && (isCurrentWorker(o.tomado_por)||isCurrentWorker(o.preparado_por)||isCurrentWorker(o.tomado_por_user))).length; }
function canReleaseCarnOrder(o){ if(!o||!o.tomado_por) return false; return isAdminRole() || isCurrentWorker(o.tomado_por) || isCurrentWorker(o.preparado_por) || isCurrentWorker(o.tomado_por_user); }
function queueLabel(nombre){ const c=carnQueueCount(nombre); return `${c}/3 pedidos en cola`; }
function prepStatusClass(s){ return String(s||'').toLowerCase().includes('sin existencia') ? 'no-stock' : ''; }
function normalizeOrderStateForSchedule(selected, despacho){ if(despacho && despacho>today()) return 'Programada'; if(selected==='Programada' && (!despacho || despacho<=today())) return 'Pedido recibido'; return selected||'Pedido recibido'; }
function initialOrderStateByDispatch(despacho){ return despacho && despacho>today() ? 'Programada' : 'Pedido recibido'; }
function canonicalOrderStates(){ return ['Programada','Pedido recibido','En preparación','Lista para facturar','Impresa para facturar','Facturada','Asignada a delivery','En ruta','Cobrado','Entregado a crédito','No entregado','Devuelto parcial','Anulado']; }

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
function orderRequiresDelivery(o){ const r=orderTypeRule(o); return o?.requiere_delivery===false ? false : !!r.delivery; }
function isSpecialOrder(o){ return orderType(o)!=='Pedido normal'; }
function orderTypeBadge(o){ const t=orderType(o); if(t==='Pedido normal') return ''; const r=orderTypeRule(t); return `<span class="badge ${r.badge}">${esc(r.label)}</span>`; }
function orderTypeClass(o){ const t=orderType(o); if(t.includes('Devolución')) return 'return-order'; if(t.includes('Cambio')) return 'change-order'; if(t.includes('Incidente')) return 'incident-order'; return ''; }
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
  const cards=list.slice(0,120).map(o=>`<div class="client-card ${orderTypeClass(o)} ${specialCaseNeedsAttention(o)?'case-attention':''}" style="grid-template-columns:1fr auto"><div><div class="client-title">${esc(o.cliente?.negocio||'Cliente')} · ${esc(o.codigo||('ORD-'+o.id))}</div><div class="client-sub">${esc(orderType(o))} · Factura ${esc(o.factura_no||'—')} · Responsable: ${esc(o.responsable_caso||'Sin asignar')} ${o.fecha_compromiso?'· Compromiso '+shortDate(o.fecha_compromiso):''}</div><div class="badges">${orderTypeBadge(o)}${specialCaseBadge(o)}${specialCaseNeedsAttention(o)?'<span class="badge bad">Requiere atención</span>':''}${o.requiere_nota_credito?'<span class="badge warn">Nota crédito</span>':''}${Number(o.monto_ajuste||0)?`<span class="badge info">Ajuste ${money(o.monto_ajuste)}</span>`:''}</div><div class="mini-items">${esc(o.accion_caso||o.notas||orderItemsText(o,4)||'Sin detalle registrado')}</div></div><div class="card-actions"><button class="btn small" data-special-case="${o.id}">Gestionar caso</button><button class="btn small gray" data-oper-order="${o.id}">Ver</button></div></div>`).join('');
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
  return `<div class="field"><label>${o?'Estado actual':'Estado inicial automático'}</label><input id="ordEstadoInfo" value="${esc(label)}" readonly><div class="hint">El estado se asigna automáticamente según la fecha de despacho y luego avanza por cada módulo.</div></div>`;
}
function focusAfterRender(id,pos){ setTimeout(()=>{ const el=document.getElementById(id); if(el){ el.focus(); try{ el.setSelectionRange(pos,pos); }catch(e){} } },0); }
function parseDateTime(v){ if(!v) return null; try{ const s=String(v); const d=s.includes('T') ? new Date(s) : new Date(s.slice(0,10)+'T00:00:00'); return isNaN(d.getTime()) ? null : d; }catch(e){ return null; } }
function minutesSince(v){ const d=parseDateTime(v); if(!d) return null; return Math.max(0,Math.floor((Date.now()-d.getTime())/60000)); }
function elapsedTextSince(v){ const m=minutesSince(v); if(m===null) return '—'; if(m<1) return 'ahora'; if(m<60) return `${m} min`; const h=Math.floor(m/60), r=m%60; if(h<24) return `${h} h${r?` ${r} min`:''}`; const d=Math.floor(h/24), hr=h%24; return `${d} día${d===1?'':'s'}${hr?` ${hr} h`:''}`; }
function createdAtOf(o){ return o?.creado_en || o?.created_at || o?.fecha; }
function createdClockBadge(o){ const m=minutesSince(createdAtOf(o)); const cls=m!==null && m>60?'warn':'info'; return `<span class="badge ${cls}">⏱ Creada hace ${esc(elapsedTextSince(createdAtOf(o)))}</span>`; }
function isOrderReady(o){ return ['Lista para facturar','Impresa para facturar'].includes(o?.estado); }
function isOrderInProcess(o){ return ['En preparación','Lista para facturar','Impresa para facturar','Facturada','Validada para delivery','Asignada a delivery','En ruta'].includes(o?.estado); }
function orderProcessStartedAt(o){
  const h=state.historialEstados.find(x=>Number(x.orden_id)===Number(o?.id) && x.estado_nuevo===o?.estado);
  if(h?.creado_en) return h.creado_en;
  if(o?.estado==='En preparación') return o.tomado_en || o.preparado_en || createdAtOf(o);
  if(['Lista para facturar','Impresa para facturar'].includes(o?.estado)) return histFirstTimeFor(o,['Lista para facturar','Impresa para facturar']) || o.preparado_en || createdAtOf(o);
  if(o?.estado==='Facturada') return o.facturado_en || createdAtOf(o);
  if(['Validada para delivery','Asignada a delivery'].includes(o?.estado)) return o.asignado_delivery_en || o.validado_en || createdAtOf(o);
  if(o?.estado==='En ruta') return o.en_ruta_en || createdAtOf(o);
  return createdAtOf(o);
}
function processClockBadge(o){ if(!isOrderInProcess(o)) return ''; const start=orderProcessStartedAt(o); const m=minutesSince(start); const cls=m!==null && m>45?'bad':'info'; return `<span class="badge ${cls}">⏱ En proceso ${esc(elapsedTextSince(start))}</span>`; }
function orderHistoryFor(o){ return (state.historialEstados||[]).filter(h=>Number(h.orden_id)===Number(o?.id)); }
function histTimeFor(o, estados){
  const names=Array.isArray(estados)?estados:[estados];
  const rows=orderHistoryFor(o).filter(h=>names.includes(h.estado_nuevo)).sort((a,b)=>new Date(b.creado_en)-new Date(a.creado_en));
  return rows[0]?.creado_en || null;
}
function histFirstTimeFor(o, estados){
  const names=Array.isArray(estados)?estados:[estados];
  const rows=orderHistoryFor(o).filter(h=>names.includes(h.estado_nuevo)).sort((a,b)=>new Date(a.creado_en)-new Date(b.creado_en));
  return rows[0]?.creado_en || null;
}
function closedAtOf(o){ return histTimeFor(o,['Cobrado','Entregado a crédito','No entregado','Devuelto parcial','Cerrado','Anulado']); }
function totalOrderClockBadge(o){
  const start=createdAtOf(o); if(!start) return '';
  const end=closedAtOf(o); const txt=end?elapsedBetweenText(start,end):elapsedTextSince(start);
  const mins=end?minutesBetween(start,end):minutesSince(start);
  const cls=mins!==null && mins>180?'bad':mins!==null && mins>60?'warn':'info';
  return `<span class="badge ${cls}">⏱ Total ${esc(txt)}</span>`;
}
function minutesBetween(a,b){ const da=parseDateTime(a), db=parseDateTime(b); if(!da||!db) return null; return Math.max(0,Math.floor((db.getTime()-da.getTime())/60000)); }
function elapsedBetweenText(a,b){ const m=minutesBetween(a,b); if(m===null) return '—'; if(m<1) return 'ahora'; if(m<60) return `${m} min`; const h=Math.floor(m/60), r=m%60; if(h<24) return `${h} h${r?` ${r} min`:''}`; const d=Math.floor(h/24), hr=h%24; return `${d} día${d===1?'':'s'}${hr?` ${hr} h`:''}`; }
function moduleFromSearchKey(k){ return {facturacionSearch:'facturacion',validacionSearch:'validacion',deliverySearch:'delivery',liquidacionSearch:'liquidacion'}[k] || ''; }
function currentModuleOfOrder(o){
  const st=effectiveOrderState(o);
  if(['Pedido recibido','En preparación'].includes(st)) return orderRequiresPrep(o) ? 'carniceria' : (orderRequiresDelivery(o) ? 'validacion' : 'ordenes');
  if(['Lista para facturar','Impresa para facturar'].includes(st)) return orderRequiresInvoice(o) ? 'facturacion' : 'validacion';
  if(['Facturada','Validada para delivery'].includes(st)) return 'validacion';
  if(['Asignada a delivery','En ruta'].includes(st)) return 'delivery';
  if(['Entregado','Cobrado','Entregado a crédito','No entregado','Devuelto parcial','Cerrado'].includes(st)) return 'liquidacion';
  return '';
}
function stageEntryAt(o,stage){
  if(!o) return null;
  if(stage==='carniceria') return histTimeFor(o,['Pedido recibido','En preparación']) || o.tomado_en || createdAtOf(o);
  if(stage==='facturacion') return histFirstTimeFor(o,['Lista para facturar','Impresa para facturar']) || o.preparado_en || null;
  if(stage==='validacion') return histTimeFor(o,['Facturada','Validada para delivery']) || o.facturado_en || o.validado_en || null;
  if(stage==='delivery') return histTimeFor(o,['Asignada a delivery','En ruta']) || o.asignado_delivery_en || o.en_ruta_en || null;
  if(stage==='liquidacion') return histTimeFor(o,['En ruta','Entregado','Cobrado','Entregado a crédito','No entregado','Devuelto parcial']) || o.en_ruta_en || o.asignado_delivery_en || null;
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
  const limits={carniceria:[25,45],facturacion:[10,20],validacion:[10,20],delivery:[60,120],liquidacion:[30,60]};
  if(!stage || !limits[stage]) return 'info';
  const [warn,bad]=limits[stage]||[30,60];
  return minutes>=bad?'bad':minutes>=warn?'warn':'info';
}
function stageClockBadge(o,stage){
  const start=stageEntryAt(o,stage); if(!start) return '';
  const end=stageExitAt(o,stage);
  const mins=end?minutesBetween(start,end):minutesSince(start);
  const txt=end?elapsedBetweenText(start,end):elapsedTextSince(start);
  const cls=stageTimerClass(mins||0,stage);
  return `<span class="badge ${cls}">⏱ ${esc(stageLabel(stage))} ${esc(txt)}</span>`;
}
function currentStageClockBadge(o){ const st=currentModuleOfOrder(o); return st ? stageClockBadge(o,st) : ''; }
function stageTimersHtml(o){
  const stages=['carniceria','facturacion','validacion','delivery','liquidacion'];
  const cur=currentModuleOfOrder(o);
  return `<div class="timer-grid">${stages.map(s=>{ const start=stageEntryAt(o,s); const end=stageExitAt(o,s); const mins=start?(end?minutesBetween(start,end):minutesSince(start)):null; const cls=(cur===s?'active ':'')+(mins!==null?stageTimerClass(mins,s):''); const txt=start?(end?elapsedBetweenText(start,end):elapsedTextSince(start)):'—'; return `<div class="timer-card ${cls}"><b>${esc(stageLabel(s))}</b><span>${esc(txt)}</span><div class="stage-note">${start?(end?'Finalizado':'Activo/pendiente'):'Sin entrar'}</div></div>`; }).join('')}</div>`;
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
  if(!peso) return orderRequiresFinalWeight(o) ? 'Debes registrar el peso final entregado antes de asignar esta orden al delivery.' : 'Esta orden no requiere peso final obligatorio.';
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
  return new Promise(resolve=>{
    const m=document.createElement('div');
    m.className='modal';
    const title=check.level==='block'?'Diferencia máxima superada':'Verificar peso final';
    const msg=check.level==='block'?'El peso final entregado supera la tolerancia máxima. No se puede asignar al delivery hasta revisar el peso.':'El peso final entregado tiene una diferencia fuera de la tolerancia de aviso. Puedes volver a revisar o continuar bajo responsabilidad.';
    const diffTxt=(check.diff>0?'+':'')+check.diff+' lb';
    m.innerHTML=`<div class="modal-card" style="max-width:720px"><div class="modal-head"><div><div class="modal-title">${title}</div><div class="hint">Control de peso antes de entregar al delivery.</div></div><button class="close" data-close>×</button></div><div class="modal-body"><div class="weight-alert ${check.level==='block'?'bad':''}"><strong>${msg}</strong><div class="grid2" style="margin-top:12px"><div class="kv"><b>Referencia</b><span>${esc(check.refName||'peso')} · ${check.calc} lb</span></div><div class="kv"><b>Peso final</b><span>${check.peso} lb</span></div><div class="kv"><b>Diferencia</b><span>${diffTxt}</span></div><div class="kv"><b>Tolerancia aviso</b><span>${check.aviso} lb</span></div><div class="kv"><b>Tolerancia máxima</b><span>${check.max} lb</span></div></div></div><div class="actions">${check.level==='block'?'<button class="btn" data-review>Volver a revisar</button>':'<button class="btn gray" data-review>Volver a revisar</button><button class="btn" data-continue>Continuar bajo responsabilidad</button>'}</div></div></div>`;
    document.body.appendChild(m);
    const close=(val)=>{m.remove(); resolve(val);};
    $('[data-close]',m).onclick=()=>close(false);
    $('[data-review]',m).onclick=()=>close(false);
    const cont=$('[data-continue]',m); if(cont) cont.onclick=()=>close(true);
  });
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
function orderClientName(o){ return o?.cliente?.negocio || 'Cliente'; }
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

function renderInicio(c){
  const hoy=today();
  const activos=state.clientes.filter(x=>x.estado==='Activo').length;
  const llamadasHoy=state.llamadas.filter(x=>String(x.fecha).slice(0,10)===hoy);
  const agendaHoy=controlScheduledClientsForDate(hoy);
  const gestionadosIds=new Set(llamadasHoy.map(l=>Number(l.cliente_id)));
  const pendientesAgenda=agendaHoy.filter(cl=>!gestionadosIds.has(Number(cl.id))).length;
  const pedidosHoy=state.ordenes.filter(o=>String(o.fecha||'').slice(0,10)===hoy && o.estado!=='Anulado');
  const pedidosMes=state.ordenes.filter(o=>String(o.fecha||'').slice(0,7)===hoy.slice(0,7) && o.estado!=='Anulado');
  const montoHoy=pedidosHoy.reduce((s,o)=>s+(+o.total_factura||+o.total_estimado||0),0);
  const montoMes=pedidosMes.reduce((s,o)=>s+(+o.total_factura||+o.total_estimado||0),0);
  const ordenesActivas=state.ordenes.filter(o=>!['Anulado','Cobrado','Entregado'].includes(o.estado||''));
  const pendientesCarniceria=state.ordenes.filter(o=>canShowInCarniceria(o) && !isFutureDispatch(o) && !['Lista para facturar','Impresa para facturar'].includes(o.estado)).length;
  const listasFacturar=state.ordenes.filter(o=>['Lista para facturar','Impresa para facturar'].includes(o.estado)).length;
  const pendientesValidacion=state.ordenes.filter(o=>['Facturada','Validada para delivery'].includes(o.estado)).length;
  const enRuta=state.ordenes.filter(o=>['Asignada a delivery','En ruta'].includes(o.estado)).length;
  const porLiquidar=state.ordenes.filter(o=>['Entregado','Entregado a crédito'].includes(o.estado||'')).length;
  const programadasProximas=state.ordenes.filter(o=>o.estado!=='Anulado' && isFutureDispatch(o)).sort((a,b)=>dispatchDateOf(a).localeCompare(dispatchDateOf(b))).slice(0,8);
  const programadasHoy=state.ordenes.filter(o=>o.estado!=='Anulado' && dispatchDateOf(o)===hoy && (o.estado==='Programada'||o.es_programada===true));
  const programadasAtrasadas=state.ordenes.filter(o=>isLateDispatch(o) && !['Lista para facturar','Facturada','Asignada a delivery','En ruta','Cobrado','Entregado'].includes(o.estado||''));
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
      <p>Resumen en vivo de llamadas, órdenes, tiempos, alertas y tareas pendientes por módulo.</p>
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
    <div class="exec-kpi"><span>Llamadas hoy</span><strong>${llamadasHoy.length}</strong><small>${pendientesAgenda} pendiente(s) de agenda</small></div>
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
      <div class="panel panel-clean"><div class="panel-head"><div><h3>Agenda de hoy</h3><p>${agendaHoy.length} cliente(s) programados · ${pendientesAgenda} pendiente(s).</p></div><button class="btn small gray" data-go="control">Ir</button></div><div class="badges metrics-row"><span class="badge info">Agenda: ${agendaHoy.length}</span><span class="badge ok">Gestionados: ${llamadasHoy.length}</span><span class="badge ${pendientesAgenda?'warn':'ok'}">Pendientes: ${pendientesAgenda}</span></div></div>
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
  return `<div class="priority-card ${level}"><div><div class="client-title" style="font-size:15px">${esc(o.codigo||('ORD-'+o.id))} · ${esc(o.cliente?.negocio||'Cliente')}</div><div class="client-sub">${esc(o.estado||'')} · Total ${elapsedTextSince(o.fecha||o.creado_en||today())}${st?` · ${esc(stageLabel(st))} ${elapsedTextSince(stageEntryAt(o,st))}`:''}</div><div class="badges">${orderStatusBadgeHtml(o)}${scheduleBadge(o)}${currentStageClockBadge(o)}${orderTakenByBadge(o)}<span class="badge">${money(o.total_factura||o.total_estimado)}</span></div></div><div class="card-actions"><button class="btn small gray" data-oper-order="${o.id}">Ver</button></div></div>`;
}

function clientMini(c){ const lc=lastCall(c.id); return `<div class="client-card" data-client="${c.id}" style="grid-template-columns:auto 1fr;cursor:pointer"><div class="avatar">${esc(String(c.codigo||'').replace('CL-','').slice(-3)||'C')}</div><div><div class="client-title" style="font-size:15px">${esc(c.negocio)}</div><div class="client-sub">${esc(c.contacto||'')} · ${esc(c.sector||'')}</div><div class="badges"><span class="badge ${c.estado==='Activo'?'ok':''}">${esc(c.estado||'')}</span>${lc?`<span class="badge info">${esc(lc.resultado)} · ${shortDate(lc.fecha)} ${callTime(lc)}</span>`:'<span class="badge warn">Sin gestión reciente</span>'}<span class="badge">${daysSince(c.ultimo_pedido)??'Nunca'} días sin pedir</span></div></div></div>`; }
function controlPendingCard(c){ const lc=lastCall(c.id); return `<div class="client-card" style="grid-template-columns:auto 1fr auto"><div class="avatar">${esc(String(c.codigo||'').replace('CL-','').slice(-3)||'C')}</div><div><div class="client-title" style="font-size:15px">${esc(c.negocio)}</div><div class="client-sub">${esc(c.contacto||'')} · ${esc(c.sector||'')}</div><div class="badges"><span class="badge ${c.estado==='Activo'?'ok':''}">${esc(c.estado||'')}</span>${lc?`<span class="badge info">${esc(lc.resultado)} · ${shortDate(lc.fecha)}</span>`:'<span class="badge">Sin gestión reciente</span>'}</div></div><div class="card-actions"><button class="iconbtn whatsapp" data-wa="${c.id}">WA</button><button class="btn small" data-call="${c.id}">Gestionar</button><button class="btn small gray" data-client="${c.id}">Ficha</button></div></div>`; }
function callMini(l){ const c=l.cliente || state.clientes.find(x=>Number(x.id)===Number(l.cliente_id)) || {}; const faltaMonto=l.resultado==='Pidió' && !(+l.monto>0); const hora=callTime(l); return `<div class="client-card ${faltaMonto?'call-warn':'call-done'}" style="grid-template-columns:1fr auto"><div><div class="client-title" style="font-size:15px">${esc(c.negocio||'Cliente')}</div><div class="client-sub">${esc(c.codigo||'')} · ${shortDate(l.fecha)} ${hora?('· '+hora):''} · ${esc(l.resultado)} ${l.monto?money(l.monto):''}</div>${l.observacion?`<div class="hint">“${esc(l.observacion)}”</div>`:''}<div class="badges"><span class="badge ${faltaMonto?'warn':'ok'}">${faltaMonto?'Falta monto':'Hecho'}</span>${l.proximo_contacto?`<span class="badge info">Próximo ${shortDate(l.proximo_contacto)}</span>`:''}</div></div><div class="card-actions"><button class="btn small gray" data-edit-call="${l.id}">Editar</button><button class="btn small danger" data-revert-call="${l.id}">Revertir</button><button class="btn small gray" data-client="${c.id||l.cliente_id}">Ficha</button><button class="iconbtn whatsapp" data-wa="${c.id||l.cliente_id}">WA</button></div></div>`; }
function orderMini(o){return `<div class="client-card" style="grid-template-columns:1fr auto"><div><div class="client-title" style="font-size:15px">${esc(o.codigo||('ORD-'+o.id))} · ${esc(o.cliente?.negocio||'Cliente')}</div><div class="client-sub">${shortDate(o.fecha)} · Despacho: ${shortDate(dispatchDateOf(o))} · ${money(o.total_factura||o.total_estimado)}${(o.items||[]).length?' · '+(o.items||[]).length+' producto(s)':''}</div><div class="badges">${scheduleBadge(o)}</div></div><div class="card-actions"><span class="badge info">${esc(o.estado||'')}</span><button class="btn small gray" data-oper-order="${o.id}">Ver pedido</button></div></div>`;}
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
  const gest=state.llamadas.filter(l=>String(l.fecha).slice(0,10)===f);
  const q=state.callSearch||'';
  const programados=controlScheduledClientsForDate(f);
  const pendientesBase=programados.filter(cl=>!gest.some(l=>Number(l.cliente_id)===Number(cl.id)));
  const pendientes=pendientesBase.filter(cl=>matchClientName(cl,q));
  const gestRows=gest.filter(l=>{const cl=l.cliente || state.clientes.find(x=>Number(x.id)===Number(l.cliente_id)) || {}; return !q || matchClientName(cl,q) || norm(l.resultado).includes(norm(q)) || norm(l.observacion).includes(norm(q));});
  c.innerHTML=`<div class="panel-head"><div><h3>Control de llamadas</h3><p>${gestRows.length} gestionados · ${pendientesBase.length} pendientes · ${programados.length} clientes en agenda para la fecha seleccionada.</p></div><div class="agenda-date"><input type="date" id="controlDate" value="${f}"><button class="btn" id="nuevaGestion">Registrar gestión</button></div></div><div class="searchbar"><input id="controlSearch" value="${esc(q)}" placeholder="Buscar nombre del cliente..."></div><div id="controlSuggest"></div><div class="grid2"><div class="panel" style="box-shadow:none"><h3 style="margin-top:0">Pendientes de agenda</h3><p class="hint">Aquí solo salen los clientes programados para esta fecha: por día de contacto o por próximo contacto reprogramado.</p><div class="list">${pendientes.slice(0,40).map(c=>controlPendingCard(c)).join('')||'<div class="empty">No quedan clientes pendientes para la agenda de esta fecha con ese filtro.</div>'}</div></div><div class="panel" style="box-shadow:none"><h3 style="margin-top:0">Gestionados</h3><p class="hint">Filtrado por fecha. Incluye hora de gestión, edición y reversión.</p><div class="list">${gestRows.slice(0,60).map(callMini).join('')||'<div class="empty">Sin gestiones en esta fecha.</div>'}</div></div></div>`;
  $('#controlDate').onchange=e=>{state.controlDate=e.target.value||today(); renderControl($('#content'));};
  $('#nuevaGestion').onclick=()=>openCallModal();
  const inp=$('#controlSearch'), sug=$('#controlSuggest');
  inp.oninput=()=>{ state.callSearch=inp.value; const q=inp.value; const rows=state.clientes.filter(x=>matchClientName(x,q)).slice(0,10); sug.innerHTML=q?`<div class="panel"><div class="list">${rows.map(x=>`<div class="client-card"><div class="avatar">${esc(String(x.codigo||'').replace('CL-','').slice(-3))}</div><div><div class="client-title">${esc(x.negocio)}</div><div class="client-sub">${esc(x.contacto||'')} · ${esc(x.telefono||'')} · ${esc(x.sector||'')}</div></div><div class="card-actions"><button class="iconbtn whatsapp" data-wa="${x.id}">WA</button><button class="btn small" data-call="${x.id}">Gestionar</button><button class="btn small gray" data-client="${x.id}">Ficha</button></div></div>`).join('')}</div></div>`:''; if(q.length>1) setTimeout(()=>{ const pos=inp.selectionStart||inp.value.length; renderControlGestiones($('#controlBody')); focusAfterRender('controlSearch',pos); },0); bindDynamic(); };
  bindDynamic();
}
function renderControlAgenda(c){
  const f=state.agendaDate || today();
  const dia=dayName(f);
  const gest=state.llamadas.filter(l=>String(l.fecha).slice(0,10)===f);
  const rows=controlScheduledClientsForDate(f);
  const gestionados=rows.filter(cl=>gest.some(g=>Number(g.cliente_id)===Number(cl.id))).length;
  const pendientes=Math.max(0,rows.length-gestionados);
  c.innerHTML=`<div class="panel-head"><div><h3>Agenda de ${dia}</h3><p>${rows.length} clientes para esta fecha · ${gestionados} gestionados · ${pendientes} pendientes.</p></div><div class="agenda-date"><input type="date" id="agendaDate" value="${f}"><button class="btn" data-go-control="1">Ir a gestiones →</button></div></div><div class="badges" style="margin:0 0 12px"><span class="badge info">Agenda: ${rows.length}</span><span class="badge ok">Gestionados: ${gestionados}</span><span class="badge ${pendientes?'warn':'ok'}">Pendientes: ${pendientes}</span></div><div class="list">${rows.map(cl=>{const l=gest.find(g=>Number(g.cliente_id)===Number(cl.id)); const reprogramado=hasNextContactOn(cl,f); return `<div class="client-card" style="grid-template-columns:auto 1fr auto"><div class="avatar">${esc(String(cl.codigo||'').replace('CL-','').slice(-3)||'C')}</div><div><div class="client-title" style="font-size:15px">${esc(cl.negocio)}</div><div class="client-sub">${esc(cl.contacto||'')} · ${esc(cl.sector||'')} · ${esc(cl.telefono||'')}</div><div class="badges"><span class="badge ok">${esc(cl.estado)}</span><span class="badge info">${esc(contactDaysText(cl)||dia)}</span>${reprogramado?'<span class="badge warn">Reprogramado para esta fecha</span>':''}${l?`<span class="badge ok">Gestionado · ${esc(l.resultado)} ${callTime(l)}</span>`:'<span class="badge warn">Pendiente</span>'}</div></div><div class="card-actions"><button class="iconbtn whatsapp" data-wa="${cl.id}">WA</button><button class="btn small" data-call="${cl.id}">${l?'Otra gestión':'Gestionar'}</button><button class="btn small gray" data-client="${cl.id}">Ficha</button></div></div>`}).join('')||`<div class="empty">No hay clientes activos programados para ${dia}. Revisa los días de contacto en la ficha del cliente.</div>`}</div>`;
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
  $$('[data-client]').forEach(b=>b.onclick=()=>openClientFicha(state.clientes.find(x=>x.id==b.dataset.client)));
  $$('[data-call]').forEach(b=>b.onclick=()=>openCallModal(state.clientes.find(x=>x.id==b.dataset.call)));
  $$('[data-prep-order]').forEach(b=>b.onclick=()=>{clearLiveFlashOrder(b.dataset.prepOrder); openPreparacionModal(state.ordenes.find(x=>x.id==b.dataset.prepOrder));});
  $$('[data-take-order]').forEach(b=>b.onclick=()=>{clearLiveFlashOrder(b.dataset.takeOrder); openTakeOrderModal(state.ordenes.find(x=>String(x.id)===String(b.dataset.takeOrder)));});
  $$('[data-release-order]').forEach(b=>b.onclick=()=>openReleaseOrderModal(state.ordenes.find(x=>String(x.id)===String(b.dataset.releaseOrder))));
  $$('[data-print-prep]').forEach(b=>b.onclick=()=>printPreparationTicket(state.ordenes.find(x=>x.id==b.dataset.printPrep)));
  $$('[data-print-order]').forEach(b=>b.onclick=()=>printOrderTicket(state.ordenes.find(x=>x.id==b.dataset.printOrder)));
  $$('[data-invoice-order]').forEach(b=>b.onclick=()=>openFacturaModal(state.ordenes.find(x=>x.id==b.dataset.invoiceOrder)));
  $$('[data-validate-order]').forEach(b=>b.onclick=()=>{ try{ const o=state.ordenes.find(x=>String(x.id)===String(b.dataset.validateOrder)); if(!o) return alert('No encontré esta orden. Actualiza la pantalla e intenta nuevamente.'); openValidacionModal(o); }catch(err){ console.error(err); alert('No pude abrir Validación: '+(err.message||err)); } });
  $$('[data-return-invoice]').forEach(b=>b.onclick=()=>openReturnToInvoiceModal(state.ordenes.find(x=>String(x.id)===String(b.dataset.returnInvoice))));
  $$('[data-special-case]').forEach(b=>b.onclick=()=>openSpecialCaseModal(state.ordenes.find(x=>String(x.id)===String(b.dataset.specialCase))));
  $$('[data-route-order]').forEach(b=>b.onclick=()=>setOrderState(state.ordenes.find(x=>x.id==b.dataset.routeOrder),'En ruta',{en_ruta_en:new Date().toISOString(),notas_estado:'Pedido marcado en ruta por delivery'}));
  $$('[data-delivery-result]').forEach(b=>b.onclick=()=>openDeliveryResultModal(state.ordenes.find(x=>String(x.id)===String(b.dataset.deliveryResult)), b.dataset.result||'Cobrado'));
  $$('[data-liquidate-order]').forEach(b=>b.onclick=()=>openLiquidacionOrdenModal(state.ordenes.find(x=>String(x.id)===String(b.dataset.liquidateOrder))));
  $$('[data-oper-order]').forEach(b=>b.onclick=(e)=>{ if(e){ e.preventDefault(); e.stopPropagation(); } try{ const o=state.ordenes.find(x=>String(x.id)===String(b.dataset.operOrder)); if(!o) return alert('No encontré esta orden. Actualiza la pantalla e intenta nuevamente.'); clearLiveFlashOrder(o.id); openOrderStatusModal(o); }catch(err){ console.error(err); alert('No pude abrir la ficha de la orden: '+(err.message||err)); } });
  $$('[data-edit-order]').forEach(b=>b.onclick=(e)=>{ if(e) e.stopPropagation(); openOrderForm(state.ordenes.find(x=>x.id==b.dataset.editOrder)); });
  $$('[data-cancel-order]').forEach(b=>b.onclick=(e)=>{ if(e) e.stopPropagation(); cancelOrder(state.ordenes.find(x=>x.id==b.dataset.cancelOrder)); });
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
async function cleanupPedidosForCall(callId){
  if(!callId) return {error:null};
  try{
    const r=await sb.from('pedidos').delete().eq('llamada_id',callId);
    if(r.error && !/does not exist|relation .*pedidos/i.test(r.error.message||'')) return r;
  }catch(e){ return {error:e}; }
  return {error:null};
}
async function clearOrderCallLinks(o){
  if(!o?.id) return {error:null};
  const patch={llamada_id:null};
  if(Object.prototype.hasOwnProperty.call(o,'pedido_crm_id')) patch.pedido_crm_id=null;
  return await sb.from('ordenes').update(patch).eq('id',o.id);
}
async function deleteOrderFully(o){
  if(!o) return {error:new Error('Orden no encontrada.')};
  const callId=o.llamada_id;
  const tables=['orden_pagos','orden_entregas','orden_pesos','orden_estados_historial','orden_detalle'];
  for(const t of tables){
    const r=await sb.from(t).delete().eq('orden_id',o.id);
    if(r.error) return r;
  }
  const del=await sb.from('ordenes').delete().eq('id',o.id);
  if(del.error) return del;
  if(callId){
    const clean=await cleanupPedidosForCall(callId);
    if(clean.error) return clean;
  }
  return del;
}
async function annulOrder(o, reason=''){
  if(!o) return {error:new Error('Orden no encontrada.')};
  const old=o.estado;
  const nota=`Orden anulada${reason?': '+reason:''}`;
  const notas=[o.notas||'', `[${new Date().toLocaleString('es-DO')}] ${nota}`].filter(Boolean).join('\n');
  const r=await sb.from('ordenes').update({estado:'Anulado',notas}).eq('id',o.id);
  if(r.error) return r;
  await logOrderState(o,old,'Anulado',nota);
  return {error:null};
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
    if(r.error){ alert(r.error.message); return false; }
    if(!fromRevert){ await loadAll(); render(); toast('Orden anulada y retirada de los módulos operativos.'); }
    return true;
  }
  const msg=`Esta orden está recién creada y no ha avanzado.\n\nSe eliminará completamente del sistema:\n${o.codigo||('ORD-'+o.id)} · ${o.cliente?.negocio||'Cliente'}\n\n¿Deseas continuar?`;
  if(!opts.skipConfirm && !confirm(msg)) return false;
  const r=await deleteOrderFully(o);
  if(r.error){ alert(r.error.message); return false; }
  if(!fromRevert){ await loadAll(); render(); toast('Orden eliminada.'); }
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
    const action=advanced?'se anulará':'se eliminará';
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

  // Preferimos una función segura de Supabase para revertir todo en una sola operación.
  // Si el SQL V6.3 aún no fue ejecutado, usamos el respaldo desde el navegador.
  const rpc=await sb.rpc('revertir_gestion_segura',{p_llamada_id:call.id,p_motivo:reason});
  if(!rpc.error){
    await loadAll(); render(); toast('Gestión revertida de forma segura.');
    return true;
  }
  if(!/revertir_gestion_segura/i.test(rpc.error.message||'')){
    alert(rpc.error.message);
    return false;
  }

  if(linked){
    const advanced=orderHasProgress(linked);
    const cancelled=await cancelOrder(linked,{fromRevert:true,skipConfirm:true,reason});
    if(!cancelled) return false;
    if(advanced){
      const clear=await clearOrderCallLinks(linked);
      if(clear.error){ alert(clear.error.message); return false; }
    }
  }
  const clean=await cleanupPedidosForCall(call.id);
  if(clean.error){ alert(clean.error.message); return false; }
  const r=await sb.from('llamadas').delete().eq('id',call.id);
  if(r.error){ alert(r.error.message); return false; }
  await loadAll(); render(); toast('Gestión revertida. El cliente vuelve a pendientes.');
  return true;
}

function renderOrdenes(c){
  const estados=['Programada','Pedido recibido','En preparación','Lista para facturar','Impresa para facturar','Facturada','Asignada a delivery','En ruta','Cobrado','Entregado a crédito','No entregado','Anulado'];
  const counts=Object.fromEntries(estados.map(e=>[e,state.ordenes.filter(o=>effectiveOrderState(o)===e).length]));
  const q=state.orderSearch||'';
  const view=state.orderView||'hoy';
  let base=state.ordenes.slice();
  if(view==='hoy') base=base.filter(o=>o.estado!=='Anulado' && isDueDispatch(o));
  if(view==='programadas') base=base.filter(o=>o.estado!=='Anulado' && isFutureDispatch(o));
  if(view==='atrasadas') base=base.filter(o=>isLateDispatch(o));
  if(view==='listas') base=base.filter(o=>isOrderReady(o));
  if(view==='proceso') base=base.filter(o=>o.estado!=='Anulado' && isOrderInProcess(o));
  if(view==='anuladas') base=base.filter(o=>o.estado==='Anulado');
  if(view==='especiales') base=base.filter(o=>isSpecialOrder(o) && o.estado!=='Anulado');
  const rows=q ? base.filter(o=>matchOrder(o,q)) : base;
  const tabs=[['hoy','Hoy / vencidas'],['programadas','Programadas'],['atrasadas','Atrasadas'],['listas','Listas'],['proceso','En proceso'],['especiales','Devol./Incid.'],['todas','Todas'],['anuladas','Anuladas']];
  c.innerHTML=`<div class="ops-flow">${estados.slice(0,6).map(e=>`<div class="flow-step"><b>${esc(e)}</b><span>${counts[e]||0}</span></div>`).join('')}</div><div class="panel"><div class="panel-head"><div><h3>Órdenes operativas</h3><p>${rows.length} de ${base.length} órdenes en esta vista · búsqueda por nombre del cliente.</p></div><div class="actions" style="margin:0"><button class="btn" id="createOrder">+ Orden</button></div></div><div class="tabs">${tabs.map(([id,n])=>`<button class="tab ${view===id?'active':''}" data-order-view="${id}">${n}</button>`).join('')}</div><div class="searchbar"><input id="orderSearch" value="${esc(q)}" placeholder="Buscar nombre del cliente..."></div><div class="hint">En <b>En proceso</b> se muestra reloj del estado, y cada orden trae <b>tiempo total</b>, cronómetro de la etapa actual y quién la tiene tomada cuando aplica. Las órdenes futuras quedan como <b>Programadas</b>. Al crear una orden el estado se asigna automático; solo administración puede corregirlo manualmente.</div></div>${view==='especiales'?specialCasePanel(rows):''}<div class="list">${rows.map(operOrderCard).join('')||'<div class="empty">No hay órdenes con esa búsqueda o vista.</div>'}</div>`;
  $('#createOrder').onclick=()=>openOrderForm();
  $('#specialTypeFilter')?.addEventListener('change',e=>{state.specialTypeFilter=e.target.value; renderOrdenes($('#content'));});
  $('#specialStatusFilter')?.addEventListener('change',e=>{state.specialStatusFilter=e.target.value; renderOrdenes($('#content'));});
  $('#specialSearch')?.addEventListener('input',e=>{ const pos=e.target.selectionStart||e.target.value.length; state.specialSearch=e.target.value; renderOrdenes($('#content')); focusAfterRender('specialSearch',pos);});
  $('#printSpecialCases')?.addEventListener('click',()=>printSpecialCasesReport());
  $$('[data-order-view]').forEach(b=>b.onclick=()=>{state.orderView=b.dataset.orderView; renderOrdenes($('#content'));});
  $('#orderSearch').oninput=e=>{ const pos=e.target.selectionStart||e.target.value.length; state.orderSearch=e.target.value; renderOrdenes($('#content')); focusAfterRender('orderSearch',pos); };
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
    <div class="product-filters">
      <div class="field"><label>Categoría</label><select id="productCategoryFilter"><option>Todas</option>${cats.map(x=>`<option ${state.productCategoryFilter===x?'selected':''}>${esc(x)}</option>`).join('')}</select></div>
      <div class="field"><label>Unidad</label><select id="productUnitFilter"><option>Todas</option>${units.map(x=>`<option ${state.productUnitFilter===x?'selected':''}>${esc(x)}</option>`).join('')}</select></div>
      <div class="field"><label>Tipo de despacho / peso</label><select id="productWeightFilter"><option>Todos</option>${weightTypes.map(x=>`<option ${state.productWeightFilter===x?'selected':''}>${esc(x)}</option>`).join('')}</select></div>
    </div>
    <div class="actions product-toolbar"><button class="btn gray" id="tplProductos">Descargar plantilla productos</button><button class="btn gray" id="exportProductos">Exportar Excel</button><label class="btn gray" for="importProductos">Importar Excel</label><input id="importProductos" type="file" accept=".xlsx,.xls" style="display:none"></div>
    ${mal?`<div class="weight-alert"><strong>Catálogo con productos por revisar</strong>Hay ${mal} producto(s) activo(s) con configuración que puede afectar órdenes, peso calculado o despacho. Usa el filtro <b>Mal configurados</b> para corregirlos.</div>`:''}
  </div>
  <div class="table-wrap product-table-wrap"><table class="table product-table"><thead><tr><th>Código</th><th>Producto</th><th>Categoría</th><th>Unidad</th><th>Precio</th><th>Despacho / peso</th><th>Estado</th><th>Configuración</th><th>Acciones</th></tr></thead><tbody>${rows.map(p=>`<tr><td>${esc(p.codigo||'')}</td><td><b>${esc(p.nombre)}</b>${p.observaciones?`<div class="hint">${esc(p.observaciones).slice(0,80)}</div>`:''}</td><td>${esc(p.categoria||'')}</td><td>${esc(p.unidad||'lb')}</td><td>${money(p.precio_defecto)}</td><td><span class="badge info">${esc(weightConfigLabel(p))}</span>${p.suma_peso_final===false?`<div class="hint">No suma peso</div>`:''}${productAllowsFraction(p)?`<div class="hint">Permite fracción</div>`:`<div class="hint">Solo entero</div>`}</td><td><span class="badge ${p.activo!==false?'ok':'bad'}">${p.activo!==false?'Activo':'Inactivo'}</span></td><td>${productConfigBadge(p)}</td><td><div class="actions product-row-actions"><button class="btn small gray" data-prod-edit="${p.id}">Editar</button><button class="btn small dark" data-prod-actions="${p.id}">Acciones</button></div></td></tr>`).join('')}</tbody></table></div>`;
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
  const llamadasHoy=(state.llamadas||[]).filter(l=>String(l.fecha||'').slice(0,10)===f);
  const gestionados=new Set(llamadasHoy.map(l=>Number(l.cliente_id)));
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
  c.innerHTML=`<div class="executive-hero alert-hero"><div><div class="hero-eyebrow">V8.6 · Centro de alertas</div><h3>Prioridades operativas del día</h3><p>Unifica atrasos, órdenes detenidas, productos mal configurados, pendientes de agenda y liquidaciones para actuar rápido.</p></div><div class="hero-actions"><button class="btn" data-go="kanban">Ver Kanban</button><button class="btn gray" data-go="ordenes">Órdenes</button><button class="btn dark" id="refreshAlerts">Actualizar</button></div></div>
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
  if(['Cobrado','Entregado a crédito','No entregado','Devuelto parcial','Cerrado','Entregado'].includes(st)) return 'cerradas';
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
  return `<div class="kanban-card ${newOrderClass(o,st||'ordenes')}" data-oper-order="${o.id}"><div class="kanban-title">${esc(o.codigo||('ORD-'+o.id))}</div><div class="kanban-client">${esc(orderClientName(o))}</div><div class="kanban-sub">Despacho: ${shortDate(dispatchDateOf(o))} · ${money(orderAmount(o))}</div><div class="badges">${newOrderBadge(o,st||'ordenes')}${orderTypeBadge(o)}${specialCaseBadge(o)}${orderStatusBadgeHtml(o)}${scheduleBadge(o)}${totalOrderClockBadge(o)}${currentStageClockBadge(o)}${orderTakenByBadge(o)}</div><div class="mini-items">${orderItemsText(o,3)}</div></div>`;
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
  const cols=[['programadas','Programadas','Pedidos futuros'],['recibido','Pedido recibido','Listas para tomar'],['carniceria','Carnicería','En preparación'],['facturacion','Facturación','Listas para facturar'],['validacion','Validación','Facturadas/validación'],['delivery','Delivery','Asignadas/en ruta'],['liquidacion','Liquidación','Pendientes de cierre'],['cerradas','Cerradas','Completadas o crédito']];
  const grouped={}; cols.forEach(([id])=>grouped[id]=[]); orders.forEach(o=>{ const k=kanbanStageOf(o); if(grouped[k]) grouped[k].push(o); });
  Object.keys(grouped).forEach(k=>grouped[k].sort((a,b)=>k==='cerradas'?kanbanClosedTimestamp(b)-kanbanClosedTimestamp(a):(()=>{ const sa=currentModuleOfOrder(a), sb=currentModuleOfOrder(b); const ma=sa?stageDurationFor(a,sa):minutesSince(createdAtOf(a)); const mb=sb?stageDurationFor(b,sb):minutesSince(createdAtOf(b)); return (mb||0)-(ma||0); })()));
  const closedTotal=grouped.cerradas.length;
  state.kanbanClosedLimit=Math.max(10,Number(state.kanbanClosedLimit)||10);
  const closedVisible=grouped.cerradas.slice(0,state.kanbanClosedLimit);
  const activeTotal=orders.filter(o=>kanbanStageOf(o)!=='cerradas').length;
  const closedToday=grouped.cerradas.filter(o=>kanbanClosedPeriodMatch(o,'hoy')).length;
  const colsHtml=cols.map(([id,title,sub])=>{
    if(id!=='cerradas') return `<section class="kanban-col" data-kanban-col="${id}"><header><div><b>${esc(title)}</b><span>${esc(sub)}</span></div><em>${grouped[id].length}</em></header><div class="kanban-list">${grouped[id].slice(0,40).map(kanbanCard).join('')||'<div class="kanban-empty">Sin órdenes</div>'}</div></section>`;
    const hidden=state.kanbanClosedHidden;
    return `<section class="kanban-col kanban-closed-col ${hidden?'closed-collapsed':''}" data-kanban-col="cerradas"><header><div><b>${esc(title)}</b><span>${esc(sub)} · ${hidden?'ocultas':`mostrando ${Math.min(closedVisible.length,closedTotal)} de ${closedTotal}`}</span></div><div class="kanban-header-actions"><em>${closedTotal}</em><button class="icon-btn" data-kanban-closed-toggle title="${hidden?'Mostrar cerradas':'Ocultar cerradas'}">${hidden?'＋':'−'}</button></div></header>${hidden?`<div class="kanban-closed-collapsed"><strong>${closedTotal}</strong><span>órdenes cerradas</span><button class="btn small gray" data-kanban-closed-history>Ver historial</button></div>`:`<div class="kanban-list kanban-closed-list">${closedVisible.map(kanbanClosedCard).join('')||'<div class="kanban-empty">Sin órdenes</div>'}</div><div class="kanban-closed-footer">${closedVisible.length<closedTotal?`<button class="btn small gray" data-kanban-closed-more>Mostrar 10 más</button>`:closedTotal>10?'<button class="btn small gray" data-kanban-closed-reset>Mostrar solo 10</button>':''}<button class="btn small dark" data-kanban-closed-history>Historial completo</button></div>`}</section>`;
  }).join('');
  c.innerHTML=`<div class="executive-hero kanban-hero"><div><div class="hero-eyebrow">V9.2.12 · Tablero Kanban</div><h3>Flujo completo de órdenes</h3><p>Visualiza dónde está cada pedido, quién lo tiene y cuánto tiempo lleva en su etapa actual.</p></div><div class="hero-actions"><button class="btn" data-go="alertas">Centro de alertas</button><button class="btn gray" data-go="ordenes">Lista de órdenes</button><button class="btn dark" data-kanban-closed-history>Historial cerradas</button></div></div><div class="kanban-kpi-grid"><div class="kanban-kpi"><span>Órdenes activas</span><strong>${activeTotal}</strong><small>Requieren seguimiento</small></div><div class="kanban-kpi"><span>En preparación</span><strong>${grouped.carniceria.length}</strong><small>Carnicería</small></div><div class="kanban-kpi"><span>En ruta</span><strong>${grouped.delivery.length}</strong><small>Delivery asignado</small></div><div class="kanban-kpi"><span>Cerradas hoy</span><strong>${closedToday}</strong><small>${closedTotal} en historial visible</small></div></div><div class="panel"><div class="panel-head"><div><h3>Tablero operativo</h3><p>${orders.length} orden(es) visibles. Cada columna tiene desplazamiento interno; los cambios reales se hacen con los botones de cada módulo.</p></div></div><div class="searchbar"><input id="kanbanSearch" value="${esc(q)}" placeholder="Buscar orden, cliente, producto, teléfono o estado..."></div><div class="kanban-board">${colsHtml}</div></div>`;
  $('#kanbanSearch').oninput=e=>{ const pos=e.target.selectionStart||e.target.value.length; state.kanbanSearch=e.target.value; renderKanban($('#content')); focusAfterRender('kanbanSearch',pos); };
  $$('[data-go]').forEach(b=>b.onclick=()=>{state.page=b.dataset.go; render();});
  $$('[data-kanban-closed-history]').forEach(b=>b.onclick=e=>{e.preventDefault();e.stopPropagation();openKanbanClosedHistory();});
  $$('[data-kanban-closed-toggle]').forEach(b=>b.onclick=e=>{e.preventDefault();e.stopPropagation();state.kanbanClosedHidden=!state.kanbanClosedHidden;refreshKanbanPreserveScroll();});
  $$('[data-kanban-closed-more]').forEach(b=>b.onclick=e=>{e.preventDefault();e.stopPropagation();state.kanbanClosedLimit=Math.min(closedTotal,state.kanbanClosedLimit+10);refreshKanbanPreserveScroll();});
  $$('[data-kanban-closed-reset]').forEach(b=>b.onclick=e=>{e.preventDefault();e.stopPropagation();state.kanbanClosedLimit=10;refreshKanbanPreserveScroll();});
  bindDynamic();
}


function employeeAreas(){ return ['Carnicería','Facturación','Validación','Delivery','Liquidación','CXC','Vendedor','Control','Gerencia','Supervisor','Administración']; }
function splitEmployeeAreas(v){ return String(v||'').split(/[,+/|;]+/).map(x=>x.trim()).filter(Boolean); }
function employeeHasArea(e, area){ if(!area) return true; const a=norm(area); return splitEmployeeAreas(e?.area).some(x=>norm(x)===a); }
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
  const lotes=(state.entregaLotes||[]).filter(l=>productDateInMonth(l.fecha_entrega||l.creado_en,month,year));
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
  c.innerHTML=`<div class="executive-hero productivity-hero"><div><div class="hero-eyebrow">V9.2.12 · Productividad e incentivos</div><h3>Panel mensual por empleado activo</h3><p>Solo calcula empleados registrados en Configuración → Empleados. Los deliverys y vendedores también se crean desde esa misma sección.</p></div><div class="hero-actions"><button class="btn" data-go="config" data-config-go="incentivos">Configurar incentivos</button><button class="btn gray" data-go="config" data-config-go="empleados">Empleados</button><button class="btn gray" id="refreshProd">Actualizar</button><button class="btn dark" id="printProd">Imprimir</button></div></div>
  <div class="panel productivity-filter-panel"><div class="prod-filters"><div class="field"><label>Mes</label><select id="prodMonth">${monthOptions().map((m,i)=>`<option value="${i+1}" ${Number(month)===i+1?'selected':''}>${m}</option>`).join('')}</select></div><div class="field"><label>Año</label><select id="prodYear">${years.map(y=>`<option value="${y}" ${Number(year)===Number(y)?'selected':''}>${y}</option>`).join('')}</select></div><div class="field"><label>Rol productivo</label><select id="prodRole">${['Todos','Delivery','Despachador','Vendedor'].map(x=>`<option ${x===role?'selected':''}>${x}</option>`).join('')}</select></div></div></div>
  <div class="exec-kpi-grid productivity-kpis"><div class="exec-kpi primary"><span>Incentivo estimado</span><strong>${money(totalIncentivo)}</strong><small>${rows.length} empleado(s)</small></div><div class="exec-kpi"><span>Clientes contados</span><strong>${totalClientes}</strong><small>Entregados/despachados</small></div><div class="exec-kpi"><span>Viajes/lotes</span><strong>${totalLotes}</strong><small>Entregas creadas</small></div><div class="exec-kpi"><span>Cobrado vinculado</span><strong>${money(totalCobrado)}</strong><small>Según liquidación/pagos</small></div></div>
  <div class="panel panel-clean"><div class="panel-head"><div><h3>Ranking de productividad</h3><p>El incentivo se calcula solo con empleados activos. Nombres heredados de vendedores se limpian con el SQL V9.2.2.</p></div></div><div class="table-wrap"><table class="table productivity-table"><thead><tr><th>Empleado</th><th>Rol productivo</th><th>Base</th><th>Clientes</th><th>Viajes</th><th>Facturado</th><th>Cobrado</th><th>Incentivo</th><th>Alertas</th></tr></thead><tbody>${rows.map(r=>`<tr><td><b>${esc(r.empleado)}</b><div class="hint">${esc(r.areaEmpleado||employeeRoleOfName(r.empleado)||'Empleado activo')}</div></td><td><span class="badge info">${esc(r.rol)}</span></td><td><b>${esc(r.baseTexto)}</b><div class="hint">${esc(r.tipoIncentivo)} · ${r.tipoIncentivo==='Porcentaje'?Number(r.valorBase||0)+'%':money(r.valorBase)}</div></td><td>${r.clientes||0}</td><td>${r.lotes||0}</td><td>${money(r.montoFacturado||0)}</td><td>${money(r.montoCobrado||0)}</td><td><b>${money(r.incentivo||0)}</b></td><td>${r.alertas?.length?`<span class="badge warn">${r.alertas.length}</span>`:'<span class="badge ok">OK</span>'}</td></tr>`).join('')||'<tr><td colspan="9">No hay productividad registrada para este período con empleados activos.</td></tr>'}</tbody></table></div></div>
  <div class="report-grid"><div class="panel panel-clean"><div class="panel-head"><div><h3>Detalle por rol</h3><p>Resumen operativo para validar antes de pagar incentivo.</p></div></div><div class="stage-report-grid">${['Delivery','Despachador','Vendedor'].map(r=>{const part=rowsAll.filter(x=>x.rol===r); return `<div class="stage-report"><b>${r}</b><strong>${money(part.reduce((s,x)=>s+Number(x.incentivo||0),0))}</strong><small>${part.length} empleado(s) · ${part.reduce((s,x)=>s+Number(x.clientes||0),0)} cliente(s)</small></div>`}).join('')}</div></div><div class="panel panel-clean"><div class="panel-head"><div><h3>Reglas activas</h3><p>Se toman de Configuración → Incentivos.</p></div></div>${productivityRulesHtml()}</div></div>`;
  $('#prodMonth').onchange=e=>{state.prodMonth=e.target.value; renderProductividad($('#content'));};
  $('#prodYear').onchange=e=>{state.prodYear=e.target.value; renderProductividad($('#content'));};
  $('#prodRole').onchange=e=>{state.prodRole=e.target.value; renderProductividad($('#content'));};
  $('#refreshProd').onclick=async()=>{ await loadAll(); renderProductividad($('#content')); toast('Productividad actualizada'); };
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
  c.innerHTML=`<div class="panel-head"><div><h3>Incentivos / Productividad</h3><p>Configura cómo se calcula el incentivo mensual. Delivery y despacho se miden por cliente; el lote queda como opción alternativa.</p></div><span class="badge info">V9.2.12</span></div>
  <div class="config-incentive-grid"><div class="card incentive-card"><h3>Delivery</h3><div class="grid2"><div class="field"><label>Activo</label><select id="incDeliveryActivo"><option value="true" ${cfg.delivery.activo!==false?'selected':''}>Sí</option><option value="false" ${cfg.delivery.activo===false?'selected':''}>No</option></select></div><div class="field"><label>Tipo</label><select id="incDeliveryTipo"><option value="monto_fijo" ${cfg.delivery.tipo!=='porcentaje'?'selected':''}>Monto fijo</option><option value="porcentaje" ${cfg.delivery.tipo==='porcentaje'?'selected':''}>Porcentaje</option></select></div></div><div class="field"><label>Base de cálculo</label><select id="incDeliveryBase"><option value="cliente_entregado" ${cfg.delivery.base==='cliente_entregado'?'selected':''}>Por cliente entregado</option><option value="lote_viaje" ${cfg.delivery.base==='lote_viaje'?'selected':''}>Por lote / viaje</option><option value="orden" ${cfg.delivery.base==='orden'?'selected':''}>Por orden</option></select></div><div class="field"><label>Valor</label><input id="incDeliveryValor" type="number" step="0.01" value="${Number(cfg.delivery.valor||0)}"></div><label class="checkrow"><input id="incDeliveryCredito" type="checkbox" ${cfg.delivery.cuentaCredito!==false?'checked':''}> <b>Contar entregados a crédito</b><span>Cuenta el cliente como entregado aunque quede saldo pendiente.</span></label></div>
  <div class="card incentive-card"><h3>Despachador</h3><div class="grid2"><div class="field"><label>Activo</label><select id="incDespActivo"><option value="true" ${cfg.despachador.activo!==false?'selected':''}>Sí</option><option value="false" ${cfg.despachador.activo===false?'selected':''}>No</option></select></div><div class="field"><label>Tipo</label><select id="incDespTipo"><option value="monto_fijo" ${cfg.despachador.tipo!=='porcentaje'?'selected':''}>Monto fijo</option><option value="porcentaje" ${cfg.despachador.tipo==='porcentaje'?'selected':''}>Porcentaje</option></select></div></div><div class="field"><label>Base de cálculo</label><select id="incDespBase"><option value="cliente_despachado" ${cfg.despachador.base==='cliente_despachado'?'selected':''}>Por cliente despachado</option><option value="orden" ${cfg.despachador.base==='orden'?'selected':''}>Por orden</option></select></div><div class="field"><label>Valor</label><input id="incDespValor" type="number" step="0.01" value="${Number(cfg.despachador.valor||0)}"></div><label class="checkrow"><input id="incDespValidadas" type="checkbox" ${cfg.despachador.cuentaSoloValidadas!==false?'checked':''}> <b>Solo órdenes validadas</b><span>Evita pagar por pedidos preparados que no salieron a entrega.</span></label></div>
  <div class="card incentive-card"><h3>Vendedor</h3><div class="grid2"><div class="field"><label>Activo</label><select id="incVendActivo"><option value="true" ${cfg.vendedor.activo!==false?'selected':''}>Sí</option><option value="false" ${cfg.vendedor.activo===false?'selected':''}>No</option></select></div><div class="field"><label>Tipo</label><select id="incVendTipo"><option value="porcentaje" ${cfg.vendedor.tipo==='porcentaje'?'selected':''}>Porcentaje</option><option value="monto_fijo" ${cfg.vendedor.tipo!=='porcentaje'?'selected':''}>Monto fijo</option></select></div></div><div class="field"><label>Base de cálculo</label><select id="incVendBase"><option value="ventas_cobradas" ${cfg.vendedor.base==='ventas_cobradas'?'selected':''}>Sobre ventas cobradas</option><option value="ventas_facturadas" ${cfg.vendedor.base==='ventas_facturadas'?'selected':''}>Sobre ventas facturadas</option></select></div><div class="field"><label>Valor</label><input id="incVendValor" type="number" step="0.01" value="${Number(cfg.vendedor.valor||0)}"></div><div class="hint">Recomendación: calcular vendedores sobre ventas cobradas para no pagar comisiones de dinero pendiente.</div></div></div>
  <div class="actions"><button class="btn" id="saveIncentivos">Guardar configuración</button><button class="btn gray" id="resetIncentivos">Restaurar sugerida</button><button class="btn dark" data-go="productividad">Ver panel</button></div>`;
  const collect=()=>({delivery:{activo:$('#incDeliveryActivo').value==='true',tipo:$('#incDeliveryTipo').value,base:$('#incDeliveryBase').value,valor:+$('#incDeliveryValor').value||0,cuentaCredito:$('#incDeliveryCredito').checked},despachador:{activo:$('#incDespActivo').value==='true',tipo:$('#incDespTipo').value,base:$('#incDespBase').value,valor:+$('#incDespValor').value||0,cuentaSoloValidadas:$('#incDespValidadas').checked},vendedor:{activo:$('#incVendActivo').value==='true',tipo:$('#incVendTipo').value,base:$('#incVendBase').value,valor:+$('#incVendValor').value||0},extras:{mostrarAlertas:true,redondear:'normal'}});
  $('#saveIncentivos').onclick=async()=>{ const val=collect(); await saveConfigKey('incentivos',val); state.systemConfig=normalizeSystemConfig({...state.systemConfig,incentivos:val}); saveSystemConfigLocal(state.systemConfig); toast('Incentivos guardados'); renderConfig($('#content')); };
  $('#resetIncentivos').onclick=async()=>{ const val=defaultIncentiveConfig(); await saveConfigKey('incentivos',val); state.systemConfig=normalizeSystemConfig({...state.systemConfig,incentivos:val}); saveSystemConfigLocal(state.systemConfig); toast('Configuración sugerida restaurada'); renderConfig($('#content')); };
  $$('[data-go="productividad"]').forEach(b=>b.onclick=()=>{state.page='productividad'; render();});
  wireEnterFlow(c,['incDeliveryValor','incDespValor','incVendValor','saveIncentivos']);
}

function renderReportes(c){
  const orders=(state.ordenes||[]).filter(o=>o.estado!=='Anulado');
  const mes=orders.filter(o=>inCurrentMonth(o.fecha||o.creado_en));
  const hoy=orders.filter(o=>rowDateKey(o.fecha||o.creado_en)===today());
  const llamadasMes=(state.llamadas||[]).filter(l=>inCurrentMonth(l.fecha));
  const llamadasHoy=(state.llamadas||[]).filter(l=>rowDateKey(l.fecha)===today());
  const montoMes=mes.reduce((s,o)=>s+orderAmount(o),0), montoHoy=hoy.reduce((s,o)=>s+orderAmount(o),0);
  const ticket=mes.length?montoMes/mes.length:0;
  const estados=sortEntries(groupCount(orders,o=>effectiveOrderState(o)||o.estado||'Sin estado'));
  const maxEstado=Math.max(1,...estados.map(x=>x[1]));
  const stages=['carniceria','facturacion','validacion','delivery','liquidacion'];
  const stageRows=stages.map(st=>{ const vals=orders.map(o=>stageDurationFor(o,st)).filter(v=>v!==null); return {stage:st,count:vals.length,avg:avg(vals),max:Math.max(0,...vals)}; });
  const productos=productAggregation().slice(0,8);
  const clientes=sortEntries(groupSum(mes,o=>orderClientName(o),o=>orderAmount(o))).slice(0,8);
  const prep=sortEntries(groupCount(orders.filter(o=>preparedByDisplay(o)),o=>preparedByDisplay(o))).slice(0,8);
  const deliveries=sortEntries(groupCount(orders.filter(o=>o.delivery_nombre),o=>o.delivery_nombre)).slice(0,8);
  c.innerHTML=`<div class="executive-hero report-hero"><div><div class="hero-eyebrow">V8.5 · Reportes</div><h3>Centro de análisis operativo</h3><p>Ventas, tiempos por etapa, productividad y productos más movidos con datos del sistema actual.</p></div><div class="hero-actions"><button class="btn" data-go="ordenes">Ver órdenes</button><button class="btn gray" data-go="auditoria">Auditoría</button><button class="btn dark" id="printReportBtn">Imprimir reporte</button></div></div>
  <div class="exec-kpi-grid"><div class="exec-kpi primary"><span>Ventas mes</span><strong>${money(montoMes)}</strong><small>${mes.length} orden(es)</small></div><div class="exec-kpi"><span>Ventas hoy</span><strong>${money(montoHoy)}</strong><small>${hoy.length} orden(es)</small></div><div class="exec-kpi"><span>Ticket promedio</span><strong>${money(ticket)}</strong><small>Mes actual</small></div><div class="exec-kpi"><span>Llamadas hoy</span><strong>${llamadasHoy.length}</strong><small>${llamadasMes.length} en el mes</small></div><div class="exec-kpi"><span>Órdenes activas</span><strong>${orders.filter(isOrderInProcess).length}</strong><small>En flujo operativo</small></div></div>
  <div class="report-grid"><div class="panel panel-clean"><div class="panel-head"><div><h3>Órdenes por estado</h3><p>Distribución del flujo actual.</p></div></div><div class="report-bars">${estados.map(([k,v])=>renderBarRow(k,v,maxEstado)).join('')||'<div class="empty">Sin órdenes.</div>'}</div></div>
  <div class="panel panel-clean"><div class="panel-head"><div><h3>Tiempos promedio por etapa</h3><p>Calculado con los cronómetros e historial disponible.</p></div></div><div class="stage-report-grid">${stageRows.map(r=>`<div class="stage-report"><b>${esc(stageLabel(r.stage))}</b><strong>${minutesText(r.avg)}</strong><small>${r.count} orden(es) · máx. ${minutesText(r.max)}</small></div>`).join('')}</div></div></div>
  <div class="report-grid"><div class="panel panel-clean"><div class="panel-head"><div><h3>Productos más movidos</h3><p>Por monto estimado/facturado en órdenes visibles.</p></div></div><div class="table-wrap"><table class="table"><thead><tr><th>Producto</th><th>Cantidad</th><th>Órdenes</th><th>Monto</th></tr></thead><tbody>${productos.map(p=>`<tr><td><b>${esc(p.producto)}</b></td><td>${Number(p.cantidad).toLocaleString('es-DO')}</td><td>${p.ordenes}</td><td>${money(p.monto)}</td></tr>`).join('')||'<tr><td colspan="4">Sin productos.</td></tr>'}</tbody></table></div></div>
  <div class="panel panel-clean"><div class="panel-head"><div><h3>Clientes con mayor movimiento del mes</h3><p>Por monto de órdenes del mes actual.</p></div></div><div class="report-bars">${clientes.map(([k,v])=>renderBarRow(k,money(v),montoMes,'money')).join('')||'<div class="empty">Sin ventas del mes.</div>'}</div></div></div>
  <div class="report-grid"><div class="panel panel-clean"><div class="panel-head"><div><h3>Productividad por despachador</h3><p>Órdenes marcadas como preparadas.</p></div></div><div class="report-bars">${prep.map(([k,v])=>renderBarRow(k,v,Math.max(1,...prep.map(x=>x[1])))).join('')||'<div class="empty">Aún no hay preparaciones finalizadas.</div>'}</div></div>
  <div class="panel panel-clean"><div class="panel-head"><div><h3>Delivery / ruta</h3><p>Órdenes asignadas por delivery.</p></div></div><div class="report-bars">${deliveries.map(([k,v])=>renderBarRow(k,v,Math.max(1,...deliveries.map(x=>x[1])))).join('')||'<div class="empty">Sin órdenes asignadas a delivery.</div>'}</div></div></div>`;
  $$('[data-go]').forEach(b=>b.onclick=()=>{state.page=b.dataset.go; render();});
  const pr=$('#printReportBtn'); if(pr) pr.onclick=()=>window.print();
}

function renderAuditoria(c){
  const q=state.auditSearch||''; const tipo=state.auditType||'todos';
  const all=auditEvents();
  const tipos=['todos',...Array.from(new Set(all.map(e=>e.tipo))).sort()];
  const rows=all.filter(e=>(tipo==='todos'||e.tipo===tipo) && (!q || norm([e.tipo,e.actor,e.titulo,e.detalle].join(' ')).includes(norm(q)))).slice(0,250);
  c.innerHTML=`<div class="panel"><div class="panel-head"><div><h3>Auditoría operativa</h3><p>${rows.length} evento(s) visibles de ${all.length}. Basado en historial de estados, llamadas, órdenes, pagos y entregas registrados.</p></div><button class="btn gray" id="refreshAudit">Actualizar</button></div><div class="audit-filters"><input id="auditSearch" value="${esc(q)}" placeholder="Buscar por cliente, usuario, orden o acción..."><select id="auditType">${tipos.map(t=>`<option value="${esc(t)}" ${t===tipo?'selected':''}>${esc(t==='todos'?'Todos los eventos':t)}</option>`).join('')}</select></div></div>
  <div class="audit-timeline">${rows.map(e=>`<div class="audit-item"><div class="audit-dot"></div><div class="audit-card"><div class="audit-head"><b>${esc(e.tipo)}</b><span>${esc(e.fecha?safeDateObj(e.fecha).toLocaleString('es-DO'):'—')}</span></div><div class="client-title" style="font-size:15px">${esc(e.titulo||'Evento')}</div><div class="client-sub">Usuario/responsable: <b>${esc(workerDisplayName(e.actor)||e.actor||'—')}</b> · Módulo: ${esc(liveTargetName(e.modulo||''))}</div>${e.detalle?`<p class="audit-detail">${esc(e.detalle)}</p>`:''}<div class="actions">${e.ordenId?`<button class="btn small gray" data-oper-order="${e.ordenId}">Ver orden</button>`:''}${e.clienteId?`<button class="btn small gray" data-client="${e.clienteId}">Ficha cliente</button>`:''}</div></div></div>`).join('')||'<div class="empty">No hay eventos con esos filtros.</div>'}</div>`;
  $('#auditSearch').oninput=e=>{ const pos=e.target.selectionStart||e.target.value.length; state.auditSearch=e.target.value; renderAuditoria($('#content')); focusAfterRender('auditSearch',pos); };
  $('#auditType').onchange=e=>{ state.auditType=e.target.value; renderAuditoria($('#content')); };
  $('#refreshAudit').onclick=async()=>{ await loadAll(); render(); toast('Auditoría actualizada'); };
  bindDynamic();
}

function renderConfig(c){
  const tabs=[['general','Centro de control'],['empresa','General'],['recibos','Recibos'],['respaldo','Copias de seguridad'],['atajos','Atajos'],['menu','Menú'],['apariencia','Apariencia'],['catalogos','Catálogos'],['peso','Control de peso'],['facturacion','Facturación'],['alertas','Alertas'],['impresion','Impresión'],['seguridad','Seguridad'],['incentivos','Incentivos'],['empleados','Empleados'],['usuarios','Usuarios'],['plantillas','WhatsApp']];
  c.innerHTML=`<div class="panel config-center"><div class="tabs config-tabs">${tabs.map(([id,n])=>`<button class="tab ${state.configTab===id?'active':''}" data-configtab="${id}">${n}</button>`).join('')}</div><div id="configBody"></div></div>`;
  $$('[data-configtab]').forEach(b=>b.onclick=()=>{state.configTab=b.dataset.configtab; renderConfig($('#content'));});
  if(state.configTab==='general') renderConfigGeneral($('#configBody'));
  if(state.configTab==='empresa') renderConfigEmpresa($('#configBody'));
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
  state.systemConfig=normalizeSystemConfig({...state.systemConfig,[key]:val}); saveSystemConfigLocal(state.systemConfig);
  try{ const {error}=await sb.from('sistema_configuracion').upsert({clave:key,valor:val,actualizado_por:state.user?.id,actualizado_en:new Date().toISOString()},{onConflict:'clave'}); if(error) throw error; toast('Configuración guardada'); }
  catch(e){ toast('Configuración guardada localmente. Si no se guarda global, revisa tabla sistema_configuracion.'); }
}
function configCardStatus(title,ok,desc){ return `<div class="config-status ${ok?'ok':'warn'}"><b>${esc(title)}</b><span>${esc(desc)}</span></div>`; }
function renderConfigApariencia(c){
  const u=state.ui;
  c.innerHTML=`<div class="panel-head"><div><h3>Apariencia y menú</h3><p>Configuraciones visuales conectadas a todo el programa: panel, menú, tarjetas, letras y densidad.</p></div><button class="btn gray" id="uiReset">Restablecer</button></div><div class="grid2"><div class="card"><h3>Diseño general</h3><div class="field"><label>Tema</label><select id="uiTheme"><option value="red" ${u.theme==='red'?'selected':''}>Rojo profesional</option><option value="blue" ${u.theme==='blue'?'selected':''}>Azul ejecutivo</option><option value="green" ${u.theme==='green'?'selected':''}>Verde operativo</option><option value="charcoal" ${u.theme==='charcoal'?'selected':''}>Negro elegante</option><option value="dark" ${u.theme==='dark'?'selected':''}>Modo oscuro</option></select></div><div class="field" style="margin-top:12px"><label>Densidad</label><select id="uiDensity"><option value="normal" ${u.density==='normal'?'selected':''}>Normal</option><option value="compact" ${u.density==='compact'?'selected':''}>Compacta: botones y tarjetas pequeñas</option></select></div><div class="field" style="margin-top:12px"><label>Ancho de trabajo</label><select id="uiLayout"><option value="wide" ${(u.layoutWidth||'wide')==='wide'?'selected':''}>Amplio para escritorio</option><option value="contained" ${u.layoutWidth==='contained'?'selected':''}>Contenido centrado</option></select></div></div><div class="card"><h3>Menú lateral</h3><div class="field"><label>Estilo de menú</label><select id="uiMenuStyle"><option value="executive" ${(u.menuStyle||'executive')==='executive'?'selected':''}>Ejecutivo con tarjetas</option><option value="compact" ${u.menuStyle==='compact'?'selected':''}>Compacto</option><option value="minimal" ${u.menuStyle==='minimal'?'selected':''}>Minimalista</option></select></div><div class="field" style="margin-top:12px"><label>Mostrar descripción debajo del módulo</label><select id="uiMenuSubtitles"><option value="true" ${u.menuSubtitles!==false?'selected':''}>Sí</option><option value="false" ${u.menuSubtitles===false?'selected':''}>No, solo nombre</option></select></div><div class="field" style="margin-top:12px"><label>Estilo de panel</label><select id="uiPanelStyle"><option value="executive" ${(u.panelStyle||'executive')==='executive'?'selected':''}>Ejecutivo moderno</option><option value="clean" ${u.panelStyle==='clean'?'selected':''}>Limpio/simple</option></select></div></div></div><div class="grid2" style="margin-top:14px"><div class="card"><div class="field"><label>Tamaño de letra</label><select id="uiFont"><option value="normal" ${u.font==='normal'?'selected':''}>Normal</option><option value="small" ${u.font==='small'?'selected':''}>Pequeña</option><option value="large" ${u.font==='large'?'selected':''}>Grande</option></select></div><div class="field" style="margin-top:12px"><label>Estilo de bordes</label><select id="uiRadius"><option value="normal" ${u.radius==='normal'?'selected':''}>Redondeado profesional</option><option value="soft" ${u.radius==='soft'?'selected':''}>Más cuadrado/compacto</option><option value="pill" ${u.radius==='pill'?'selected':''}>Más redondo/app móvil</option></select></div></div><div class="card"><h3>Vista previa</h3><div class="client-card"><div class="avatar">PC</div><div><div class="client-title">Colmado ejemplo</div><div class="client-sub">Contacto · Sector · estilo actual</div><div class="badges"><span class="badge ok">Activo</span><span class="badge info">Contactado</span><span class="badge warn">Seguimiento</span></div></div><div class="card-actions"><button class="btn small">Gestionar</button><button class="iconbtn whatsapp">WA</button></div></div></div></div>`;
  const save=()=>{ state.ui={theme:$('#uiTheme').value,density:$('#uiDensity').value,font:$('#uiFont').value,radius:$('#uiRadius').value,menuStyle:$('#uiMenuStyle').value,menuSubtitles:$('#uiMenuSubtitles').value==='true',layoutWidth:$('#uiLayout').value,panelStyle:$('#uiPanelStyle').value}; saveUi(); renderConfig($('#content')); };
  ['#uiTheme','#uiDensity','#uiFont','#uiRadius','#uiMenuStyle','#uiMenuSubtitles','#uiLayout','#uiPanelStyle'].forEach(sel=>$(sel).onchange=save);
  $('#uiReset').onclick=()=>{state.ui={theme:'red',density:'normal',font:'normal',radius:'normal',menuStyle:'executive',menuSubtitles:true,layoutWidth:'wide',panelStyle:'executive'}; saveUi(); renderConfig($('#content'));};
}
function renderConfigPlantillas(c){ c.innerHTML=`<div class="panel-head"><div><h3>Plantillas de WhatsApp</h3><p>Variables: {contacto}, {negocio}, {telefono}, {sector}, {vendedor}, {monto}, {fecha}, {factura}</p></div><button class="btn" id="newTpl">+ Plantilla</button></div><div class="list">${state.plantillas.map(p=>`<div class="client-card" style="grid-template-columns:1fr auto"><div><div class="client-title" style="font-size:16px">${esc(p.nombre)}</div><div class="client-sub">${esc(p.categoria)} · ${esc(p.texto)}</div></div><div class="card-actions"><span class="badge ${p.activo?'ok':''}">${p.activo?'Activa':'Inactiva'}</span><button class="btn small gray" data-tpl="${p.id}">Editar</button></div></div>`).join('')}</div>`; $('#newTpl').onclick=()=>openTemplateForm(); $$('[data-tpl]').forEach(b=>b.onclick=()=>openTemplateForm(state.plantillas.find(x=>x.id==b.dataset.tpl))); }
function catalogLabel(id){ return {tipo_negocio:'Tipo de negocio',sectores:'Sectores',categoria_producto:'Categorías de productos',unidad_producto:'Unidades de venta',estado_orden:'Estados de órdenes',frecuencias:'Frecuencias heredadas'}[id] || String(id||'').replaceAll('_',' '); }
function catalogHelp(id){ return {categoria_producto:'Alimenta el campo Categoría dentro de Productos.',unidad_producto:'Alimenta la Unidad de venta en Productos y la unidad tomada al crear órdenes.',tipo_negocio:'Alimenta la ficha de clientes.',sectores:'Alimenta la ubicación/sector de clientes.',estado_orden:'Estados internos del flujo operativo. Editar con cuidado.'}[id] || 'Catálogo conectado a formularios del sistema.'; }
function catalogIdsForConfig(){ const base=['categoria_producto','unidad_producto','tipo_negocio','sectores','estado_orden']; const rest=Object.keys(state.catalogos||{}).filter(x=>!base.includes(x)).sort(); return base.concat(rest).filter((v,i,a)=>v&&a.indexOf(v)===i); }
function renderConfigCatalogos(c){ const ids=catalogIdsForConfig(); c.innerHTML=`<div class="panel-head"><div><h3>Catálogos conectados</h3><p>Las categorías, unidades y sectores que agregues aquí se reflejan en Productos, Clientes y Órdenes.</p></div></div><div class="config-catalog-focus"><div class="card"><h3>Categorías de productos</h3><p class="hint">Agrega familias como Carnes, Embutidos, Provisiones, Lácteos, etc.</p><button class="btn" data-addcat="categoria_producto">+ Categoría</button></div><div class="card"><h3>Unidades de venta</h3><p class="hint">Agrega lb, unidad, caja, paquete, galón u otra unidad usada en pedidos.</p><button class="btn dark" data-addcat="unidad_producto">+ Unidad</button></div></div><div class="grid2">${ids.map(id=>{ const items=state.catalogos[id]||[]; return `<div class="panel catalog-panel" style="box-shadow:none"><div class="panel-head"><div><h3>${esc(catalogLabel(id))}</h3><p>${esc(catalogHelp(id))} · ${items.length} opciones</p></div><button class="btn small" data-addcat="${esc(id)}">+</button></div><div class="list catalog-list">${items.map(it=>`<div class="client-card" style="grid-template-columns:1fr auto;padding:10px 12px"><b>${esc(it.valor)}</b><button class="btn small gray" data-delcat="${it.id}">Quitar</button></div>`).join('')||'<div class="empty">No hay opciones todavía.</div>'}</div></div>`}).join('')}</div>`; $$('[data-addcat]').forEach(b=>b.onclick=()=>addCatalogItem(b.dataset.addcat)); $$('[data-delcat]').forEach(b=>b.onclick=()=>deleteCatalogItem(b.dataset.delcat)); }
function renderConfigDeliverys(c){
  state.configTab='empleados';
  renderConfigEmpleados(c);
  toast('Delivery ahora se administra desde Empleados → Área Delivery');
}
function roleMapHtml(){
  const roles=['Gerente','Control','Carnicería','Facturación','Validación','Delivery','Liquidación','Supervisor'];
  const deps={
    'Gerente':'Todo el sistema y configuración.',
    'Control':'Clientes, llamadas, órdenes y productos para registrar ventas.',
    'Carnicería':'Órdenes, clientes, productos, detalle y empleados de carnicería para preparar/pesar.',
    'Facturación':'Órdenes listas, clientes, detalle, productos y pesajes para imprimir y registrar factura.',
    'Validación':'Órdenes facturadas, clientes, deliverys, detalle y pesajes para validar/asignar.',
    'Delivery':'Sus entregas asignadas, cliente, dirección/teléfono y estado de ruta.',
    'Liquidación':'Órdenes entregadas, clientes, pagos, CXC y cierre de cobros.',
    'Supervisor':'Vista y control operativo de todo el flujo, sin configuración técnica completa.'
  };
  const rows=roles.map(r=>{ const mods=navItems.map(([id,n])=>{ const rp=state.permisos.find(x=>x.rol===r&&x.modulo===id); const nivel=r==='Gerente'?'editar':(rp?.nivel||'none'); return nivel==='none'?null:`${n} (${nivel==='editar'?'editar':'ver'})`; }).filter(Boolean); return `<tr><td><b>${esc(r)}</b></td><td><small>${mods.map(esc).join(' · ')||'Sin módulos'}</small></td><td><small>${esc(deps[r]||'')}</small></td></tr>`; }).join('');
  return `<div class="section-title">Mapa base de roles</div><div class="hint" style="margin-bottom:10px">Este mapa controla los módulos visibles. El SQL V5.5.1 también abre los datos dependientes necesarios; por ejemplo, Carnicería no ve el módulo Clientes, pero sí puede leer el nombre, teléfono, sector y productos de las órdenes que prepara.</div><div class="table-wrap"><table class="table"><thead><tr><th>Rol</th><th>Módulos visibles</th><th>Datos operativos incluidos</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
function renderConfigUsuarios(c){
  const canEdit=puede('config',true);
  c.innerHTML=`<div class="panel-head"><div><h3>Usuarios y módulos</h3><p>V8.4: configuración central conectada con roles, módulos y permisos operativos.</p></div><button class="btn gray" id="authGuide">Guía crear login</button></div>
  <div class="grid3">
    <div class="card"><h3>${state.usuarios.length}</h3><p class="hint">perfiles registrados</p></div>
    <div class="card"><h3>${state.usuarios.filter(u=>u.activo!==false).length}</h3><p class="hint">usuarios activos</p></div>
    <div class="card"><h3>${state.usuarios.filter(u=>u.activo===false).length}</h3><p class="hint">usuarios inactivos</p></div>
  </div>
  <div class="table-wrap"><table class="table"><thead><tr><th>Nombre</th><th>Rol</th><th>Acceso final</th><th>Estado</th><th>Módulos</th></tr></thead><tbody>${state.usuarios.map(u=>{ const mods=navItems.map(([id,n])=>{ const um=state.usuarioModulos.find(x=>x.usuario_id===u.id&&x.modulo===id); const rp=state.permisos.find(x=>x.rol===u.rol&&x.modulo===id); const nivel=u.rol==='Gerente'?'editar':(um?.nivel||rp?.nivel||'none'); return nivel==='none'?null:n; }).filter(Boolean); return `<tr><td><b>${esc(u.nombre||'Sin nombre')}</b><br><small>${esc(u.id)}</small></td><td>${esc(u.rol||'')}</td><td><small>${mods.slice(0,4).map(esc).join(' · ')}${mods.length>4?' · +'+(mods.length-4):''}</small></td><td><span class="badge ${u.activo!==false?'ok':'bad'}">${u.activo!==false?'Activo':'Inactivo'}</span></td><td><button class="btn small gray" data-user="${u.id}" ${canEdit?'':'disabled'}>Editar</button></td></tr>`}).join('')}</tbody></table></div>${roleMapHtml()}`;
  $('#authGuide').onclick=()=>openAuthGuide();
  $$('[data-user]').forEach(b=>b.onclick=()=>openUserPerms(state.usuarios.find(x=>x.id===b.dataset.user)));
}
function openAuthGuide(){
  openModal('Guía para crear login del empleado',`<div class="card"><h3>Paso 1: crear credencial en Supabase</h3><p class="hint">Supabase → Authentication → Users → Add user. Escribe correo y contraseña temporal.</p><h3>Paso 2: crear o confirmar perfil</h3><p class="hint">El ID del usuario de Auth debe existir en la tabla perfiles. En V5.6 haremos este paso automático desde el sistema con una función segura.</p><h3>Paso 3: asignar módulos</h3><p class="hint">En esta pantalla eliges rol, activo/inactivo y permiso por módulo: Sin acceso, Solo ver o Editar.</p><div class="error"><b>Seguridad:</b> No se debe poner la service_role key dentro del HTML público. Por eso la creación automática será la V5.6.</div></div>`);
}
function renderConfigGeneral(c){
  const sc=normalizeSystemConfig(state.systemConfig||{}); const wc=normalizeWeightConfig(state.weightConfig||{});
  sc.empresa=sc.empresa||defaultSystemConfig().empresa; sc.alertas=sc.alertas||defaultSystemConfig().alertas; sc.impresion=sc.impresion||defaultSystemConfig().impresion; sc.recibos=sc.recibos||defaultSystemConfig().recibos; sc.respaldo=sc.respaldo||defaultSystemConfig().respaldo; sc.atajos=sc.atajos||defaultSystemConfig().atajos; sc.seguridad=sc.seguridad||defaultSystemConfig().seguridad;
  const enabled=navItems.filter(([id])=>moduleEnabled(id)).length;
  c.innerHTML=`<div class="panel-head"><div><h3>Centro de configuración</h3><p>Todo lo que cambies aquí alimenta los módulos operativos del sistema.</p></div><span class="badge info">V9.2.12</span></div>
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
  </div>
  <div class="grid2" style="margin-top:16px"><div class="card"><h3>Recomendación operativa</h3><p class="hint">Mantén activos solo los módulos que usas. Las unidades y categorías deben agregarse desde Catálogos para que Productos, Órdenes y Carnicería usen la misma información.</p><div class="actions"><button class="btn" data-config-go="catalogos">Revisar catálogos</button><button class="btn gray" data-config-go="peso">Control de peso</button></div></div><div class="card"><h3>Conexiones principales</h3><div class="kv"><b>Categorías/unidades</b><span>Productos → Órdenes → Carnicería</span></div><div class="kv"><b>Deliverys</b><span>Validación → Delivery → Liquidación</span></div><div class="kv"><b>Roles</b><span>Menú → permisos → acciones permitidas</span></div><div class="kv"><b>Alertas</b><span>Realtime → sonido/parpadeo → módulos</span></div></div></div>`;
  $$('[data-config-go]').forEach(b=>b.onclick=()=>{state.configTab=b.dataset.configGo; renderConfig($('#content'));});
}
function renderConfigEmpresa(c){ const e=normalizeSystemConfig(state.systemConfig||{}).empresa || defaultSystemConfig().empresa;
  c.innerHTML=`<div class="panel-head"><div><h3>Configuración general del negocio</h3><p>Datos maestros que salen en menú, reportes, hojas de ruta, recibos y facturas internas.</p></div><span class="badge info">V9.2.12</span></div><div class="grid2"><div class="card"><div class="field"><label>Nombre comercial</label><input id="empNombre" value="${esc(e.nombre)}"></div><div class="field"><label>Subtítulo del sistema</label><input id="empSub" value="${esc(e.subtitulo)}"></div><div class="grid2"><div class="field"><label>Texto del logo</label><input id="empLogo" maxlength="6" value="${esc(e.logoTexto)}"></div><div class="field"><label>Moneda</label><input id="empMoneda" value="${esc(e.moneda)}"></div></div><div class="field"><label>Logo URL opcional</label><input id="empLogoUrl" value="${esc(e.logoUrl||'')}" placeholder="https://.../logo.png"><div class="hint">Opcional. Si se deja vacío, se usa el texto del logo.</div></div></div><div class="card"><div class="grid2"><div class="field"><label>Teléfono</label><input id="empTel" value="${esc(e.telefono)}"></div><div class="field"><label>RNC</label><input id="empRnc" value="${esc(e.rnc||'')}"></div></div><div class="field"><label>Correo</label><input id="empCorreo" value="${esc(e.correo||'')}"></div><div class="field"><label>Dirección</label><textarea id="empDir">${esc(e.direccion)}</textarea></div><div class="success"><b>Conectado:</b> estos datos se usan en reportes, recibos, hoja de ruta, tickets y encabezado del sistema.</div><button class="btn" id="saveEmpresa">Guardar configuración general</button></div></div>`;
  $('#saveEmpresa').onclick=async()=>{ const val={nombre:$('#empNombre').value.trim()||'Productos César',subtitulo:$('#empSub').value.trim()||'CRM · Despacho · CXC',logoTexto:$('#empLogo').value.trim()||'PC',logoUrl:$('#empLogoUrl').value.trim(),moneda:$('#empMoneda').value.trim()||'RD$',telefono:$('#empTel').value.trim(),rnc:$('#empRnc').value.trim(),correo:$('#empCorreo').value.trim(),direccion:$('#empDir').value.trim()}; await saveConfigKey('empresa',val); render(); state.configTab='empresa'; state.page='config'; setTimeout(()=>renderConfig($('#content')),50); };
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
function renderConfigAlertas(c){ const a=normalizeSystemConfig(state.systemConfig||{}).alertas || defaultSystemConfig().alertas;
  c.innerHTML=`<div class="panel-head"><div><h3>Alertas y tiempo operativo</h3><p>Controla sonido, parpadeo y tiempos de referencia para identificar atrasos.</p></div></div><div class="grid2"><div class="card"><div class="field"><label>Parpadeo de órdenes nuevas</label><select id="alParpadeo"><option value="true" ${a.parpadeoNuevas!==false?'selected':''}>Activo</option><option value="false" ${a.parpadeoNuevas===false?'selected':''}>Apagado</option></select></div><div class="field"><label>Sonido activo por defecto</label><select id="alSonido"><option value="false" ${!a.sonidoDefault?'selected':''}>No</option><option value="true" ${a.sonidoDefault?'selected':''}>Sí</option></select></div><div class="field"><label>Revisión automática cada segundos</label><input id="alRevision" type="number" min="10" max="300" value="${a.revisionSegundos||30}"></div></div><div class="card"><h3>Tiempo máximo recomendado por etapa</h3><div class="grid2"><div class="field"><label>Carnicería min.</label><input id="alCarn" type="number" value="${a.carniceriaMaxMin}"></div><div class="field"><label>Facturación min.</label><input id="alFact" type="number" value="${a.facturacionMaxMin}"></div><div class="field"><label>Validación min.</label><input id="alVal" type="number" value="${a.validacionMaxMin}"></div><div class="field"><label>Delivery min.</label><input id="alDel" type="number" value="${a.deliveryMaxMin}"></div><div class="field"><label>Liquidación min.</label><input id="alLiq" type="number" value="${a.liquidacionMaxMin}"></div></div><button class="btn" id="saveAlertas">Guardar alertas</button></div></div>`;
  $('#saveAlertas').onclick=async()=>{ const val={parpadeoNuevas:$('#alParpadeo').value==='true',sonidoDefault:$('#alSonido').value==='true',revisionSegundos:+$('#alRevision').value||30,carniceriaMaxMin:+$('#alCarn').value||45,facturacionMaxMin:+$('#alFact').value||30,validacionMaxMin:+$('#alVal').value||30,deliveryMaxMin:+$('#alDel').value||120,liquidacionMaxMin:+$('#alLiq').value||60}; await saveConfigKey('alertas',val); startLivePolling(); render(); };
}
function renderConfigImpresion(c){ const im=normalizeSystemConfig(state.systemConfig||{}).impresion || defaultSystemConfig().impresion;
  c.innerHTML=`<div class="panel-head"><div><h3>Impresión y tickets</h3><p>Parámetros para tickets internos de carnicería y facturación.</p></div></div><div class="grid2"><div class="card"><div class="field"><label>Ticket de carnicería</label><select id="impCarn"><option ${im.ticketCarniceria==='80mm'?'selected':''}>80mm</option><option ${im.ticketCarniceria==='Carta'?'selected':''}>Carta</option></select></div><div class="field"><label>Ticket de facturación</label><select id="impFact"><option ${im.ticketFacturacion==='80mm'?'selected':''}>80mm</option><option ${im.ticketFacturacion==='Carta'?'selected':''}>Carta</option></select></div><div class="field"><label>Pie de ticket</label><input id="impPie" value="${esc(im.pieTicket)}"></div></div><div class="card"><label class="checkrow"><input id="impLogo" type="checkbox" ${im.mostrarLogo!==false?'checked':''}> <b>Mostrar logo</b><span>Usa el texto configurado en Empresa.</span></label><label class="checkrow"><input id="impTel" type="checkbox" ${im.mostrarTelefono!==false?'checked':''}> <b>Mostrar teléfono</b><span>Sale en tickets si está definido.</span></label><label class="checkrow"><input id="impDir" type="checkbox" ${im.mostrarDireccion!==false?'checked':''}> <b>Mostrar dirección</b><span>Sale en tickets si está definida.</span></label><button class="btn" id="saveImpresion">Guardar impresión</button></div></div>`;
  $('#saveImpresion').onclick=async()=>{ const val={ticketCarniceria:$('#impCarn').value,ticketFacturacion:$('#impFact').value,pieTicket:$('#impPie').value.trim(),mostrarLogo:$('#impLogo').checked,mostrarTelefono:$('#impTel').checked,mostrarDireccion:$('#impDir').checked}; await saveConfigKey('impresion',val); };
}
function renderConfigSeguridad(c){ const sg=normalizeSystemConfig(state.systemConfig||{}).seguridad || defaultSystemConfig().seguridad;
  c.innerHTML=`<div class="panel-head"><div><h3>Seguridad operativa</h3><p>Define reglas visibles de acciones delicadas. Los permisos de base siguen en RLS de Supabase.</p></div></div><div class="grid2"><div class="card"><label class="checkrow"><input id="sgSoloAdmin" type="checkbox" ${sg.soloAdminEliminar!==false?'checked':''}> <b>Eliminar solo administrador</b><span>Los roles operativos no ven eliminar.</span></label><label class="checkrow"><input id="sgConfirmar" type="checkbox" ${sg.confirmarAnular!==false?'checked':''}> <b>Confirmar anulaciones/reversos</b><span>Pide confirmación antes de acciones delicadas.</span></label><label class="checkrow"><input id="sgBloquear" type="checkbox" ${sg.bloquearOperativos!==false?'checked':''}> <b>Bloquear acciones operativas fuera de rol</b><span>Evita que un empleado actúe a nombre de otro.</span></label><label class="checkrow"><input id="sgEliminarReciente" type="checkbox" ${sg.mostrarBotonEliminarSoloReciente!==false?'checked':''}> <b>Mostrar eliminar solo en órdenes recientes sin avance</b><span>Si ya avanzó, debe anularse.</span></label><button class="btn" id="saveSeguridad">Guardar seguridad</button></div><div class="card"><h3>Recomendación</h3><div class="error"><b>No pongas service_role key en el frontend.</b><br>Crear usuarios desde Configuración debe hacerse con función segura en V8.6/V5.6.</div><p class="hint">Estas reglas mejoran la interfaz. La protección fuerte debe mantenerse también en SQL/RLS.</p></div></div>`;
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
function weightDiffDialog(check){ return new Promise(resolve=>{ const m=document.createElement('div'); m.className='modal'; const title=check.level==='block'?'Diferencia demasiado alta':'Verificar diferencia de peso'; const msg=check.level==='block'?'El peso real supera la tolerancia máxima permitida. No se puede enviar a facturación hasta corregirlo.':'El peso real no coincide con el peso calculado. Puedes volver a revisar o continuar bajo responsabilidad.'; const diffTxt=(check.diff>0?'+':'')+check.diff+' lb'; m.innerHTML=`<div class="modal-card" style="max-width:720px"><div class="modal-head"><div><div class="modal-title">${title}</div><div class="hint">Control de peso antes de enviar a facturación.</div></div><button class="close" data-close>×</button></div><div class="modal-body"><div class="weight-alert ${check.level==='block'?'bad':''}"><strong>${msg}</strong><div class="grid2" style="margin-top:12px"><div class="kv"><b>Peso calculado</b><span>${check.calc} lb</span></div><div class="kv"><b>Peso real</b><span>${check.peso} lb</span></div><div class="kv"><b>Diferencia</b><span>${diffTxt}</span></div><div class="kv"><b>Tolerancia aviso</b><span>${check.aviso} lb</span></div><div class="kv"><b>Tolerancia máxima</b><span>${check.max} lb</span></div></div></div><div class="actions">${check.level==='block'?'<button class="btn" data-review>Volver a revisar</button>':'<button class="btn gray" data-review>Volver a revisar</button><button class="btn" data-continue>Continuar bajo responsabilidad</button>'}</div></div></div>`; document.body.appendChild(m); const close=(val)=>{m.remove(); resolve(val);}; $('[data-close]',m).onclick=()=>close(false); $('[data-review]',m).onclick=()=>close(false); const cont=$('[data-continue]',m); if(cont) cont.onclick=()=>close(true); }); }

function openModal(title, body, opts=''){ state.modal=true; const m=document.createElement('div'); m.className='modal'; m.innerHTML=`<div class="modal-card"><div class="modal-head"><div><div class="modal-title">${title}</div>${opts?`<div class="hint">${opts}</div>`:''}</div><button class="close" id="modalClose">×</button></div><div class="modal-body">${body}</div></div>`; document.body.appendChild(m); $('#modalClose',m).onclick=()=>m.remove(); m.onclick=e=>{if(e.target===m)m.remove();}; setTimeout(()=>attachGlobalModalDraft(m,title,opts),550); return m; }
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
  const cxc=(state.cobranza||[]).filter(x=>Number(x.cliente_id)===cid).length;
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
  await loadAll(); render(); toast(`Cliente ${next.toLowerCase()}: ${c.negocio}`);
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
  await loadAll(); render(); toast('Cliente eliminado definitivamente');
}

function openClientFicha(c){
  if(!c) return;
  const lc=lastCall(c.id);
  const calls=state.llamadas.filter(l=>Number(l.cliente_id)===Number(c.id)).slice(0,8);
  const orders=state.ordenes.filter(o=>Number(o.cliente_id)===Number(c.id));
  const cxc=state.cobranza.filter(x=>Number(x.cliente_id)===Number(c.id));
  const pendiente=cxc.reduce((s,x)=>s+(+x.monto||0)-(+x.abonado||0),0);
  const ultimaGestionTxt=lc ? esc(lc.resultado)+' · '+shortDate(lc.fecha)+' '+callTime(lc) : 'Sin gestiones';
  const ultimaComentario=lc && lc.observacion ? `<div class="hint" style="margin-top:6px;line-height:1.45"><b>Comentario:</b> “${esc(lc.observacion)}”</div>` : '';
  const llamadasHtml=calls.map(l=>`<div class="client-card" style="grid-template-columns:1fr auto;padding:12px"><div><div><b>${shortDate(l.fecha)} ${callTime(l)}</b> · ${esc(l.resultado)}</div>${l.observacion?`<div class="hint" style="margin-top:5px;line-height:1.45">“${esc(l.observacion)}”</div>`:''}${l.proximo_contacto?`<div class="hint" style="margin-top:4px">Próximo contacto: ${shortDate(l.proximo_contacto)}</div>`:''}</div><span>${l.monto?money(l.monto):''}</span></div>`).join('') || '<div class="empty">Sin llamadas.</div>';
  const body=`<div class="grid2"><div><div class="badges"><span class="badge ${c.estado==='Activo'?'ok':''}">${esc(c.estado||'')}</span><span class="badge info">${esc(c.codigo||'')}</span></div><div class="kv"><b>Contacto</b><span>${esc(c.contacto||'')}</span></div><div class="kv"><b>Tipo</b><span>${esc(c.tipo||'')}</span></div><div class="kv"><b>Sector</b><span>${esc(c.sector||'')}</span></div><div class="kv"><b>Vendedor</b><span>${esc(c.vendedor||'')}</span></div><div class="kv"><b>Días de contacto</b><span>${esc(contactDaysText(c))}</span></div><div class="kv"><b>Frecuencia</b><span>${esc(freqFromDays(contactDaysOf(c)))}</span></div><div class="kv"><b>Teléfono</b><span>${esc(c.telefono||'')}</span></div><div class="kv"><b>Crédito</b><span>${c.credito?'Sí':'No'} · límite ${money(c.limite_credito)}</span></div></div><div><div class="card"><h3 style="margin-top:0">Indicadores</h3><div class="kv"><b>Última gestión</b><span>${ultimaGestionTxt}${ultimaComentario}</span></div><div class="kv"><b>Último pedido</b><span>${shortDate(c.ultimo_pedido)}</span></div><div class="kv"><b>Días sin pedir</b><span>${daysSince(c.ultimo_pedido)??'Nunca'}</span></div><div class="kv"><b>Órdenes</b><span>${orders.length}</span></div><div class="kv"><b>Pendiente CXC</b><span>${money(pendiente)}</span></div></div></div></div><div class="actions" style="margin-top:18px"><a class="btn gray" href="tel:${esc(c.telefono||'')}">Llamar</a><button class="btn green" data-wa="${c.id}">WhatsApp</button><button class="btn" data-call="${c.id}">Registrar llamada</button><button class="btn dark" data-edit-client="${c.id}">Editar</button></div>${clientAdminActionsHtml(c)}<div class="section-title">Historial reciente</div><div class="grid2"><div><b>Llamadas</b>${llamadasHtml}</div><div><b>Órdenes</b><div class="hint" style="margin:4px 0 8px">Usa <b>Ver pedido</b> para revisar artículos solicitados, pesajes e historial del proceso.</div>${orders.slice(0,8).map(orderMini).join('')||'<div class="empty">Sin órdenes.</div>'}</div></div>`;
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
    estado_orden:['Pedido recibido','En preparación','Pesada / lista para facturar','Impresa para facturar','Facturada','Asignada a delivery','En ruta','Cobrado','Entregado a crédito','No entregado','Devuelto parcial','Anulada']
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

function openClientForm(c={}){
  const selectedVendor=canonicalEmployeeName(c.vendedor||state.profile.vendedor||'','Vendedor') || normalizeLegacyVendorInRows();
  const body=`<div class="form"><div class="grid2"><div class="field"><label>Código</label><div style="display:flex;gap:8px"><input id="f_codigo" value="${esc(c.codigo||(!c.id?nextClientCode():''))}"><button type="button" class="btn gray small" id="genClientCode">Generar</button></div></div><div class="field"><label>Estado</label><select id="f_estado">${['Activo','Inactivo','Prospecto','Cerrado','Suspendido'].map(x=>`<option ${x===(c.estado||'Activo')?'selected':''}>${x}</option>`).join('')}</select></div></div><div class="field"><label>Negocio</label><input id="f_negocio" value="${esc(c.negocio||'')}"></div><div class="grid2"><div class="field"><label>Contacto</label><input id="f_contacto" value="${esc(c.contacto||'')}"></div><div class="field"><label>Teléfono</label><input id="f_telefono" value="${esc(c.telefono||'')}"></div></div><div class="grid2"><div class="field"><label>Tipo de negocio</label><select id="f_tipo">${optionList('tipo_negocio',c.tipo)}</select></div><div class="field"><label>Sector</label><select id="f_sector">${optionList('sectores',c.sector)}</select></div></div><div class="field"><label>Vendedor</label><select id="f_vendedor">${vendorSelect(selectedVendor)}</select><div class="hint">Se alimenta de Configuración → Empleados. Crea el empleado con área Vendedor.</div></div>${contactDaysCheckboxes(c)}<div class="grid2"><div class="field"><label>Frecuencia automática</label><div id="contactFreqPreview" class="calc-box">${esc(freqFromDays(contactDaysOf(c)))}</div><div class="hint">Se calcula según las casillas marcadas. Ya no se edita manualmente.</div></div><div class="field"><label>Límite crédito</label><input type="number" id="f_limite" value="${esc(c.limite_credito||0)}"></div></div><div class="field"><label>Observaciones</label><textarea id="f_obs">${esc(c.observaciones||'')}</textarea></div>${clientAdminActionsHtml(c)}<button class="btn" id="saveClient">Guardar cliente</button></div>`;
  const m=openModal(c.id?'Editar cliente':'Nuevo cliente',body);
  bindClientAdminButtons(m);
  $$('input[name="contact_day"]',m).forEach(ch=>ch.onchange=()=>updateContactFreqPreview(m));
  $('#saveClient',m).onclick=async()=>{
    const days=selectedContactDays(m);
    if(!days.length) return alert('Selecciona por lo menos un día de contacto.');
    const vendedor=$('#f_vendedor',m).value;
    if(!vendedor) return alert('Selecciona un vendedor registrado en empleados.');
    const row={codigo:$('#f_codigo',m).value.trim()||nextClientCode(),negocio:$('#f_negocio',m).value.trim(),contacto:$('#f_contacto',m).value.trim(),telefono:$('#f_telefono',m).value.trim(),tipo:$('#f_tipo',m).value,sector:$('#f_sector',m).value,vendedor,dia_contacto:days.join(', '),frecuencia:freqFromDays(days),estado:$('#f_estado',m).value,limite_credito:+$('#f_limite',m).value||0,observaciones:$('#f_obs',m).value,whatsapp:true,credito:(+$('#f_limite',m).value||0)>0,archivado:false};
    if(!row.negocio) return alert('El nombre del negocio es obligatorio.');
    const q=c.id?sb.from('clientes').update(row).eq('id',c.id):sb.from('clientes').insert(row);
    const {error}=await q;
    if(error) return alert(error.message);
    m.remove(); await loadAll(); render(); toast('Cliente guardado');
  };
  const gen=$('#genClientCode',m); if(gen) gen.onclick=()=>{$('#f_codigo',m).value=nextClientCode();};
  wireEnterFlow(m,['f_codigo','f_estado','f_negocio','f_contacto','f_telefono','f_tipo','f_sector','f_vendedor','f_limite','f_obs','saveClient']);
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
    m.remove(); await loadAll(); render(); toast(isEdit?'Gestión actualizada':'Llamada registrada');
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
      const r=await sb.from('llamadas').insert(row).select('id').single();
      if(r.error) throw new Error(r.error.message+'\n\nNo se creó la orden porque primero debe guardarse la gestión como “Pidió”.');
      const extra={initialTotal:+$('#callMonto',m).value||0,initialNotas:obs,fromCall:true,fromCallId:r.data.id};
      if(callDraftKey) clearDraftLocal(callDraftKey);
      m.remove();
      await loadAll();
      openOrderForm(null,cl,extra);
      toast('Gestión guardada como “Pidió”. Completa y guarda la orden.');
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

function openOrderForm(o=null, client=null, extra={}){
  const existingItems=(o?.items||[]).map(i=>({id:i.id,producto_id:i.producto_id||'',producto_nombre:i.producto_nombre||'',cantidad_pedida:+i.cantidad_pedida||0,unidad:i.unidad||'lb',precio:+i.precio||0,subtotal:+i.subtotal||0,notas:i.notas||'',tipo_despacho_peso:i.tipo_despacho_peso||'',requiere_pesaje:i.requiere_pesaje,peso_estandar_lb:i.peso_estandar_lb,tolerancia_lb:i.tolerancia_lb,suma_peso_final:i.suma_peso_final,permite_fraccion:i.permite_fraccion}));
  let lineItems=existingItems.length?existingItems:[];
  let staged={producto_id:'',producto_nombre:'',cantidad_pedida:1,unidad:'lb',precio:0,subtotal:0,notas:'',permite_fraccion:true};
  const deliveryOptions=state.deliverys.filter(d=>d.activo!==false).map(d=>d.nombre);
  const selectedDelivery=o?.delivery_nombre||'';
  const adminAdvanced = !!o && isAdminRole();
  const currentTotal = o?.total_factura||o?.total_estimado||extra.initialTotal||0;
  const adminFields = adminAdvanced ? `<div class="order-section admin-section"><div class="section-title">Datos administrativos</div><div class="hint">Estos campos pertenecen al cierre del flujo. Úsalos solo para correcciones administrativas.</div><div class="grid2"><div class="field"><label>Factura No.</label><input id="ordFactura" value="${esc(o?.factura_no||'')}"></div><div class="field"><label>Delivery</label>${deliveryOptions.length?`<select id="ordDelivery"><option value="">Sin asignar</option>${deliveryOptions.map(n=>`<option ${n===selectedDelivery?'selected':''}>${esc(n)}</option>`).join('')}<option value="__manual__" ${selectedDelivery&&!deliveryOptions.includes(selectedDelivery)?'selected':''}>Otro / manual</option></select><input id="ordDeliveryManual" value="${selectedDelivery&&!deliveryOptions.includes(selectedDelivery)?esc(selectedDelivery):''}" placeholder="Nombre del delivery" style="margin-top:8px;${selectedDelivery&&!deliveryOptions.includes(selectedDelivery)?'':'display:none'}">`:`<input id="ordDelivery" value="${esc(selectedDelivery)}" placeholder="Nombre del delivery">`}</div></div></div>` : `<input type="hidden" id="ordFactura" value="${esc(o?.factura_no||'')}"><input type="hidden" id="ordDelivery" value="${esc(selectedDelivery)}"><input type="hidden" id="ordDeliveryManual" value="">`;
  const body=`<div class="form order-form-pro"><input type="hidden" id="ordTotal" value="${currentTotal}">
    <div class="order-section"><div class="section-title">1. Cliente</div><div class="field relative"><label>Cliente</label><input id="ordClientText" autocomplete="off" data-lpignore="true" data-form-type="other" value="${esc(client?client.codigo+' · '+client.negocio:o?.cliente?.negocio||'')}" placeholder="Buscar nombre del cliente..."><input type="hidden" id="ordClientId" value="${client?.id||o?.cliente_id||''}"><div id="ordSuggest" class="suggest" style="display:none"></div></div></div>
    <div class="order-section"><div class="section-title">2. Programación del pedido</div><div class="grid3"><div class="field"><label>Fecha despacho</label><input id="ordFechaDespacho" type="date" value="${esc(o?.fecha_despacho||today())}"></div><div class="field"><label>Hora despacho</label><input id="ordHoraDespacho" type="time" value="${esc((o?.hora_despacho||'').slice(0,5))}"></div><div class="field"><label>Prioridad</label><select id="ordPrioridad"><option ${(!o?.prioridad||o?.prioridad==='Normal')?'selected':''}>Normal</option><option ${o?.prioridad==='Alta'?'selected':''}>Alta</option><option ${o?.prioridad==='Urgente'?'selected':''}>Urgente</option></select></div></div><div class="grid3 order-type-grid" style="margin-top:12px"><div class="field"><label>Tipo de orden</label><select id="ordTipoOrden">${orderTypes().map(t=>`<option value="${esc(t)}" ${(orderType(o||{tipo_orden:extra.tipo_orden||'Pedido normal'})===t)?'selected':''}>${esc(t)}</option>`).join('')}</select></div><div class="field"><label>Preparación</label><input id="ordReqPrepInfo" readonly></div><div class="field"><label>Facturación</label><input id="ordReqFactInfo" readonly></div></div><div id="orderTypeNote" class="weight-alert info"></div><div id="programNote" class="weight-alert" style="display:none"><strong>Pedido programado</strong>Esta orden tiene fecha futura. No aparecerá en Carnicería hasta la fecha de despacho.</div>${orderStateControlHtml(o)}</div>
    ${adminFields}
    <div class="order-section"><div class="section-title">3. Productos solicitados</div><div class="order-builder professional"><div class="order-entry"><div class="order-stage-grid pro"><div class="field relative wide"><label>Producto</label><input id="newItemName" autocomplete="off" data-lpignore="true" data-form-type="other" placeholder="Buscar producto o escribir manualmente"><input type="hidden" id="newItemPid"><div id="newItemSuggest" class="suggest" style="display:none"></div></div><div class="field"><label>Cantidad</label><input id="newItemQty" type="number" step="0.01" value="1"></div><div class="field"><label>Unidad</label><div id="newItemUnitDisplay" class="calc-box unit-display">lb</div><input id="newItemUnit" value="lb" type="hidden"></div><div class="field"><label>Precio</label><input id="newItemPrice" type="number" step="0.01" value="0"></div></div><div class="actions" style="margin-top:12px"><button type="button" class="btn dark" id="addStagedItem">Agregar producto</button><button type="button" class="btn gray" id="addManualItem">Agregar no listado</button><button type="button" class="btn gray" id="clearStage">Limpiar entrada</button></div></div><div class="order-total-card order-total-readonly"><div><span class="count" id="orderItemCount">0 productos</span><div class="big-total" id="orderBigTotal">RD$ 0</div><div class="hint">Total estimado automático. No se edita manualmente en creación; Facturación registra la factura final.</div></div></div></div><div id="orderItems" class="order-summary-list professional"></div></div>
    <div class="order-section"><div class="section-title">4. Notas</div><div class="field"><label>Nota de programación</label><textarea id="ordNotaProgramacion" placeholder="Ejemplo: cliente pidió para el lunes temprano.">${esc(o?.nota_programacion||'')}</textarea></div><div class="field"><label>Notas internas</label><textarea id="ordNotas">${esc(o?.notas||extra.initialNotas||'')}</textarea></div></div><button class="btn save-order-btn" id="saveOrder">Guardar orden</button></div>`;
  const m=openModal(o?'Actualizar orden':'Crear orden',body,'Pedido compacto: usa Enter y flechas para capturar más rápido.');
  m.classList.add('order-modal');
  const orderCard=$('.modal-card',m); if(orderCard) orderCard.classList.add('order-modal-card');
  setupClientSuggest($('#ordClientText',m),$('#ordClientId',m),$('#ordSuggest',m));
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
  };
  $('#ordTipoOrden',m)?.addEventListener('change',syncOrderTypeUi);
  $('#ordFechaDespacho',m).onchange=syncScheduleUi; syncScheduleUi(); syncOrderTypeUi();
  const calc=()=>{ lineItems.forEach(it=>{it.subtotal=(+it.cantidad_pedida||0)*(+it.precio||0);}); const total=lineItems.reduce((s,it)=>s+(+it.subtotal||0),0); const inp=$('#ordTotal',m); if(inp) inp.value=Number(total.toFixed(2)); const big=$('#orderBigTotal',m); if(big) big.textContent=money(total); const count=$('#orderItemCount',m); if(count) count.textContent=lineItems.length+' producto'+(lineItems.length===1?'':'s'); return total; };
  const resetStage=()=>{ staged={producto_id:'',producto_nombre:'',cantidad_pedida:1,unidad:'lb',precio:0,subtotal:0,notas:'',permite_fraccion:true}; $('#newItemName',m).value=''; $('#newItemPid',m).value=''; $('#newItemQty',m).value=1; $('#newItemUnit',m).value='lb'; const uDisp=$('#newItemUnitDisplay',m); if(uDisp) uDisp.textContent='lb'; $('#newItemPrice',m).value=0; $('#newItemSuggest',m).style.display='none'; };
  const drawItems=(opts={})=>{
    calc();
    const box=$('#orderItems',m);
    box.innerHTML=lineItems.length?`<div class="order-list-header"><span>Producto</span><span>Cantidad</span><span>Precio</span><span>Subtotal</span><span></span></div>`+lineItems.map((it,idx)=>{ const noFrac=it.permite_fraccion===false; return `<div class="order-row" data-line="${idx}"><div class="order-main"><b>${esc(it.producto_nombre||'Producto')}</b><small>${it.producto_id?'Catálogo':'No listado'} · ${esc(it.unidad||'lb')} · ${money(it.precio||0)} · ${esc(it.tipo_despacho_peso||weightConfigLabel(state.productos.find(p=>String(p.id)===String(it.producto_id)))||'Por libra')}${noFrac?' · No granel':''}</small></div><input data-row-qty="${idx}" type="number" step="${noFrac?'1':'0.01'}" value="${it.cantidad_pedida||0}" title="Cantidad"><input data-row-price="${idx}" type="number" step="0.01" value="${it.precio||0}" title="Precio"><div class="order-subtotal" data-row-sub="${idx}">${money(it.subtotal||0)}</div><button type="button" class="btn small danger" data-row-del="${idx}">Quitar</button></div>`; }).join(''):'<div class="order-empty">Aún no has agregado productos. Usa el buscador superior para construir la orden.</div>';
    box.title=lineItems.length>5?'Usa la rueda del mouse o desliza para ver más artículos de esta orden.':'';
    $$('[data-row-qty]',m).forEach(inp=>{ inp.oninput=()=>{ lineItems[+inp.dataset.rowQty].cantidad_pedida=+inp.value||0; calc(); const i=+inp.dataset.rowQty; const sub=$(`[data-row-sub="${i}"]`,m); if(sub) sub.textContent=money(lineItems[i].subtotal||0); }; inp.onchange=()=>{ const i=+inp.dataset.rowQty; const item=lineItems[i]; const val=+inp.value||0; if(!validateFractionQty(item,val)){ inp.classList.add('input-error'); inp.value=Math.max(1,Math.round(val||1)); item.cantidad_pedida=+inp.value; alert(noFractionMessage(item.producto_nombre)); } else inp.classList.remove('input-error'); calc(); const sub=$(`[data-row-sub="${i}"]`,m); if(sub) sub.textContent=money(item.subtotal||0); }; });
    $$('[data-row-price]',m).forEach(inp=>inp.oninput=()=>{ lineItems[+inp.dataset.rowPrice].precio=+inp.value||0; calc(); const i=+inp.dataset.rowPrice; const sub=$(`[data-row-sub="${i}"]`,m); if(sub) sub.textContent=money(lineItems[i].subtotal||0); });
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
  const suggest=$('#newItemSuggest',m), nameInp=$('#newItemName',m), qtyInp=$('#newItemQty',m), unitInp=$('#newItemUnit',m), priceInp=$('#newItemPrice',m), addBtn=$('#addStagedItem',m), manualBtn=$('#addManualItem',m);
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
  priceInp.onkeydown=(e)=>{ if(e.key==='Enter'){ e.preventDefault(); addBtn.click(); } };
  addBtn.onkeydown=(e)=>{ if(e.key==='Enter'){ e.preventDefault(); addBtn.click(); } };
  manualBtn.onkeydown=(e)=>{ if(e.key==='Enter'){ e.preventDefault(); manualBtn.click(); } };
  $('#clearStage',m).onclick=()=>{ resetStage(); focusSelect(nameInp); };
  const addFromStage=(manualMode=false)=>{ const nombre=String($('#newItemName',m).value||'').trim(); if(!nombre) return alert('Escribe o selecciona un producto.'); const qty=+qtyInp.value||0; if(qty<=0) return alert('La cantidad debe ser mayor que cero.'); const catalogProduct=staged.producto_id?state.productos.find(p=>String(p.id)===String(staged.producto_id)):null; if(catalogProduct && catalogProduct.activo===false) return alert('Este producto está inactivo. Actívalo o selecciona otro producto.'); if(catalogProduct){ const issues=productConfigIssues(catalogProduct); if(issues.length && !confirm('Este producto tiene configuración por revisar:\n- '+issues.join('\n- ')+'\n\nPuedes agregarlo, pero podría afectar el peso calculado o el despacho. ¿Continuar?')) return; } const fixedUnit=catalogProduct?(catalogProduct.unidad||'lb'):'lb'; const snap=manualMode||!staged.producto_id?{tipo_despacho_peso:'Por libra',requiere_pesaje:true,peso_estandar_lb:null,tolerancia_lb:0.25,suma_peso_final:true,permite_fraccion:true}:productWeightSnapshot(staged.producto_id); const item={producto_id:manualMode?null:(staged.producto_id?+staged.producto_id:null),producto_nombre:nombre,cantidad_pedida:qty,unidad:fixedUnit,precio:+priceInp.value||0,subtotal:0,notas:manualMode||!staged.producto_id?'Producto no listado · unidad asumida lb':null,...snap}; if(!validateFractionQty(item,qty)) return alert(noFractionMessage(nombre)); lineItems.push(item); resetStage(); drawItems({scrollEnd:true}); focusSelect(nameInp); };
  addBtn.onclick=()=>addFromStage(false);
  manualBtn.onclick=()=>addFromStage(true);
  drawItems(); focusSelect(nameInp);
  const orderDraftKey=draftKey(o?'orden_editar':'orden', o?.id || extra.fromCallId || client?.id || 'nueva');
  attachOrderDraft(m, orderDraftKey, ()=>({
    clientText:$('#ordClientText',m)?.value||'', clientId:$('#ordClientId',m)?.value||'', fechaDespacho:$('#ordFechaDespacho',m)?.value||today(), horaDespacho:$('#ordHoraDespacho',m)?.value||'', prioridad:$('#ordPrioridad',m)?.value||'Normal', total:$('#ordTotal',m)?.value||0, factura:$('#ordFactura',m)?.value||'', delivery:$('#ordDelivery',m)?.value||'', deliveryManual:$('#ordDeliveryManual',m)?.value||'', notaProgramacion:$('#ordNotaProgramacion',m)?.value||'', notas:$('#ordNotas',m)?.value||'', lineItems:lineItems, stage:{name:$('#newItemName',m)?.value||'',pid:$('#newItemPid',m)?.value||'',qty:$('#newItemQty',m)?.value||1,unit:$('#newItemUnit',m)?.value||'lb',price:$('#newItemPrice',m)?.value||0}
  }), data=>{
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
    if(data.stage){ $('#newItemName',m).value=data.stage.name||''; $('#newItemPid',m).value=data.stage.pid||''; $('#newItemQty',m).value=data.stage.qty||1; $('#newItemUnit',m).value=data.stage.unit||'lb'; const uDisp=$('#newItemUnitDisplay',m); if(uDisp) uDisp.textContent=data.stage.unit||'lb'; $('#newItemPrice',m).value=data.stage.price||0; }
    syncScheduleUi();
  });
  $('#saveOrder',m).onclick=async()=>{
    const cid=$('#ordClientId',m).value; if(!cid) return alert('Selecciona un cliente.');
    for(const it of lineItems){ if(!validateFractionQty(it,+it.cantidad_pedida||0)) return alert(noFractionMessage(it.producto_nombre)); }
    const clean=lineItems.map(it=>{ const snap=it.producto_id?productWeightSnapshot(it.producto_id):{tipo_despacho_peso:it.tipo_despacho_peso||(String(it.unidad||'lb').toLowerCase()==='lb'?'Por libra':'Unidad peso variable'),requiere_pesaje:true,peso_estandar_lb:it.peso_estandar_lb||null,tolerancia_lb:it.tolerancia_lb||0.25,suma_peso_final:it.suma_peso_final!==false,permite_fraccion:it.permite_fraccion!==false}; const base={producto_id:it.producto_id?+it.producto_id:null,producto_nombre:String(it.producto_nombre||'').trim(),cantidad_pedida:+it.cantidad_pedida||0,unidad:String(it.unidad||'lb').trim(),precio:+it.precio||0,subtotal:(+it.cantidad_pedida||0)*(+it.precio||0),notas:it.producto_id?null:'Producto no listado',...snap}; if(base.tipo_despacho_peso==='Unidad peso fijo') base.peso_equivalente_solicitado=Number(((base.cantidad_pedida||0)*(base.peso_estandar_lb||0)).toFixed(3)); else if(base.tipo_despacho_peso==='Por libra') base.peso_equivalente_solicitado=Number((base.cantidad_pedida||0).toFixed(3)); else base.peso_equivalente_solicitado=null; return base; }).filter(it=>it.producto_nombre && it.cantidad_pedida>0);
    if(!clean.length) return alert('Agrega al menos un producto al pedido.');
    const cl=state.clientes.find(x=>x.id==cid);
    let deliveryVal=''; const d=$('#ordDelivery',m); if(d){deliveryVal=d.value==='__manual__'?($('#ordDeliveryManual',m)?.value||''):d.value;} else deliveryVal=$('#ordDelivery',m)?.value||'';
    const total=clean.reduce((s,it)=>s+(+it.subtotal||0),0);
    const fechaDespacho=$('#ordFechaDespacho',m).value||today();
    const estadoManual=$('#ordEstado',m)?.value||'';
    const estadoFinal=o ? (estadoManual || o.estado || initialOrderStateByDispatch(fechaDespacho)) : initialOrderStateByDispatch(fechaDespacho);
    const row={cliente_id:+cid,fecha:o?.fecha||today(),fecha_despacho:fechaDespacho,hora_despacho:$('#ordHoraDespacho',m).value||null,es_programada:fechaDespacho>today(),nota_programacion:$('#ordNotaProgramacion',m).value||null,programada_por:(fechaDespacho>today()?state.user.id:(o?.programada_por||null)),fecha_programacion:(fechaDespacho>today()?(o?.fecha_programacion||new Date().toISOString()):o?.fecha_programacion||null),prioridad:$('#ordPrioridad',m).value||'Normal',tipo_orden:$('#ordTipoOrden',m)?.value||o?.tipo_orden||'Pedido normal',requiere_preparacion:orderTypeRule($('#ordTipoOrden',m)?.value||o?.tipo_orden||'Pedido normal').prep,requiere_facturacion:orderTypeRule($('#ordTipoOrden',m)?.value||o?.tipo_orden||'Pedido normal').invoice,requiere_delivery:orderTypeRule($('#ordTipoOrden',m)?.value||o?.tipo_orden||'Pedido normal').delivery,canal:o?.canal||'Manual',vendedor:cl?.vendedor||state.profile.vendedor,estado:estadoFinal,condicion_pago:o?.condicion_pago||'Crédito',total_estimado:total,total_factura:+$('#ordTotal',m).value||total,factura_no:$('#ordFactura',m).value||null,delivery_nombre:deliveryVal||null,zona:cl?.sector||null,notas:$('#ordNotas',m).value||null};
    let orderId=o?.id, orderCode=o?.codigo||'';
    if(o){
      const r=await sb.from('ordenes').update(row).eq('id',o.id);
      if(r.error) return alert(r.error.message);
      await sb.from('orden_detalle').delete().eq('orden_id',o.id);
    } else if(extra.fromCallId){
      // Al guardar una llamada como “Pidió”, Supabase puede crear una orden automática por trigger.
      // Para evitar duplicados, reutilizamos esa orden y solo completamos sus productos/datos.
      const existing=await sb.from('ordenes').select('id,codigo').eq('llamada_id',extra.fromCallId).maybeSingle();
      if(existing.error) return alert(existing.error.message);
      if(existing.data){
        orderId=existing.data.id;
        orderCode=existing.data.codigo||('ORD-'+orderId);
        const r=await sb.from('ordenes').update(row).eq('id',orderId);
        if(r.error) return alert(r.error.message);
        await sb.from('orden_detalle').delete().eq('orden_id',orderId);
      }else{
        const r=await sb.from('ordenes').insert({...row,llamada_id:extra.fromCallId}).select('id,codigo').single();
        if(r.error) return alert(r.error.message);
        orderId=r.data.id;
        orderCode=r.data.codigo||('ORD-'+orderId);
      }
    } else {
      const r=await sb.from('ordenes').insert(row).select('id,codigo').single();
      if(r.error) return alert(r.error.message);
      orderId=r.data.id;
      orderCode=r.data.codigo||('ORD-'+orderId);
    }
    const detailRows=clean.map(it=>({...it,orden_id:orderId}));
    const det=await sb.from('orden_detalle').insert(detailRows); if(det.error) return alert(det.error.message);
    clearDraftLocal(orderDraftKey);
    if(extra.fromCallId){
      const baseObs=String(extra.initialNotas||'').trim();
      const linkNote=`Orden ${orderCode||('ORD-'+orderId)} creada desde esta gestión. Total: ${money(total)}.`;
      await sb.from('llamadas').update({resultado:'Pidió',monto:total,observacion:baseObs?baseObs+'\n\n'+linkNote:linkNote}).eq('id',extra.fromCallId);
    }
    m.remove(); await loadAll(); render(); toast(extra.fromCallId?'Gestión y orden guardadas correctamente':'Orden guardada con '+clean.length+' producto(s)');
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
  return `<div class="client-card op-card ${cls} ${orderTypeClass(o)} ${newOrderClass(o,currentModuleOfOrder(o)||'ordenes')}" data-oper-order="${o.id}" style="grid-template-columns:1fr auto;cursor:pointer"><div><div class="client-title">${esc(o.codigo||('ORD-'+o.id))} · ${esc(o.cliente?.negocio||'Cliente')}</div><div class="client-sub">Creada: ${shortDate(o.fecha)} · Despacho: ${shortDate(dispatchDateOf(o))}${o.hora_despacho?' '+esc(String(o.hora_despacho).slice(0,5)):''} · ${esc(o.vendedor||'')} ${o.delivery_nombre?'· Delivery: '+esc(o.delivery_nombre):''}</div><div class="order-status-line">${newOrderBadge(o,currentModuleOfOrder(o)||'ordenes')}${orderTypeBadge(o)}${specialCaseBadge(o)}${orderStatusBadgeHtml(o)}${orderTakenByBadge(o)}${scheduleBadge(o)}${totalOrderClockBadge(o)}${currentStageClockBadge(o)}<span class="badge">${money(o.total_factura||o.total_estimado)}</span>${o.prioridad&&o.prioridad!=='Normal'?`<span class="badge bad">${esc(o.prioridad)}</span>`:''}${o.factura_no?`<span class="badge ok">Factura ${esc(o.factura_no)}</span>`:''}${prep?`<span class="badge warn">Peso prep. ${Number(prep.libras||0)} lb</span>`:''}${final?`<span class="badge ok">Peso final ${Number(final.libras||0)} lb</span>`:''}<span class="badge">${items.length} producto(s)</span></div>${o.nota_programacion?`<div class="hint"><b>Programación:</b> ${esc(o.nota_programacion)}</div>`:''}${items.length?`<div class="mini-items"><b>Detalle:</b> ${orderItemsText(o,6)}</div>`:''}</div><div class="card-actions"><button class="btn small gray" data-oper-order="${o.id}">Ver</button>${o.estado==='Anulado'?'':`${isSpecialOrder(o)?`<button class="btn small" data-special-case="${o.id}">Gestionar caso</button>`:''}${canEditOrderGeneral(o)?`<button class="btn small gray" data-edit-order="${o.id}">Editar</button>`:''}${canDeleteOrder(o)?`<button class="btn small danger" data-cancel-order="${o.id}">${orderHasProgress(o)?'Anular':'Eliminar'}</button>`:''}`}</div></div>`;
}
function renderOperPanel(c, title, desc, orders, empty, buttonsFn, searchKey=''){
  const q=searchKey ? (state[searchKey]||'') : '';
  const rows=q ? orders.filter(o=>matchOrder(o,q)) : orders;
  const inputId=searchKey ? 'search_'+searchKey : '';
  c.innerHTML=`<div class="panel"><div class="panel-head"><div><h3>${title}</h3><p>${desc}</p></div><span class="badge info">${rows.length} de ${orders.length} orden(es)</span></div>${searchKey?`<div class="searchbar"><input id="${inputId}" value="${esc(q)}" placeholder="Buscar nombre del cliente..."></div>`:''}<div class="list">${rows.map(o=>`<div class="client-card op-card ${orderTypeClass(o)} ${newOrderClass(o,moduleFromSearchKey(searchKey))}" style="grid-template-columns:1fr auto"><div><div class="client-title">${esc(o.codigo||('ORD-'+o.id))} · ${esc(o.cliente?.negocio||'Cliente')}</div><div class="client-sub">Creada: ${shortDate(o.fecha)} · Despacho: ${shortDate(dispatchDateOf(o))} · ${esc(o.cliente?.telefono||'')} · ${esc(o.cliente?.sector||'')}</div><div class="order-status-line">${newOrderBadge(o,moduleFromSearchKey(searchKey))}${orderTypeBadge(o)}${specialCaseBadge(o)}${orderStatusBadgeHtml(o)}${scheduleBadge(o)}${stageClockBadge(o,moduleFromSearchKey(searchKey))}<span class="badge">${money(o.total_factura||o.total_estimado)}</span>${o.factura_no?`<span class="badge ok">Factura ${esc(o.factura_no)}</span>`:''}${preparedByDisplay(o)?`<span class="badge warn">Prep. ${esc(preparedByDisplay(o))}</span>`:''}${o.delivery_nombre?`<span class="badge ok">${esc(o.delivery_nombre)}</span>`:''}</div><div class="mini-items">${orderItemsText(o,7)}</div></div><div class="card-actions">${buttonsFn(o)}</div></div>`).join('')||`<div class="empty">${empty}</div>`}</div></div>`;
  if(searchKey){
    const inp=$('#'+inputId);
    if(inp) inp.oninput=e=>{ const pos=e.target.selectionStart||e.target.value.length; state[searchKey]=e.target.value; render(); focusAfterRender(inputId,pos); };
  }
  bindDynamic();
}
function renderCarniceria(c){
  const tabs=[['libres','Libres'],['preparacion','En preparación'],['mias','Mis pedidos'],['listas','Listas'],['todas','Todas']];
  const allowed=tabs.map(x=>x[0]);
  const tab=allowed.includes(state.carniceriaTab) ? state.carniceriaTab : 'libres';
  state.carniceriaTab=tab;
  const all=state.ordenes.filter(o=>canShowInCarniceria(o));
  const myQueue=all.filter(o=>isActiveCarnOrder(o) && (isCurrentWorker(o.tomado_por) || isCurrentWorker(o.preparado_por) || isCurrentWorker(o.tomado_por_user)));
  let base=all;
  if(tab==='libres') base=all.filter(o=>['Pedido recibido','Programada'].includes(o.estado) && !o.tomado_por);
  if(tab==='preparacion') base=all.filter(o=>o.estado==='En preparación');
  if(tab==='mias') base=myQueue;
  if(tab==='listas') base=all.filter(o=>['Lista para facturar','Impresa para facturar'].includes(o.estado));
  const q=state.carniceriaSearch||'';
  const rows=q?base.filter(o=>matchOrder(o,q)):base;
  const queueWarn=myQueue.length>=3 ? '<span class="badge bad">Límite alcanzado</span>' : '<span class="badge ok">Disponible</span>';
  c.innerHTML=`<div class="panel"><div class="panel-head"><div><h3>Órdenes para carnicería</h3><p>Multi-despachador: inicia en <b>Libres</b>. Las órdenes tomadas siguen visibles, pero quedan bloqueadas para los demás.</p></div><span class="badge info">${rows.length} de ${base.length} orden(es)</span></div><div class="queue-box"><div><b>Mi cola de trabajo: ${myQueue.length}/3</b><div class="limit">Puedes tomar hasta 3 pedidos al mismo tiempo. Para tomar otro, marca uno como listo o usa “Soltar”.</div></div>${queueWarn}</div><div class="tabs">${tabs.map(([id,n])=>`<button class="tab ${tab===id?'active':''}" data-carn-tab="${id}">${n}</button>`).join('')}</div><div class="searchbar"><input id="search_carniceriaSearch" value="${esc(q)}" placeholder="Buscar nombre del cliente..."></div><div class="list">${rows.map(carniceriaCard).join('')||'<div class="empty">No hay órdenes en esta vista.</div>'}</div></div>`;
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
  return `<div class="client-card op-card ${cls} ${newOrderClass(o,'carniceria')}" style="grid-template-columns:1fr auto"><div><div class="client-title">${esc(o.codigo||('ORD-'+o.id))} · ${esc(o.cliente?.negocio||'Cliente')}</div><div class="client-sub">Creada: ${shortDate(o.fecha)} · Despacho: ${shortDate(dispatchDateOf(o))} · ${esc(o.cliente?.telefono||'')} · ${esc(o.cliente?.sector||'')}</div><div class="order-status-line">${newOrderBadge(o,'carniceria')}${orderTypeBadge(o)}<span class="badge info">${esc(o.estado||'')}</span>${scheduleBadge(o)}${createdClockBadge(o)}${stageClockBadge(o,'carniceria')}${lock}${ageBadge}<span class="badge">${money(o.total_factura||o.total_estimado)}</span>${preparedByDisplay(o)?`<span class="badge warn">Prep. ${esc(preparedByDisplay(o))}</span>`:''}</div><div class="mini-items">${orderItemsText(o,7)}</div></div><div class="card-actions">${buttons}</div></div>`;
}
function renderFacturacion(c){ const orders=state.ordenes.filter(o=>orderRequiresInvoice(o) && ['Lista para facturar','Impresa para facturar'].includes(o.estado)); renderOperPanel(c,'Órdenes listas para facturar','Imprime el volante 80 mm, factura en tu sistema externo y registra la factura aquí.',orders,'No hay órdenes listas para facturación.',o=>`<button class="btn small dark" data-print-order="${o.id}">Imprimir 80mm</button><button class="btn small" data-invoice-order="${o.id}">Marcar facturada</button><button class="btn small gray" data-oper-order="${o.id}">Ver</button>`,'facturacionSearch'); }

function validationReadyOrders(){
  return state.ordenes.filter(o=>['Facturada','Validada para delivery'].includes(o.estado) || (!orderRequiresPrep(o) && orderRequiresDelivery(o) && ['Pedido recibido','Validada para delivery'].includes(effectiveOrderState(o))));
}
function batchCodeFromOrder(o){
  const detalle=(state.entregaLoteDetalle||[]).find(d=>String(d.orden_id)===String(o?.id));
  if(detalle?.codigo_lote) return String(detalle.codigo_lote).toUpperCase();
  const txt=[o?.notas_validacion,o?.notas_liquidacion,o?.notas_estado,o?.notas].filter(Boolean).join(' | ');
  const m=String(txt||'').match(/Lote:\s*(LOT-[A-Z0-9-]+)/i);
  return m ? m[1].toUpperCase() : '';
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
  const d=String(dateStr).slice(0,10);
  return (!from || d>=from) && (!to || d<=to);
}
function orderPesoEsperado(o){ const r=validationWeightReference(o); return Number(r.value||0); }
function orderMonto(o){ return Number(o?.total_factura||o?.total_estimado||0); }
function batchSummaryFromOrders(items){
  const moneySum=deliveryMoneySummary(items);
  return {...moneySum,pesoEsperado:items.reduce((s,o)=>s+orderPesoEsperado(o),0),pesoEntregado:items.reduce((s,o)=>s+Number(o.peso_validado||0),0)};
}
function lotesFromReceivedOrders(deliveryName='', from='', to=''){
  const closedOrders=state.ordenes.filter(o=>o.recibido_en && (!deliveryName || o.delivery_nombre===deliveryName) && dateInRange(o.recibido_en,from,to));
  return liquidacionBatchGroups(closedOrders).map(g=>({
    source:'ordenes', codigo_lote:g.code, delivery_nombre:deliveryName||g.items[0]?.delivery_nombre||'', fecha_entrega:g.items[0]?.validado_en||g.items[0]?.asignado_delivery_en||'', fecha_liquidacion:g.items.reduce((mx,o)=>!mx||String(o.recibido_en)>String(mx)?o.recibido_en:mx,''), cantidad_ordenes:g.items.length,
    total_facturado:g.summary.total, efectivo_reportado:g.summary.cobrado, efectivo_recibido:g.summary.cobrado, credito_pendiente:g.summary.credito+g.summary.devuelto, no_entregado:g.summary.noEntregado, diferencia:0, estado:'Cerrado', items:g.items
  }));
}
function liquidationHistoryRows(deliveryName='', from='', to=''){
  const formal=(state.liquidacionesLotes||[]).filter(l=>(!deliveryName || l.delivery_nombre===deliveryName) && dateInRange(l.fecha_liquidacion||l.creado_en,from,to)).map(l=>({source:'formal',...l,items:ordersForBatch(l.codigo_lote)}));
  const formalCodes=new Set(formal.map(l=>String(l.codigo_lote||'').toUpperCase()));
  const fallback=lotesFromReceivedOrders(deliveryName,from,to).filter(l=>!formalCodes.has(String(l.codigo_lote||'').toUpperCase()));
  return [...formal,...fallback].sort((a,b)=>String(b.fecha_liquidacion||b.creado_en||'').localeCompare(String(a.fecha_liquidacion||a.creado_en||'')));
}
function ordersForBatch(code){ return state.ordenes.filter(o=>(batchCodeFromOrder(o)||'SIN-LOTE')===code); }
function batchDetailRowsForCode(code){ return (state.entregaLoteDetalle||[]).filter(d=>String(d.codigo_lote).toUpperCase()===String(code||'').toUpperCase()); }
async function saveFormalDeliveryBatch(lote, deliveryName, selected){
  const payload={codigo_lote:lote,delivery_nombre:deliveryName,fecha_entrega:new Date().toISOString(),cantidad_ordenes:selected.length,peso_esperado:selected.reduce((s,x)=>s+Number(x.expected||0),0),peso_entregado:selected.reduce((s,x)=>s+Number(x.peso||0),0),total_facturado:selected.reduce((s,x)=>s+Number(x.amount||0),0),estado:'Abierto',creado_por:state.user?.id||null};
  const {data,error}=await sb.from('entrega_lotes').insert(payload).select('*').single();
  if(error){ console.warn('No se guardó lote formal:',error.message); return null; }
  const loteId=data.id;
  const rows=selected.map(x=>({lote_id:loteId,codigo_lote:lote,orden_id:x.o.id,cliente_id:x.o.cliente_id||null,codigo_orden:x.o.codigo||null,factura_no:x.o.factura_no||null,monto_factura:Number(x.amount||0),peso_esperado:Number(x.expected||0),peso_entregado:Number(x.peso||0),estado_liquidacion:'Pendiente'}));
  if(rows.length){ const det=await sb.from('entrega_lote_detalle').insert(rows); if(det.error) console.warn('No se guardó detalle de lote:',det.error.message); }
  return data;
}
async function saveFormalLiquidationBatch(code, deliveryName, orders, recibo){
  const summary=deliveryMoneySummary(orders);
  const lot=batchRecordByCode(code);
  const payload={lote_id:lot?.id||null,codigo_lote:code,delivery_nombre:deliveryName,fecha_liquidacion:new Date().toISOString(),total_facturado:summary.total,efectivo_reportado:summary.cobrado,efectivo_recibido:Number(recibo.efectivo_recibido||0),credito_pendiente:summary.credito+summary.devuelto,no_entregado:summary.noEntregado,diferencia:Number(recibo.efectivo_recibido||0)-summary.cobrado,recibido_por:recibo.recibido_por||'',observacion:recibo.observacion||null,estado:'Cerrado',creado_por:state.user?.id||null};
  const {data,error}=await sb.from('liquidaciones_lotes').insert(payload).select('*').single();
  if(error){ console.warn('No se guardó liquidación formal:',error.message); return null; }
  const rows=orders.map(o=>({liquidacion_id:data.id,orden_id:o.id,cliente_id:o.cliente_id||null,codigo_orden:o.codigo||null,cliente_nombre:o.cliente?.negocio||null,factura_no:o.factura_no||null,resultado_entrega:o.resultado_entrega||o.estado||'',total_factura:orderMonto(o),monto_cobrado:Number(o.monto_cobrado||0),monto_credito:Number(o.monto_pendiente||0),monto_no_entregado:(o.resultado_entrega||o.estado)==='No entregado'?orderMonto(o):0,observacion:o.notas_liquidacion||null}));
  if(rows.length){ const det=await sb.from('liquidacion_lote_detalle').insert(rows); if(det.error) console.warn('No se guardó detalle de liquidación:',det.error.message); }
  if(lot?.id) await sb.from('entrega_lotes').update({estado:'Cerrado'}).eq('id',lot.id);
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
  const peso=draftWeight!==null ? draftWeight : (o.peso_validado||'');
  const amount=Number(o.total_factura||o.total_estimado||0);
  const disabledAttr=(req && checked)?'':'disabled';
  return `<div class="batch-row ${orderTypeClass(o)}" data-batch-row="${o.id}" data-amount="${amount}" data-expected="${Number(ref.value||0)}" data-reqpeso="${req?'1':'0'}">
    <div class="batch-check"><input type="checkbox" data-batch-check="${o.id}" ${checked?'checked':''} aria-label="Seleccionar ${esc(o.cliente?.negocio||'cliente')}"></div>
    <div class="batch-main"><b>${esc(o.cliente?.negocio||'Cliente')}</b><small>${esc(o.codigo||'')} · Factura ${esc(o.factura_no||'—')} · ${esc(o.cliente?.sector||'')} · ${money(amount)}</small><small>${orderTypeBadge(o)}${orderBatchBadge(o)}${stageClockBadge(o,'validacion')}</small></div>
    <div class="batch-num"><span>Esperado</span><b>${ref.value?Number(ref.value).toFixed(2)+' lb':(req?'—':'No pesa')}</b></div>
    <div class="batch-weight"><input type="number" step="0.01" data-batch-weight="${o.id}" value="${esc(peso)}" ${disabledAttr} placeholder="${req?'Peso entregado':'No pesa'}"></div>
    <div class="batch-status" data-batch-status="${o.id}">${validationRowStatusHtml(o,Number(peso||0))}</div>
    <div class="card-actions mini"><button class="btn small gray" data-oper-order="${o.id}">Ver</button>${(orderRequiresInvoice(o)&&['Facturada','Validada para delivery'].includes(o.estado))?`<button class="btn small warn" data-return-invoice="${o.id}">Reabrir</button>`:''}</div>
  </div>`;
}
function renderValidacion(c){
  const base=validationReadyOrders();
  const q=state.validacionSearch||'';
  const orders=base.filter(o=>matchOrder(o,q));
  const names=activeDeliveryNames();
  const draft=ensureValidationBatchDraft();
  const defaultDel=draft.deliveryValue||state.deliveryFiltro||'';
  const totalFact=orders.reduce((s,o)=>s+Number(o.total_factura||o.total_estimado||0),0);
  const totalPeso=orders.reduce((s,o)=>s+Number(validationWeightReference(o).value||0),0);
  c.innerHTML=`<div class="panel validation-batch-panel"><div class="panel-head"><div><h3>Validación por lote y entrega a delivery</h3><p>Selecciona un delivery, coteja los clientes que se lleva y registra el peso final por cada orden.</p></div><span class="badge info">${orders.length} orden(es)</span></div>
  <div class="grid4 compact-kpis"><div class="card kpi"><div class="label">Órdenes listas</div><div class="value">${orders.length}</div></div><div class="card kpi"><div class="label">Monto facturado</div><div class="value">${money(totalFact)}</div></div><div class="card kpi"><div class="label">Peso esperado</div><div class="value">${Number(totalPeso.toFixed(2))} lb</div></div><div class="card kpi"><div class="label">Seleccionadas</div><div class="value" id="batchCount">0</div></div></div>
  <div class="batch-toolbar"><div class="field"><label>Delivery que se llevará el lote</label><select id="batchDelivery"><option value="">Selecciona delivery</option>${names.map(n=>`<option ${n===defaultDel?'selected':''}>${esc(n)}</option>`).join('')}<option value="__manual__" ${defaultDel==='__manual__'?'selected':''}>Otro / manual</option></select><input id="batchDeliveryManual" value="${esc(draft.manual||'')}" placeholder="Nombre del delivery" style="display:${defaultDel==='__manual__'?'block':'none'};margin-top:8px"></div><div class="field"><label>Buscar cliente</label><input id="validacionSearch" value="${esc(q)}" placeholder="Buscar nombre del cliente..."></div><div class="batch-actions"><button class="btn gray" id="selectAllBatch">Seleccionar visibles</button><button class="btn gray" id="clearBatch">Limpiar</button><button class="btn dark" id="previewBatchRoute">Vista hoja de ruta</button><button class="btn" id="createDeliveryBatch">Crear lote y asignar</button></div></div>
  <div id="batchSummary" class="lock-alert ok">Selecciona las órdenes que se llevará el delivery. El peso se valida individualmente por cliente.</div>
  <div class="batch-table"><div class="batch-head"><span></span><span>Cliente / orden</span><span>Peso esperado</span><span>Peso entregado</span><span>Estado</span><span>Acciones</span></div>${orders.map(renderValidationBatchRow).join('')||'<div class="empty">No hay órdenes facturadas pendientes de entregar al delivery.</div>'}</div>
  <div class="section-title">Validación individual</div><div class="hint">También puedes validar una orden individual si no será enviada dentro de un lote.</div><div class="list compact-list">${orders.map(o=>`<div class="client-card op-card ${newOrderClass(o,'validacion')}" style="grid-template-columns:1fr auto"><div><div class="client-title">${esc(o.codigo||'')} · ${esc(o.cliente?.negocio||'Cliente')}</div><div class="client-sub">Factura ${esc(o.factura_no||'—')} · ${money(o.total_factura||o.total_estimado)} · Ref. peso: ${validationWeightReference(o).value||'—'} lb</div><div class="order-status-line">${newOrderBadge(o,'validacion')}${orderTypeBadge(o)}${specialCaseBadge(o)}${orderStatusBadgeHtml(o)}${stageClockBadge(o,'validacion')}${orderBatchBadge(o)}</div></div><div class="card-actions">${(orderRequiresInvoice(o)&&['Facturada','Validada para delivery'].includes(o.estado))?`<button class="btn small warn" data-return-invoice="${o.id}">Reabrir facturación</button>`:''}<button class="btn small" data-validate-order="${o.id}">Validar individual</button><button class="btn small gray" data-oper-order="${o.id}">Ver</button></div></div>`).join('')||''}</div></div>`;
  bindValidationBatch(c,orders);
  // V9.2.11: conecta las acciones generales de las órdenes dentro de Validación.
  // Sin este enlace, Ver, Reabrir facturación y Validar individual se mostraban, pero no respondían.
  bindDynamic();
}
function getBatchDelivery(container){
  const sel=$('#batchDelivery',container), man=$('#batchDeliveryManual',container);
  if(!sel) return '';
  return sel.value==='__manual__' ? String(man?.value||'').trim() : sel.value;
}
function selectedBatchRows(container,orders){
  return $$('[data-batch-row]',container).filter(row=>$('[data-batch-check]',row)?.checked).map(row=>{
    const id=row.dataset.batchRow;
    const o=orders.find(x=>String(x.id)===String(id));
    const peso=Number($('[data-batch-weight]',row)?.value||0);
    return {row,id,o,peso,req:row.dataset.reqpeso==='1',expected:Number(row.dataset.expected||0),amount:Number(row.dataset.amount||0)};
  }).filter(x=>x.o);
}
function updateBatchSummary(container,orders){
  const sel=selectedBatchRows(container,orders);
  const peso=sel.reduce((s,x)=>s+Number(x.peso||0),0);
  const expected=sel.reduce((s,x)=>s+Number(x.expected||0),0);
  const total=sel.reduce((s,x)=>s+Number(x.amount||0),0);
  const count=$('#batchCount',container); if(count) count.textContent=sel.length;
  const box=$('#batchSummary',container); if(box){ box.className='lock-alert '+(sel.length?'ok':''); box.innerHTML=sel.length?`<b>Lote en preparación:</b> ${sel.length} orden(es) · Peso esperado ${Number(expected.toFixed(2))} lb · Peso entregado ${Number(peso.toFixed(2))} lb · Total facturado ${money(total)}.`:'Selecciona las órdenes que se llevará el delivery. El peso se valida individualmente por cliente.'; }
}
function validateSelectedBatch(container,orders){
  const selected=selectedBatchRows(container,orders);
  const missing=[], blocked=[], warnings=[];
  selected.forEach(x=>{
    if(x.req && x.peso<=0) missing.push(x.o.codigo+' · '+(x.o.cliente?.negocio||'Cliente'));
    if(x.peso>0){
      const ch=validationWeightCheck(x.o,x.peso);
      if(ch.calc && ch.level==='block') blocked.push(`${x.o.codigo} · ${x.o.cliente?.negocio||'Cliente'} (${(ch.diff>0?'+':'')+ch.diff} lb)`);
      if(ch.calc && ch.level==='warn') warnings.push(`${x.o.codigo} · ${x.o.cliente?.negocio||'Cliente'} (${(ch.diff>0?'+':'')+ch.diff} lb)`);
    }
  });
  return {selected,missing,blocked,warnings};
}
function bindValidationBatch(container,orders){
  const delivery=$('#batchDelivery',container), manual=$('#batchDeliveryManual',container);
  if(delivery) delivery.onchange=()=>{ if(manual) manual.style.display=delivery.value==='__manual__'?'block':'none'; state.deliveryFiltro=getBatchDelivery(container)||state.deliveryFiltro; saveBatchDeliveryDraft(container); };
  if(manual) manual.oninput=()=>{ state.deliveryFiltro=getBatchDelivery(container)||state.deliveryFiltro; saveBatchDeliveryDraft(container); };
  $('#validacionSearch',container).oninput=e=>{ const pos=e.target.selectionStart||e.target.value.length; state.validacionSearch=e.target.value; renderValidacion($('#content')); focusAfterRender('validacionSearch',pos); };
  $$('[data-batch-check]',container).forEach(ch=>{
    ch.onchange=()=>{
      const row=ch.closest('[data-batch-row]'), inp=$('[data-batch-weight]',row);
      if(inp){ inp.disabled=!(ch.checked && row.dataset.reqpeso==='1'); if(ch.checked && row.dataset.reqpeso==='1') setTimeout(()=>{inp.focus();inp.select();},0); }
      saveBatchRowDraft(row);
      updateBatchSummary(container,orders);
    };
  });
  $$('[data-batch-weight]',container).forEach(inp=>{
    inp.oninput=()=>{ const row=inp.closest('[data-batch-row]'); const o=orders.find(x=>String(x.id)===String(row.dataset.batchRow)); const status=$('[data-batch-status]',row); if(status) status.innerHTML=validationRowStatusHtml(o,Number(inp.value||0)); saveBatchRowDraft(row); updateBatchSummary(container,orders); };
    inp.addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); const rows=$$('[data-batch-row]',container).filter(r=>$('[data-batch-check]',r)?.checked && r.dataset.reqpeso==='1'); const idx=rows.findIndex(r=>r===inp.closest('[data-batch-row]')); const next=rows[idx+1]; if(next){ const ni=$('[data-batch-weight]',next); if(ni){ni.focus();ni.select();} } else { $('#createDeliveryBatch',container)?.focus(); } } });
  });
  $('#selectAllBatch',container).onclick=()=>{ $$('[data-batch-check]',container).forEach(ch=>{ ch.checked=true; const row=ch.closest('[data-batch-row]'), inp=$('[data-batch-weight]',row); if(inp) inp.disabled=row.dataset.reqpeso!=='1'; saveBatchRowDraft(row); }); updateBatchSummary(container,orders); };
  $('#clearBatch',container).onclick=()=>{ $$('[data-batch-check]',container).forEach(ch=>{ ch.checked=false; const row=ch.closest('[data-batch-row]'), inp=$('[data-batch-weight]',row); if(inp){ inp.disabled=true; inp.value=''; } saveBatchRowDraft(row); const status=$('[data-batch-status]',row); const o=orders.find(x=>String(x.id)===String(row.dataset.batchRow)); if(status) status.innerHTML=validationRowStatusHtml(o,0); }); updateBatchSummary(container,orders); };
  $('#previewBatchRoute',container).onclick=()=>{ const val=validateSelectedBatch(container,orders); const del=getBatchDelivery(container)||'—'; if(!val.selected.length) return alert('Selecciona al menos una orden.'); printDeliveryBatchSheet(del,newBatchCode(),val.selected,false); };
  $('#createDeliveryBatch',container).onclick=async()=>{
    const del=getBatchDelivery(container);
    if(!del) return alert('Selecciona el delivery que se llevará el lote.');
    const val=validateSelectedBatch(container,orders);
    if(!val.selected.length) return alert('Selecciona al menos una orden para el lote.');
    if(val.missing.length) return alert('Faltan pesos finales en estas órdenes:\n- '+val.missing.join('\n- '));
    if(val.blocked.length) return alert('No se puede crear el lote. Hay diferencias de peso demasiado altas:\n- '+val.blocked.join('\n- '));
    if(val.warnings.length && !confirm('Hay diferencias de peso fuera de la tolerancia de aviso:\n- '+val.warnings.join('\n- ')+'\n\n¿Deseas continuar bajo responsabilidad?')) return;
    const lote=newBatchCode();
    await saveFormalDeliveryBatch(lote,del,val.selected);
    for(const x of val.selected){
      const o=x.o; let alerta='';
      if(x.peso>0){
        const ch=validationWeightCheck(o,x.peso);
        if(ch.calc && ch.level==='warn') alerta=validationWeightAlertText(o,x.peso);
        const ins=await sb.from('orden_pesos').insert({orden_id:o.id,tipo:'Entregado a delivery',libras:x.peso,notas:['Lote: '+lote,alerta].filter(Boolean).join(' | '),creado_por:state.user.id});
        if(ins.error) return alert(ins.error.message);
      }
      const notaBase=['Lote: '+lote, alerta].filter(Boolean).join(' | ');
      const old=o.estado;
      const {error}=await sb.from('ordenes').update({estado:'Asignada a delivery',validado_por:currentWorkerName(),peso_validado:x.peso||null,validado_en:new Date().toISOString(),delivery_nombre:del,asignado_delivery_en:new Date().toISOString(),notas_validacion:notaBase}).eq('id',o.id);
      if(error) return alert(error.message);
      await logOrderState(o,old,'Asignada a delivery',`Lote ${lote} asignado a ${del}. Peso final: ${x.peso||'No aplica'} lb`);
    }
    printDeliveryBatchSheet(del,lote,val.selected,true);
    clearValidationBatchDraft();
    await loadAll(); render(); toast(`Lote ${lote} creado para ${del}`);
  };
  updateBatchSummary(container,orders);
}
function printDeliveryBatchSheet(deliveryName,lote,items,auto=true){
  const rows=items.map(x=>`<tr><td>${esc(x.o.codigo||'')}</td><td>${esc(x.o.cliente?.negocio||'')}</td><td>${esc(x.o.cliente?.telefono||'')}</td><td>${esc(x.o.cliente?.sector||'')}</td><td>${esc(x.o.factura_no||'—')}</td><td>${money(x.amount)}</td><td>${x.expected?Number(x.expected).toFixed(2)+' lb':'No pesa'}</td><td>${x.peso?Number(x.peso).toFixed(2)+' lb':'—'}</td><td></td></tr>`).join('');
  const total=items.reduce((s,x)=>s+x.amount,0), exp=items.reduce((s,x)=>s+x.expected,0), pes=items.reduce((s,x)=>s+Number(x.peso||0),0);
  const html=`<!doctype html><html><head><meta charset="utf-8"><title>Hoja de ruta ${esc(lote)}</title><style>body{font-family:Arial,sans-serif;color:#111;padding:20px;font-size:12px}h1{font-size:22px;margin:0 0 6px}table{width:100%;border-collapse:collapse;margin-top:12px}th,td{border:1px solid #d1d5db;padding:6px;text-align:left}th{background:#f3f4f6}.tot{font-weight:bold;background:#f8fafc}.sign{display:inline-block;width:240px;border-top:1px solid #000;margin-top:36px;margin-right:40px;padding-top:4px}@media print{button{display:none}}</style></head><body>${printCompanyHeader(appCfg('recibos.tituloRuta','Hoja de ruta / lote de entrega'),'Lote de entrega al delivery')}<p><b>Lote:</b> ${esc(lote)}<br><b>Delivery:</b> ${esc(deliveryName||'—')}<br><b>Fecha:</b> ${new Date().toLocaleString('es-DO')}</p><p><b>Órdenes:</b> ${items.length} · <b>Total facturado:</b> ${money(total)} · <b>Peso esperado:</b> ${Number(exp.toFixed(2))} lb · <b>Peso entregado:</b> ${Number(pes.toFixed(2))} lb</p><table><thead><tr><th>Orden</th><th>Cliente</th><th>Teléfono</th><th>Sector</th><th>Factura</th><th>Monto</th><th>Peso esperado</th><th>Peso entregado</th><th>Firma/nota cliente</th></tr></thead><tbody>${rows}<tr class="tot"><td colspan="5">Totales</td><td>${money(total)}</td><td>${Number(exp.toFixed(2))} lb</td><td>${Number(pes.toFixed(2))} lb</td><td></td></tr></tbody></table>${signatureHtml(appCfg('recibos.firmaValidacion','Entregado por validación'))}${signatureHtml(appCfg('recibos.firmaDelivery','Recibido por delivery'))}${printFooterHtml()}<button onclick="window.print()">Imprimir</button>${auto?'<script>setTimeout(()=>window.print(),500)<\/script>':''}</body></html>`;
  const w=window.open('','_blank','width=1000,height=720'); if(!w) return alert('El navegador bloqueó la impresión. Permite ventanas emergentes.'); w.document.open(); w.document.write(html); w.document.close();
}

function activeDeliveryNames(){ return deliveryEmployeeNames(); }
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
function pendingLiquidationOrders(deliveryName){
  return state.ordenes.filter(o=>{
    if(o.estado==='Anulado' || o.estado==='Cerrado') return false;
    if(deliveryName && o.delivery_nombre!==deliveryName) return false;
    if(o.recibido_en) return false;
    return deliveryPendingStates().includes(o.estado);
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
  if(o.estado==='Asignada a delivery' || o.estado==='Validada para delivery') return `<button class="btn small" data-route-order="${o.id}">Marcar en ruta</button><button class="btn small gray" data-oper-order="${o.id}">Ver</button>`;
  if(o.estado==='En ruta') return `<button class="btn small green" data-delivery-result="${o.id}" data-result="Cobrado">Cobrado</button><button class="btn small gray" data-delivery-result="${o.id}" data-result="Entregado a crédito">Crédito</button><button class="btn small warn" data-delivery-result="${o.id}" data-result="Devuelto parcial">Dev. parcial</button><button class="btn small danger" data-delivery-result="${o.id}" data-result="No entregado">No entregado</button><button class="btn small gray" data-oper-order="${o.id}">Ver</button>`;
  return `<button class="btn small gray" data-delivery-result="${o.id}" data-result="${esc(o.resultado_entrega||o.estado||'Cobrado')}">Editar resultado</button><button class="btn small gray" data-oper-order="${o.id}">Ver</button>`;
}
function renderDelivery(c){
  const names=activeDeliveryNames();
  const filter=selectedDeliveryFilter();
  if(!state.deliveryFiltro&&filter) state.deliveryFiltro=filter;
  const canSelect=deliveryCanSelect();
  const base=state.ordenes.filter(o=>o.delivery_nombre===filter && ['Asignada a delivery','En ruta','Validada para delivery','Cobrado','Entregado a crédito','No entregado','Devuelto parcial'].includes(o.estado) && !o.recibido_en);
  const q=state.deliverySearch||''; const orders=base.filter(o=>matchOrder(o,q));
  const summary=deliveryMoneySummary(base);
  const historyHtml=(isAdminRole()||puede('liquidacion'))?deliveryAdminHistoryHtml(filter):'';
  c.innerHTML=`<div class="panel"><div class="panel-head"><div><h3>Pedidos asignados por delivery</h3><p>${orders.length} de ${base.length} pedidos activos. Cuando se liquida, pasa al historial administrativo.</p></div>${canSelect?`<select id="deliveryFiltro" style="max-width:280px"><option value="">Selecciona delivery</option>${names.map(n=>`<option ${n===filter?'selected':''}>${esc(n)}</option>`).join('')}</select>`:`<div class="badge info">${esc(filter||'Tu usuario')}</div>`}</div><div class="grid4 compact-kpis"><div class="card kpi"><div class="label">Pedidos activos</div><div class="value">${base.length}</div></div><div class="card kpi"><div class="label">Total facturas</div><div class="value">${money(summary.total)}</div></div><div class="card kpi"><div class="label">Reportados</div><div class="value">${base.filter(isFinalDeliveryResult).length}</div></div><div class="card kpi"><div class="label">Pendientes</div><div class="value">${summary.pendientes}</div></div></div><div class="searchbar"><input id="deliverySearch" value="${esc(q)}" placeholder="Buscar nombre del cliente..."></div><div class="list">${orders.map(o=>`<div class="client-card op-card ruta ${newOrderClass(o,'delivery')}" style="grid-template-columns:1fr auto"><div><div class="client-title">${esc(o.cliente?.negocio||'Cliente')}</div><div class="client-sub">${esc(o.cliente?.telefono||'')} · ${esc(o.cliente?.sector||'')} · ${money(o.total_factura||o.total_estimado)}</div><div class="badges">${newOrderBadge(o,'delivery')}<span class="badge info">${esc(o.estado)}</span>${deliveryStatusBadge(o)}${orderBatchBadge(o)}${stageClockBadge(o,'delivery')}<span class="badge">${esc(o.codigo)}</span>${o.monto_cobrado?`<span class="badge ok">Efectivo CXC ${money(o.monto_cobrado)}</span>`:''}</div><div class="mini-items">${orderItemsText(o,8)}</div></div><div class="card-actions">${deliveryActionButtons(o)}</div></div>`).join('')||'<div class="empty">No hay pedidos activos asignados a este delivery con esa búsqueda.</div>'}</div>${historyHtml}</div>`;
  const sel=$('#deliveryFiltro'); if(sel) sel.onchange=e=>{state.deliveryFiltro=e.target.value; renderDelivery($('#content'));};
  $('#deliverySearch').oninput=e=>{ const pos=e.target.selectionStart||e.target.value.length; state.deliverySearch=e.target.value; renderDelivery($('#content')); focusAfterRender('deliverySearch',pos); };
  const f1=$('#deliveryHistoryFrom'); if(f1) f1.onchange=e=>{state.deliveryHistoryFrom=e.target.value||today(); renderDelivery($('#content'));};
  const f2=$('#deliveryHistoryTo'); if(f2) f2.onchange=e=>{state.deliveryHistoryTo=e.target.value||today(); renderDelivery($('#content'));};
  $$('[data-delivery-history-print]').forEach(b=>b.onclick=()=>{ const rows=liquidationHistoryRows(filter,state.deliveryHistoryFrom,state.deliveryHistoryTo); printHistorySummary(filter,rows); });
  bindDynamic();
}
function deliveryAdminHistoryHtml(filter){
  const from=state.deliveryHistoryFrom||today(), to=state.deliveryHistoryTo||today();
  const rows=liquidationHistoryRows(filter,from,to);
  const summary=rows.reduce((a,l)=>({viajes:a.viajes+1,pedidos:a.pedidos+Number(l.cantidad_ordenes||historyLotItems(l).length),fact:a.fact+Number(l.total_facturado||0),cash:a.cash+Number(l.efectivo_recibido||l.efectivo_reportado||0),cred:a.cred+Number(l.credito_pendiente||0)}),{viajes:0,pedidos:0,fact:0,cash:0,cred:0});
  return `<div class="section-title">Historial administrativo del delivery</div><div class="lock-alert ok"><b>Solo administrativo:</b> aquí no se pierden los viajes liquidados. Puedes revisar por fecha qué clientes y facturas llevó este delivery.</div><div class="batch-toolbar"><div class="field"><label>Desde</label><input type="date" id="deliveryHistoryFrom" value="${esc(from)}"></div><div class="field"><label>Hasta</label><input type="date" id="deliveryHistoryTo" value="${esc(to)}"></div><div class="batch-actions"><button class="btn gray" data-delivery-history-print="1">Imprimir historial</button></div></div><div class="grid4 compact-kpis"><div class="card kpi"><div class="label">Viajes</div><div class="value">${summary.viajes}</div></div><div class="card kpi"><div class="label">Pedidos</div><div class="value">${summary.pedidos}</div></div><div class="card kpi"><div class="label">Facturado</div><div class="value">${money(summary.fact)}</div></div><div class="card kpi"><div class="label">Efectivo</div><div class="value">${money(summary.cash)}</div></div></div><div class="liq-batch-list">${rows.slice(0,20).map(liquidacionHistoryCard).join('')||'<div class="empty">No hay viajes liquidados para ese rango.</div>'}</div>`;
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

function liquidacionBatchCard(g){
  const faltan=g.items.filter(o=>!isFinalDeliveryResult(o));
  const title=g.code==='SIN-LOTE'?'Órdenes sin lote registrado':g.code;
  const lote=batchRecordByCode(g.code);
  const estadoLote=lote?.estado || (faltan.length?'Abierto':'Listo para cierre');
  const rows=g.items.map(o=>`<div class="liq-order-row ${newOrderClass(o,'liquidacion')}"><div><b>${esc(o.cliente?.negocio||'Cliente')}</b><small>${esc(o.codigo)} · ${money(o.total_factura||o.total_estimado)} · ${esc(o.cliente?.telefono||'')}</small><div class="badges">${newOrderBadge(o,'liquidacion')}${stageClockBadge(o,'liquidacion')}<span class="badge info">${esc(o.estado)}</span>${deliveryStatusBadge(o)}${o.monto_cobrado?`<span class="badge ok">A recibir ${money(o.monto_cobrado)}</span>`:''}${o.monto_pendiente?`<span class="badge warn">Crédito ${money(o.monto_pendiente)}</span>`:''}</div><div class="mini-items">${orderItemsText(o,5)}</div></div><div class="card-actions"><button class="btn small" data-liquidate-order="${o.id}">${isFinalDeliveryResult(o)?'Confirmar / recibir':'Recibir / cerrar'}</button><button class="btn small gray" data-oper-order="${o.id}">Ver</button></div></div>`).join('');
  return `<div class="liq-batch-card"><div class="liq-batch-head"><div><div class="client-title">${esc(title)}</div><div class="client-sub">${esc(g.date||'')} · ${g.items.length} orden(es) · Estado: ${esc(estadoLote)} · ${faltan.length?faltan.length+' pendiente(s)':'listo para recibir'}</div><div class="badges"><span class="badge info">Total ${money(g.summary.total)}</span><span class="badge ok">Efectivo ${money(g.summary.cobrado)}</span><span class="badge warn">Crédito ${money(g.summary.credito+g.summary.devuelto)}</span>${g.summary.noEntregado?`<span class="badge bad">No entregado ${money(g.summary.noEntregado)}</span>`:''}${faltan.length?`<span class="badge bad">Faltan ${faltan.length}</span>`:'<span class="badge ok">Ruta cuadrada</span>'}</div></div><div class="card-actions"><button class="btn small gray" data-print-liq-batch="${esc(g.code)}">Imprimir lote</button><button class="btn small gray" data-verify-liq-batch="${esc(g.code)}">Verificar</button><button class="btn small" data-close-liq-batch="${esc(g.code)}">Recibir lote / recibo</button></div></div><div class="liq-batch-body">${rows}</div></div>`;
}
function historyLotItems(l){
  if(l.items) return l.items;
  const detalle=(state.liquidacionLoteDetalle||[]).filter(d=>Number(d.liquidacion_id)===Number(l.id));
  if(detalle.length) return detalle.map(d=>({codigo:d.codigo_orden||d.orden_id, cliente:{negocio:d.cliente_nombre||''}, resultado_entrega:d.resultado_entrega, total_factura:d.total_factura, monto_cobrado:d.monto_cobrado, monto_pendiente:d.monto_credito, id:d.orden_id}));
  return ordersForBatch(l.codigo_lote);
}
function liquidacionHistoryCard(l){
  const items=historyLotItems(l);
  const code=l.codigo_lote||'SIN-LOTE';
  const rows=items.map(o=>`<div class="liq-order-row"><div><b>${esc(o.cliente?.negocio||o.cliente_nombre||'Cliente')}</b><small>${esc(o.codigo||o.codigo_orden||('ORD-'+(o.orden_id||o.id||'')))} · ${esc(o.resultado_entrega||o.estado||'')} · Total ${money(o.total_factura||o.total_estimado||0)}</small><div class="badges"><span class="badge ok">Cobrado ${money(o.monto_cobrado||0)}</span>${Number(o.monto_pendiente||o.monto_credito||0)?`<span class="badge warn">Crédito ${money(o.monto_pendiente||o.monto_credito||0)}</span>`:''}</div></div><div class="card-actions">${o.id?`<button class="btn small gray" data-oper-order="${o.id}">Ver</button>`:''}</div></div>`).join('');
  return `<div class="liq-batch-card closed"><div class="liq-batch-head"><div><div class="client-title">${esc(code)} · ${esc(l.delivery_nombre||'')}</div><div class="client-sub">Entregado: ${l.fecha_entrega?new Date(l.fecha_entrega).toLocaleString('es-DO'):'—'} · Liquidado: ${l.fecha_liquidacion?new Date(l.fecha_liquidacion).toLocaleString('es-DO'):'—'} · ${Number(l.cantidad_ordenes||items.length)} orden(es)</div><div class="badges"><span class="badge info">Facturas ${money(l.total_facturado||0)}</span><span class="badge ok">Efectivo ${money(l.efectivo_recibido||l.efectivo_reportado||0)}</span><span class="badge warn">Crédito ${money(l.credito_pendiente||0)}</span>${Number(l.no_entregado||0)?`<span class="badge bad">No entregado ${money(l.no_entregado)}</span>`:''}<span class="badge ${Math.abs(Number(l.diferencia||0))>0.01?'bad':'ok'}">Diferencia ${money(l.diferencia||0)}</span></div></div><div class="card-actions"><button class="btn small gray" data-print-history-lot="${esc(code)}">Reimprimir recibo</button></div></div><div class="liq-batch-body">${rows}</div></div>`;
}
function renderLiquidacionHistorial(c, filter){
  const names=activeDeliveryNames();
  const from=state.liqHistFrom||today(), to=state.liqHistTo||today();
  const rows=liquidationHistoryRows(filter,from,to).filter(l=>!state.liquidacionSearch || norm(l.codigo_lote).includes(norm(state.liquidacionSearch)) || norm(l.delivery_nombre).includes(norm(state.liquidacionSearch)) || (l.items||[]).some(o=>matchOrder(o,state.liquidacionSearch)));
  const total=rows.reduce((a,l)=>({fact:a.fact+Number(l.total_facturado||0),cash:a.cash+Number(l.efectivo_recibido||l.efectivo_reportado||0),cred:a.cred+Number(l.credito_pendiente||0),diff:a.diff+Number(l.diferencia||0)}),{fact:0,cash:0,cred:0,diff:0});
  c.innerHTML=`<div class="panel"><div class="panel-head"><div><h3>Historial de liquidaciones</h3><p>${rows.length} lote(s) cerrado(s). Consulta por delivery, fecha, lote, cliente o factura.</p></div>${deliveryCanSelect()?`<select id="liquidDelivery" style="max-width:280px"><option value="">Todos los deliverys</option>${names.map(n=>`<option ${n===filter?'selected':''}>${esc(n)}</option>`).join('')}</select>`:`<div class="badge info">${esc(filter||'Tu usuario')}</div>`}</div>
  <div class="tabs"><button class="tab" data-liqtab="pendientes">Pendientes</button><button class="tab active" data-liqtab="historial">Historial</button></div>
  <div class="grid4 compact-kpis"><div class="card kpi"><div class="label">Lotes cerrados</div><div class="value">${rows.length}</div></div><div class="card kpi"><div class="label">Total facturado</div><div class="value">${money(total.fact)}</div></div><div class="card kpi"><div class="label">Efectivo recibido</div><div class="value">${money(total.cash)}</div></div><div class="card kpi"><div class="label">Crédito</div><div class="value">${money(total.cred)}</div></div></div>
  <div class="batch-toolbar"><div class="field"><label>Desde</label><input type="date" id="liqHistFrom" value="${esc(from)}"></div><div class="field"><label>Hasta</label><input type="date" id="liqHistTo" value="${esc(to)}"></div><div class="field"><label>Buscar</label><input id="liquidacionSearch" value="${esc(state.liquidacionSearch||'')}" placeholder="Cliente, lote o factura..."></div><div class="batch-actions"><button class="btn gray" id="printHistorySummary">Imprimir historial</button></div></div>
  <div class="${state.liquidacionSchemaOk?'lock-alert ok':'lock-alert warn'}"><b>Historial permanente:</b> ${state.liquidacionSchemaOk?'guardado en tablas formales de lotes y liquidaciones.':'ejecuta el SQL V9.0.9 para guardar historial estructurado. Mientras tanto se muestra historial reconstruido desde órdenes recibidas.'}</div>
  <div class="liq-batch-list">${rows.map(liquidacionHistoryCard).join('')||'<div class="empty">No hay liquidaciones cerradas en ese rango.</div>'}</div></div>`;
  wireLiquidacionCommon(c, rows);
  $('#liqHistFrom').onchange=e=>{state.liqHistFrom=e.target.value||today(); renderLiquidacion($('#content'));};
  $('#liqHistTo').onchange=e=>{state.liqHistTo=e.target.value||today(); renderLiquidacion($('#content'));};
  $('#printHistorySummary').onclick=()=>printHistorySummary(filter,rows);
  $$('[data-print-history-lot]',c).forEach(b=>{ b.onclick=()=>{ const code=b.dataset.printHistoryLot; const l=rows.find(x=>String(x.codigo_lote)===String(code)); if(l) printLiquidationReceipt(l.delivery_nombre,code,historyLotItems(l),{efectivo_recibido:l.efectivo_recibido||l.efectivo_reportado,recibido_por:l.recibido_por||'',observacion:l.observacion||''},false); }; });
}
function wireLiquidacionCommon(c, rows){
  const sel=$('#liquidDelivery',c); if(sel) sel.onchange=e=>{state.deliveryFiltro=e.target.value; renderLiquidacion($('#content'));};
  const search=$('#liquidacionSearch',c); if(search) search.oninput=e=>{ const pos=e.target.selectionStart||e.target.value.length; state.liquidacionSearch=e.target.value; renderLiquidacion($('#content')); focusAfterRender('liquidacionSearch',pos); };
  $$('[data-liqtab]',c).forEach(b=>b.onclick=()=>{state.liquidacionTab=b.dataset.liqtab; renderLiquidacion($('#content'));});
  try{ bindDynamic(); }catch(err){ console.error('bindDynamic/liquidacion',err); }
}

function bindLiquidacionActionButtons(c, filter, orders, groups){
  const safe=(fn)=>async()=>{ try{ await fn(); }catch(err){ console.error(err); alert('No pude ejecutar esta acción de Liquidación: '+(err?.message||err)); } };
  const printBtn=$('#printLiqSummary',c);
  if(printBtn) printBtn.onclick=safe(()=>printLiquidationSummary(filter,orders));
  const closeRoute=$('#closeRouteBtn',c);
  if(closeRoute) closeRoute.onclick=safe(()=>verifyRouteClose(filter,orders));
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
      printLiquidationSummary((filter||'')+' · '+(code==='SIN-LOTE'?'Sin lote':code),g.items);
    });
  });
  $$('[data-verify-liq-batch]',c).forEach(b=>{
    b.onclick=safe(()=>{
      const code=b.dataset.verifyLiqBatch;
      const g=(groups||[]).find(x=>String(x.code)===String(code));
      if(!g) return alert('No encontré este lote. Actualiza la pantalla e intenta nuevamente.');
      verifyRouteClose((filter||'')+' · '+(code==='SIN-LOTE'?'Sin lote':code),g.items);
    });
  });
  $$('[data-close-liq-batch]',c).forEach(b=>{
    b.onclick=safe(()=>{
      const code=b.dataset.closeLiqBatch;
      const g=(groups||[]).find(x=>String(x.code)===String(code));
      if(!g) return alert('No encontré este lote. Actualiza la pantalla e intenta nuevamente.');
      openCloseBatchLiquidationModal(filter, g);
    });
  });
}
function renderLiquidacion(c){
  const names=activeDeliveryNames();
  const filter=(state.liquidacionTab==='historial' && deliveryCanSelect()) ? (state.deliveryFiltro||'') : selectedDeliveryFilter();
  if(state.liquidacionTab!=='historial' && !state.deliveryFiltro&&filter) state.deliveryFiltro=filter;
  if(state.liquidacionTab==='historial') return renderLiquidacionHistorial(c, filter);
  const canSelect=deliveryCanSelect();
  const base=pendingLiquidationOrders(filter);
  const q=state.liquidacionSearch||''; const orders=base.filter(o=>matchOrder(o,q) || norm(batchCodeFromOrder(o)).includes(norm(q)));
  const summary=deliveryMoneySummary(orders);
  const groups=liquidacionBatchGroups(orders);
  c.innerHTML=`<div class="panel"><div class="panel-head"><div><h3>Liquidación de delivery por lote/viaje</h3><p>${orders.length} de ${base.length} pedidos · cada viaje se recibe y se cierra como lote separado.</p></div>${canSelect?`<select id="liquidDelivery" style="max-width:280px"><option value="">Selecciona delivery</option>${names.map(n=>`<option ${n===filter?'selected':''}>${esc(n)}</option>`).join('')}</select>`:`<div class="badge info">${esc(filter||'Tu usuario')}</div>`}</div>
  <div class="tabs"><button class="tab active" data-liqtab="pendientes">Pendientes</button><button class="tab" data-liqtab="historial">Historial</button></div>
  <div class="searchbar"><input id="liquidacionSearch" value="${esc(q)}" placeholder="Buscar nombre del cliente, lote u orden..."></div>
  <div class="grid4 compact-kpis"><div class="card kpi"><div class="label">Lotes / viajes</div><div class="value">${groups.length}</div></div><div class="card kpi"><div class="label">Total facturas</div><div class="value">${money(summary.total)}</div></div><div class="card kpi"><div class="label">Efectivo a recibir</div><div class="value">${money(summary.cobrado)}</div></div><div class="card kpi"><div class="label">Crédito / pendiente</div><div class="value">${money(summary.credito+summary.devuelto)}</div></div></div>
  <div class="lock-alert ok"><b>Control por entrega:</b> cada lote representa un viaje físico al delivery. Puedes cerrar el lote completo cuando todos sus pedidos tengan resultado final.</div>
  <div class="actions" style="justify-content:flex-end;margin:10px 0"><button class="btn gray" id="printLiqSummary">Imprimir resumen general</button><button class="btn" id="closeRouteBtn">Verificar ruta completa</button></div>
  <div class="liq-batch-list">${groups.map(liquidacionBatchCard).join('')||'<div class="empty">No hay pedidos pendientes de liquidar con esa búsqueda.</div>'}</div></div>`;
  // Primero se enlazan las acciones críticas de caja/lote. Así no quedan sin evento si otra rutina genérica falla.
  bindLiquidacionActionButtons(c, filter, orders, groups);
  try{ wireLiquidacionCommon(c, groups); }catch(err){ console.error('wireLiquidacionCommon',err); }
  // Refuerzo final: garantiza que los botones rojos sigan activos después de cualquier enlace dinámico.
  bindLiquidacionActionButtons(c, filter, orders, groups);
}
async function logOrderState(order, oldState, newState, comentario=''){ try{ await sb.from('orden_estados_historial').insert({orden_id:order.id,estado_anterior:oldState||null,estado_nuevo:newState,comentario,usuario:state.user?.id}); }catch(e){ console.warn(e); } }
async function setOrderState(o, estado, extra={}){ if(!o) return; const old=o.estado; const comentario=extra.notas_estado||'Cambio desde sistema'; const clean={...extra}; delete clean.notas_estado; const {error}=await sb.from('ordenes').update({...clean,estado}).eq('id',o.id); if(error) return alert(error.message); await logOrderState(o,old,estado,comentario); await loadAll(); render(); toast('Orden actualizada: '+estado); }
function employeeOptions(area, selected=''){ return employeeOptionsForArea(area, selected, {fallbackAll:false, placeholder:'Selecciona'}); }
function employeeOptionsWithDefault(area, selected=''){ return employeeOptionsForArea(area, selected, {fallbackAll:false, placeholder:'Selecciona'}); }
function deliverySelect(selected=''){ const sel=String(selected||'').trim(); const names=deliveryEmployeeNames(); const canonical=canonicalEmployeeName(sel,'Delivery')||sel; return `<option value="">Sin asignar</option>${canonical&&!names.some(n=>norm(n)===norm(canonical))&&canonical!=='__manual__'?`<option selected>${esc(canonical)}</option>`:''}${names.map(n=>`<option ${norm(n)===norm(canonical)?'selected':''}>${esc(n)}</option>`).join('')}<option value="__manual__" ${sel==='__manual__'?'selected':''}>Otro / manual</option>`; }
function manualInput(id, placeholder='Nombre manual'){ return `<input id="${id}" placeholder="${placeholder}" style="margin-top:8px;display:none">`; }
function getSelectManual(m, selectId, manualId){ const s=$('#'+selectId,m), man=$('#'+manualId,m); return s.value==='__manual__' ? (man.value||'').trim() : s.value; }
function wireManual(m, selectId, manualId){ const s=$('#'+selectId,m), man=$('#'+manualId,m); if(!s||!man) return; s.onchange=()=>{man.style.display=s.value==='__manual__'?'block':'none';}; }
async function openTakeOrderModal(o){
  if(!o) return;
  await loadAll();
  o=state.ordenes.find(x=>String(x.id)===String(o.id))||o;
  if(o.tomado_por){
    if(!canEditCarniceriaOrder(o)) return alert(`Esta orden ya está siendo preparada por ${workerDisplayName(o.tomado_por)}${o.tomado_en?' desde '+new Date(o.tomado_en).toLocaleTimeString('es-DO',{hour:'2-digit',minute:'2-digit'}):''}. Puedes verla, pero no modificarla.`);
    return openPreparacionModal(o);
  }
  const nombreFijo=currentWorkerName();
  const currentCount=carnQueueCount(nombreFijo);
  if(currentCount>=3 && !isAdminRole()) return alert(`No puedes tomar más pedidos. Ya tienes ${currentCount}/3 pedidos en cola. Finaliza o suelta uno antes de tomar otro.`);
  const workerField=workerSelectHtml('Carnicería','takeBy','Despachador que toma el pedido',o.tomado_por||nombreFijo);
  const body=`<div class="form"><div class="client-card" style="grid-template-columns:1fr"><div><div class="client-title">${esc(o.codigo)} · ${esc(o.cliente?.negocio||'Cliente')}</div><div class="client-sub">${orderItemsText(o,10)}</div></div></div><div class="queue-box"><div><b>Tu cola actual: ${currentCount}/3</b><div class="limit">La regla evita que un despachador tome más de 3 pedidos a la vez.</div></div></div>${workerField}<div class="lock-alert ok">Al tomar el pedido quedará visible para todos, pero bloqueado como: <b>En preparación por tu usuario</b>.</div><button class="btn" id="confirmTake">Tomar pedido y preparar</button></div>`;
  const m=openModal('Tomar pedido',body,'Evita que otro despachador prepare la misma orden.');
  if(isAdminRole()) wireManual(m,'takeBy','takeByManual');
  $('#confirmTake',m).onclick=async()=>{
    const nombre=workerValueFromModal(m,'takeBy');
    if(!nombre) return alert('No pude identificar el usuario que toma el pedido. Revisa el nombre del perfil.');
    await loadAll();
    const fresh=state.ordenes.find(x=>String(x.id)===String(o.id));
    if(fresh?.tomado_por && !canEditCarniceriaOrder(fresh)) return alert(`Esta orden ya fue tomada por ${workerDisplayName(fresh.tomado_por)}. No se puede tomar de nuevo.`);
    const qCount=carnQueueCount(nombre);
    if(!fresh?.tomado_por && qCount>=3) return alert(`${nombre} ya tiene ${qCount}/3 pedidos en cola. Debe finalizar o soltar uno antes de tomar otro.`);
    const old=fresh?.estado||o.estado;
    const row={estado:'En preparación',tomado_por:nombre,tomado_en:new Date().toISOString(),tomado_por_user:state.user.id,preparado_por:null,preparado_en:null,liberado_por:null,liberado_en:null,motivo_liberacion:null};
    const {error}=await sb.from('ordenes').update(row).eq('id',o.id);
    if(error) return alert(error.message);
    await logOrderState(fresh||o,old,'En preparación',`Orden tomada por ${nombre}`);
    m.remove(); await loadAll(); render(); const updated=state.ordenes.find(x=>String(x.id)===String(o.id)); openPreparacionModal(updated);
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
    const {error}=await sb.from('ordenes').update({estado:'Pedido recibido',tomado_por:null,tomado_en:null,tomado_por_user:null,preparado_por:null,preparado_en:null,peso_preparado:null,paquetes_preparados:null,notas_preparacion:null,liberado_por:state.user.id,liberado_en:new Date().toISOString(),motivo_liberacion:motivo}).eq('id',o.id);
    if(error) return alert(error.message);
    await sb.from('orden_detalle').update({cantidad_preparada:null,estado_preparacion:'Pendiente',nota_preparacion:null}).eq('orden_id',o.id);
    await logOrderState(o,old,'Pedido recibido',`Pedido soltado/liberado. ${motivo}`);
    m.remove(); await loadAll(); render(); toast('Pedido liberado. Otro despachador puede tomarlo.');
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
  let diffInfo='';
  if(real>0 && total>0){ const chk=weightControlCheck(total,real); const cls=chk.level==='block'?'peso-bad':(chk.level==='warn'?'peso-warn':''); diffInfo=`<br><span class="${cls}">Peso real: <b>${chk.peso} lb</b> · Diferencia: <b>${chk.diff>0?'+':''}${chk.diff} lb</b> · Aviso: ${chk.aviso} lb · Máximo: ${chk.max} lb</span>`; }
  const box=$('#prepPesoResumen',m); if(box) box.innerHTML=`Peso preparado calculado: <b>${total} lb</b><br><span>Se suma por libra, por peso fijo de unidad o por peso real en productos de unidad variable. El peso real de balanza se escribe manualmente.</span>${diffInfo}`;
  $$('[data-detail-id]',m).forEach(row=>{
    const qty=Number($('[data-prepqty]',row)?.value||0);
    const tipo=row.dataset.tipoPeso||'Por libra', std=Number(row.dataset.pesoStd||0), pedido=Number(row.dataset.pedidoQty||0), tol=Number(row.dataset.tolerancia||0.25);
    const equiv=prepEquivalentFromRow(row,qty);
    const eqEl=$('[data-peso-equiv]',row); if(eqEl) eqEl.innerHTML=`${Number(equiv.toFixed(2))} lb`;
    const req=(row.dataset.sumaPeso==='false'||tipo==='No pesa')?0:(tipo==='Unidad peso fijo'?pedido*std:(tipo==='Unidad peso variable'?0:pedido));
    const help=$('.peso-help',row); if(help && req>0){ const diff=equiv-req; const cls=Math.abs(diff)>tol ? (diff>0?'peso-warn':'peso-bad') : ''; help.innerHTML=`${row.dataset.helpBase||''}${Math.abs(diff)>tol?` <span class="${cls}">Diferencia ${diff>0?'+':''}${Number(diff.toFixed(2))} lb</span>`:''}`; }
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

async function savePrepDetailRows(m){
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
    const payload={cantidad_preparada:qtyRaw===''&&estado==='Pendiente'?null:qty,estado_preparacion:estado,nota_preparacion:nota,peso_equivalente_preparado:Number(equiv.toFixed(3)),peso_equivalente_solicitado:Number(esperado.toFixed(3))};
    const {error}=await sb.from('orden_detalle').update(payload).eq('id',id);
    if(error) throw error;
  }
}
function prepRowsHtml(o, disabled=false){
  const opts=['Pendiente','Preparado','Parcial','Sin existencia','Sustituido'];
  const items=o.items||[];
  if(!items.length) return '<div class="empty">Esta orden no tiene artículos detallados.</div>';
  return `<div class="prep-detail-list"><div class="prep-head"><div>Producto</div><div>Solicitado</div><div>Preparado</div><div>Estado</div><div>Peso equiv.</div></div>${items.map(i=>{
    const st=i.estado_preparacion||'Pendiente';
    const no=prepStatusClass(st);
    const d=disabled?'disabled':'';
    const tipo=detailWeightType(i);
    const std=detailStdWeight(i);
    const suma=detailSumsWeight(i);
    const tol=detailTolerance(i);
    const prep=prepQty(i);
    const equiv=preparedWeightEquivalent(i,prep);
    const help=detailWeightHelp(i);
    const allowFrac=detailAllowsFraction(i);
    const rawNota=String(i.nota_preparacion||'');
    const subMatch=rawNota.match(/Sustituido por:\s*([^·]+)/i);
    const subSelected=subMatch?subMatch[1].trim():'';
    const subQty=substituteQtyFromNote(rawNota);
    return `<div class="prep-row ${no}" data-detail-id="${i.id}" data-tipo-peso="${esc(tipo)}" data-peso-std="${std}" data-suma-peso="${suma}" data-tolerancia="${tol}" data-pedido-qty="${Number(i.cantidad_pedida||0)}" data-permite-fraccion="${allowFrac}" data-help-base="${esc(help)}"><div><b class="prod-name">${esc(i.producto_nombre)}</b><small style="display:block;color:#64748b">${esc(tipo)} · ${esc(i.unidad||'')} · solicitado por el cliente</small>${allowFrac?'':'<small class="no-granel-note">No se despacha al granel</small>'}<small class="peso-help">${esc(help)}</small></div><div data-pedido="${Number(i.cantidad_pedida||0)}"><b>${Number(i.cantidad_pedida||0)}</b> ${esc(i.unidad||'')}</div><div><input ${d} data-prepqty type="number" step="${allowFrac?'0.01':'1'}" value="${prep===''?'':prep}" placeholder="Pendiente"><small style="display:block;color:#64748b;margin-top:4px;font-weight:800">${esc(prepInputLabel(i))}</small></div><div><select ${d} data-prepstate>${opts.map(x=>`<option ${x===st?'selected':''}>${x}</option>`).join('')}</select><div data-substitute-box class="prep-substitute" style="${st==='Sustituido'?'':'display:none'}"><select ${d} data-prepsub>${substituteProductOptions(subSelected)}</select><input ${d} data-prepsubqty type="number" step="0.01" value="${subQty===''?'':subQty}" placeholder="Cantidad sustituta"></div></div><div data-peso-equiv>${Number(equiv.toFixed(2))} lb</div></div>`;
  }).join('')}</div>`;
}

async function printPreparationTicket(o){
  if(!o) return;
  const now=new Date();
  const items=o.items||[];
  const lines=items.map(i=>{ const st=i.estado_preparacion||''; const qty=i.cantidad_preparada!==null&&i.cantidad_preparada!==undefined?i.cantidad_preparada:''; return `<tr><td>${esc(Number(i.cantidad_pedida||0))}</td><td>${esc(i.unidad||'')}</td><td>${esc(i.producto_nombre||'')}${st?`<br><span class="small">${esc(st)}${qty!==''?' · prep. '+esc(qty):''}</span>`:''}</td></tr>`; }).join('');
  const html=`<!doctype html><html><head><meta charset="utf-8"><title>${esc(o.codigo||'Preparación')}</title><style>@page{size:80mm auto;margin:3mm}body{width:74mm;margin:0;font-family:Arial,sans-serif;font-size:11px;color:#000}.center{text-align:center}.line{border-top:1px dashed #000;margin:6px 0}h2{font-size:15px;margin:0 0 3px}.small{font-size:10px}table{width:100%;border-collapse:collapse}td{vertical-align:top;padding:2px 0}.b{font-weight:bold}.sign{border-top:1px solid #000;margin-top:14px;padding-top:2px}@media print{button{display:none}}.lock-alert{background:#fff8e6;border:1px solid #fbbf24;color:#92400e;border-radius:16px;padding:12px 14px;font-size:13px;font-weight:800;line-height:1.35}.lock-alert.ok{background:#ecfdf5;border-color:#86efac;color:#047857}.lock-alert.bad{background:#fff1f2;border-color:#fecdd3;color:#991b1b}.queue-box{background:#fff;border:1px solid #e5e7eb;border-radius:18px;padding:12px 14px;display:flex;gap:10px;align-items:center;justify-content:space-between;box-shadow:0 8px 18px rgba(17,24,39,.05);margin:10px 0 14px}.queue-box b{font-size:16px}.queue-box .limit{font-size:12px;color:#64748b}.op-card.locked{background:#fffbeb;border-color:#fbbf24}.op-card.free{background:#fff}.op-card.done{background:#ecfdf5;border-color:#86efac}.btn.danger,.btn.danger:hover{background:#dc2626;color:white}.btn.outline{background:#fff;color:#111827;border:1px solid #d1d5db}.input-error{border-color:#ef4444!important;box-shadow:0 0 0 3px rgba(239,68,68,.14)!important}.no-granel-note{display:inline-block;margin-top:4px;color:#991b1b;font-weight:900;font-size:11px}
    .live-bar{background:#fff;border:1px solid var(--line);border-radius:18px;padding:12px 14px;margin:-6px 0 16px;display:flex;justify-content:space-between;align-items:center;gap:12px;box-shadow:var(--shadow2);flex-wrap:wrap}.live-left{display:flex;align-items:center;gap:9px;flex-wrap:wrap}.live-dot{width:10px;height:10px;border-radius:999px;background:#94a3b8;box-shadow:0 0 0 4px rgba(148,163,184,.15)}.live-dot.on{background:#10b981;box-shadow:0 0 0 4px rgba(16,185,129,.15)}.live-dot.warn{background:#f59e0b;box-shadow:0 0 0 4px rgba(245,158,11,.15)}.live-dot.bad{background:#ef4444;box-shadow:0 0 0 4px rgba(239,68,68,.15)}.live-title{font-weight:950}.live-sub{font-size:12px;color:var(--muted);font-weight:700}.live-notice{border:1px solid #bfdbfe;background:#eff6ff;border-radius:14px;padding:9px 11px;font-size:12px;color:#1e40af;font-weight:800}.live-notice b{display:block;color:#111827;margin-bottom:2px}.live-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
  </style></head><body><div class="center"><h2>PRODUCTOS CÉSAR</h2><div class="b">ORDEN DE PREPARACIÓN</div><div>${esc(o.codigo||'')}</div></div><div class="line"></div><div>Fecha orden: ${shortDate(o.fecha)}</div><div>Fecha despacho: ${shortDate(dispatchDateOf(o))} ${o.hora_despacho?esc(String(o.hora_despacho).slice(0,5)):''}</div><div>Impreso: ${now.toLocaleString('es-DO')}</div>${isFutureDispatch(o)?'<div class="b">NO DESPACHAR HOY</div>':''}<div class="line"></div><div class="b">CLIENTE</div><div>${esc(o.cliente?.negocio||'')}</div><div>Tel: ${esc(o.cliente?.telefono||'')}</div><div>Sector: ${esc(o.cliente?.sector||'')}</div><div class="line"></div><div>Tomado por: ${esc(workerDisplayName(o.tomado_por||o.preparado_por)||'________________')}</div><div>Hora tomada: ${o.tomado_en?new Date(o.tomado_en).toLocaleString('es-DO'):'________________'}</div><div class="line"></div><div class="b">DETALLE SIN PRECIOS</div><table>${lines}</table><div class="line"></div>${o.notas?`<div>Notas: ${esc(o.notas)}</div>`:''}${o.nota_programacion?`<div>Programación: ${esc(o.nota_programacion)}</div>`:''}<div class="sign">Peso final</div><div class="sign">Paquetes</div><div class="sign">Firma despacho</div><button onclick="window.print()">Imprimir</button><script>setTimeout(()=>window.print(),400)<\/script></body></html>`;
  const w=window.open('','_blank','width=420,height=720'); if(!w) return alert('El navegador bloqueó la ventana de impresión. Permite popups para esta página.'); w.document.open(); w.document.write(html); w.document.close();
  const count=(+o.impresiones_preparacion||0)+1;
  const {error}=await sb.from('ordenes').update({impresiones_preparacion:count,ultima_impresion_preparacion:new Date().toISOString(),impreso_preparacion_por:state.user.id}).eq('id',o.id);
  if(error) console.warn(error.message);
  await logOrderState(o,o.estado,o.estado,'Impresión de orden de preparación 80 mm');
  await loadAll(); render();
}
function openPreparacionModal(o){
  if(!o) return;
  const locked=o.tomado_por && !canEditCarniceriaOrder(o);
  const prepByField=locked ? `<div class="field"><label>Despachador responsable</label><input id="prepBy" value="${esc(workerDisplayName(o.tomado_por)||currentWorkerName())}" readonly></div>` : workerSelectHtml('Carnicería','prepBy','Despachador responsable',o.tomado_por||currentWorkerName());
  const body=`<div class="form"><div class="client-card" style="grid-template-columns:1fr"><div><div class="client-title">${esc(o.codigo)} · ${esc(o.cliente?.negocio||'Cliente')}</div><div class="client-sub">${orderItemsText(o,12)}</div></div></div>${o.tomado_por?`<div class="lock-alert ${locked?'':'ok'}"><b>${esc(lockText(o))}</b>${locked?'<br>Esta orden solo puede ser modificada por quien la tomó, administrador o supervisor. Puedes verla e imprimirla.':'<br>Puedes continuar trabajando esta orden. Solo quedará como preparado por ti cuando marques “Lista para facturar”.'}</div>`:''}<div class="actions"><button class="btn gray" id="printPrepNow">Imprimir preparación 80mm</button>${canReleaseCarnOrder(o)?`<button class="btn warn" id="releaseFromPrep">Soltar pedido</button>`:""}</div><div class="section-title">Detalle solicitado vs preparado</div><div class="prep-summary-note">Registra la cantidad preparada por artículo. El estado se actualiza automáticamente. Si eliges “Sustituido”, selecciona el producto sustituto y su cantidad. No se modifica precio.</div>${prepRowsHtml(o,locked)}<div id="prepPesoResumen" class="prep-weight-box">Peso preparado calculado: <b>0 lb</b></div><div class="grid3">${prepByField}<div class="field"><label>Peso real del pedido / balanza</label><input id="prepPeso" ${locked?'disabled readonly':''} type="number" step="0.01" value="${locked?(o.peso_preparado||''):''}" placeholder="Escribe el peso real"><div class="hint">Obligatorio si la orden tiene productos que suman peso. No se llena automático.</div></div><div class="field"><label>Paquetes</label><input id="prepPaq" ${locked?'disabled':''} type="number" value="${o.paquetes_preparados||1}"></div></div><div class="field"><label>Observación general</label><textarea id="prepNotas" ${locked?'disabled':''}>${esc(o.notas_preparacion||'')}</textarea></div>${locked?'':`<div class="actions"><button class="btn gray" id="savePrepDraft">Guardar avance</button><button class="btn" id="savePrep">Marcar lista para facturar</button></div>`}</div>`;
  const m=openModal('Preparar / pesar orden',body, locked?'Modo lectura: orden tomada por otro despachador.':'Detalle por artículo, faltantes y pesaje.');
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
    if(final && requierePeso && pesoCalculado>0 && pesoReal>0){
      const chk=weightControlCheck(pesoCalculado,pesoReal);
      if(chk.level==='block'){ await weightDiffDialog(chk); return; }
      if(chk.level==='warn'){ const ok=await weightDiffDialog(chk); if(!ok) return; }
    }
    try{ await savePrepDetailRows(m); }catch(err){ return alert(err.message); }
    const montoPreparado=invoiceExpectedAmountFromModal(m,o);
    const workBase={tomado_por:o.tomado_por||prepBy,tomado_en:o.tomado_en||new Date().toISOString(),tomado_por_user:o.tomado_por_user||state.user.id,peso_preparado:pesoReal||null,peso_calculado_preparado:pesoCalculado||null,paquetes_preparados:paquetes,notas_preparacion:notas,total_estimado:montoPreparado||o.total_estimado||0};
    const finalBase={...workBase,preparado_por:prepBy,preparado_en:new Date().toISOString()};
    if(!final){ const {error}=await sb.from('ordenes').update({...workBase,estado:'En preparación',preparado_por:null,preparado_en:null}).eq('id',o.id); if(error) return alert(error.message); await logOrderState(o,o.estado,'En preparación','Avance de preparación guardado sin marcar como preparado'); clearDraftLocal(draftKey('preparacion', o.id)); m.remove(); await loadAll(); render(); toast('Avance guardado. La orden aún no está marcada como preparada.'); return; }
    clearDraftLocal(draftKey('preparacion', o.id));
    await sb.from('orden_pesos').insert({orden_id:o.id,tipo:'Preparado',libras:pesoReal,paquetes,notas,creado_por:state.user.id});
    m.remove(); await setOrderState(o,'Lista para facturar',{...finalBase,notas_estado:'Preparada, detallada y pesada'});
  };
  $('#savePrepDraft',m).onclick=()=>updateDetailsAndOrder(false);
  $('#savePrep',m).onclick=()=>updateDetailsAndOrder(true);
}
function invoiceExpectedAmount(o){
  const items=o?.items||[];
  if(!items.length) return Number(o?.total_factura||o?.total_estimado||0);
  const hasPrepared=items.some(i=>i.cantidad_preparada!==null && i.cantidad_preparada!==undefined);
  if(!hasPrepared) return Number(o?.total_estimado||o?.total_factura||0);
  let total=0;
  items.forEach(i=>{
    const st=String(i.estado_preparacion||'');
    if(st==='Sin existencia') return;
    if(st==='Sustituido' && i.nota_preparacion){
      const name=(String(i.nota_preparacion).match(/Sustituido por:\s*([^·]+)/i)||[])[1]?.trim();
      const qty=substituteQtyFromNote(i.nota_preparacion);
      const p=productByName(name||'');
      total += (Number(qty)||0) * (Number(p?.precio_defecto)||Number(i.precio)||0);
      return;
    }
    const qty=(i.cantidad_preparada!==null && i.cantidad_preparada!==undefined) ? Number(i.cantidad_preparada||0) : Number(i.cantidad_pedida||0);
    total += qty * Number(i.precio||0);
  });
  return Number(total.toFixed(2));
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
function invoiceAmountDiffDialog(check){ return new Promise(resolve=>{ const m=document.createElement('div'); m.className='modal'; const title=check.level==='block'?'Diferencia de factura demasiado alta':'Verificar monto de factura'; const msg=check.level==='block'?'El monto de factura supera la tolerancia máxima. No se puede guardar hasta corregirlo.':'El monto de factura tiene una diferencia fuera de la tolerancia de aviso. Puedes volver a revisar o continuar bajo responsabilidad.'; const diffTxt=(check.diff>0?'+':'')+money(check.diff); m.innerHTML=`<div class="modal-card" style="max-width:720px"><div class="modal-head"><div><div class="modal-title">${title}</div><div class="hint">Control antes de pasar a Validación.</div></div><button class="close" data-close>×</button></div><div class="modal-body"><div class="weight-alert ${check.level==='block'?'bad':''}"><strong>${msg}</strong><div class="grid2" style="margin-top:12px"><div class="kv"><b>Monto esperado</b><span>${money(check.expected)}</span></div><div class="kv"><b>Monto factura</b><span>${money(check.actual)}</span></div><div class="kv"><b>Diferencia</b><span>${diffTxt}</span></div><div class="kv"><b>Tolerancia aviso</b><span>${money(check.aviso)}</span></div><div class="kv"><b>Tolerancia máxima</b><span>${money(check.max)}</span></div></div></div><div class="actions">${check.level==='block'?'<button class="btn" data-review>Volver a revisar</button>':'<button class="btn gray" data-review>Volver a revisar</button><button class="btn" data-continue>Continuar bajo responsabilidad</button>'}</div></div></div>`; document.body.appendChild(m); const close=(val)=>{m.remove(); resolve(val);}; $('[data-close]',m).onclick=()=>close(false); $('[data-review]',m).onclick=()=>close(false); const cont=$('[data-continue]',m); if(cont) cont.onclick=()=>close(true); }); }

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
  return new Promise(resolve=>{
    const m=document.createElement('div'); m.className='modal';
    const title=check.level==='block'?'Diferencia de peso demasiado alta':'Verificar peso facturado';
    const msg=check.level==='block'?'El peso facturado supera la tolerancia máxima contra el peso preparado en Carnicería. No se puede pasar a Validación hasta corregirlo.':'El peso facturado tiene una diferencia fuera de la tolerancia de aviso. Puedes volver a revisar o continuar bajo responsabilidad.';
    const diffTxt=(check.diff>0?'+':'')+check.diff+' lb';
    m.innerHTML=`<div class="modal-card" style="max-width:720px"><div class="modal-head"><div><div class="modal-title">${title}</div><div class="hint">Control de peso antes de pasar a Validación.</div></div><button class="close" data-close>×</button></div><div class="modal-body"><div class="weight-alert ${check.level==='block'?'bad':''}"><strong>${msg}</strong><div class="grid2" style="margin-top:12px"><div class="kv"><b>Peso preparado</b><span>${check.expected||0} lb</span></div><div class="kv"><b>Peso facturado</b><span>${check.actual||0} lb</span></div><div class="kv"><b>Diferencia</b><span>${diffTxt}</span></div><div class="kv"><b>Tolerancia aviso</b><span>${check.aviso||0} lb</span></div><div class="kv"><b>Tolerancia máxima</b><span>${check.max||0} lb</span></div></div></div><div class="actions">${check.level==='block'?'<button class="btn" data-review>Volver a revisar</button>':'<button class="btn gray" data-review>Volver a revisar</button><button class="btn" data-continue>Continuar bajo responsabilidad</button>'}</div></div></div>`;
    document.body.appendChild(m);
    const close=(val)=>{m.remove(); resolve(val);};
    $('[data-close]',m).onclick=()=>close(false);
    $('[data-review]',m).onclick=()=>close(false);
    const cont=$('[data-continue]',m); if(cont) cont.onclick=()=>close(true);
  });
}

function openFacturaModal(o){
  if(!o) return;
  const canChooseBy=isAdminRole() || puede('configuracion');
  const defaultBy=o.facturado_por || currentWorkerName();
  const montoEsperado=invoiceExpectedAmount(o);
  const pesoEsperado=Number(o.peso_preparado || orderLastPeso(o,'Preparado')?.libras || o.peso_facturado || 0);
  const byField=canChooseBy ? `<select id="facBy">${employeeOptionsWithDefault('Facturación',defaultBy)}</select>${manualInput('facByManual')}` : `<input id="facBy" readonly value="${esc(defaultBy)}"><div class="hint">Se usa tu usuario de acceso.</div>`;
  const body=`<div class="form invoice-form"><div class="client-card" style="grid-template-columns:1fr"><div><div class="client-title">${esc(o.codigo)} · ${esc(o.cliente?.negocio||'Cliente')}</div><div class="client-sub">Monto esperado: ${money(montoEsperado)} · Peso preparado: ${pesoEsperado?pesoEsperado+' lb':'—'} · ${orderItemsText(o,7)}</div></div></div><div class="grid2"><div class="field"><label>Facturado por</label>${byField}</div><div class="field"><label>No. factura</label><input id="facNo" value="${esc(o.factura_no||'')}" placeholder="Número de factura"></div></div><div class="grid3"><div class="field"><label>Monto factura</label><input id="facMonto" type="number" step="0.01" value="${o.total_factura||montoEsperado||0}"><div class="hint">Debe coincidir con el monto actualizado por Carnicería.</div></div><div class="field"><label>Peso facturado</label><input id="facPeso" type="number" step="0.01" value="${o.peso_facturado||pesoEsperado||''}"><div class="hint">Debe coincidir con el peso preparado en Carnicería.</div></div><div class="field"><label>Condición</label><select id="facCond"><option ${o.condicion_pago==='Crédito'?'selected':''}>Crédito</option><option ${o.condicion_pago==='Contado'?'selected':''}>Contado</option></select></div></div><div id="facMontoAlert">${invoiceAmountAlertHtml(montoEsperado, o.total_factura||montoEsperado||0)}</div><div id="facPesoAlert">${invoiceWeightAlertHtml(pesoEsperado, o.peso_facturado||pesoEsperado||0)}</div><button class="btn" id="saveFac">Guardar factura y pasar a validación</button></div>`;
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
      const ok=await invoiceAmountDiffDialog(chk);
      if(!ok) return;
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
      const ok=await invoiceWeightDiffDialog(chkPeso);
      if(!ok) return;
      alertaPeso=`Peso facturado bajo responsabilidad. Preparado ${pesoEsperado} lb, facturado ${peso} lb.`;
    }
    if(peso>0) await sb.from('orden_pesos').insert({orden_id:o.id,tipo:'Facturado',libras:peso,notas:alertaPeso||'Peso facturado',creado_por:state.user.id});
    m.remove();
    await setOrderState(o,'Facturada',{facturado_por:by,facturado_en:new Date().toISOString(),factura_no:facNo.value||null,total_factura:monto,peso_facturado:peso||null,condicion_pago:facCond.value||'Crédito',notas_estado:[alertaMonto,alertaPeso].filter(Boolean).join(' · ')||'Facturada'});
  };
  focusEl(facBy);
}

function specialCaseEmployeeOptions(selected=''){
  const rows=state.empleados.filter(e=>e.activo!==false);
  const names=[...new Set([...rows.map(e=>e.nombre), ...activeDeliveryNames(), currentWorkerName()].filter(Boolean))];
  const sel=String(selected||'').trim();
  return `<option value="">Sin asignar</option>${names.map(n=>`<option ${norm(n)===norm(sel)?'selected':''}>${esc(n)}</option>`).join('')}<option value="__manual__">Otro / manual</option>`;
}
async function logSpecialCase(o, estado, comentario){
  try{ await sb.from('orden_casos_historial').insert({orden_id:o.id,estado_caso:estado,comentario,usuario:state.user?.id||null}); }catch(e){ console.warn('Historial caso no disponible:',e.message||e); }
  try{ await logOrderState(o,o.estado,o.estado,`Caso especial: ${estado}. ${comentario||''}`); }catch(e){}
}
function specialCasePatchFromModal(m,o){
  const type=$('#caseType',m)?.value||orderType(o);
  const rule=orderTypeRule(type);
  const reqDelivery=$('#caseReqDelivery',m)?.checked || !!rule.delivery;
  const status=$('#caseStatus',m)?.value||'Abierto';
  const resp=$('#caseResp',m)?.value==='__manual__'?($('#caseRespManual',m)?.value||'').trim():($('#caseResp',m)?.value||'');
  const notas=[`Tipo caso: ${type}`,`Estado caso: ${status}`,`Responsable: ${resp||'Sin asignar'}`,$('#caseAction',m)?.value?`Acción: ${$('#caseAction',m).value}`:'',$('#casePick',m)?.value?`Recoger: ${$('#casePick',m).value}`:'',$('#caseGive',m)?.value?`Entregar/cambiar: ${$('#caseGive',m).value}`:'',$('#caseResolution',m)?.value?`Resolución: ${$('#caseResolution',m).value}`:''].filter(Boolean).join('\n');
  const patch={tipo_orden:type,requiere_preparacion:!!rule.prep,requiere_facturacion:!!rule.invoice,requiere_delivery:!!reqDelivery,estado_caso_especial:status,responsable_caso:resp||null,accion_caso:$('#caseAction',m)?.value||null,producto_recoger:$('#casePick',m)?.value||null,producto_entregar:$('#caseGive',m)?.value||null,monto_ajuste:Number($('#caseAmount',m)?.value||0),fecha_compromiso:$('#caseDue',m)?.value||null,requiere_nota_credito:!!$('#caseCredit',m)?.checked,resolucion_caso:$('#caseResolution',m)?.value||null,caso_resuelto_por:['Resuelto','Cerrado'].includes(status)?currentWorkerName():(o?.caso_resuelto_por||null),caso_resuelto_en:['Resuelto','Cerrado'].includes(status)?(o?.caso_resuelto_en||new Date().toISOString()):null,notas:[o?.notas||'',`[${new Date().toLocaleString('es-DO')}] ${notas}`].filter(Boolean).join('\n')};
  if(reqDelivery && ['Abierto','En revisión','Asignado a delivery'].includes(status) && !['Asignada a delivery','En ruta','Cobrado','Entregado a crédito','No entregado','Devuelto parcial','Anulado'].includes(o?.estado||'')) patch.estado='Validada para delivery';
  if(['Resuelto','Cerrado'].includes(status)) patch.estado=o?.estado==='Anulado'?'Anulado':(o?.estado||'Pedido recibido');
  return patch;
}
async function saveSpecialCasePatch(o,patch){
  const {estado,...cols}=patch;
  let r=await sb.from('ordenes').update(patch).eq('id',o.id);
  if(r.error && /estado_caso_especial|responsable_caso|accion_caso|producto_recoger|producto_entregar|monto_ajuste|fecha_compromiso|requiere_nota_credito|resolucion_caso|caso_resuelto/i.test(r.error.message||'')){
    const fallback={tipo_orden:cols.tipo_orden,requiere_preparacion:cols.requiere_preparacion,requiere_facturacion:cols.requiere_facturacion,requiere_delivery:cols.requiere_delivery,notas:cols.notas};
    if(estado) fallback.estado=estado;
    r=await sb.from('ordenes').update(fallback).eq('id',o.id);
    if(!r.error) alert('Se guardó el caso en notas, pero para historial estructurado ejecuta el SQL V9.1.');
  }
  return r;
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
    const notes=`Caso especial creado.\nTipo: ${type}\nResponsable: ${resp||'Sin asignar'}\nAcción: ${$('#quickCaseAction',m).value||''}\nRecoger: ${$('#quickCasePick',m).value||''}\nEntregar/cambio: ${$('#quickCaseGive',m).value||''}`;
    const row={cliente_id:cl.id,fecha:today(),fecha_despacho:today(),prioridad:'Alta',tipo_orden:type,requiere_preparacion:!!rule.prep,requiere_facturacion:!!rule.invoice,requiere_delivery:!!reqDelivery,canal:'Caso especial',vendedor:state.profile?.vendedor||null,estado:reqDelivery&&!rule.prep&&!rule.invoice?'Validada para delivery':'Pedido recibido',condicion_pago:'Crédito',total_estimado:0,total_factura:0,zona:cl.sector||null,notas:notes,estado_caso_especial:'Abierto',responsable_caso:resp||null,accion_caso:$('#quickCaseAction',m).value||null,producto_recoger:$('#quickCasePick',m).value||null,producto_entregar:$('#quickCaseGive',m).value||null,fecha_compromiso:$('#quickCaseDue',m).value||null,requiere_nota_credito:$('#quickCaseCredit',m).checked};
    let r=await sb.from('ordenes').insert(row).select('id,codigo').single();
    if(r.error && /estado_caso_especial|responsable_caso|accion_caso|producto_recoger|producto_entregar|fecha_compromiso|requiere_nota_credito/i.test(r.error.message||'')){
      const {estado_caso_especial,responsable_caso,accion_caso,producto_recoger,producto_entregar,fecha_compromiso,requiere_nota_credito,...fallback}=row;
      r=await sb.from('ordenes').insert(fallback).select('id,codigo').single();
      if(!r.error) alert('Caso creado en notas. Ejecuta el SQL V9.1 para campos estructurados de seguimiento.');
    }
    if(r.error) return alert(r.error.message);
    await logSpecialCase({id:r.data.id,estado:row.estado},'Abierto','Caso especial creado');
    m.remove(); await loadAll(); state.orderView='especiales'; render(); toast('Caso especial creado');
  };
}
function openSpecialCaseModal(o){
  if(!o) return alert('No encontré este caso.');
  const hist=specialCaseHistoryFor(o);
  const body=`<div class="form"><div class="client-card" style="grid-template-columns:1fr"><div><div class="client-title">${esc(o.codigo||('ORD-'+o.id))} · ${esc(o.cliente?.negocio||'Cliente')}</div><div class="client-sub">${esc(orderType(o))} · Estado operativo: ${esc(o.estado||'')} · Factura ${esc(o.factura_no||'—')}</div><div class="badges">${orderTypeBadge(o)}${specialCaseBadge(o)}${o.requiere_nota_credito?'<span class="badge warn">Nota crédito</span>':''}</div></div></div><div class="grid3"><div class="field"><label>Tipo</label><select id="caseType">${orderTypes().filter(x=>x!=='Pedido normal').map(x=>`<option ${orderType(o)===x?'selected':''}>${esc(x)}</option>`).join('')}</select></div><div class="field"><label>Estado del caso</label><select id="caseStatus">${specialCaseStates().map(x=>`<option ${specialCaseStatus(o)===x?'selected':''}>${esc(x)}</option>`).join('')}</select></div><div class="field"><label>Fecha compromiso</label><input id="caseDue" type="date" value="${esc(o.fecha_compromiso||today())}"></div></div><div class="grid2"><div class="field"><label>Responsable</label><select id="caseResp">${specialCaseEmployeeOptions(o.responsable_caso||currentWorkerName())}</select><input id="caseRespManual" placeholder="Nombre manual" style="display:none;margin-top:8px"></div><div class="field"><label>Monto ajuste / crédito</label><input id="caseAmount" type="number" step="0.01" value="${Number(o.monto_ajuste||0)}"></div></div><div class="grid2"><div class="field"><label>Producto a recoger</label><input id="casePick" value="${esc(o.producto_recoger||'')}"></div><div class="field"><label>Producto a entregar / cambio</label><input id="caseGive" value="${esc(o.producto_entregar||'')}"></div></div><div class="field"><label>Acción requerida</label><textarea id="caseAction">${esc(o.accion_caso||'')}</textarea></div><div class="field"><label>Resolución / comentario</label><textarea id="caseResolution">${esc(o.resolucion_caso||'')}</textarea></div><div class="grid2"><label class="checkline"><input type="checkbox" id="caseReqDelivery" ${orderRequiresDelivery(o)?'checked':''}> Requiere delivery/recogida</label><label class="checkline"><input type="checkbox" id="caseCredit" ${o.requiere_nota_credito?'checked':''}> Requiere nota de crédito / ajuste</label></div><div class="lock-alert info"><b>Conexión operativa:</b> si marcas que requiere delivery, el caso pasa a Validación/Delivery para recogida o entrega. Si queda resuelto/cerrado, se conserva en historial.</div><div class="section-title">Historial del caso</div>${hist.slice(0,8).map(h=>`<div class="kv"><b>${new Date(h.creado_en).toLocaleString('es-DO')}</b><span>${esc(h.estado_caso||'')} · ${esc(h.comentario||'')}</span></div>`).join('')||'<div class="empty">Sin historial estructurado. Ejecuta SQL V9.1 para historial formal.</div>'}<button class="btn" id="saveSpecialCase">Guardar seguimiento</button></div>`;
  const m=openModal('Gestionar devolución / cambio / incidencia',body,'V9.1 · seguimiento conectado a delivery, liquidación, cliente y auditoría.');
  wireManual(m,'caseResp','caseRespManual');
  $('#saveSpecialCase',m).onclick=async()=>{
    const patch=specialCasePatchFromModal(m,o);
    const r=await saveSpecialCasePatch(o,patch);
    if(r.error) return alert(r.error.message);
    await logSpecialCase(o,patch.estado_caso_especial||'Actualizado',$('#caseResolution',m).value||$('#caseAction',m).value||'Seguimiento actualizado');
    m.remove(); await loadAll(); render(); toast('Caso actualizado');
  };
}
function printSpecialCasesReport(){
  const rows=state.ordenes.filter(o=>isSpecialOrder(o) && o.estado!=='Anulado');
  const html=`<!doctype html><html><head><meta charset="utf-8"><title>Casos especiales</title><style>body{font-family:Arial,sans-serif;padding:20px;color:#111}h1{margin:0 0 6px}table{width:100%;border-collapse:collapse;margin-top:16px;font-size:12px}th,td{border:1px solid #ddd;padding:7px;text-align:left}th{background:#f3f4f6}.sign{display:inline-block;width:240px;border-top:1px solid #000;margin-top:36px;margin-right:40px}@media print{button{display:none}}</style></head><body><h1>Reporte de devoluciones, cambios e incidencias</h1><p><b>Fecha:</b> ${new Date().toLocaleString('es-DO')} · <b>Total:</b> ${rows.length}</p><table><thead><tr><th>Orden</th><th>Cliente</th><th>Tipo</th><th>Estado caso</th><th>Responsable</th><th>Compromiso</th><th>Acción</th><th>Ajuste</th></tr></thead><tbody>${rows.map(o=>`<tr><td>${esc(o.codigo||'')}</td><td>${esc(o.cliente?.negocio||'')}</td><td>${esc(orderType(o))}</td><td>${esc(specialCaseStatus(o))}</td><td>${esc(o.responsable_caso||'')}</td><td>${esc(o.fecha_compromiso||'')}</td><td>${esc(o.accion_caso||'')}</td><td>${money(o.monto_ajuste||0)}</td></tr>`).join('')}</tbody></table><div class="sign">Revisado por</div><button onclick="window.print()">Imprimir</button><script>setTimeout(()=>window.print(),500)<\/script></body></html>`;
  const w=window.open('','_blank','width=1000,height=720'); if(!w) return alert('Permite ventanas emergentes para imprimir.'); w.document.open(); w.document.write(html); w.document.close();
}

function openReturnToInvoiceModal(o){
  if(!o) return;
  if(!orderRequiresInvoice(o)) return alert('Esta orden no requiere facturación.');
  const body=`<div class="form"><div class="client-card" style="grid-template-columns:1fr"><div><div class="client-title">${esc(o.codigo)} · ${esc(o.cliente?.negocio||'Cliente')}</div><div class="client-sub">Factura actual: ${esc(o.factura_no||'—')} · ${money(o.total_factura||o.total_estimado)} · Estado: ${esc(o.estado||'')}</div></div></div><div class="warning"><b>La orden volverá a Facturación.</b><br>Se mantendrá la factura registrada como referencia, pero quedará pendiente de corregir/guardar nuevamente. Todo se registrará en el historial.</div><div class="field"><label>Motivo de devolución</label><textarea id="returnReason" placeholder="Ej: número de factura incorrecto, monto mal registrado, peso facturado incorrecto..."></textarea></div><button class="btn warn" id="confirmReturnInvoice">Devolver a Facturación</button></div>`;
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
  const defaultPeso=o.peso_validado||'';
  const reqPeso=orderRequiresFinalWeight(o);
  const ref=validationWeightReference(o);
  const byField=canChooseBy
    ? `<select id="valBy">${employeeOptionsWithDefault('Validación',defaultBy)}</select>${manualInput('valByManual')}`
    : `<input id="valBy" readonly value="${esc(defaultBy)}"><div class="hint">Se usa tu usuario de acceso. No puedes validar a nombre de otro empleado.</div>`;
  const body=`<div class="form validation-form"><div class="client-card" style="grid-template-columns:1fr"><div><div class="client-title">${esc(o.codigo)} · ${esc(o.cliente?.negocio||'Cliente')}</div><div class="client-sub">Factura ${esc(o.factura_no||'—')} · ${money(o.total_factura||o.total_estimado)}${ref.value?` · Ref. peso: ${ref.value} lb`:''}</div></div></div><div class="grid3"><div class="field"><label>Validado / entregado por</label>${byField}</div><div class="field"><label>Peso final entregado</label><input id="valPeso" type="number" step="0.01" value="${defaultPeso}" placeholder="Escribe peso final${reqPeso?' obligatorio':''}"><div class="hint">${reqPeso?'Obligatorio porque la orden incluye productos que suman peso.':'No obligatorio si todos los productos no pesan.'}</div></div><div class="field"><label>Delivery</label><select id="valDelivery">${deliverySelect(o.delivery_nombre||'')}</select>${manualInput('valDeliveryManual','Nombre del delivery')}</div></div><div id="valPesoAlert">${validationWeightAlertHtml(o,defaultPeso)}</div><div class="field"><label>Observación</label><textarea id="valNotas" placeholder="Opcional"></textarea></div><button class="btn" id="saveVal">Validar y asignar a delivery</button></div>`;
  const m=openModal('Validar y entregar al delivery',body,'Flujo rápido: peso final → delivery → observación → confirmar.');
  if(canChooseBy) wireManual(m,'valBy','valByManual');
  wireManual(m,'valDelivery','valDeliveryManual');
  const valBy=$('#valBy',m), valPeso=$('#valPeso',m), valDelivery=$('#valDelivery',m), valNotas=$('#valNotas',m), save=$('#saveVal',m);
  const updateAlert=()=>{$('#valPesoAlert',m).innerHTML=validationWeightAlertHtml(o,+valPeso.value||0);};
  valPeso.oninput=updateAlert;
  const focusEl=el=>{ if(!el) return; setTimeout(()=>{el.focus(); if(el.select) el.select();},0); };
  if(valBy) valBy.addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); focusEl(valPeso); } });
  if(valPeso) valPeso.addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); focusEl(valDelivery); } });
  if(valDelivery) valDelivery.addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); focusEl(valNotas); } });
  if(valNotas) valNotas.addEventListener('keydown',e=>{ if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); focusEl(save); } });
  if(save) save.addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); save.click(); } });
  save.onclick=async()=>{
    const by=canChooseBy?getSelectManual(m,'valBy','valByManual'):String(valBy.value||'').trim();
    const del=getSelectManual(m,'valDelivery','valDeliveryManual');
    const peso=+valPeso.value||0;
    if(!by) return alert('Selecciona quién validó o entregó al delivery.');
    if(!del) return alert('Selecciona el delivery que llevará esta orden.');
    if(reqPeso && peso<=0) return alert('Debes registrar el peso final entregado antes de asignar esta orden al delivery.');
    let alerta='';
    if(peso>0){
      const check=validationWeightCheck(o,peso);
      if(check.calc && check.level==='block'){
        await validationWeightDiffDialog(check);
        return;
      }
      if(check.calc && check.level==='warn'){
        const ok=await validationWeightDiffDialog(check);
        if(!ok) return;
        alerta=validationWeightAlertText(o,peso);
      }
    }
    const obs=valNotas.value||'';
    const notaPeso=[obs,alerta].filter(Boolean).join(' | ');
    if(peso>0){
      const ins=await sb.from('orden_pesos').insert({orden_id:o.id,tipo:'Entregado a delivery',libras:peso,notas:notaPeso||null,creado_por:state.user.id});
      if(ins.error) return alert(ins.error.message);
    }
    m.remove();
    await setOrderState(o,'Asignada a delivery',{validado_por:by,peso_validado:peso||null,validado_en:new Date().toISOString(),delivery_nombre:del,asignado_delivery_en:new Date().toISOString(),notas_validacion:notaPeso||null,notas_estado:alerta?('Validada y asignada a delivery bajo revisión de peso · '+alerta):'Validada y asignada a delivery'});
  };
  focusEl(reqPeso?valPeso:valDelivery);
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
  const body=`<div class="form"><div class="client-card" style="grid-template-columns:1fr"><div><div class="client-title">${esc(o.codigo)} · ${esc(o.cliente?.negocio||'Cliente')}</div><div class="client-sub">Delivery: ${esc(o.delivery_nombre||'')} · Factura ${money(total)} · ${orderItemsText(o,8)}</div></div></div><div class="grid3"><div class="field"><label>Resultado de entrega</label><select id="delRes"><option value="Cobrado" ${res==='Cobrado'?'selected':''}>Entregado y cobrado</option><option value="Entregado a crédito" ${res==='Entregado a crédito'?'selected':''}>Abono / entregado a crédito</option><option value="No entregado" ${res==='No entregado'?'selected':''}>No entregado</option><option value="Devuelto parcial" ${res==='Devuelto parcial'?'selected':''}>Devuelto parcial</option></select></div><div class="field"><label id="delCashLabel">Dinero recibido del cliente</label><input id="delCobrado" type="number" step="0.01" value="${initialCash}"></div><div class="field"><label>Forma de pago</label><select id="delMetodo"><option>Efectivo</option><option>Transferencia</option><option>Mixto</option><option>Crédito</option><option>No aplica</option></select></div></div><div class="grid4 compact-kpis"><div class="card kpi"><div class="label">Total factura</div><div class="value">${money(total)}</div></div><div class="card kpi"><div class="label">Se reportará cobrado</div><div class="value" id="delApplied">${money(total)}</div></div><div class="card kpi"><div class="label">Cambio al cliente</div><div class="value" id="delChange">${money(0)}</div></div><div class="card kpi"><div class="label">Queda a crédito</div><div class="value" id="delPending">${money(0)}</div></div></div><div id="delSummary" class="lock-alert ok"></div><div class="field"><label>Observación</label><textarea id="delNotas" placeholder="Opcional; úsalo si no entregó, crédito o devolución parcial"></textarea></div><button class="btn" id="saveDelResult">Registrar resultado</button></div>`;
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
function openLiquidacionOrdenModal(o){
  if(!o) return;
  const total=Number(o.total_factura||o.total_estimado||0);
  const defaultRes=finalDeliveryStates().includes(o.resultado_entrega||o.estado)?(o.resultado_entrega||o.estado):'Cobrado';
  const hasDeliveryReport=isFinalDeliveryResult(o) && (o.monto_cobrado!==undefined && o.monto_cobrado!==null && o.monto_cobrado!=='');
  const reportedCash=hasDeliveryReport ? Number(o.monto_cobrado||0) : expectedCashFromOrder(o,defaultRes);
  const initialCredit=Number(o.monto_pendiente ?? Math.max(total-reportedCash,0));
  const startCash=reportedCash;
  const body=`<div class="form"><div class="client-card" style="grid-template-columns:1fr"><div><div class="client-title">${esc(o.cliente?.negocio||'Cliente')}</div><div class="client-sub">${esc(o.codigo)} · Delivery: ${esc(o.delivery_nombre||'')} · total factura ${money(total)}</div></div></div>
  <div class="grid4 compact-kpis"><div class="card kpi"><div class="label">Factura</div><div class="value">${money(total)}</div></div><div class="card kpi"><div class="label">Reportado por delivery</div><div class="value">${money(reportedCash)}</div></div><div class="card kpi"><div class="label">Crédito inicial</div><div class="value" id="liqInitialCredit">${money(initialCredit)}</div></div><div class="card kpi"><div class="label">Resultado reportado</div><div class="value" style="font-size:16px">${esc(defaultRes)}</div></div></div>
  ${hasDeliveryReport&&initialCredit>0?`<div class="lock-alert warn"><b>Crédito detectado:</b> puedes mantenerlo a crédito o recibir un abono/pago ahora en caja. No se permite recibir más que el total de la factura ni menos que el efectivo ya reportado por el delivery.</div>`:''}
  <div class="grid3"><div class="field"><label>Resultado final en caja</label><select id="liqRes"><option value="Cobrado" ${defaultRes==='Cobrado'?'selected':''}>Cobrado completo</option><option value="Entregado a crédito" ${defaultRes==='Entregado a crédito'?'selected':''}>Mantener / abonar crédito</option><option value="No entregado" ${defaultRes==='No entregado'?'selected':''}>No entregado</option><option value="Devuelto parcial" ${defaultRes==='Devuelto parcial'?'selected':''}>Devuelto parcial</option></select></div><div class="field"><label>Monto recibido en caja</label><input id="liqCobrado" type="number" step="0.01" value="${startCash}"></div><div class="field"><label>Método</label><select id="liqMetodo"><option>Efectivo</option><option>Transferencia</option><option>Mixto</option><option>Crédito</option><option>No aplica</option></select></div></div>
  <div class="grid2"><div class="field"><label>Recibido por</label><select id="liqBy">${employeeOptions('CXC',o.recibido_por||currentWorkerName())}</select>${manualInput('liqByManual')}</div><div class="field"><label>Diferencia / pago adicional</label><input id="liqDiff" readonly></div></div>
  <div class="grid3 compact-kpis"><div class="card kpi"><div class="label">Recibido ahora</div><div class="value" id="liqReceivedNow">${money(startCash)}</div></div><div class="card kpi"><div class="label">Pago de crédito</div><div class="value" id="liqCreditPay">${money(0)}</div></div><div class="card kpi"><div class="label">Crédito final</div><div class="value" id="liqFinalCredit">${money(initialCredit)}</div></div></div>
  <div id="liqSummary" class="lock-alert ok"></div><div class="field"><label>Observación</label><textarea id="liqNotas">${esc(o.notas_liquidacion||'')}</textarea></div><button class="btn" id="saveLiq">Cerrar recepción</button></div>`;
  const m=openModal('Recibir delivery / liquidar orden',body,'Caja CXC: permite recibir pagos de crédito al momento de liquidar, con control por cliente.');
  wireManual(m,'liqBy','liqByManual');
  const res=$('#liqRes',m), cob=$('#liqCobrado',m), metodo=$('#liqMetodo',m), by=$('#liqBy',m), notas=$('#liqNotas',m), diff=$('#liqDiff',m), btn=$('#saveLiq',m), summary=$('#liqSummary',m);
  const receivedNow=$('#liqReceivedNow',m), creditPay=$('#liqCreditPay',m), finalCreditEl=$('#liqFinalCredit',m);
  function calc(){
    const resultado=res.value;
    let cash=Number(cob.value||0);
    const minCash=hasDeliveryReport?reportedCash:0;
    let err='';
    if(cash<0) err='El monto no puede ser negativo.';
    if(hasDeliveryReport){
      if(cash+0.01<minCash) err=`No puedes recibir menos de lo que el delivery reportó (${money(minCash)}).`;
      if(cash>total+0.01) err=`No puedes recibir más que el total de la factura (${money(total)}).`;
      if(resultado==='No entregado' && cash>0.01) err='Una orden no entregada no debe registrar dinero recibido.';
      if(resultado==='Cobrado' && cash+0.01<total) err=`Para marcar Cobrado completo debes recibir ${money(total)}. Si solo recibiste una parte, usa Mantener / abonar crédito.`;
    }else{
      err=validateDeliveryCash(resultado,total,cash)||'';
    }
    const additional=Math.max(cash-reportedCash,0);
    const finalCredit=(resultado==='No entregado')?total:Math.max(total-cash,0);
    const finalResult=(resultado!=='No entregado' && finalCredit<=0.01)?'Cobrado':resultado;
    return {resultado,cash,additional,finalCredit,finalResult,err,minCash};
  }
  function paint(){
    const x=calc();
    const delta=x.cash-reportedCash;
    diff.value=money(delta).replace(appCfg('empresa.moneda','RD$')+' ','');
    receivedNow.textContent=money(x.cash);
    creditPay.textContent=money(x.additional);
    finalCreditEl.textContent=money(x.finalCredit);
    summary.className='lock-alert '+(x.err?'bad':'ok');
    if(x.err){
      summary.innerHTML=esc(x.err);
    }else if(hasDeliveryReport && x.additional>0){
      summary.innerHTML=`Caja válida. Reportado por delivery ${money(reportedCash)} · pago de crédito recibido ahora ${money(x.additional)} · crédito final ${money(x.finalCredit)}.`;
    }else if(x.finalCredit>0){
      summary.innerHTML=`Caja válida. Se recibe ${money(x.cash)} y queda a crédito ${money(x.finalCredit)}.`;
    }else{
      summary.innerHTML=`Caja cuadrada. Factura cubierta: ${money(total)}.`;
    }
  }
  res.onchange=()=>{ if(res.value==='Cobrado') cob.value=total; if(res.value==='No entregado') cob.value=0; if(res.value==='Entregado a crédito' && Number(cob.value||0)>total) cob.value=reportedCash; paint(); };
  cob.oninput=paint; paint();
  bindEnterFlow([cob,metodo,res,by,notas,btn]); focusAndSelect(cob);
  btn.onclick=async()=>{
    const recv=getSelectManual(m,'liqBy','liqByManual'); if(!recv) return alert('Selecciona quién recibe al delivery.');
    const x=calc();
    if(x.err) return alert(x.err);
    const notasExtra=[];
    if(hasDeliveryReport) notasExtra.push(`Reportado por delivery: ${defaultRes} · efectivo reportado ${money(reportedCash)} · crédito inicial ${money(initialCredit)}.`);
    if(x.additional>0) notasExtra.push(`Pago de crédito recibido en liquidación: ${money(x.additional)}; crédito final ${money(x.finalCredit)}.`);
    if(x.finalCredit>0 && x.additional<=0) notasExtra.push(`Se mantiene saldo a crédito ${money(x.finalCredit)}.`);
    if(x.finalResult==='Cobrado' && defaultRes==='Entregado a crédito') notasExtra.push('La orden fue marcada a crédito por delivery, pero quedó cobrada en liquidación.');
    const nota=[notas.value||'',...notasExtra].filter(Boolean).join(' | ')||null;
    await sb.from('orden_entregas').insert({orden_id:o.id,resultado:x.finalResult,monto_cobrado:x.cash,monto_pendiente:x.finalCredit,notas:nota,creado_por:state.user.id});
    if(x.cash>0) await sb.from('orden_pagos').insert({orden_id:o.id,cliente_id:o.cliente_id,monto:x.cash,metodo:metodo.value,recibido_por:state.user.id});
    m.remove();
    await setOrderState(o,x.finalResult,{recibido_por:recv,recibido_en:new Date().toISOString(),resultado_entrega:x.finalResult,monto_cobrado:x.cash,monto_pendiente:x.finalCredit,notas_liquidacion:nota,notas_estado:`Liquidación cerrada por CXC. Recibido en caja: ${money(x.cash)}. Crédito final: ${money(x.finalCredit)}.`});
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

function openCloseBatchLiquidationModal(deliveryName,g){
  const orders=g.items||[];
  const faltan=orders.filter(o=>!isFinalDeliveryResult(o));
  if(faltan.length) return alert('No puedes recibir este lote. Faltan pedidos sin resultado final:\n\n'+faltan.map(o=>'- '+(o.cliente?.negocio||o.codigo)).join('\n'));
  const summary=deliveryMoneySummary(orders);
  const rows=orders.map(o=>{
    const f=liquidationOrderFinancial(o);
    const type=liquidationRowType(o);
    const defaultCash=liquidationRowAmountDefault(o);
    const defaultResult=liquidationDefaultFinalResult(o);
    const note=type==='contado'?'Debe cotejarse con el efectivo físico.':type==='credito'?'Cerrar manualmente como crédito o digitar abono si trajo dinero.':type==='abono_credito'?'Cotejar abono y confirmar saldo pendiente.':type==='no_entregado'?'Confirmar que no se recibe dinero.':'Revisar diferencia/devolución.';
    return `<div class="liq-check-row" data-liq-row="${o.id}">
      <label class="check-cell"><input type="checkbox" data-batch-check="${o.id}"><span></span></label>
      <div class="liq-check-main"><b>${esc(o.cliente?.negocio||'Cliente')}</b><small>${esc(o.codigo||'')} · Factura ${esc(o.factura_no||'—')} · ${esc(o.cliente?.telefono||'')}</small><div class="badges"><span class="badge ${type==='contado'?'ok':type==='credito'?'info':type==='no_entregado'?'bad':'warn'}">${esc(liquidationRowLabel(type))}</span><span class="badge info">${esc(f.result||'Resultado')}</span>${f.credit?`<span class="badge warn">Crédito inicial ${money(f.credit)}</span>`:''}</div><div class="batch-row-result"><label>Resultado CXC</label><select data-batch-result="${o.id}">${liquidationFinalResultOptions(defaultResult)}</select></div><div class="hint">${esc(note)}</div></div>
      <div class="liq-check-num"><label>Factura</label><strong>${money(f.total)}</strong></div>
      <div class="liq-check-num"><label>Efectivo/abono</label><input type="number" step="0.01" min="0" data-batch-cash="${o.id}" value="${Number(defaultCash||0)}" disabled></div>
      <div class="liq-check-num"><label>Crédito/devolución</label><strong data-batch-credit="${o.id}">${money(f.credit)}</strong></div>
      <div class="liq-check-status" data-batch-status="${o.id}">Sin cotejar</div>
    </div>`;
  }).join('');
  const body=`<div class="form batch-liquidation-form"><div class="client-card" style="grid-template-columns:1fr"><div><div class="client-title">${esc(g.code)} · ${esc(deliveryName||'')}</div><div class="client-sub">Recepción por lote/viaje. Coteja ventas de contado, confirma créditos y luego genera el recibo.</div></div></div>
  <div class="grid4 compact-kpis"><div class="card kpi"><div class="label">Total facturas</div><div class="value">${money(summary.total)}</div></div><div class="card kpi"><div class="label">Efectivo esperado</div><div class="value">${money(summary.cobrado)}</div></div><div class="card kpi"><div class="label">Crédito inicial</div><div class="value">${money(summary.credito+summary.devuelto)}</div></div><div class="card kpi"><div class="label">Pedidos</div><div class="value">${orders.length}</div></div></div>
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
    if(input) input.disabled = !checked || selectedResult==='No entregado';
    let cash=Number(input?.value||0);
    if(selectedResult==='No entregado'){ cash=0; if(input) input.value=0; }
    let err='';
    if(cash<0) err='No puede ser negativo.';
    if(cash>f.total+0.01) err='Mayor que factura.';
    if(selectedResult==='Cobrado' && Math.abs(cash-f.total)>0.01) err='Cobrado debe igualar factura.';
    if(selectedResult==='Entregado a crédito' && cash>f.total+0.01) err='Abono mayor que factura.';
    if(selectedResult==='No entregado' && cash>0.01) err='No entregado no recibe efectivo.';
    if(selectedResult==='Devuelto parcial' && cash>f.total+0.01) err='Recibido mayor que factura.';
    let finalCredit=0;
    let returnAmount=0;
    let finalResult=selectedResult;
    if(selectedResult==='Cobrado'){ finalCredit=0; returnAmount=0; }
    else if(selectedResult==='Entregado a crédito'){ finalCredit=Math.max(f.total-cash,0); }
    else if(selectedResult==='Devuelto parcial'){ returnAmount=Math.max(f.total-cash,0); finalCredit=returnAmount; }
    else if(selectedResult==='No entregado'){ finalCredit=0; }
    return {checked,cash,err,finalCredit,returnAmount,finalResult,total:f.total,type,selectedResult,initial:f};
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
    const total=liquidationOrderFinancial(o).total;
    if(inp && sel.value==='Cobrado') inp.value=Number(total||0);
    if(inp && sel.value==='No entregado') inp.value=0;
    paint();
    if(inp && !inp.disabled) focusAndSelect(inp);
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
    if(summaryNow.unchecked.length) return alert('No puedes cerrar el lote. Faltan clientes por cotejar:\n\n'+summaryNow.unchecked.map(o=>'- '+(o.cliente?.negocio||o.codigo)).join('\n'));
    if(summaryNow.errors.length) return alert('Hay errores de caja:\n\n'+summaryNow.errors.join('\n'));
    const obs=$('#batchObs',m).value||null;
    const now=new Date().toISOString();
    const results=buildResults();
    const finalOrders=results.map(x=>({...x.o,estado:x.finalResult,resultado_entrega:x.finalResult,monto_cobrado:x.cash,monto_pendiente:x.finalCredit,notas_liquidacion:[x.o.notas_liquidacion, obs].filter(Boolean).join(' | ')}));
    await saveFormalLiquidationBatch(g.code,deliveryName,finalOrders,{efectivo_recibido:summaryNow.cashTotal,recibido_por,observacion:obs});
    for(const x of results){
      const o=x.o;
      const notaExtra=[];
      if(x.initial.result==='Entregado a crédito' && x.cash>0.01) notaExtra.push(`Crédito abonado/cobrado en liquidación: ${money(x.cash)}. Crédito final: ${money(x.finalCredit)}.`);
      if(x.finalResult==='Devuelto parcial') notaExtra.push(`Devolución parcial registrada en liquidación. Recibido: ${money(x.cash)}. Monto devuelto/ajustado: ${money(x.returnAmount||0)}.`);
      if(x.finalResult==='Entregado a crédito' && x.cash<=0.01) notaExtra.push(`Crédito confirmado en liquidación: ${money(x.finalCredit)}.`);
      const nota=[o.notas_liquidacion,obs,...notaExtra,`Lote ${g.code} cotejado por CXC. Recibido: ${money(x.cash)}. Crédito final: ${money(x.finalCredit)}.`].filter(Boolean).join(' | ');
      if(x.cash>0.01) await sb.from('orden_pagos').insert({orden_id:o.id,cliente_id:o.cliente_id,monto:Number(x.cash||0),metodo:'Efectivo',recibido_por:state.user.id});
      await sb.from('orden_entregas').insert({orden_id:o.id,resultado:x.finalResult,monto_cobrado:Number(x.cash||0),monto_pendiente:Number(x.finalCredit||0),notas:nota,creado_por:state.user.id});
      await sb.from('ordenes').update({estado:x.finalResult,resultado_entrega:x.finalResult,monto_cobrado:Number(x.cash||0),monto_pendiente:Number(x.finalCredit||0),recibido_por,recibido_en:now,notas_liquidacion:nota}).eq('id',o.id);
      await logOrderState(o,o.estado,x.finalResult,`Liquidación por lote ${g.code}. Cotejado por ${recibido_por}.`);
    }
    m.remove();
    printLiquidationReceipt(deliveryName,g.code,finalOrders,{efectivo_recibido:summaryNow.cashTotal,recibido_por,observacion:obs},true);
    await loadAll(); render(); toast(`Lote ${g.code} recibido, cerrado y guardado en historial`);
  };
  paint();
}

function printLiquidationReceipt(deliveryName,code,orders,recibo={},auto=true){
  const summary=deliveryMoneySummary(orders);
  const rows=orders.map(o=>`<tr><td>${esc(o.codigo||'')}</td><td>${esc(o.cliente?.negocio||'')}</td><td>${esc(o.factura_no||'—')}</td><td>${esc(o.resultado_entrega||o.estado||'')}</td><td>${money(orderMonto(o))}</td><td>${money(o.monto_cobrado||0)}</td><td>${money(o.monto_pendiente||0)}</td></tr>`).join('');
  const diff=Number(recibo.efectivo_recibido||0)-summary.cobrado;
  const html=`<!doctype html><html><head><meta charset="utf-8"><title>Recibo ${esc(code)}</title><style>body{font-family:Arial,sans-serif;font-size:12px;color:#111;padding:20px}h1{font-size:20px;margin:0 0 8px}table{width:100%;border-collapse:collapse;margin-top:12px}th,td{border:1px solid #ddd;padding:6px;text-align:left}th{background:#f3f4f6}.tot{font-weight:bold;background:#f8fafc}.sign{border-top:1px solid #000;margin-top:38px;padding-top:4px;width:240px;display:inline-block;margin-right:40px}.box{border:1px solid #ddd;border-radius:10px;padding:10px;margin:10px 0}@media print{button{display:none}}</style></head><body>${printCompanyHeader(appCfg('recibos.tituloLiquidacion','Recibo de liquidación'),'Cierre formal de lote/viaje')}<div class="box"><b>Lote/Viaje:</b> ${esc(code)}<br><b>Delivery:</b> ${esc(deliveryName||'—')}<br><b>Fecha:</b> ${new Date().toLocaleString('es-DO')}<br><b>Recibido por:</b> ${esc(recibo.recibido_por||'—')}</div><p><b>Órdenes:</b> ${orders.length} · <b>Total facturado:</b> ${money(summary.total)} · <b>Efectivo recibido:</b> ${money(recibo.efectivo_recibido||0)} · <b>Crédito:</b> ${money(summary.credito+summary.devuelto)} · <b>No entregado:</b> ${money(summary.noEntregado)} · <b>Diferencia:</b> ${money(diff)}</p><table><thead><tr><th>Orden</th><th>Cliente</th><th>Factura</th><th>Resultado</th><th>Total</th><th>Cobrado</th><th>Crédito</th></tr></thead><tbody>${rows}<tr class="tot"><td colspan="4">Totales</td><td>${money(summary.total)}</td><td>${money(summary.cobrado)}</td><td>${money(summary.credito+summary.devuelto)}</td></tr></tbody></table>${recibo.observacion?`<p><b>Observación:</b> ${esc(recibo.observacion)}</p>`:''}${signatureHtml(appCfg('recibos.firmaDelivery','Firma delivery'))}${signatureHtml(appCfg('recibos.firmaRecibido','Firma recibido por CXC'))}${printFooterHtml()}<button onclick="window.print()">Imprimir</button>${auto?'<script>setTimeout(()=>window.print(),400)<\/script>':''}</body></html>`;
  const w=window.open('','_blank','width=950,height=750'); if(!w) return alert('El navegador bloqueó la ventana de impresión.'); w.document.open(); w.document.write(html); w.document.close();
}
function printHistorySummary(deliveryName,rows){
  const htmlRows=rows.map(l=>`<tr><td>${esc(l.codigo_lote||'')}</td><td>${esc(l.delivery_nombre||deliveryName||'')}</td><td>${l.fecha_liquidacion?new Date(l.fecha_liquidacion).toLocaleString('es-DO'):'—'}</td><td>${Number(l.cantidad_ordenes||historyLotItems(l).length)}</td><td>${money(l.total_facturado||0)}</td><td>${money(l.efectivo_recibido||l.efectivo_reportado||0)}</td><td>${money(l.credito_pendiente||0)}</td><td>${money(l.diferencia||0)}</td></tr>`).join('');
  const html=`<!doctype html><html><head><meta charset="utf-8"><title>Historial liquidaciones</title><style>body{font-family:Arial,sans-serif;font-size:12px;padding:20px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:6px;text-align:left}th{background:#f3f4f6}@media print{button{display:none}}</style></head><body>${printCompanyHeader(appCfg('recibos.tituloHistorial','Historial de liquidaciones'),'Liquidaciones cerradas')}<p><b>Delivery:</b> ${esc(deliveryName||'Todos')} · <b>Fecha:</b> ${new Date().toLocaleString('es-DO')}</p><table><thead><tr><th>Lote</th><th>Delivery</th><th>Liquidado</th><th>Órdenes</th><th>Total</th><th>Efectivo</th><th>Crédito</th><th>Diferencia</th></tr></thead><tbody>${htmlRows}</tbody></table>${printFooterHtml()}<button onclick="window.print()">Imprimir</button><script>setTimeout(()=>window.print(),400)<\/script></body></html>`;
  const w=window.open('','_blank','width=950,height=750'); if(!w) return alert('El navegador bloqueó la ventana de impresión.'); w.document.open(); w.document.write(html); w.document.close();
}
function verifyRouteClose(deliveryName,orders){
  const faltan=orders.filter(o=>!isFinalDeliveryResult(o));
  if(faltan.length) return alert('No puedes cerrar la ruta todavía. Faltan pedidos con resultado final:\n\n'+faltan.map(o=>'- '+(o.cliente?.negocio||o.codigo)).join('\n'));
  alert(`Ruta lista para recibir/cerrar. Delivery: ${deliveryName||'—'}\nÓrdenes: ${orders.length}\nAhora confirma cada recepción o imprime el resumen para constancia.`);
}
function printLiquidationSummary(deliveryName,orders){
  const summary=deliveryMoneySummary(orders);
  const rows=orders.map(o=>`<tr><td>${esc(o.codigo||'')}</td><td>${esc(o.cliente?.negocio||'')}</td><td>${esc(o.resultado_entrega||o.estado||'Pendiente')}</td><td>${money(o.total_factura||o.total_estimado)}</td><td>${money(o.monto_cobrado||0)}</td></tr>`).join('');
  const html=`<!doctype html><html><head><meta charset="utf-8"><title>Liquidación ${esc(deliveryName||'')}</title><style>body{font-family:Arial,sans-serif;font-size:12px;color:#111;padding:20px}h1{font-size:20px}table{width:100%;border-collapse:collapse;margin-top:12px}th,td{border:1px solid #ddd;padding:6px;text-align:left}.tot{font-weight:bold;background:#f3f4f6}.sign{border-top:1px solid #000;margin-top:34px;padding-top:4px;width:240px;display:inline-block;margin-right:40px}@media print{button{display:none}}</style></head><body>${printCompanyHeader('Resumen de liquidación','Recepción de delivery')}<p><b>Delivery:</b> ${esc(deliveryName||'—')}<br><b>Fecha:</b> ${new Date().toLocaleString('es-DO')}</p><p><b>Órdenes:</b> ${orders.length} · <b>Total esperado:</b> ${money(summary.total)} · <b>Cobrado reportado:</b> ${money(summary.cobrado)} · <b>Crédito:</b> ${money(summary.credito)}</p><table><thead><tr><th>Orden</th><th>Cliente</th><th>Resultado</th><th>Total</th><th>Cobrado</th></tr></thead><tbody>${rows}<tr class="tot"><td colspan="3">Totales</td><td>${money(summary.total)}</td><td>${money(summary.cobrado)}</td></tr></tbody></table>${signatureHtml(appCfg('recibos.firmaRecibido','Recibido por'))}${signatureHtml(appCfg('recibos.firmaDelivery','Delivery'))}${printFooterHtml()}<button onclick="window.print()">Imprimir</button><script>setTimeout(()=>window.print(),400)<\/script></body></html>`;
  const w=window.open('','_blank','width=800,height=700'); if(!w) return alert('El navegador bloqueó la ventana de impresión.'); w.document.open(); w.document.write(html); w.document.close();
}
function openOrderStatusModal(o){ if(!o) return; const pesos=state.pesos.filter(p=>Number(p.orden_id)===Number(o.id)); const hist=state.historialEstados.filter(h=>Number(h.orden_id)===Number(o.id)); const pesoAlert=weightAlertText(o,o.peso_validado); const body=`<div class="grid2"><div><div class="section-title">Datos de orden</div><div class="kv"><b>Cliente</b><span>${esc(o.cliente?.negocio||'')}</span></div><div class="kv"><b>Estado</b><span>${esc(o.estado||'')} ${scheduleBadge(o)}</span></div><div class="kv"><b>Fecha despacho</b><span>${shortDate(dispatchDateOf(o))}${o.hora_despacho?' · '+esc(String(o.hora_despacho).slice(0,5)):''}${o.nota_programacion?' · '+esc(o.nota_programacion):''}</span></div><div class="kv"><b>Tomado por</b><span>${esc(workerDisplayName(o.tomado_por)||'—')}${o.tomado_en?' · '+new Date(o.tomado_en).toLocaleString('es-DO'):''}</span></div><div class="kv"><b>Preparado por</b><span>${preparedByDisplay(o)?esc(preparedByDisplay(o)):'—'}${!orderPreparationFinalized(o)&&o.tomado_por?' <small style="color:#64748b">(aún en preparación)</small>':''}</span></div><div class="kv"><b>Facturado por</b><span>${esc(workerDisplayName(o.facturado_por)||'—')} · ${esc(o.factura_no||'')}</span></div><div class="kv"><b>Validado / entregado por</b><span>${esc(workerDisplayName(o.validado_por)||'—')}${o.validado_en?' · '+new Date(o.validado_en).toLocaleString('es-DO'):''}</span></div><div class="kv"><b>Delivery</b><span>${esc(o.delivery_nombre||'—')}</span></div><div class="kv"><b>Total</b><span>${money(o.total_factura||o.total_estimado)}</span></div></div><div><div class="section-title">Pesajes</div>${pesoAlert?`<div class="kv alert-row"><b>Alerta</b><span>${esc(pesoAlert)}</span></div>`:''}${pesos.map(p=>`<div class="kv"><b>${esc(p.tipo)}</b><span>${Number(p.libras||0)} lb ${p.paquetes?`· ${p.paquetes} paquete(s)`:''}${p.notas?` · ${esc(p.notas)}`:''}</span></div>`).join('')||'<div class="empty">Sin pesajes.</div>'}</div></div><div class="section-title">Cronómetros por etapa</div>${stageTimersHtml(o)}<div class="section-title">Detalle</div><div class="order-scroll">${(o.items||[]).map(i=>`<div class="order-row ${prepStatusClass(i.estado_preparacion)}"><div class="order-main"><b class="prod-name">${esc(i.producto_nombre)}</b><small>${esc(i.unidad)} · Solicitado: ${Number(i.cantidad_pedida||0)} · ${detailPreparedText(i)}</small></div><span>${Number(i.cantidad_pedida||0)}</span><span>${i.cantidad_preparada!==null&&i.cantidad_preparada!==undefined?Number(i.cantidad_preparada):'—'}</span><span>${esc(i.estado_preparacion||'Pendiente')}</span></div>`).join('')}</div>${isSpecialOrder(o)?`<div class="section-title">Seguimiento especial</div><div class="kv"><b>Estado caso</b><span>${esc(specialCaseStatus(o))}</span></div><div class="kv"><b>Responsable</b><span>${esc(o.responsable_caso||'—')}</span></div><div class="kv"><b>Acción requerida</b><span>${esc(o.accion_caso||'—')}</span></div><div class="kv"><b>Recoger</b><span>${esc(o.producto_recoger||'—')}</span></div><div class="kv"><b>Entregar/cambio</b><span>${esc(o.producto_entregar||'—')}</span></div><div class="kv"><b>Ajuste/crédito</b><span>${money(o.monto_ajuste||0)} ${o.requiere_nota_credito?'· requiere nota de crédito':''}</span></div><div class="actions"><button class="btn" data-special-case="${o.id}">Gestionar caso</button></div>`:''}<div class="section-title">Historial de estados</div>${hist.slice(0,12).map(h=>`<div class="kv"><b>${new Date(h.creado_en).toLocaleString('es-DO')}</b><span>${esc(h.estado_anterior||'—')} → <b>${esc(h.estado_nuevo)}</b>${h.comentario?' · '+esc(h.comentario):''}</span></div>`).join('')||'<div class="empty">Sin historial todavía.</div>'}<div class="actions" style="margin-top:16px">${(puede('carniceria')||puede('ordenes')||isAdminRole())?`<button class="btn gray" data-print-prep="${o.id}">Imprimir preparación</button>`:''}${(puede('facturacion')||puede('ordenes')||isAdminRole())?`<button class="btn gray" data-print-order="${o.id}">Imprimir facturación 80mm</button>`:''}${o.estado==='Anulado'?'':`${canEditOrderGeneral(o)?`<button class="btn gray" data-edit-order="${o.id}">Editar orden</button>`:''}${canDeleteOrder(o)?`<button class="btn danger" data-cancel-order="${o.id}">${orderHasProgress(o)?'Anular orden':'Eliminar orden'}</button>`:''}`}</div>`; const m=openModal('Trazabilidad de orden',body); bindDynamic(); }
async function printOrderTicket(o){ if(!o) return; const prepPeso=orderLastPeso(o,'Preparado'); const finalPeso=orderLastPeso(o,'Entregado a delivery'); const now=new Date(); const items=o.items||[]; const lines=items.map(i=>{ const st=i.estado_preparacion||''; if(st==='Sin existencia') return `<tr><td>0</td><td>${esc(i.unidad||'')}</td><td>${esc(i.producto_nombre||'')}<br><span class="small">SIN EXISTENCIA</span></td></tr>`; const qty=i.cantidad_preparada!==null&&i.cantidad_preparada!==undefined?i.cantidad_preparada:i.cantidad_pedida; return `<tr><td>${esc(Number(qty||0))}</td><td>${esc(i.unidad||'')}</td><td>${esc(i.producto_nombre||'')}${st&&st!=='Preparado'?`<br><span class="small">${esc(st)}</span>`:''}</td></tr>`; }).join(''); const html=`<!doctype html><html><head><meta charset="utf-8"><title>${esc(o.codigo||'Orden')}</title><style>@page{size:80mm auto;margin:3mm}body{width:74mm;margin:0;font-family:Arial,sans-serif;font-size:11px;color:#000}.center{text-align:center}.line{border-top:1px dashed #000;margin:6px 0}h2{font-size:15px;margin:0 0 3px}.small{font-size:10px}table{width:100%;border-collapse:collapse}td{vertical-align:top;padding:2px 0}.b{font-weight:bold}.foot{margin-top:10px}.sign{border-top:1px solid #000;margin-top:14px;padding-top:2px}@media print{button{display:none}}.lock-alert{background:#fff8e6;border:1px solid #fbbf24;color:#92400e;border-radius:16px;padding:12px 14px;font-size:13px;font-weight:800;line-height:1.35}.lock-alert.ok{background:#ecfdf5;border-color:#86efac;color:#047857}.lock-alert.bad{background:#fff1f2;border-color:#fecdd3;color:#991b1b}.queue-box{background:#fff;border:1px solid #e5e7eb;border-radius:18px;padding:12px 14px;display:flex;gap:10px;align-items:center;justify-content:space-between;box-shadow:0 8px 18px rgba(17,24,39,.05);margin:10px 0 14px}.queue-box b{font-size:16px}.queue-box .limit{font-size:12px;color:#64748b}.op-card.locked{background:#fffbeb;border-color:#fbbf24}.op-card.free{background:#fff}.op-card.done{background:#ecfdf5;border-color:#86efac}.btn.danger,.btn.danger:hover{background:#dc2626;color:white}.btn.outline{background:#fff;color:#111827;border:1px solid #d1d5db}.input-error{border-color:#ef4444!important;box-shadow:0 0 0 3px rgba(239,68,68,.14)!important}.no-granel-note{display:inline-block;margin-top:4px;color:#991b1b;font-weight:900;font-size:11px}
    .live-bar{background:#fff;border:1px solid var(--line);border-radius:18px;padding:12px 14px;margin:-6px 0 16px;display:flex;justify-content:space-between;align-items:center;gap:12px;box-shadow:var(--shadow2);flex-wrap:wrap}.live-left{display:flex;align-items:center;gap:9px;flex-wrap:wrap}.live-dot{width:10px;height:10px;border-radius:999px;background:#94a3b8;box-shadow:0 0 0 4px rgba(148,163,184,.15)}.live-dot.on{background:#10b981;box-shadow:0 0 0 4px rgba(16,185,129,.15)}.live-dot.warn{background:#f59e0b;box-shadow:0 0 0 4px rgba(245,158,11,.15)}.live-dot.bad{background:#ef4444;box-shadow:0 0 0 4px rgba(239,68,68,.15)}.live-title{font-weight:950}.live-sub{font-size:12px;color:var(--muted);font-weight:700}.live-notice{border:1px solid #bfdbfe;background:#eff6ff;border-radius:14px;padding:9px 11px;font-size:12px;color:#1e40af;font-weight:800}.live-notice b{display:block;color:#111827;margin-bottom:2px}.live-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
  </style></head><body><div class="center"><h2>${esc(appCfg('empresa.nombre','PRODUCTOS CÉSAR'))}</h2><div class="b">${esc(appCfg('recibos.tituloOrden','ORDEN PARA FACTURAR'))}</div><div>${esc(o.codigo||'')}</div>${appCfg('empresa.telefono','')?`<div class="small">Tel: ${esc(appCfg('empresa.telefono',''))}</div>`:''}</div><div class="line"></div><div>Fecha orden: ${shortDate(o.fecha)}</div><div>Fecha despacho: ${shortDate(dispatchDateOf(o))} ${o.hora_despacho?esc(String(o.hora_despacho).slice(0,5)):''}</div><div>Impreso: ${now.toLocaleString('es-DO')}</div><div>Estado: ${esc(o.estado||'')}</div>${isFutureDispatch(o)?'<div class="b">NO DESPACHAR HOY</div>':''}<div class="line"></div><div class="b">CLIENTE</div><div>${esc(o.cliente?.negocio||'')}</div><div>${esc(o.cliente?.contacto||'')}</div><div>Tel: ${esc(o.cliente?.telefono||'')}</div><div>Sector: ${esc(o.cliente?.sector||'')}</div><div class="line"></div><div class="b">PREPARACIÓN</div><div>Preparado por: ${esc(preparedByDisplay(o)||'—')}</div><div>Peso pedido: ${esc(o.peso_preparado||prepPeso?.libras||'—')} lb</div><div>Paquetes: ${esc(o.paquetes_preparados||prepPeso?.paquetes||'—')}</div><div>Peso final: ${esc(o.peso_validado||finalPeso?.libras||'—')} lb</div><div class="line"></div><div class="b">DETALLE DE ORDEN</div><table>${lines}</table><div class="line"></div><div>Total estimado: ${money(o.total_factura||o.total_estimado)}</div>${o.notas?`<div>Notas: ${esc(o.notas)}</div>`:''}<div class="foot"><div class="sign">${esc(appCfg('recibos.firmaFacturacion','Facturado por'))}</div><div class="sign">No. Factura</div><div class="sign">Validado por</div><div class="sign">Archivo / firma</div>${appCfg('recibos.pie','')?`<div class="small center">${esc(appCfg('recibos.pie',''))}</div>`:''}</div><button onclick="window.print()">Imprimir</button><script>setTimeout(()=>window.print(),400)<\/script></body></html>`; const w=window.open('','_blank','width=420,height=720'); if(!w) return alert('El navegador bloqueó la ventana de impresión. Permite popups para esta página.'); w.document.open(); w.document.write(html); w.document.close(); const count=(+o.cantidad_impresiones||0)+1; const nextEstado = o.estado==='Lista para facturar' ? 'Impresa para facturar' : o.estado;
  await sb.from('ordenes').update({cantidad_impresiones:count,ultima_impresion:new Date().toISOString(),impreso_por:state.user.id,estado:nextEstado}).eq('id',o.id);
  if(nextEstado!==o.estado){
    await logOrderState(o,o.estado,nextEstado,'Impresión de volante 80 mm');
  }else{
    await logOrderState(o,o.estado,o.estado,'Reimpresión de volante 80 mm');
  }
  await loadAll(); render(); }
function renderConfigEmpleados(c){
  const areas=employeeAreas();
  c.innerHTML=`<div class="panel-head"><div><h3>Empleados operativos</h3><p>Fuente única de personal: vendedores, deliverys, carnicería, facturación, validación, liquidación y CXC. El módulo Delivery toma sus nombres desde aquí.</p></div><button class="btn" id="newEmp">+ Empleado</button></div><div class="stage-report-grid" style="margin-bottom:14px">${areas.map(a=>{const n=activeEmployees(a).length; return n?`<div class="stage-report"><b>${esc(a)}</b><strong>${n}</strong><small>activo(s)</small></div>`:''}).join('')}</div><div class="list">${state.empleados.map(e=>`<div class="client-card"><div><div class="client-title" style="font-size:16px">${esc(e.nombre)}</div><div class="badges"><span class="badge info">${esc(e.area)}</span><span class="badge ${e.activo?'ok':'bad'}">${e.activo?'Activo':'Inactivo'}</span></div>${e.observaciones?`<div class="hint">${esc(e.observaciones)}</div>`:''}</div><div class="card-actions"><button class="btn small gray" data-emp-edit="${e.id}">Editar</button><button class="btn small ${e.activo?'warn':'green'}" data-emp-toggle="${e.id}">${e.activo?'Desactivar':'Activar'}</button></div></div>`).join('')||'<div class="empty">No hay empleados operativos registrados.</div>'}</div>`;
  $('#newEmp').onclick=()=>openEmpleadoForm();
  $$('[data-emp-edit]').forEach(b=>b.onclick=()=>openEmpleadoForm(state.empleados.find(x=>x.id==b.dataset.empEdit)));
  $$('[data-emp-toggle]').forEach(b=>b.onclick=()=>toggleEmpleado(state.empleados.find(x=>x.id==b.dataset.empToggle)));
}
function openEmpleadoForm(e={}){
  const areas=employeeAreas();
  const body=`<div class="form"><div class="grid2"><div class="field"><label>Nombre</label><input id="empNombre" value="${esc(e.nombre||'')}"></div><div class="field"><label>Área / rol operativo</label><select id="empArea">${areas.map(a=>`<option ${a===e.area?'selected':''}>${a}</option>`).join('')}</select><div class="hint">Usa Vendedor para asignar clientes. Usa Delivery para asignar lotes y rutas.</div></div></div><div class="field"><label>Estado</label><select id="empActivo"><option value="true" ${e.activo!==false?'selected':''}>Activo</option><option value="false" ${e.activo===false?'selected':''}>Inactivo</option></select></div><div class="field"><label>Observaciones</label><textarea id="empObs">${esc(e.observaciones||'')}</textarea></div><button class="btn" id="saveEmp">Guardar empleado</button></div>`;
  const m=openModal(e.id?'Editar empleado':'Nuevo empleado operativo',body);
  $('#saveEmp',m).onclick=async()=>{
    const row={nombre:$('#empNombre',m).value.trim(),area:$('#empArea',m).value,activo:$('#empActivo',m).value==='true',observaciones:$('#empObs',m).value||null};
    if(!row.nombre) return alert('Nombre obligatorio.');
    const q=e.id?sb.from('empleados_operativos').update(row).eq('id',e.id):sb.from('empleados_operativos').insert(row);
    const {error}=await q; if(error) return alert(error.message);
    m.remove(); await loadAll(); render(); toast('Empleado guardado');
  };
  wireEnterFlow(m,['empNombre','empArea','empActivo','empObs','saveEmp']);
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
    m.remove(); await loadAll(); render(); toast('Producto guardado');
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
  await loadAll(); render(); toast(nuevo?'Producto activado':'Producto desactivado');
}
async function deleteProduct(p){
  if(!p) return;
  if(productHasOrders(p)){
    const soft=confirm(`El producto "${p.nombre}" ya tiene órdenes vinculadas.\n\nNo conviene eliminarlo porque puede afectar reportes e historial.\n\n¿Deseas desactivarlo para que no siga disponible en pedidos?`);
    if(soft){
      const r=await sb.from('productos_despacho').update({activo:false}).eq('id',p.id);
      if(r.error) return alert(r.error.message);
      await loadAll(); render(); toast('Producto desactivado');
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
      await loadAll(); render(); toast('Producto desactivado');
    } else alert(error.message);
    return;
  }
  await loadAll(); render(); toast('Producto eliminado definitivamente');
}

function downloadClienteTemplate(){ sheetExport('plantilla_clientes_productos_cesar.xlsx',[{codigo:'CL-999',negocio:'COLMADO EJEMPLO',contacto:'JUAN',tipo:'Colmado',sector:'San Marcos',telefono:'809-000-0000',vendedor:'Cesar',dias_contacto:'Lunes, Jueves',frecuencia_automatica:'2 veces por semana',estado:'Activo',whatsapp:true,credito:false,limite_credito:0,observaciones:''}]); }
function downloadProductoTemplate(){ sheetExport('plantilla_productos_productos_cesar.xlsx',[{codigo:'PR-999',nombre:'Longaniza ejemplo',categoria:'Carnes',unidad:'lb',precio:100,tipo_despacho_peso:'Por libra',peso_estandar_lb:'',requiere_pesaje:true,suma_peso_final:true,tolerancia_lb:0.25,permitir_ajustar_peso:true,permite_fraccion:true,activo:true,observaciones:''},{codigo:'PR-998',nombre:'Salami ejemplo',categoria:'Embutidos',unidad:'unidad',precio:300,tipo_despacho_peso:'Unidad peso fijo',peso_estandar_lb:3.5,requiere_pesaje:false,suma_peso_final:true,tolerancia_lb:0.25,permitir_ajustar_peso:false,permite_fraccion:false,activo:true,observaciones:'1 unidad = 3.5 lb; no se vende al granel'}]); }
function exportClientes(rows){ sheetExport('clientes_productos_cesar.xlsx', rows.map(c=>({codigo:c.codigo,negocio:c.negocio,contacto:c.contacto,tipo:c.tipo,sector:c.sector,telefono:c.telefono,vendedor:c.vendedor,dias_contacto:contactDaysText(c),frecuencia_automatica:freqFromDays(contactDaysOf(c)),estado:c.estado,whatsapp:c.whatsapp,credito:c.credito,limite_credito:c.limite_credito,observaciones:c.observaciones}))); }
function exportProductos(rows){ sheetExport('productos_productos_cesar.xlsx', rows.map(p=>({codigo:p.codigo,nombre:p.nombre,categoria:p.categoria,unidad:p.unidad,precio:p.precio_defecto,tipo_despacho_peso:productWeightTypeFromProduct(p),peso_estandar_lb:p.peso_estandar_lb,requiere_pesaje:p.requiere_pesaje!==false,suma_peso_final:p.suma_peso_final!==false,tolerancia_lb:p.tolerancia_lb||0.25,permitir_ajustar_peso:p.permitir_ajustar_peso!==false,permite_fraccion:productAllowsFraction(p),activo:p.activo,observaciones:p.observaciones}))); }
async function readXlsx(file){ if(!file) return []; const data=await file.arrayBuffer(); const wb=XLSX.read(data); return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:''}); }
function val(row,names){ const keys=Object.keys(row); for(const n of names){ const k=keys.find(k=>norm(k)===norm(n)); if(k) return row[k]; } return ''; }
async function importClientes(file){ const rows=await readXlsx(file); if(!rows.length) return; const payload=rows.map(r=>({codigo:String(val(r,['codigo','código'])).trim(),negocio:String(val(r,['negocio','cliente'])).trim(),contacto:String(val(r,['contacto'])).trim(),tipo:String(val(r,['tipo','tipo_negocio'])).trim()||'Otro',sector:String(val(r,['sector','zona'])).trim(),telefono:String(val(r,['telefono','teléfono'])).trim(),vendedor:String(val(r,['vendedor'])).trim()||state.profile.vendedor||'Cesar',dia_contacto:(String(val(r,['dias_contacto','días_contacto','dia_contacto','día','dia'])).trim()||'Lunes'),frecuencia:freqFromDays(splitContactDays(String(val(r,['dias_contacto','días_contacto','dia_contacto','día','dia'])).trim()||'Lunes')),estado:String(val(r,['estado'])).trim()||'Activo',whatsapp:String(val(r,['whatsapp'])).toLowerCase()!=='false',credito:String(val(r,['credito','crédito'])).toLowerCase()==='true',limite_credito:+val(r,['limite_credito','límite_credito'])||0,observaciones:String(val(r,['observaciones'])).trim(),archivado:false})).filter(x=>x.codigo&&x.negocio); if(!payload.length) return alert('No encontré filas válidas.'); const {error}=await sb.from('clientes').upsert(payload,{onConflict:'codigo'}); if(error) return alert(error.message); await sb.from('importaciones_log').insert({tipo:'clientes',archivo:file.name,importados:payload.length,detalle:{filas:rows.length},usuario:state.user.id}); await loadAll(); render(); toast('Clientes importados/actualizados: '+payload.length); }
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
  await loadAll(); render();
  const msg=`Importación finalizada\n\nInsertados: ${insertados}\nActualizados: ${actualizados}\nOmitidos por existir: ${omitidos}\nDesactivados: ${desactivados}\nErrores: ${errores.length}`;
  if(errores.length) alert(msg+'\n\nPrimeros errores:\n'+errores.slice(0,8).join('\n'));
  else alert(msg);
}

init();

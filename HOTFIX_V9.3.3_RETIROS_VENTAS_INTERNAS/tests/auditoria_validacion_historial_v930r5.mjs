import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const main=fs.readFileSync(path.join(root,'src','main.js'),'utf8');
const css=fs.readFileSync(path.join(root,'src','styles.css'),'utf8');
const sql=fs.readFileSync(path.join(root,'supabase','25_actualizacion_v930r5_historial_validacion.sql'),'utf8');

function ok(name,cond){
  if(!cond){ console.error(`ERROR - ${name}`); process.exitCode=1; }
  else console.log(`OK - ${name}`);
}
function bodyOf(name){
  const start=main.indexOf(`function ${name}`);
  if(start<0) return '';
  const next=main.indexOf('\nfunction ',start+10);
  return main.slice(start,next<0?main.length:next);
}

ok('marcador V9.3.0 R5',main.includes('V9.3.0 R5'));
ok('pestañas pendientes e historial',main.includes("['pendientes',") && main.includes("['historial',") && main.includes('renderValidationHistory'));
ok('historial inicia en hoy',main.includes('validationHistoryFrom:today()') && main.includes('validationHistoryTo:today()'));
ok('filtros de historial',main.includes('validationHistDelivery') && main.includes('validationHistSearch') && main.includes('data-validation-preset'));
ok('snapshot de hoja de ruta',main.includes('buildDeliveryRouteSnapshot') && main.includes('hoja_ruta_snapshot'));
ok('reimpresión marcada como copia',main.includes('COPIA / REIMPRESIÓN') && main.includes('printValidationRouteFromLot'));
ok('constancia de entrega',main.includes('Constancia de entrega a delivery') && main.includes('printValidationDeliveryReceipt'));
ok('reporte diario agrupado',main.includes('Reporte diario de entregas a delivery') && main.includes('printValidationDailyReport'));
ok('auditoría documental',main.includes('entrega_documentos_historial') && main.includes('recordDeliveryDocumentEvent'));
ok('reimpresión no registra transición',!bodyOf('printValidationRouteFromLot').includes('logOrderState') && !bodyOf('printValidationDeliveryReceipt').includes('logOrderState') && !bodyOf('printValidationDailyReport').includes('logOrderState'));
ok('diseño móvil R5',css.includes('V9.3.0 R5 - Historial de entregas') && css.includes('.validation-history-toolbar') && css.includes('.validation-history-kpis'));
ok('SQL crea auditoría',sql.includes('create table if not exists public.entrega_documentos_historial'));
ok('SQL agrega snapshot',sql.includes('add column if not exists hoja_ruta_snapshot jsonb'));
ok('SQL protege auditoría con RLS',sql.includes('entrega_documentos_select_v930r5') && sql.includes("puede_modulo_v930r5('validacion','editar')"));

if(process.exitCode) process.exit(process.exitCode);
console.log('\nAuditoría Historial de Validación V9.3.0 R5 aprobada.');

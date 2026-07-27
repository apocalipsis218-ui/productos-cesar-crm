import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const main=fs.readFileSync(path.join(root,'src','main.js'),'utf8');
const css=fs.readFileSync(path.join(root,'src','styles.css'),'utf8');
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));

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

ok('marcador V9.3.0 R7',main.includes('V9.3.0 R7 · Confirmación de órdenes por WhatsApp'));
ok('configuración global WhatsApp',main.includes("whatsapp:{ofrecerAlGuardar:true,botonManual:true"));
ok('configuración cargada desde Supabase',main.includes("'incentivos','whatsapp'") && main.includes("saveConfigKey('whatsapp',val)"));
ok('activar/desactivar al guardar',bodyOf('maybeOfferOrderWhatsApp').includes('cfg.ofrecerAlGuardar===false'));
ok('botón manual configurable',bodyOf('orderWhatsAppManualButton').includes('cfg.botonManual===false') && main.includes('data-wa-order'));
ok('vista previa y plantilla editable',bodyOf('renderConfigPlantillas').includes('waOrderTemplate') && bodyOf('renderConfigPlantillas').includes('previewWaOrderCfg'));
ok('mensaje se ofrece después de guardar',main.includes("maybeOfferOrderWhatsApp(savedOrder,orderWasUpdate?'actualizacion':'confirmacion')"));
ok('actualización identificada',bodyOf('buildOrderWhatsAppMessage').includes('ACTUALIZACIÓN DE ORDEN'));
ok('detalle sin campos económicos',!bodyOf('orderDetailWithoutPrices').match(/\.precio\b|subtotal|total_factura|total_estimado|money\s*\(/));
ok('plantilla bloquea variables económicas',bodyOf('sanitizeOrderWhatsAppTemplate').includes('monto|precio|precios|subtotal|total|factura'));
ok('no envía silenciosamente',bodyOf('showOrderWhatsAppPrompt').includes('Abrir WhatsApp') && bodyOf('openOrderWhatsApp').includes('window.open'));
ok('auditoría dice preparado',bodyOf('logOrderWhatsAppPrepared').includes('WhatsApp preparado'));
ok('auditoría no cambia el estado',bodyOf('logOrderWhatsAppPrepared').includes('estado_anterior:o.estado') && bodyOf('logOrderWhatsAppPrepared').includes("estado_nuevo:o.estado"));
ok('órdenes anuladas bloqueadas',bodyOf('openOrderWhatsApp').includes("o.estado==='Anulado'"));
ok('solo pedidos normales',bodyOf('openOrderWhatsApp').includes('isCommercialNormalOrder(o)'));
ok('diseño de vista previa móvil',css.includes('V9.3.0 R7 - Confirmación de órdenes por WhatsApp') && css.includes('.wa-order-preview'));
ok('auditoría R7 integrada a npm test',pkg.scripts.test.includes('auditoria_whatsapp_ordenes_v930r7.mjs'));

// Prueba funcional del generador: extrae únicamente las funciones puras necesarias.
const detailCode=bodyOf('orderDetailWithoutPrices');
const sanitizeCode=bodyOf('sanitizeOrderWhatsAppTemplate');
const buildCode=bodyOf('buildOrderWhatsAppMessage');
const factory=new Function('orderWhatsAppConfig','defaultSystemConfig','dispatchDateOf','today','shortDate','rowDateKey','createdAtOf',`${detailCode}\n${sanitizeCode}\n${buildCode}\nreturn {buildOrderWhatsAppMessage};`);
const api=factory(
  ()=>({plantilla:'{encabezado}\nOrden {codigo_orden}\n{detalle_sin_precio}\n{observacion_cliente}\n{total}\n{precio}'}),
  ()=>({whatsapp:{plantilla:''}}),
  o=>o.fecha_despacho,
  ()=>'2026-07-20',
  v=>String(v),
  v=>String(v).slice(0,10),
  o=>o.creado_en||o.fecha
);
const sample={id:1,codigo:'ORD-001',creado_en:'2026-07-20T09:00:00',fecha_despacho:'2026-07-21',estado:'Pedido recibido',cliente:{contacto:'Juan',negocio:'Colmado Ejemplo'},items:[{producto_nombre:'Carne de res',cantidad_pedida:10,unidad:'lb',precio:999,subtotal:9990}],nota_programacion:'Entregar temprano',total_estimado:9990,total_factura:9990};
const msg=api.buildOrderWhatsAppMessage(sample,'confirmacion');
ok('prueba funcional: incluye producto/cantidad',msg.includes('10 lb') && msg.includes('Carne de res'));
ok('prueba funcional: excluye precio y monto',!msg.includes('999') && !msg.includes('9,990'));
ok('prueba funcional: elimina variables prohibidas',!msg.includes('{total}') && !msg.includes('{precio}'));

if(process.exitCode) process.exit(process.exitCode);
console.log('\nAuditoría WhatsApp de órdenes V9.3.0 R7 aprobada.');

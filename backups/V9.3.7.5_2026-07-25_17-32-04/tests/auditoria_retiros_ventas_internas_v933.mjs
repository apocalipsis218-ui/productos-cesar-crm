import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');
const main=read('src/main.js');
const css=read('src/styles.css');
const pwa=read('src/pwa.js');
const sql=read('supabase/27_actualizacion_v933_retiros_ventas_internas.sql');
const pkg=JSON.parse(read('package.json'));
const ok=(cond,msg)=>{ if(!cond){ console.error('ERROR - '+msg); process.exit(1); } console.log('OK - '+msg); };

ok(/^9\.3\.(?:[3-9]|[1-9]\d+)(?:\.\d+)?$/.test(pkg.version),'package actualizado a V9.3.3');
ok(main.includes('V9.3.3') && ['V9.3.3 PWA','V9.3.4 PWA','V9.3.5 PWA','V9.3.5.1 PWA','V9.3.6 PWA','V9.3.7 PWA','V9.3.7.1 PWA','V9.3.7.3 PWA','V9.3.7.4 PWA'].some(v=>pwa.includes(`APP_VERSION = '${v}'`)),'versión V9.3.3 PWA visible');
ok(main.includes('modalidad_entrega') && main.includes("Retiro en negocio"),'modalidad de entrega separada del tipo de orden');
ok(main.includes('tipo_cliente_orden') && main.includes('Venta interna / mostrador'),'venta interna disponible sin crear cliente');
ok(main.includes("Es obligatorio escribir el nombre del comprador") && main.includes("El nombre del cliente es obligatorio"),'nombre obligatorio en toda orden');
ok(main.includes("cliente_id:customerType==='Registrado'?+cid:null"),'venta interna guarda cliente_id vacío');
ok(main.includes("condicion_pago:customerType==='Venta interna'?'Contado'"),'venta interna queda al contado');
ok(main.includes("o.tipo_cliente_orden!=='Venta interna' && o.cliente_id!==null"),'venta interna no cuenta como gestión de cliente CRM');
ok(main.includes("function isStorePickup") && main.includes("function pickupReadyOrders"),'reglas centrales de retiro integradas');
ok(main.includes("modalidad_entrega:reqDelivery?'Delivery':'No aplica'"),'casos especiales conservan modalidad coherente');
ok(main.includes("['pendientes','Delivery pendiente'],['retiros','Retiros en negocio']"),'pestaña Retiros en Validación');
ok(main.includes("openPickupConfirmModal") && main.includes("'Entregada en negocio'"),'confirmación y cierre de retiro con trazabilidad');
ok(main.includes('if(isStorePickup(o)) return false;') && main.includes("!isStorePickup(o) && o.delivery_nombre"),'retiros excluidos de Delivery y Liquidación');
ok(main.includes("if(st==='Lista para retiro') return 'retiros'") && main.includes("['retiros','Retiros','Listas para retirar']"),'Kanban identifica retiros por separado');
ok(main.includes('print-pickup-alert') && main.includes('NO ENVIAR A DELIVERY'),'aviso visible en impresiones');
ok(main.includes("impresion.tamanoTituloPx") && main.includes("impresion.tamanoDetallePx"),'tamaño configurable de títulos y detalle');
ok(main.includes('function renderConfigFlujos') && main.includes('Flujos de órdenes'),'configuración de flujos integrada');
ok(css.includes('V9.3.3 — RETIROS, VENTAS INTERNAS E IMPRESIÓN CONFIGURABLE'),'estilos V9.3.3 incluidos');
ok(sql.includes('ALTER COLUMN cliente_id DROP NOT NULL'),'SQL permite venta interna sin cliente registrado');
ok(sql.includes('ordenes_cliente_nombre_obligatorio_chk') && sql.includes('pc_normalizar_flujo_orden_v933'),'SQL exige nombre y normaliza el flujo');
ok(sql.includes("modalidad_entrega = 'Retiro en negocio'") && sql.includes('requiere_delivery := false'),'SQL bloquea Delivery para retiros');
ok(sql.includes('entregado_mostrador_por') && sql.includes('entregado_mostrador_en'),'SQL registra la entrega en mostrador');
ok(pkg.scripts.test.includes('auditoria_retiros_ventas_internas_v933.mjs'),'auditoría V9.3.3 integrada en npm test');


ok(/function\s+isInternalSale\s*\(o\)\s*\{\s*return\s+orderCustomerType\(o\)===['"]Venta interna['"]/.test(main), 'venta interna no depende de variables locales del modal');
ok(!/function\s+isInternalSale\s*\(o\)\s*\{[^}]*initialCustomerType/.test(main), 'helper global no usa initialCustomerType fuera de alcance');

console.log('Auditoría Retiros, Ventas Internas e Impresión V9.3.3 aprobada.');

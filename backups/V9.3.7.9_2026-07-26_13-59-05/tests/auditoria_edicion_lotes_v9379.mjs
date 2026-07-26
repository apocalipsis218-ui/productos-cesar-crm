import fs from 'node:fs';

const main=fs.readFileSync('src/main.js','utf8');
const css=fs.readFileSync('src/styles.css','utf8');
const sql=fs.readFileSync('supabase/sql/38_actualizacion_v9379_edicion_segura_lotes.sql','utf8');
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
const installer=fs.readFileSync('APLICAR_V9379.ps1','utf8');

const checks=[
  ['versión V9.3.7.9 sincronizada',pkg.version==='9.3.7.9'&&/V9\.3\.7\.9 PWA/.test(main)],
  ['botón Editar lote visible',/>Editar lote</.test(main)&&/openModal\('Editar lote'/.test(main)],
  ['lista órdenes incluidas',/data-lot-current-order/.test(main)],
  ['lista órdenes disponibles',/data-lot-add-order/.test(main)],
  ['motivo obligatorio',/correctLotReason/.test(main)&&/reason\.length<5/.test(main)],
  ['RPC transaccional conectada',/editar_composicion_lote_v9379/.test(main)&&/create or replace function public\.editar_composicion_lote_v9379/.test(sql)],
  ['solo acepta lotes abiertos',/lower\(coalesce\(v_lote\.estado,'Abierto'\)\) <> 'abierto'/.test(sql)],
  ['bloquea recepción, resultado y liquidación',/recibido_en is not null/.test(sql)&&/resultado_entrega/.test(sql)&&/liquidaciones_lotes/.test(sql)],
  ['evita asignación en dos lotes',/asignadas a otro lote/.test(sql)&&/entrega_lote_detalle/.test(sql)],
  ['no permite lote vacío',/debe conservar al menos una orden/.test(sql)],
  ['retirada vuelve a Facturada',/Orden retirada[\s\S]*set estado='Facturada'/.test(sql)],
  ['agregada pasa a delivery',/Orden agregada[\s\S]*set estado='Asignada a delivery'/.test(sql)],
  ['monto pendiente conserva NOT NULL',/monto_pendiente=0/.test(sql)&&!/monto_pendiente\s*=\s*null/.test(sql)],
  ['recalcula todos los totales',/cantidad_ordenes=s\.cnt/.test(sql)&&/peso_esperado=s\.peso_esperado/.test(sql)&&/peso_entregado=s\.peso_entregado/.test(sql)&&/total_facturado=s\.total_facturado/.test(sql)],
  ['actualiza snapshot de impresión',/hoja_ruta_snapshot=coalesce\(p_snapshot/.test(sql)&&/buildDeliveryRouteSnapshot/.test(main)],
  ['auditoría privada transaccional',/insert into public\.auditoria_excepciones/.test(sql)&&/Edición de composición de lote/.test(sql)],
  ['interfaz adaptable',/lot-edit-order-list/.test(css)&&/@media\(max-width:700px\)/.test(css)],
  ['SQL 38 incluido en instalador',/38_actualizacion_v9379_edicion_segura_lotes\.sql/.test(installer)],
  ['prueba integrada en npm test',/auditoria_edicion_lotes_v9379\.mjs/.test(pkg.scripts.pretest)]
];

let failed=0;
for(const [name,ok] of checks){
  console.log(`${ok?'OK':'ERROR'} - ${name}`);
  if(!ok) failed++;
}
if(failed) process.exit(1);
console.log('Auditoría Edición Segura de Lotes V9.3.7.9 aprobada.');

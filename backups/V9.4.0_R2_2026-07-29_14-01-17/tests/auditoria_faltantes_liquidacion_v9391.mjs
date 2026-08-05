import fs from 'node:fs';

const main=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const sql=fs.readFileSync(new URL('../supabase/sql/44_actualizacion_v9391_faltantes_liquidacion_ocasional.sql',import.meta.url),'utf8');
const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));

const checks=[
  ['versión V9.3.9.1 o superior sincronizada',/^(?:9\.3\.9\.[1-9][0-9]*|9\.4\.0)$/.test(pkg.version) && main.includes(`V${pkg.version}`)],
  ['cliente_id de pago admite ocasionales',/orden_pagos[\s\S]*alter column cliente_id drop not null/i.test(sql)],
  ['pago conserva snapshot del cliente',sql.includes('pc_snapshot_pago_cliente_v9391') && sql.includes('cliente_nombre') && sql.includes('cliente_telefono')],
  ['preparación y pendiente son transaccionales',sql.includes('guardar_preparacion_faltantes_v9391') && sql.includes('guardar_preparacion_v9381')],
  ['solo copia artículos sin existencia',/estado_preparacion'='Sin existencia'/.test(sql)],
  ['evita doble pendiente por orden origen',sql.includes('uq_orden_pendiente_existencia_origen_v9391')],
  ['estado pendiente no entra a Carnicería',main.includes("if(st==='Pendiente por existencia') return 'ordenes'")],
  ['pregunta antes de generar seguimiento',main.includes('shortageFollowupDialog') && main.includes('Crear orden pendiente')],
  ['permite liberar a Carnicería',sql.includes('liberar_pendiente_existencia_v9391') && main.includes('data-release-stock-order')],
  ['SQL 44 integrado en la interfaz',main.includes('Verifica que aplicaste el SQL 44')]
];

let failed=0;
for(const [name,ok] of checks){
  console.log(`${ok?'OK':'ERROR'} - ${name}`);
  if(!ok) failed++;
}
if(failed) process.exit(1);
console.log('Auditoría V9.3.9.1 de faltantes y liquidación ocasional aprobada.');

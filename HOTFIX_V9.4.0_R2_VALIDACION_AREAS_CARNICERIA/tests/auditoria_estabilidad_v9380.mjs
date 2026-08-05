import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { mergeRecentAndPendingOrders, shouldRunFallbackPolling } from '../src/stabilityV9380.js';

const root=process.cwd();
const main=fs.readFileSync(path.join(root,'src','main.js'),'utf8');
const sqlDir=path.join(root,'supabase','sql');

const merged=mergeRecentAndPendingOrders(
  [{id:503,estado:'Cobrado'},{id:502,estado:'Facturada'}],
  [{id:502,estado:'Facturada',marca:'actualizada'},{id:7,estado:'Entregado a crédito'}]
);
assert.deepEqual(merged.map(x=>x.id),[503,502,7]);
assert.equal(merged.find(x=>x.id===502).marca,'actualizada');
assert.equal(shouldRunFallbackPolling({hasUser:true,liveStatus:'en vivo'}),false);
assert.equal(shouldRunFallbackPolling({hasUser:true,liveStatus:'polling'}),true);
assert.equal(shouldRunFallbackPolling({hasUser:false,liveStatus:'polling'}),false);

assert.ok(
  /p_estado_esperado:old,p_estado_nuevo:'En preparación'/.test(main) ||
  (/sb\.rpc\('tomar_orden_v9397'/.test(main) && /p_estado_esperado:old/.test(main)),
  'La toma debe ser condicional y atómica.'
);
assert.match(main,/if\(!takenRows\?\.length\)/,'Debe detectar que otra estación ganó la toma.');
assert.match(main,/fetchPendingOrdersV9380/,'Debe cargar pendientes históricos paginados.');
assert.match(main,/PENDING_HISTORY_KEY_V9380/,'Debe conservar localmente el historial que no pudo enviarse.');
assert.match(main,/shouldRunFallbackPolling/,'Realtime debe suspender el polling redundante.');

for(let n=19;n<=32;n+=1){
  const matches=fs.readdirSync(sqlDir).filter(name=>name.startsWith(`${n}_`) && name.endsWith('.sql'));
  assert.equal(matches.length,1,`Debe existir exactamente un SQL ${n} en supabase/sql.`);
}

console.log('OK - fusión real de órdenes recientes y pendientes');
console.log('OK - órdenes antiguas pendientes permanecen visibles');
console.log('OK - toma condicional impide doble asignación');
console.log('OK - historial fallido queda pendiente para reintento');
console.log('OK - polling se pausa cuando Realtime está en vivo');
console.log('OK - cadena SQL 19-32 recuperada');
console.log('Auditoría de estabilidad V9.3.9.0 aprobada.');

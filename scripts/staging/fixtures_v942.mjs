import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const EXPECTED_REF = 'odlwbuagtrgmfpdohors';
const TAG = 'STG942';
const EMAIL_SUFFIX = '@stg942.example.invalid';
const action = process.argv[2] || 'plan';
const flags = new Set(process.argv.slice(3));

const users = [
  ['gerente', 'Gerente Staging', 'Gerente', 'Gerencia', ['Administración']],
  ['vendedor', 'Vendedor Staging', 'Vendedor', 'Vendedor', []],
  ['carniceria', 'Carnicería Staging', 'Carnicería', 'Carnicería', []],
  ['facturacion', 'Facturación Staging', 'Facturación', 'Facturación', []],
  ['validacion', 'Validación Staging', 'Validación', 'Validación', []],
  ['delivery', 'Delivery Staging', 'Delivery', 'Delivery', []],
  ['liquidacion', 'Liquidación Staging', 'Liquidación', 'Liquidación', ['CXC']],
];

const catalogs = JSON.parse(readFileSync(new URL('./catalogos_v942.json', import.meta.url), 'utf8'));
const modules = catalogs.modulos_sistema;

function fail(message) { throw new Error(message); }
function projectRef(url) {
  const host = new URL(url).hostname;
  const match = host.match(/^([a-z0-9]+)\.supabase\.co$/);
  return match?.[1] || '';
}
function client() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) fail('Faltan SUPABASE_URL o SUPABASE_SECRET_KEY.');
  if (projectRef(url) !== EXPECTED_REF) fail(`Destino rechazado: se esperaba ${EXPECTED_REF}.`);
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
async function authenticatedClient(email, password) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!key) fail('Falta SUPABASE_PUBLISHABLE_KEY.');
  if (projectRef(url) !== EXPECTED_REF) fail(`Destino rechazado: se esperaba ${EXPECTED_REF}.`);
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  await checked(sb.auth.signInWithPassword({ email, password }), `iniciar sesión ${email}`);
  return sb;
}
function requireWriteConfirmation(kind) {
  if (!flags.has('--execute')) fail(`${kind} está en modo seguro. Agrega --execute.`);
  if (process.env.CONFIRM_STAGING_PROJECT !== EXPECTED_REF) {
    fail(`Define CONFIRM_STAGING_PROJECT=${EXPECTED_REF}.`);
  }
}
async function checked(promise, label) {
  const result = await promise;
  if (result.error) fail(`${label}: ${result.error.message}`);
  return result.data;
}
async function listAllUsers(sb) {
  const all = [];
  for (let page = 1; ; page += 1) {
    const data = await checked(sb.auth.admin.listUsers({ page, perPage: 100 }), 'listar usuarios');
    all.push(...data.users);
    if (data.users.length < 100) return all;
  }
}
async function ensureAuthUsers(sb) {
  const password = process.env.STAGING_TEST_PASSWORD;
  if (!password || password.length < 14) fail('STAGING_TEST_PASSWORD debe tener al menos 14 caracteres.');
  const existing = await listAllUsers(sb);
  const result = [];
  for (const [slug, name, role] of users) {
    const email = `${slug}${EMAIL_SUFFIX}`;
    let user = existing.find((item) => item.email === email);
    if (!user) {
      const data = await checked(sb.auth.admin.createUser({
        email, password, email_confirm: true,
        app_metadata: { fixture: TAG }, user_metadata: { display_name: name },
      }), `crear ${email}`);
      user = data.user;
    } else {
      if (user.app_metadata?.fixture !== TAG) fail(`Usuario existente ajeno a ${TAG}: ${email}`);
      const data = await checked(
        sb.auth.admin.updateUserById(user.id, { password }),
        `sincronizar contraseña ${email}`,
      );
      user = data.user;
    }
    result.push({ slug, name, role, email, id: user.id });
  }
  return result;
}
async function seed() {
  requireWriteConfirmation('La carga');
  const sb = client();
  const existingOrders = await checked(sb.from('ordenes').select('id').like('codigo', `${TAG}-ORD-%`).limit(1), 'comprobar fixtures');
  if (existingOrders.length) fail(`Ya existen fixtures ${TAG}. Verifica o limpia antes de recargar.`);
  const authUsers = await ensureAuthUsers(sb);

  await checked(sb.from('modulos_sistema').upsert(modules, { onConflict: 'id' }), 'módulos');
  await checked(sb.from('roles_permisos').upsert(catalogs.roles_permisos, { onConflict: 'rol,modulo' }), 'permisos');
  await checked(sb.from('orden_transiciones_v9382').upsert(catalogs.orden_transiciones_v9382, { onConflict: 'estado_anterior,estado_nuevo' }), 'transiciones');

  const employeeRows = users.map(([, name, , area, extras]) => ({
    nombre: `[${TAG}] ${name}`, area, areas_adicionales: extras, activo: true,
    observaciones: `[${TAG}] empleado sintético`,
  }));
  await checked(sb.from('empleados_operativos').upsert(employeeRows, { onConflict: 'nombre,area' }), 'empleados');
  const employees = await checked(sb.from('empleados_operativos').select('id,nombre,area').like('nombre', `[${TAG}]%`), 'leer empleados');

  const profiles = authUsers.map((u) => ({
    id: u.id, nombre: u.name, correo: u.email, rol: u.role, activo: true,
    empleado_id: employees.find((e) => e.nombre === `[${TAG}] ${u.name}`)?.id,
    tipo_cuenta: 'empleado',
  }));
  await checked(sb.from('perfiles').upsert(profiles, { onConflict: 'id' }), 'perfiles');
  const gerenteLogin = authUsers.find((u) => u.role === 'Gerente');
  const userSb = await authenticatedClient(gerenteLogin.email, process.env.STAGING_TEST_PASSWORD);

  const clients = await checked(sb.from('clientes').upsert([
    { codigo: `${TAG}-CLI-001`, negocio: `[${TAG}] Comedor El Ensayo`, contacto: 'Ana Prueba', tipo: 'Comedor', sector: 'San Marcos', telefono: '809-555-0101', estado: 'Activo', credito: true, limite_credito: 25000, direccion: 'Calle de prueba 1' },
    { codigo: `${TAG}-CLI-002`, negocio: `[${TAG}] Restaurante Demostración`, contacto: 'Luis Prueba', tipo: 'Restaurante', sector: 'Centro', telefono: '809-555-0102', estado: 'Activo', credito: false, direccion: 'Calle de prueba 2' },
  ], { onConflict: 'codigo' }).select('id,codigo,negocio'), 'clientes');

  const products = await checked(sb.from('productos_despacho').upsert([
    { nombre: `[${TAG}] Paleta de cerdo`, codigo: `${TAG}-PRO-001`, categoria: 'Cerdo', unidad: 'lb', precio_defecto: 115, requiere_pesaje: true },
    { nombre: `[${TAG}] Pollo entero`, codigo: `${TAG}-PRO-002`, categoria: 'Pollo', unidad: 'unidad', precio_defecto: 325, tipo_despacho_peso: 'Peso estándar', requiere_pesaje: true, peso_estandar_lb: 4.5 },
    { nombre: `[${TAG}] Arroz selecto`, codigo: `${TAG}-PRO-003`, categoria: 'Abarrotes', unidad: 'saco', precio_defecto: 1850, tipo_despacho_peso: 'Sin pesaje', requiere_pesaje: false, suma_peso_final: false },
  ], { onConflict: 'nombre' }).select('id,nombre,precio_defecto'), 'productos');

  const gerente = gerenteLogin;
  const vendedor = employees.find((e) => e.area === 'Vendedor');
  const scenarios = [
    ['001','Pedido recibido','Registrado','Delivery',clients[0],true],
    ['002','En preparación','Registrado','Delivery',clients[1],true],
    ['003','Lista para facturar','Registrado','Retiro en negocio',clients[0],false],
    ['004','Facturada','Ocasional','Delivery',null,true],
    ['005','Validada para delivery','Registrado','Delivery',clients[1],true],
    ['006','Entregado a crédito','Registrado','Delivery',clients[0],true],
  ];
  const orderRows = scenarios.map(([suffix, estado, tipo, modalidad, cli, delivery]) => ({
    codigo: `${TAG}-ORD-${suffix}`, cliente_id: cli?.id ?? null, estado: 'Pedido recibido',
    condicion_pago: suffix === '006' ? 'Crédito' : 'Contado', total_estimado: 3450,
    total_factura: ['004','005','006'].includes(suffix) ? 3450 : 0,
    factura_no: ['004','005','006'].includes(suffix) ? `${TAG}-FAC-${suffix}` : null,
    vendedor: 'Vendedor Staging', notas: `[${TAG}] escenario ${estado}`,
    creado_por: gerente.id, actualizado_por: gerente.id, tipo_orden: 'Pedido normal',
    requiere_delivery: delivery, modalidad_entrega: modalidad, tipo_cliente_orden: tipo,
    cliente_nombre_orden: cli?.negocio ?? `[${TAG}] Cliente ocasional`,
    cliente_telefono_orden: tipo === 'Ocasional' ? '809-555-0199' : null,
    cliente_sector_orden: tipo === 'Ocasional' ? 'Zona de prueba' : null,
    cliente_direccion_orden: tipo === 'Ocasional' ? 'Dirección ficticia' : null,
    tomado_por_empleado_id: vendedor?.id,
    delivery_nombre: delivery ? `[${TAG}] Delivery Staging` : null,
    cxc_estado: suffix === '006' ? 'Pendiente' : 'No aplica',
    cxc_saldo_inicial: suffix === '006' ? 3450 : null,
    monto_pendiente: suffix === '006' ? 3450 : 0,
  }));
  await checked(userSb.from('ordenes').insert(orderRows), 'órdenes');
  const orders = await checked(sb.from('ordenes').select('id,codigo,estado').like('codigo', `${TAG}-ORD-%`), 'leer órdenes');

  await checked(sb.from('orden_detalle').delete().in('orden_id', orders.map((o) => o.id)), 'reiniciar detalles');
  const detailRows = orders.flatMap((order) => [
    { orden_id: order.id, producto_id: products[0].id, producto_nombre: products[0].nombre, cantidad_pedida: 20, unidad: 'lb', precio: 115, subtotal: 2300, requiere_pesaje: true, tipo_despacho_peso: 'Por libra' },
    { orden_id: order.id, producto_id: products[2].id, producto_nombre: products[2].nombre, cantidad_pedida: 1, unidad: 'saco', precio: 1150, subtotal: 1150, requiere_pesaje: false, tipo_despacho_peso: 'Sin pesaje' },
  ]);
  await checked(userSb.from('orden_detalle').insert(detailRows), 'detalles');

  const routes = {
    '002': [['Pedido recibido','En preparación','carniceria']],
    '003': [['Pedido recibido','Lista para facturar','carniceria']],
    '004': [['Pedido recibido','Facturada','facturacion']],
    '005': [['Pedido recibido','Validada para delivery','validacion']],
    '006': [
      ['Pedido recibido','Validada para delivery','validacion'],
      ['Validada para delivery','Asignada a delivery','validacion'],
      ['Asignada a delivery','En ruta','delivery'],
      ['En ruta','Entregado a crédito','delivery'],
    ],
  };
  for (const [suffix, steps] of Object.entries(routes)) {
    const order = orders.find((o) => o.codigo.endsWith(suffix));
    for (const [from, to, modulo] of steps) {
      await checked(userSb.rpc('cambiar_estado_orden_v9382', {
        p_orden_id: order.id, p_estado_esperado: from, p_estado_nuevo: to,
        p_cambios: {}, p_comentario: `[${TAG}] transición sintética`, p_modulo: modulo,
      }), `${order.codigo}: ${from} -> ${to}`);
    }
  }

  const refreshedOrders = await checked(sb.from('ordenes').select('id,codigo,estado').like('codigo', `${TAG}-ORD-%`), 'releer órdenes');
  const advanced = refreshedOrders.filter((o) => ['Lista para facturar','Facturada','Validada para delivery','Entregado a crédito'].includes(o.estado));
  await checked(sb.from('orden_pesos').insert(advanced.map((o) => ({ orden_id: o.id, tipo: 'Preparación', libras: 20, paquetes: 2, notas: `[${TAG}] peso sintético`, creado_por: gerente.id }))), 'pesos');
  const billed = refreshedOrders.filter((o) => ['Facturada','Validada para delivery','Entregado a crédito'].includes(o.estado));
  await checked(sb.from('orden_facturas').insert(billed.map((o) => ({ orden_id: o.id, factura_no: o.codigo.replace('ORD','FAC'), monto: 3450, peso_facturado: 20, condicion_pago: o.estado === 'Entregado a crédito' ? 'Crédito' : 'Contado', notas: `[${TAG}] factura sintética`, creado_por: gerente.id }))), 'facturas');

  const routeOrder = refreshedOrders.find((o) => o.estado === 'Validada para delivery');
  const lot = await checked(sb.from('entrega_lotes').upsert({ codigo_lote: `${TAG}-LOTE-001`, delivery_nombre: `[${TAG}] Delivery Staging`, cantidad_ordenes: 1, peso_esperado: 20, total_facturado: 3450, estado: 'Abierto', creado_por: gerente.id, validado_por: 'Validación Staging', responsable_nombre: `[${TAG}] Delivery Staging` }, { onConflict: 'codigo_lote' }).select('id').single(), 'lote');
  await checked(sb.from('entrega_lote_detalle').delete().eq('codigo_lote', `${TAG}-LOTE-001`), 'reiniciar lote');
  await checked(sb.from('entrega_lote_detalle').insert({ lote_id: lot.id, codigo_lote: `${TAG}-LOTE-001`, orden_id: routeOrder.id, codigo_orden: routeOrder.codigo, factura_no: routeOrder.codigo.replace('ORD','FAC'), monto_factura: 3450, peso_esperado: 20, cliente_nombre: `[${TAG}] Cliente de ruta` }), 'detalle de lote');

  console.log(`OK: ${authUsers.length} usuarios y ${refreshedOrders.length} escenarios ${TAG} cargados solo en staging.`);
}

async function verify() {
  const sb = client();
  const [authUsers, orders, clients, products, lots] = await Promise.all([
    listAllUsers(sb),
    checked(sb.from('ordenes').select('id,codigo,estado').like('codigo', `${TAG}-ORD-%`), 'órdenes'),
    checked(sb.from('clientes').select('id,codigo').like('codigo', `${TAG}-CLI-%`), 'clientes'),
    checked(sb.from('productos_despacho').select('id,nombre').like('nombre', `[${TAG}]%`), 'productos'),
    checked(sb.from('entrega_lotes').select('id,codigo_lote').like('codigo_lote', `${TAG}-%`), 'lotes'),
  ]);
  const testUsers = authUsers.filter((u) => u.email?.endsWith(EMAIL_SUFFIX));
  const counts = { usuarios: testUsers.length, ordenes: orders.length, clientes: clients.length, productos: products.length, lotes: lots.length };
  console.log(JSON.stringify(counts, null, 2));
  if (Object.values(counts).some((n) => n === 0)) fail('El conjunto de pruebas está incompleto.');
  console.log('OK: fixtures staging V9.4.2 completos.');
}

async function cleanup() {
  requireWriteConfirmation('La limpieza');
  if (!flags.has('--confirm-delete=STG942')) fail('Agrega --confirm-delete=STG942.');
  const sb = client();
  const orders = await checked(sb.from('ordenes').select('id').like('codigo', `${TAG}-ORD-%`), 'localizar órdenes');
  await checked(sb.from('entrega_lotes').delete().like('codigo_lote', `${TAG}-%`), 'eliminar lotes');
  if (orders.length) await checked(sb.from('ordenes').delete().in('id', orders.map((o) => o.id)), 'eliminar órdenes');
  await checked(sb.from('clientes').delete().like('codigo', `${TAG}-CLI-%`), 'eliminar clientes');
  await checked(sb.from('productos_despacho').delete().like('nombre', `[${TAG}]%`), 'eliminar productos');
  const authUsers = (await listAllUsers(sb)).filter((u) => u.email?.endsWith(EMAIL_SUFFIX));
  for (const user of authUsers) await checked(sb.auth.admin.deleteUser(user.id), `eliminar ${user.email}`);
  await checked(sb.from('empleados_operativos').delete().like('nombre', `[${TAG}]%`), 'eliminar empleados');
  await checked(sb.from('orden_transiciones_v9382').delete().in('modulo', [...new Set(catalogs.orden_transiciones_v9382.map((x) => x.modulo))]), 'eliminar transiciones');
  await checked(sb.from('roles_permisos').delete().in('rol', [...new Set(catalogs.roles_permisos.map((x) => x.rol))]), 'eliminar permisos');
  await checked(sb.from('modulos_sistema').delete().in('id', modules.map((x) => x.id)), 'eliminar módulos');
  console.log(`OK: conjunto ${TAG} eliminado de staging.`);
}

function plan() {
  console.log(JSON.stringify({ proyecto: EXPECTED_REF, usuarios: users.map((u) => ({ correo: `${u[0]}${EMAIL_SUFFIX}`, rol: u[2] })), escenarios: 6, escribe: false }, null, 2));
}

const actions = { plan, seed, verify, cleanup };
if (!actions[action]) fail('Acción válida: plan, seed, verify o cleanup.');
await actions[action]();

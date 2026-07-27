-- ============================================================
-- 01_migracion_ordenes_crm.sql
-- Productos César · Integración CRM + Órdenes/Despacho/CXC
-- Ejecutar en el proyecto Supabase del CRM: productos-cesar-crm
-- ============================================================

create extension if not exists pgcrypto;

-- Perfil administrador para Cesar. Si el usuario ya existe en Auth, lo pone como Gerente.
insert into public.perfiles (id, nombre, rol, vendedor, activo)
select id, coalesce(raw_user_meta_data->>'nombre', email), 'Gerente', 'Cesar', true
from auth.users
where email = 'apocalipsis218@gmail.com'
on conflict (id) do update
set rol = 'Gerente', vendedor = 'Cesar', activo = true;

-- Secuencia y generador de códigos de orden
create sequence if not exists public.ordenes_seq;

create or replace function public.fn_codigo_orden()
returns text
language sql
as $$
  select 'ORD-' || to_char(now(), 'YYMMDD') || '-' || lpad(nextval('public.ordenes_seq')::text, 4, '0');
$$;

-- Catálogo de productos para despacho/facturación
create table if not exists public.productos_despacho (
  id bigint generated always as identity primary key,
  nombre text not null unique,
  unidad text not null default 'lb',
  precio_defecto numeric(14,2) not null default 0,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

-- Encabezado de la orden operativa
create table if not exists public.ordenes (
  id bigint generated always as identity primary key,
  codigo text not null unique default public.fn_codigo_orden(),
  cliente_id bigint not null references public.clientes(id),
  llamada_id bigint unique references public.llamadas(id),
  pedido_crm_id bigint references public.pedidos(id),
  fecha date not null default current_date,
  canal text not null default 'WhatsApp',
  vendedor text,
  estado text not null default 'Pedido recibido',
  condicion_pago text not null default 'Crédito',
  total_estimado numeric(14,2) not null default 0,
  total_factura numeric(14,2) not null default 0,
  factura_no text,
  delivery_nombre text,
  zona text,
  notas text,
  creado_por uuid references auth.users(id),
  actualizado_por uuid references auth.users(id),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint chk_orden_estado check (estado in (
    'Pedido recibido',
    'En preparación',
    'Preparado',
    'Facturado',
    'Validado para ruta',
    'Asignado a delivery',
    'En ruta',
    'Entregado',
    'Entregado a crédito',
    'Cobrado',
    'No entregado',
    'Devuelto parcial',
    'Cerrado',
    'Anulado'
  )),
  constraint chk_orden_condicion check (condicion_pago in ('Crédito', 'Contado'))
);
create index if not exists idx_ordenes_cliente on public.ordenes(cliente_id);
create index if not exists idx_ordenes_estado on public.ordenes(estado);
create index if not exists idx_ordenes_fecha on public.ordenes(fecha);

-- Detalle de productos de cada orden
create table if not exists public.orden_detalle (
  id bigint generated always as identity primary key,
  orden_id bigint not null references public.ordenes(id) on delete cascade,
  producto_id bigint references public.productos_despacho(id),
  producto_nombre text not null,
  cantidad_pedida numeric(14,2) not null default 0,
  cantidad_despachada numeric(14,2),
  unidad text not null default 'lb',
  precio numeric(14,2) not null default 0,
  subtotal numeric(14,2) not null default 0,
  notas text,
  creado_en timestamptz not null default now()
);
create index if not exists idx_orden_detalle_orden on public.orden_detalle(orden_id);

-- Pesos por etapa
create table if not exists public.orden_pesos (
  id bigint generated always as identity primary key,
  orden_id bigint not null references public.ordenes(id) on delete cascade,
  tipo text not null,
  libras numeric(14,2) not null check (libras > 0),
  paquetes int,
  notas text,
  creado_por uuid references auth.users(id),
  creado_en timestamptz not null default now(),
  constraint chk_orden_peso_tipo check (tipo in ('Preparado','Facturado','Entregado a delivery','Devuelto'))
);
create index if not exists idx_orden_pesos_orden on public.orden_pesos(orden_id);

-- Facturas relacionadas a la orden
create table if not exists public.orden_facturas (
  id bigint generated always as identity primary key,
  orden_id bigint not null references public.ordenes(id) on delete cascade,
  factura_no text not null,
  monto numeric(14,2) not null default 0,
  peso_facturado numeric(14,2),
  condicion_pago text not null default 'Crédito',
  notas text,
  creado_por uuid references auth.users(id),
  creado_en timestamptz not null default now(),
  constraint chk_orden_factura_cond check (condicion_pago in ('Crédito', 'Contado'))
);
create index if not exists idx_orden_facturas_orden on public.orden_facturas(orden_id);

-- Viajes de delivery
create table if not exists public.viajes_delivery (
  id bigint generated always as identity primary key,
  codigo text not null unique default ('VIA-' || to_char(now(), 'YYMMDD') || '-' || upper(substr(gen_random_uuid()::text, 1, 4))),
  delivery_nombre text not null,
  zona text,
  estado text not null default 'En ruta',
  salida_en timestamptz not null default now(),
  cierre_en timestamptz,
  notas text,
  creado_por uuid references auth.users(id),
  constraint chk_viaje_estado check (estado in ('Abierto','En ruta','Cerrado','Anulado'))
);

create table if not exists public.viaje_ordenes (
  id bigint generated always as identity primary key,
  viaje_id bigint not null references public.viajes_delivery(id) on delete cascade,
  orden_id bigint not null references public.ordenes(id) on delete cascade,
  creado_en timestamptz not null default now(),
  unique (viaje_id, orden_id)
);
create index if not exists idx_viaje_ordenes_viaje on public.viaje_ordenes(viaje_id);
create index if not exists idx_viaje_ordenes_orden on public.viaje_ordenes(orden_id);

-- Resultado de entrega
create table if not exists public.orden_entregas (
  id bigint generated always as identity primary key,
  orden_id bigint not null references public.ordenes(id) on delete cascade,
  resultado text not null,
  monto_cobrado numeric(14,2) not null default 0,
  monto_pendiente numeric(14,2) not null default 0,
  notas text,
  creado_por uuid references auth.users(id),
  creado_en timestamptz not null default now(),
  constraint chk_orden_entrega_resultado check (resultado in ('entregado_cobrado','entregado_credito','no_entregado','devuelto_parcial'))
);
create index if not exists idx_orden_entregas_orden on public.orden_entregas(orden_id);

-- Pagos asociados a órdenes
create table if not exists public.orden_pagos (
  id bigint generated always as identity primary key,
  orden_id bigint not null references public.ordenes(id) on delete cascade,
  cliente_id bigint not null references public.clientes(id),
  monto numeric(14,2) not null check (monto > 0),
  metodo text not null default 'Efectivo',
  recibido_por uuid references auth.users(id),
  creado_en timestamptz not null default now()
);
create index if not exists idx_orden_pagos_orden on public.orden_pagos(orden_id);

-- Integración con cobranza existente: permite saber de qué orden salió una CXC.
alter table public.cobranza add column if not exists orden_id bigint references public.ordenes(id);

-- Auditoría del módulo de órdenes
create table if not exists public.orden_auditoria (
  id bigint generated always as identity primary key,
  ts timestamptz not null default now(),
  usuario uuid,
  entidad text,
  registro text,
  accion text,
  detalle jsonb
);

-- Triggers técnicos
create or replace function public.fn_orden_set_actualizado()
returns trigger
language plpgsql
as $$
begin
  new.actualizado_en = now();
  new.actualizado_por = auth.uid();
  return new;
end $$;

drop trigger if exists trg_ordenes_actualizado on public.ordenes;
create trigger trg_ordenes_actualizado
before update on public.ordenes
for each row execute function public.fn_orden_set_actualizado();

create or replace function public.fn_auditar_orden()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.orden_auditoria(usuario, entidad, registro, accion, detalle)
  values (auth.uid(), tg_table_name, coalesce(new.id::text, old.id::text), tg_op, to_jsonb(coalesce(new, old)));
  return coalesce(new, old);
end $$;

drop trigger if exists trg_aud_ordenes on public.ordenes;
create trigger trg_aud_ordenes after insert or update or delete on public.ordenes
for each row execute function public.fn_auditar_orden();

-- Crea una orden automáticamente cuando una llamada se marca como "Pidió".
create or replace function public.fn_orden_desde_llamada()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pedido_id bigint;
  v_sector text;
begin
  if new.resultado = 'Pidió' then
    select id into v_pedido_id from public.pedidos where llamada_id = new.id order by id desc limit 1;
    select sector into v_sector from public.clientes where id = new.cliente_id;

    insert into public.ordenes (
      cliente_id, llamada_id, pedido_crm_id, fecha, canal, vendedor,
      estado, condicion_pago, total_estimado, zona, notas, creado_por
    ) values (
      new.cliente_id, new.id, v_pedido_id, new.fecha, 'Llamada CRM', new.vendedor,
      'Pedido recibido', 'Crédito', coalesce(new.monto,0), v_sector,
      nullif(new.observacion,''), auth.uid()
    )
    on conflict (llamada_id) do update
    set total_estimado = excluded.total_estimado,
        pedido_crm_id = excluded.pedido_crm_id,
        notas = excluded.notas,
        actualizado_en = now();
  end if;
  return new;
end $$;

drop trigger if exists zz_trg_orden_desde_llamada on public.llamadas;
create trigger zz_trg_orden_desde_llamada after insert on public.llamadas
for each row execute function public.fn_orden_desde_llamada();

-- Backfill: crea órdenes para llamadas antiguas con resultado "Pidió" que aún no tengan orden.
insert into public.ordenes (cliente_id, llamada_id, pedido_crm_id, fecha, canal, vendedor, estado, condicion_pago, total_estimado, zona, notas)
select
  l.cliente_id,
  l.id,
  p.id,
  l.fecha,
  'Llamada CRM',
  l.vendedor,
  'Pedido recibido',
  'Crédito',
  coalesce(l.monto,0),
  c.sector,
  nullif(l.observacion,'')
from public.llamadas l
join public.clientes c on c.id = l.cliente_id
left join public.pedidos p on p.llamada_id = l.id
left join public.ordenes o on o.llamada_id = l.id
where l.resultado = 'Pidió' and o.id is null
on conflict (llamada_id) do nothing;

-- Productos iniciales para el módulo de despacho
insert into public.productos_despacho (nombre, unidad, precio_defecto) values
  ('Chuleta ahumada', 'lb', 115),
  ('Longaniza criolla', 'lb', 135),
  ('Pollo fresco', 'lb', 75),
  ('Muslo importado', 'lb', 75),
  ('Pierna importada', 'lb', 95),
  ('Res de guisar', 'lb', 145),
  ('Mondongo res', 'lb', 110),
  ('Queso', 'lb', 0)
on conflict (nombre) do nothing;

-- RLS del módulo integrado. MVP: usuarios autenticados pueden operar.
alter table public.productos_despacho enable row level security;
alter table public.ordenes enable row level security;
alter table public.orden_detalle enable row level security;
alter table public.orden_pesos enable row level security;
alter table public.orden_facturas enable row level security;
alter table public.viajes_delivery enable row level security;
alter table public.viaje_ordenes enable row level security;
alter table public.orden_entregas enable row level security;
alter table public.orden_pagos enable row level security;
alter table public.orden_auditoria enable row level security;

drop policy if exists prod_despacho_all on public.productos_despacho;
create policy prod_despacho_all on public.productos_despacho for all to authenticated using (true) with check (true);

drop policy if exists ordenes_all on public.ordenes;
create policy ordenes_all on public.ordenes for all to authenticated using (true) with check (true);

drop policy if exists orden_detalle_all on public.orden_detalle;
create policy orden_detalle_all on public.orden_detalle for all to authenticated using (true) with check (true);

drop policy if exists orden_pesos_all on public.orden_pesos;
create policy orden_pesos_all on public.orden_pesos for all to authenticated using (true) with check (true);

drop policy if exists orden_facturas_all on public.orden_facturas;
create policy orden_facturas_all on public.orden_facturas for all to authenticated using (true) with check (true);

drop policy if exists viajes_delivery_all on public.viajes_delivery;
create policy viajes_delivery_all on public.viajes_delivery for all to authenticated using (true) with check (true);

drop policy if exists viaje_ordenes_all on public.viaje_ordenes;
create policy viaje_ordenes_all on public.viaje_ordenes for all to authenticated using (true) with check (true);

drop policy if exists orden_entregas_all on public.orden_entregas;
create policy orden_entregas_all on public.orden_entregas for all to authenticated using (true) with check (true);

drop policy if exists orden_pagos_all on public.orden_pagos;
create policy orden_pagos_all on public.orden_pagos for all to authenticated using (true) with check (true);

drop policy if exists orden_auditoria_read on public.orden_auditoria;
create policy orden_auditoria_read on public.orden_auditoria for select to authenticated using (true);

-- Permiso de escritura en cobranza para Cesar/Gerente ya existe en tu CRM.
-- Si un usuario no puede cerrar CXC, revisa su perfil en public.perfiles.
-- ============================================================
-- 02_mejoras_config_clientes.sql
-- Productos César · Integrado V2
-- Ejecutar DESPUÉS de 01_migracion_ordenes_crm.sql en Supabase del CRM.
-- Agrega: configuración central, módulos, permisos por usuario y mejoras para búsquedas/fichas.
-- ============================================================

-- Asegurar tabla config del CRM
create table if not exists public.config (
  clave text primary key,
  valor text,
  editable boolean default true
);

-- Configuración general del sistema integrado
insert into public.config (clave, valor, editable) values
  ('empresa_nombre','Productos César', true),
  ('sistema_nombre','Sistema Productos César', true),
  ('moneda','RD$', true),
  ('condicion_pago_defecto','Crédito', true),
  ('canal_pedido_defecto','WhatsApp', true),
  ('tolerancia_peso_lbs','1.00', true),
  ('dias_credito_defecto','7', true),
  ('permitir_pedido_sin_monto','true', true),
  ('mostrar_alertas_peso','true', true),
  ('version_integrada','v2_config_clientes', false)
on conflict (clave) do update set valor = excluded.valor;

-- Catálogo de módulos configurables
create table if not exists public.modulos_sistema (
  id text primary key,
  nombre text not null,
  grupo text not null default 'Operación',
  descripcion text,
  orden int not null default 100,
  activo boolean not null default true,
  actualizado_en timestamptz not null default now()
);

insert into public.modulos_sistema (id, nombre, grupo, descripcion, orden, activo) values
  ('panel','Panel general','Inicio','Indicadores y resumen operativo.', 10, true),
  ('crm','CRM / llamadas','Ventas','Gestión de llamadas y resultado del contacto.', 20, true),
  ('nuevo','Nuevo pedido','Ventas','Crear pedidos manuales o desde WhatsApp.', 30, true),
  ('ordenes','Órdenes','Operación','Seguimiento de pedidos por estado.', 40, true),
  ('peso','Peso y factura','Operación','Preparación, pesaje y facturación.', 50, true),
  ('viajes','Viajes / delivery','Logística','Asignar órdenes al delivery y controlar rutas.', 60, true),
  ('cierre','Cierre / CXC','CXC','Cerrar entregas, cobros y crédito.', 70, true),
  ('clientes','Clientes','Clientes','Ficha completa del cliente, historial y edición.', 80, true),
  ('config','Configuración','Sistema','Configuración general, usuarios y permisos.', 90, true)
on conflict (id) do update set
  nombre = excluded.nombre,
  grupo = excluded.grupo,
  descripcion = excluded.descripcion,
  orden = excluded.orden,
  activo = excluded.activo,
  actualizado_en = now();

-- Permisos por usuario, por encima de permisos por rol.
create table if not exists public.usuario_modulos (
  usuario_id uuid not null references auth.users(id) on delete cascade,
  modulo text not null references public.modulos_sistema(id) on delete cascade,
  nivel text not null default 'none' check (nivel in ('none','ver','editar')),
  actualizado_en timestamptz not null default now(),
  primary key (usuario_id, modulo)
);

-- Asegurar permisos por rol para los módulos nuevos, usando los roles existentes del CRM.
insert into public.roles_permisos (rol, modulo, nivel) values
  ('Gerente','panel','editar'),('Gerente','crm','editar'),('Gerente','nuevo','editar'),('Gerente','ordenes','editar'),('Gerente','peso','editar'),('Gerente','viajes','editar'),('Gerente','cierre','editar'),('Gerente','clientes','editar'),('Gerente','config','editar'),
  ('Vendedor','panel','ver'),('Vendedor','crm','editar'),('Vendedor','nuevo','editar'),('Vendedor','ordenes','ver'),('Vendedor','peso','none'),('Vendedor','viajes','none'),('Vendedor','cierre','none'),('Vendedor','clientes','ver'),('Vendedor','config','none'),
  ('Cobrador','panel','ver'),('Cobrador','crm','none'),('Cobrador','nuevo','none'),('Cobrador','ordenes','ver'),('Cobrador','peso','none'),('Cobrador','viajes','ver'),('Cobrador','cierre','editar'),('Cobrador','clientes','ver'),('Cobrador','config','none'),
  ('Supervisor','panel','ver'),('Supervisor','crm','ver'),('Supervisor','nuevo','editar'),('Supervisor','ordenes','editar'),('Supervisor','peso','editar'),('Supervisor','viajes','editar'),('Supervisor','cierre','editar'),('Supervisor','clientes','editar'),('Supervisor','config','ver')
on conflict (rol, modulo) do update set nivel = excluded.nivel;

-- RLS para tablas nuevas/auxiliares. Lectura para autenticados; escritura para Gerente.
alter table public.modulos_sistema enable row level security;
alter table public.usuario_modulos enable row level security;

-- modulos_sistema
drop policy if exists modulos_sistema_read on public.modulos_sistema;
create policy modulos_sistema_read on public.modulos_sistema for select to authenticated using (true);
drop policy if exists modulos_sistema_admin on public.modulos_sistema;
create policy modulos_sistema_admin on public.modulos_sistema for all to authenticated
  using (public.mi_rol() = 'Gerente') with check (public.mi_rol() = 'Gerente');

-- usuario_modulos
drop policy if exists usuario_modulos_read on public.usuario_modulos;
create policy usuario_modulos_read on public.usuario_modulos for select to authenticated using (true);
drop policy if exists usuario_modulos_admin on public.usuario_modulos;
create policy usuario_modulos_admin on public.usuario_modulos for all to authenticated
  using (public.mi_rol() = 'Gerente') with check (public.mi_rol() = 'Gerente');

grant select, insert, update, delete on public.modulos_sistema to authenticated;
grant select, insert, update, delete on public.usuario_modulos to authenticated;
grant select, insert, update, delete on public.config to authenticated;
grant select, insert, update, delete on public.roles_permisos to authenticated;
grant select, insert, update on public.perfiles to authenticated;

-- Permitir "Pidió" sin monto y mantener orden operativa aunque el monto se complete luego.
alter table public.llamadas drop constraint if exists chk_pedido_con_monto;

create or replace function public.fn_tras_llamada() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.resultado = 'Pidió' and coalesce(new.monto,0) > 0 then
    update public.clientes set estado='Activo', ultimo_pedido=new.fecha, actualizado_en=now() where id=new.cliente_id;
    insert into public.pedidos (cliente_id, llamada_id, fecha, vendedor, monto)
      values (new.cliente_id, new.id, new.fecha, new.vendedor, new.monto)
      on conflict do nothing;
  elsif new.resultado = 'Pidió' then
    update public.clientes set estado='Activo', actualizado_en=now() where id=new.cliente_id;
  elsif new.resultado = 'Reprogramar' then
    update public.clientes set reprogramado_para=new.proximo_contacto, actualizado_en=now() where id=new.cliente_id;
  end if;
  return new;
end $$;

-- Si actualizan una llamada a Pidió con monto, crea/actualiza pedido CRM y orden operativa.
create or replace function public.fn_llamada_upd() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.resultado is distinct from old.resultado or coalesce(new.monto,0) is distinct from coalesce(old.monto,0) or new.fecha is distinct from old.fecha then
    if new.resultado = 'Pidió' and coalesce(new.monto,0) > 0 then
      insert into public.pedidos (cliente_id, llamada_id, fecha, vendedor, monto)
      values (new.cliente_id, new.id, new.fecha, new.vendedor, new.monto)
      on conflict do nothing;
      update public.pedidos set monto = new.monto, fecha = new.fecha, vendedor = new.vendedor where llamada_id = new.id;
      update public.clientes set ultimo_pedido = new.fecha, estado='Activo', actualizado_en=now() where id=new.cliente_id;
    elsif new.resultado = 'Pidió' then
      update public.clientes set estado='Activo', actualizado_en=now() where id=new.cliente_id;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_llamada_upd on public.llamadas;
create trigger trg_llamada_upd after update on public.llamadas
  for each row execute function public.fn_llamada_upd();

-- Mejorar trigger de orden desde llamada: crea orden aunque el monto sea 0 y también al actualizar.
create or replace function public.fn_orden_desde_llamada()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pedido_id bigint;
  v_sector text;
begin
  if new.resultado = 'Pidió' then
    select id into v_pedido_id from public.pedidos where llamada_id = new.id order by id desc limit 1;
    select sector into v_sector from public.clientes where id = new.cliente_id;

    insert into public.ordenes (
      cliente_id, llamada_id, pedido_crm_id, fecha, canal, vendedor,
      estado, condicion_pago, total_estimado, zona, notas, creado_por
    ) values (
      new.cliente_id, new.id, v_pedido_id, new.fecha, 'Llamada CRM', new.vendedor,
      'Pedido recibido', coalesce((select valor from public.config where clave='condicion_pago_defecto'), 'Crédito'), coalesce(new.monto,0), v_sector,
      nullif(new.observacion,''), auth.uid()
    )
    on conflict (llamada_id) do update
    set total_estimado = coalesce(excluded.total_estimado, public.ordenes.total_estimado),
        pedido_crm_id = excluded.pedido_crm_id,
        notas = excluded.notas,
        actualizado_en = now();
  end if;
  return new;
end $$;

drop trigger if exists zz_trg_orden_desde_llamada on public.llamadas;
create trigger zz_trg_orden_desde_llamada after insert or update on public.llamadas
for each row execute function public.fn_orden_desde_llamada();

select 'listo: V2 configuración, usuarios por módulo, búsquedas y ficha de clientes' as estado;

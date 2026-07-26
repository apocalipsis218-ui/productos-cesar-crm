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

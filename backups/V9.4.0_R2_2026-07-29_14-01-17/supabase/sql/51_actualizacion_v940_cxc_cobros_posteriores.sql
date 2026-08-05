-- =========================================================
-- 51 - V9.4.0 · CXC Y COBROS POSTERIORES
-- Productos César CRM
--
-- Agrega, sin eliminar datos:
--   1) Cartera formal por orden/factura.
--   2) Cobros posteriores con recibo numerado.
--   3) Aplicación exacta a una o varias facturas.
--   4) Vencimiento, antigüedad y saldo antes/después.
--   5) Reversión administrativa sin borrar movimientos.
--   6) Vista ligera para separar CXC del flujo operativo.
-- Corrección 2 · 2026-07-29:
--   Backfill compatible con el SQL Editor sin tablas temporales y
--   reactivación verificada de la protección de identidad V9.3.9.7.
-- =========================================================

begin;

-- ---------------------------------------------------------
-- 0. PRERREQUISITOS
-- ---------------------------------------------------------
do $$
begin
  if to_regprocedure('public.tomar_orden_v9397(bigint,text,bigint,text,text)') is null
     or to_regprocedure('public.crear_caso_especial_v9397(jsonb)') is null then
    raise exception 'Falta SQL 50: primero aplica la V9.3.9.7.';
  end if;
  if to_regclass('public.ordenes') is null
     or to_regclass('public.orden_pagos') is null
     or to_regclass('public.clientes') is null then
    raise exception 'Falta la base operativa de órdenes, pagos o clientes.';
  end if;
end $$;

-- ---------------------------------------------------------
-- 1. CAMPOS CXC EN LA ORDEN
-- ---------------------------------------------------------
alter table public.ordenes
  add column if not exists cxc_saldo_inicial numeric(14,2),
  add column if not exists cxc_pagado_acumulado numeric(14,2) not null default 0,
  add column if not exists cxc_vencimiento date,
  add column if not exists cxc_estado text not null default 'No aplica',
  add column if not exists cxc_ultimo_pago_en timestamptz;

alter table public.ordenes drop constraint if exists chk_orden_cxc_estado_v940;
alter table public.ordenes
  add constraint chk_orden_cxc_estado_v940
  check(cxc_estado in('No aplica','Pendiente','Abonado','Pagado'));

-- El backfill se ejecuta desde el SQL Editor, donde auth.uid() es nulo.
-- Un único bloque conserva en memoria los triggers que estaban activos,
-- los suspende solamente durante el UPDATE y los reactiva aun si falla.
-- No se usan tablas temporales porque el SQL Editor puede cerrar su
-- transacción entre sentencias y eliminar objetos ON COMMIT DROP.
do $$
declare
  v_triggers_activos text[];
  v_trigger_name text;
begin
  select coalesce(
    array_agg(t.tgname order by t.tgname),
    array[]::text[]
  )
  into v_triggers_activos
  from pg_trigger t
  where t.tgrelid='public.ordenes'::regclass
    and not t.tgisinternal
    and t.tgenabled<>'D'
    and t.tgname in(
      'trg_pc_identidad_preparacion_v9397',
      'trg_ordenes_actualizado',
      'trg_aud_ordenes'
    );

  foreach v_trigger_name in array v_triggers_activos
  loop
    execute format(
      'alter table public.ordenes disable trigger %I',
      v_trigger_name
    );
  end loop;

  begin
    update public.ordenes
    set cxc_saldo_inicial=greatest(coalesce(monto_pendiente,0),0),
        cxc_pagado_acumulado=0,
        cxc_vencimiento=coalesce(recibido_en::date,fecha,current_date)+7,
        cxc_estado=case
          when coalesce(monto_pendiente,0)<=0.01 then 'Pagado'
          else 'Pendiente'
        end
    where coalesce(resultado_entrega,estado)='Entregado a crédito'
      and cxc_saldo_inicial is null;
  exception when others then
    foreach v_trigger_name in array v_triggers_activos
    loop
      execute format(
        'alter table public.ordenes enable trigger %I',
        v_trigger_name
      );
    end loop;
    raise;
  end;

  foreach v_trigger_name in array v_triggers_activos
  loop
    execute format(
      'alter table public.ordenes enable trigger %I',
      v_trigger_name
    );
  end loop;
end $$;

create or replace function public.pc_sincronizar_cxc_orden_v940()
returns trigger
language plpgsql
set search_path=public,pg_temp
as $$
declare
  v_credito_nuevo boolean:=coalesce(new.resultado_entrega,new.estado)='Entregado a crédito';
  v_credito_anterior boolean:=case when tg_op='UPDATE'
    then coalesce(old.resultado_entrega,old.estado)='Entregado a crédito'
    else false end;
begin
  if v_credito_nuevo then
    if not v_credito_anterior then
      new.cxc_saldo_inicial:=greatest(coalesce(new.monto_pendiente,0),0);
      new.cxc_pagado_acumulado:=0;
      new.cxc_vencimiento:=coalesce(new.cxc_vencimiento,coalesce(new.recibido_en::date,new.fecha,current_date)+7);
    else
      new.cxc_saldo_inicial:=greatest(
        coalesce(new.cxc_saldo_inicial,0),
        coalesce(new.monto_pendiente,0)+coalesce(new.cxc_pagado_acumulado,0)
      );
      new.cxc_vencimiento:=coalesce(new.cxc_vencimiento,coalesce(new.recibido_en::date,new.fecha,current_date)+7);
    end if;
    new.cxc_estado:=case
      when coalesce(new.monto_pendiente,0)<=0.01 then 'Pagado'
      when coalesce(new.cxc_pagado_acumulado,0)>0.01 then 'Abonado'
      else 'Pendiente'
    end;
  elsif v_credito_anterior then
    new.cxc_saldo_inicial:=null;
    new.cxc_pagado_acumulado:=0;
    new.cxc_vencimiento:=null;
    new.cxc_estado:='No aplica';
    new.cxc_ultimo_pago_en:=null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_pc_sincronizar_cxc_orden_v940 on public.ordenes;
create trigger trg_pc_sincronizar_cxc_orden_v940
before insert or update of estado,resultado_entrega,monto_pendiente,cxc_saldo_inicial,
  cxc_pagado_acumulado,cxc_vencimiento
on public.ordenes
for each row execute function public.pc_sincronizar_cxc_orden_v940();

-- ---------------------------------------------------------
-- 2. RECIBOS, APLICACIONES Y AUDITORÍA
-- ---------------------------------------------------------
create sequence if not exists public.cxc_recibo_seq_v940;

create table if not exists public.cxc_cobros (
  id bigint generated always as identity primary key,
  numero_recibo text not null unique,
  cliente_clave text not null,
  cliente_id bigint references public.clientes(id) on delete restrict,
  cliente_nombre text not null,
  cliente_telefono text,
  fecha_cobro timestamptz not null default now(),
  monto_total numeric(14,2) not null check(monto_total>0),
  metodo text not null check(metodo in('Efectivo','Transferencia','Mixto')),
  referencia text,
  recibido_por text not null,
  observacion text,
  estado text not null default 'Activo' check(estado in('Activo','Reversado')),
  creado_por uuid not null references auth.users(id),
  creado_en timestamptz not null default now(),
  reversado_por uuid references auth.users(id),
  reversado_en timestamptz,
  motivo_reversion text
);

create table if not exists public.cxc_cobro_aplicaciones (
  id bigint generated always as identity primary key,
  cobro_id bigint not null references public.cxc_cobros(id) on delete restrict,
  orden_id bigint not null references public.ordenes(id) on delete restrict,
  monto_aplicado numeric(14,2) not null check(monto_aplicado>0),
  saldo_antes numeric(14,2) not null check(saldo_antes>=0),
  saldo_despues numeric(14,2) not null check(saldo_despues>=0),
  vencimiento date,
  creado_en timestamptz not null default now(),
  unique(cobro_id,orden_id)
);

create table if not exists public.cxc_eventos (
  id bigint generated always as identity primary key,
  cobro_id bigint references public.cxc_cobros(id) on delete restrict,
  orden_id bigint references public.ordenes(id) on delete restrict,
  tipo text not null,
  motivo text,
  datos jsonb not null default '{}'::jsonb,
  usuario_id uuid not null references auth.users(id),
  creado_en timestamptz not null default now()
);

alter table public.orden_pagos
  add column if not exists cxc_cobro_id bigint references public.cxc_cobros(id) on delete restrict,
  add column if not exists tipo_pago text not null default 'Liquidación inicial',
  add column if not exists reversado boolean not null default false,
  add column if not exists reversado_en timestamptz,
  add column if not exists reversado_por uuid references auth.users(id);

create index if not exists idx_ordenes_cxc_abierta_v940
  on public.ordenes(cxc_vencimiento,cliente_id,id)
  where coalesce(monto_pendiente,0)>0.01
    and coalesce(resultado_entrega,estado)='Entregado a crédito'
    and coalesce(archivada,false)=false;
create index if not exists idx_cxc_cobros_cliente_fecha_v940
  on public.cxc_cobros(cliente_clave,fecha_cobro desc);
create index if not exists idx_cxc_aplicaciones_orden_v940
  on public.cxc_cobro_aplicaciones(orden_id,cobro_id);
create index if not exists idx_orden_pagos_cxc_v940
  on public.orden_pagos(cxc_cobro_id)
  where cxc_cobro_id is not null;

-- ---------------------------------------------------------
-- 3. VISTA LIGERA DE CARTERA
-- ---------------------------------------------------------
create or replace view public.cxc_saldos_v940
with (security_invoker=true)
as
select
  o.id as orden_id,
  o.codigo as orden_codigo,
  o.factura_no,
  o.cliente_id,
  case when o.cliente_id is not null
    then 'REG:'||o.cliente_id::text
    else 'ORD:'||o.id::text end as cliente_clave,
  coalesce(c.negocio,o.cliente_nombre_orden,'Cliente ocasional') as cliente_nombre,
  coalesce(c.telefono,o.cliente_telefono_orden) as cliente_telefono,
  c.codigo as cliente_codigo,
  o.fecha,
  o.recibido_en,
  o.total_factura,
  o.monto_cobrado as recibido_en_liquidacion,
  greatest(coalesce(o.cxc_saldo_inicial,o.monto_pendiente,0),0) as saldo_inicial_cxc,
  greatest(coalesce(o.cxc_pagado_acumulado,0),0) as abonado_cxc,
  greatest(coalesce(o.monto_pendiente,0),0) as saldo_pendiente,
  o.cxc_vencimiento,
  greatest(current_date-coalesce(o.cxc_vencimiento,current_date),0) as dias_atraso,
  case
    when coalesce(o.monto_pendiente,0)<=0.01 then 'Pagado'
    when coalesce(o.cxc_vencimiento,current_date)>=current_date then 'Al día'
    when current_date-o.cxc_vencimiento<=30 then '1-30 días'
    when current_date-o.cxc_vencimiento<=60 then '31-60 días'
    else '+60 días'
  end as antiguedad,
  case
    when coalesce(o.monto_pendiente,0)<=0.01 then 'Pagado'
    when coalesce(o.cxc_pagado_acumulado,0)>0.01 then 'Abonado'
    else 'Pendiente'
  end as estado_cxc,
  o.cxc_ultimo_pago_en
from public.ordenes o
left join public.clientes c on c.id=o.cliente_id
where coalesce(o.cxc_saldo_inicial,0)>0
  and coalesce(o.archivada,false)=false;

grant select on public.cxc_saldos_v940 to authenticated;

-- ---------------------------------------------------------
-- 4. SEGURIDAD: LECTURA POR MÓDULO, ESCRITURA SOLO POR RPC
-- ---------------------------------------------------------
alter table public.cxc_cobros enable row level security;
alter table public.cxc_cobro_aplicaciones enable row level security;
alter table public.cxc_eventos enable row level security;

drop policy if exists v940_cxc_cobros_select on public.cxc_cobros;
create policy v940_cxc_cobros_select on public.cxc_cobros
for select to authenticated
using(
  public.es_admin_operativo()
  or public.tiene_algun_modulo(array['liquidacion','clientes','control'],'ver')
);

drop policy if exists v940_cxc_aplicaciones_select on public.cxc_cobro_aplicaciones;
create policy v940_cxc_aplicaciones_select on public.cxc_cobro_aplicaciones
for select to authenticated
using(
  public.es_admin_operativo()
  or public.tiene_algun_modulo(array['liquidacion','clientes','control'],'ver')
);

drop policy if exists v940_cxc_eventos_admin on public.cxc_eventos;
create policy v940_cxc_eventos_admin on public.cxc_eventos
for select to authenticated
using(public.es_admin_operativo());

grant select on public.cxc_cobros,public.cxc_cobro_aplicaciones to authenticated;
revoke insert,update,delete on public.cxc_cobros,public.cxc_cobro_aplicaciones,public.cxc_eventos
  from public,anon,authenticated;

-- ---------------------------------------------------------
-- 5. REGISTRAR COBRO POSTERIOR
-- ---------------------------------------------------------
create or replace function public.registrar_cobro_cxc_v940(
  p_cliente_clave text,
  p_monto numeric,
  p_metodo text,
  p_referencia text,
  p_recibido_por text,
  p_observacion text,
  p_aplicaciones jsonb
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_uid uuid:=auth.uid();
  v_cliente_clave text:=btrim(coalesce(p_cliente_clave,''));
  v_monto numeric(14,2):=round(coalesce(p_monto,0),2);
  v_metodo text:=initcap(lower(btrim(coalesce(p_metodo,''))));
  v_item jsonb;
  v_orden public.ordenes%rowtype;
  v_orden_id bigint;
  v_aplicado numeric(14,2);
  v_suma numeric(14,2):=0;
  v_antes numeric(14,2);
  v_despues numeric(14,2);
  v_cobro_id bigint;
  v_numero text;
  v_cliente_id bigint;
  v_cliente_nombre text;
  v_cliente_telefono text;
  v_clave_orden text;
  v_saldo_cliente numeric(14,2):=0;
begin
  if v_uid is null then raise exception 'Sesión no válida.'; end if;
  if not public.es_admin_operativo()
     and not public.tiene_modulo('liquidacion','editar') then
    raise exception 'No tienes permiso para registrar cobros de CXC.';
  end if;
  if v_cliente_clave='' then raise exception 'Selecciona el cliente del cobro.'; end if;
  if v_monto<=0 then raise exception 'El monto del cobro debe ser mayor que cero.'; end if;
  if v_metodo not in('Efectivo','Transferencia','Mixto') then
    raise exception 'Método de pago no válido.';
  end if;
  if v_metodo in('Transferencia','Mixto')
     and length(btrim(coalesce(p_referencia,'')))<3 then
    raise exception 'La referencia es obligatoria para transferencia o pago mixto.';
  end if;
  if length(btrim(coalesce(p_recibido_por,'')))<2 then
    raise exception 'Selecciona quién recibió el cobro.';
  end if;
  if jsonb_typeof(coalesce(p_aplicaciones,'[]'::jsonb))<>'array'
     or jsonb_array_length(coalesce(p_aplicaciones,'[]'::jsonb))=0 then
    raise exception 'El cobro debe aplicarse al menos a una factura.';
  end if;
  if (
    select count(*)<>count(distinct nullif(x->>'orden_id','')::bigint)
    from jsonb_array_elements(p_aplicaciones) x
  ) then
    raise exception 'Una factura está repetida en el cobro.';
  end if;

  -- Bloqueo canónico evita interbloqueos si dos cajas intentan aplicar
  -- cobros simultáneos sobre varias facturas del mismo cliente.
  perform o.id
  from public.ordenes o
  join jsonb_array_elements(p_aplicaciones) x
    on o.id=nullif(x->>'orden_id','')::bigint
  order by o.id
  for update of o;

  -- Primera pasada: bloquea y valida todas las facturas antes de crear el recibo.
  for v_item in select value from jsonb_array_elements(p_aplicaciones)
  loop
    v_orden_id:=nullif(v_item->>'orden_id','')::bigint;
    v_aplicado:=round(coalesce(nullif(v_item->>'monto','')::numeric,0),2);
    if v_orden_id is null or v_aplicado<=0 then
      raise exception 'Cada aplicación requiere orden y monto mayor que cero.';
    end if;
    select * into v_orden from public.ordenes where id=v_orden_id for update;
    if not found then raise exception 'La orden % no existe.',v_orden_id; end if;
    if coalesce(v_orden.archivada,false) then
      raise exception 'La orden % está archivada.',v_orden.codigo;
    end if;
    if coalesce(v_orden.resultado_entrega,v_orden.estado)<>'Entregado a crédito'
       or coalesce(v_orden.monto_pendiente,0)<=0.01 then
      raise exception 'La orden % no tiene una CXC abierta.',v_orden.codigo;
    end if;
    v_clave_orden:=case when v_orden.cliente_id is not null
      then 'REG:'||v_orden.cliente_id::text
      else 'ORD:'||v_orden.id::text end;
    if v_clave_orden<>v_cliente_clave then
      raise exception 'La orden % pertenece a otro cliente.',v_orden.codigo;
    end if;
    if v_aplicado>v_orden.monto_pendiente+0.009 then
      raise exception 'El abono de % supera el saldo de la orden %.',
        v_aplicado,v_orden.codigo;
    end if;
    v_suma:=round(v_suma+v_aplicado,2);
    if v_cliente_nombre is null then
      v_cliente_id:=v_orden.cliente_id;
      select
        coalesce(c.negocio,v_orden.cliente_nombre_orden,'Cliente ocasional'),
        coalesce(c.telefono,v_orden.cliente_telefono_orden)
      into v_cliente_nombre,v_cliente_telefono
      from (select 1) q
      left join public.clientes c on c.id=v_orden.cliente_id;
    end if;
  end loop;

  if abs(v_suma-v_monto)>0.009 then
    raise exception 'Las aplicaciones (%) no coinciden con el monto recibido (%).',
      v_suma,v_monto;
  end if;

  v_numero:='CXC-'||to_char(current_date,'YYYYMMDD')||'-'||
    lpad(nextval('public.cxc_recibo_seq_v940')::text,6,'0');

  insert into public.cxc_cobros(
    numero_recibo,cliente_clave,cliente_id,cliente_nombre,cliente_telefono,
    monto_total,metodo,referencia,recibido_por,observacion,creado_por
  ) values(
    v_numero,v_cliente_clave,v_cliente_id,coalesce(v_cliente_nombre,'Cliente'),
    v_cliente_telefono,v_monto,v_metodo,nullif(btrim(p_referencia),''),
    btrim(p_recibido_por),nullif(btrim(p_observacion),''),v_uid
  ) returning id into v_cobro_id;

  -- Segunda pasada: aplica cada monto y conserva saldo antes/después.
  for v_item in select value from jsonb_array_elements(p_aplicaciones)
  loop
    v_orden_id:=(v_item->>'orden_id')::bigint;
    v_aplicado:=round((v_item->>'monto')::numeric,2);
    select * into v_orden from public.ordenes where id=v_orden_id for update;
    v_antes:=round(coalesce(v_orden.monto_pendiente,0),2);
    v_despues:=greatest(round(v_antes-v_aplicado,2),0);

    update public.ordenes
    set monto_pendiente=v_despues,
        cxc_saldo_inicial=greatest(
          coalesce(cxc_saldo_inicial,0),
          v_antes+coalesce(cxc_pagado_acumulado,0)
        ),
        cxc_pagado_acumulado=round(coalesce(cxc_pagado_acumulado,0)+v_aplicado,2),
        cxc_estado=case when v_despues<=0.01 then 'Pagado' else 'Abonado' end,
        cxc_ultimo_pago_en=now(),
        actualizado_por=v_uid,
        actualizado_en=now()
    where id=v_orden_id;

    insert into public.cxc_cobro_aplicaciones(
      cobro_id,orden_id,monto_aplicado,saldo_antes,saldo_despues,vencimiento
    ) values(
      v_cobro_id,v_orden_id,v_aplicado,v_antes,v_despues,v_orden.cxc_vencimiento
    );

    insert into public.orden_pagos(
      orden_id,cliente_id,monto,metodo,recibido_por,cxc_cobro_id,tipo_pago
    ) values(
      v_orden_id,v_orden.cliente_id,v_aplicado,v_metodo,v_uid,v_cobro_id,'Cobro posterior CXC'
    );
  end loop;

  select coalesce(sum(o.monto_pendiente),0) into v_saldo_cliente
  from public.ordenes o
  where (case when o.cliente_id is not null then 'REG:'||o.cliente_id::text else 'ORD:'||o.id::text end)=v_cliente_clave
    and coalesce(o.resultado_entrega,o.estado)='Entregado a crédito'
    and coalesce(o.archivada,false)=false;

  insert into public.cxc_eventos(
    cobro_id,tipo,motivo,datos,usuario_id
  ) values(
    v_cobro_id,'Cobro registrado',null,
    jsonb_build_object(
      'numero_recibo',v_numero,
      'cliente_clave',v_cliente_clave,
      'monto',v_monto,
      'metodo',v_metodo,
      'aplicaciones',p_aplicaciones,
      'saldo_cliente',v_saldo_cliente
    ),
    v_uid
  );

  return jsonb_build_object(
    'cobro_id',v_cobro_id,
    'numero_recibo',v_numero,
    'cliente_nombre',v_cliente_nombre,
    'monto_total',v_monto,
    'metodo',v_metodo,
    'referencia',nullif(btrim(p_referencia),''),
    'recibido_por',btrim(p_recibido_por),
    'saldo_cliente',round(v_saldo_cliente,2),
    'aplicaciones',p_aplicaciones
  );
end;
$$;

-- ---------------------------------------------------------
-- 6. REVERSIÓN ADMINISTRATIVA SIN BORRADO
-- ---------------------------------------------------------
create or replace function public.reversar_cobro_cxc_v940(
  p_cobro_id bigint,
  p_motivo text
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_uid uuid:=auth.uid();
  v_cobro public.cxc_cobros%rowtype;
  v_app public.cxc_cobro_aplicaciones%rowtype;
  v_orden public.ordenes%rowtype;
  v_nuevo_saldo numeric(14,2);
begin
  if v_uid is null then raise exception 'Sesión no válida.'; end if;
  if not public.es_admin_operativo() then
    raise exception 'Solo Administración o Gerencia puede reversar un cobro.';
  end if;
  if length(btrim(coalesce(p_motivo,'')))<5 then
    raise exception 'El motivo de reversión debe tener al menos 5 caracteres.';
  end if;
  select * into v_cobro from public.cxc_cobros where id=p_cobro_id for update;
  if not found then raise exception 'El recibo no existe.'; end if;
  if v_cobro.estado<>'Activo' then raise exception 'Este recibo ya fue reversado.'; end if;

  perform o.id
  from public.ordenes o
  join public.cxc_cobro_aplicaciones a on a.orden_id=o.id
  where a.cobro_id=v_cobro.id
  order by o.id
  for update of o;

  for v_app in
    select * from public.cxc_cobro_aplicaciones
    where cobro_id=v_cobro.id order by id for update
  loop
    select * into v_orden from public.ordenes where id=v_app.orden_id for update;
    if not found then raise exception 'La orden % ya no existe.',v_app.orden_id; end if;
    v_nuevo_saldo:=round(coalesce(v_orden.monto_pendiente,0)+v_app.monto_aplicado,2);
    if v_orden.cxc_saldo_inicial is not null
       and v_nuevo_saldo>v_orden.cxc_saldo_inicial+0.009 then
      raise exception 'La reversión excedería el saldo original de la orden %.',v_orden.codigo;
    end if;
    update public.ordenes
    set monto_pendiente=v_nuevo_saldo,
        cxc_pagado_acumulado=greatest(
          round(coalesce(cxc_pagado_acumulado,0)-v_app.monto_aplicado,2),0
        ),
        cxc_estado=case
          when greatest(round(coalesce(cxc_pagado_acumulado,0)-v_app.monto_aplicado,2),0)>0.01
            then 'Abonado'
          else 'Pendiente'
        end,
        cxc_ultimo_pago_en=(
          select max(c.fecha_cobro)
          from public.cxc_cobros c
          join public.cxc_cobro_aplicaciones a on a.cobro_id=c.id
          where a.orden_id=v_app.orden_id
            and c.id<>v_cobro.id
            and c.estado='Activo'
        ),
        actualizado_por=v_uid,
        actualizado_en=now()
    where id=v_app.orden_id;
  end loop;

  update public.orden_pagos
  set reversado=true,reversado_en=now(),reversado_por=v_uid
  where cxc_cobro_id=v_cobro.id;

  update public.cxc_cobros
  set estado='Reversado',reversado_por=v_uid,reversado_en=now(),
      motivo_reversion=btrim(p_motivo)
  where id=v_cobro.id;

  insert into public.cxc_eventos(cobro_id,tipo,motivo,datos,usuario_id)
  values(
    v_cobro.id,'Cobro reversado',btrim(p_motivo),
    jsonb_build_object('numero_recibo',v_cobro.numero_recibo,'monto',v_cobro.monto_total),
    v_uid
  );

  return jsonb_build_object(
    'cobro_id',v_cobro.id,
    'numero_recibo',v_cobro.numero_recibo,
    'estado','Reversado',
    'monto_reintegrado',v_cobro.monto_total
  );
end;
$$;

-- ---------------------------------------------------------
-- 7. ACTUALIZAR VENCIMIENTO CON TRAZABILIDAD
-- ---------------------------------------------------------
create or replace function public.actualizar_vencimiento_cxc_v940(
  p_orden_id bigint,
  p_vencimiento date,
  p_motivo text
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_uid uuid:=auth.uid();
  v_orden public.ordenes%rowtype;
  v_anterior date;
begin
  if v_uid is null then raise exception 'Sesión no válida.'; end if;
  if not public.es_admin_operativo()
     and not public.tiene_modulo('liquidacion','editar') then
    raise exception 'No tienes permiso para cambiar vencimientos de CXC.';
  end if;
  if p_vencimiento is null then raise exception 'La fecha de vencimiento es obligatoria.'; end if;
  if length(btrim(coalesce(p_motivo,'')))<5 then
    raise exception 'Indica un motivo de al menos 5 caracteres.';
  end if;
  select * into v_orden from public.ordenes where id=p_orden_id for update;
  if not found then raise exception 'La orden no existe.'; end if;
  if coalesce(v_orden.resultado_entrega,v_orden.estado)<>'Entregado a crédito'
     or coalesce(v_orden.cxc_saldo_inicial,0)<=0 then
    raise exception 'La orden no pertenece a CXC.';
  end if;
  v_anterior:=v_orden.cxc_vencimiento;
  update public.ordenes
  set cxc_vencimiento=p_vencimiento,actualizado_por=v_uid,actualizado_en=now()
  where id=p_orden_id;
  insert into public.cxc_eventos(orden_id,tipo,motivo,datos,usuario_id)
  values(
    p_orden_id,'Vencimiento actualizado',btrim(p_motivo),
    jsonb_build_object('anterior',v_anterior,'nuevo',p_vencimiento,'orden',v_orden.codigo),
    v_uid
  );
  return jsonb_build_object(
    'orden_id',p_orden_id,'orden_codigo',v_orden.codigo,
    'vencimiento_anterior',v_anterior,'vencimiento_nuevo',p_vencimiento
  );
end;
$$;

revoke all on function public.registrar_cobro_cxc_v940(text,numeric,text,text,text,text,jsonb)
  from public,anon,authenticated;
revoke all on function public.reversar_cobro_cxc_v940(bigint,text)
  from public,anon,authenticated;
revoke all on function public.actualizar_vencimiento_cxc_v940(bigint,date,text)
  from public,anon,authenticated;
grant execute on function public.registrar_cobro_cxc_v940(text,numeric,text,text,text,text,jsonb)
  to authenticated;
grant execute on function public.reversar_cobro_cxc_v940(bigint,text)
  to authenticated;
grant execute on function public.actualizar_vencimiento_cxc_v940(bigint,date,text)
  to authenticated;

comment on function public.registrar_cobro_cxc_v940 is
  'V9.4.0: registra un recibo numerado y aplica el cobro a facturas del mismo cliente.';
comment on function public.reversar_cobro_cxc_v940 is
  'V9.4.0: reversa un recibo sin borrarlo y restituye los saldos de sus facturas.';
comment on view public.cxc_saldos_v940 is
  'V9.4.0: cartera ligera con saldo, vencimiento, días de atraso y antigüedad.';

do $$
begin
  begin
    alter publication supabase_realtime add table public.cxc_cobros;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.cxc_cobro_aplicaciones;
  exception when duplicate_object then null;
  end;
end $$;

analyze public.ordenes;
analyze public.cxc_cobros;
analyze public.cxc_cobro_aplicaciones;

commit;

select
  to_regprocedure('public.registrar_cobro_cxc_v940(text,numeric,text,text,text,text,jsonb)') is not null
    as cobro_transaccional,
  to_regprocedure('public.reversar_cobro_cxc_v940(bigint,text)') is not null
    as reversion_auditada,
  to_regclass('public.cxc_saldos_v940') is not null
    as cartera_disponible,
  not has_table_privilege('authenticated','public.cxc_cobros','INSERT')
    and not has_table_privilege('authenticated','public.cxc_cobros','UPDATE')
    and not has_table_privilege('authenticated','public.cxc_cobros','DELETE')
    as escritura_directa_bloqueada,
  exists(
    select 1
    from pg_trigger t
    where t.tgrelid='public.ordenes'::regclass
      and t.tgname='trg_pc_identidad_preparacion_v9397'
      and t.tgenabled<>'D'
  ) as proteccion_identidad_activa,
  '9.4.0' as version;

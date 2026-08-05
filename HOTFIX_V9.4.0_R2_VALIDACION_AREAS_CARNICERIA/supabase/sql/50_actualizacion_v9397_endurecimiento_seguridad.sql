-- =========================================================
-- 50 - V9.3.9.7 · ENDURECIMIENTO DE SEGURIDAD OPERATIVA
-- Productos César CRM
--
-- Corrige:
--   1) Políticas permisivas heredadas (*_all).
--   2) Creación directa de órdenes en estados avanzados.
--   3) Suplantación del despachador que toma/prepara una orden.
--   4) Creación no transaccional de casos especiales.
--   5) RPC de liquidación antiguas todavía expuestas.
--
-- Compatible con clientes V9.3.9.6:
--   Las tomas antiguas que usan cambiar_estado_orden_v9382 siguen
--   funcionando, pero el trigger V9.3.9.7 normaliza la identidad
--   con los datos del servidor.
-- =========================================================

begin;

-- ---------------------------------------------------------
-- 0. PRERREQUISITOS REALES: SQL 39–49
-- ---------------------------------------------------------
do $$
declare
  v_def text;
begin
  if to_regprocedure('public.guardar_orden_v9381(bigint,bigint,jsonb,jsonb,boolean,text,text)') is null
     or to_regprocedure('public.guardar_preparacion_v9381(bigint,jsonb,jsonb,boolean)') is null then
    raise exception 'Falta SQL 39: guardado transaccional.';
  end if;
  if to_regprocedure('public.cambiar_estado_orden_v9382(bigint,text,text,jsonb,text,text)') is null then
    raise exception 'Falta SQL 40: estados protegidos.';
  end if;
  if to_regprocedure('public.cancelar_orden_v9383(bigint,text,text,boolean)') is null then
    raise exception 'Falta SQL 41/49: cancelación segura.';
  end if;
  if to_regprocedure(
    'public.guardar_preparacion_faltantes_v9391(bigint,jsonb,jsonb,boolean,date,text)'
  ) is null
     or not exists(
       select 1 from information_schema.columns
       where table_schema='public' and table_name='ordenes'
         and column_name='es_pendiente_existencia'
     )
     or not exists(
       select 1 from information_schema.columns
       where table_schema='public' and table_name='ordenes'
         and column_name='orden_origen_id'
     ) then
    raise exception 'Falta SQL 44: pendientes por existencia.';
  end if;
  if to_regprocedure('public.registrar_devolucion_parcial_v9392(bigint,jsonb,numeric,text,text,text)') is null then
    raise exception 'Falta SQL 45: devolución parcial.';
  end if;
  if to_regprocedure('public.recibir_lote_cxc_v9392_r2(bigint,jsonb,text,text)') is null then
    raise exception 'Falta SQL 46: devolución integrada al lote.';
  end if;
  if to_regprocedure('public.recibir_orden_cxc_v9393(bigint,text,numeric,text,text,text)') is null
     or to_regprocedure('public.recibir_lote_cxc_v9393(bigint,jsonb,text,text)') is null then
    raise exception 'Falta SQL 47: no entregados a Validación.';
  end if;
  if to_regprocedure('public.pc_retornar_no_entregado_validacion_v9393(bigint,bigint,text,text)') is null then
    raise exception 'Falta SQL 48: corrección de retorno No entregado.';
  end if;

  select pg_get_functiondef(
    'public.pc_retornar_no_entregado_validacion_v9393(bigint,bigint,text,text)'::regprocedure
  ) into v_def;
  if position('notas_validacion' in v_def)=0 or position('notas_estado' in v_def)>0 then
    raise exception 'SQL 48 no está aplicado correctamente.';
  end if;

  select pg_get_functiondef(
    'public.cancelar_orden_v9383(bigint,text,text,boolean)'::regprocedure
  ) into v_def;
  if position('v_retorno_no_entregado' in v_def)=0
     or position('transferido totalmente' in lower(v_def))=0 then
    raise exception 'SQL 49 no está aplicado correctamente.';
  end if;

  if not exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='perfiles' and column_name='tipo_cuenta'
  ) or not exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='perfiles' and column_name='empleado_id'
  ) or not exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='empleados_operativos'
      and column_name='areas_adicionales'
  ) then
    raise exception 'Faltan SQL 26/34: cuentas de estación y áreas operativas.';
  end if;

  if to_regclass('public.orden_casos_historial') is null then
    raise exception 'Falta SQL 21: casos especiales estructurados.';
  end if;
end $$;

-- ---------------------------------------------------------
-- 1. RETIRAR POLÍTICAS PERMISIVAS HEREDADAS
-- ---------------------------------------------------------
drop policy if exists ordenes_all on public.ordenes;
drop policy if exists orden_detalle_all on public.orden_detalle;
drop policy if exists orden_pesos_all on public.orden_pesos;
drop policy if exists orden_entregas_all on public.orden_entregas;
drop policy if exists orden_pagos_all on public.orden_pagos;
drop policy if exists prod_despacho_all on public.productos_despacho;

-- Políticas explícitas para órdenes.
drop policy if exists v551_ordenes_select_operativo on public.ordenes;
drop policy if exists v551_ordenes_write_operativo on public.ordenes;
drop policy if exists v552_ordenes_insert_operativo on public.ordenes;
drop policy if exists v552_ordenes_update_operativo on public.ordenes;
drop policy if exists v552_ordenes_delete_admin on public.ordenes;
drop policy if exists v9397_ordenes_select_operativo on public.ordenes;
drop policy if exists v9397_ordenes_insert_seguro on public.ordenes;
drop policy if exists v9397_ordenes_update_operativo on public.ordenes;

create policy v9397_ordenes_select_operativo
on public.ordenes for select to authenticated
using(
  public.es_admin_operativo()
  or public.tiene_algun_modulo(
    array['ordenes','control','carniceria','facturacion','validacion','delivery','liquidacion'],
    'ver'
  )
);

create policy v9397_ordenes_insert_seguro
on public.ordenes for insert to authenticated
with check(
  creado_por=auth.uid()
  and actualizado_por=auth.uid()
  and (
    (
      estado in('Programada','Pedido recibido')
      and (
        public.es_admin_operativo()
        or public.tiene_algun_modulo(array['ordenes','control'],'editar')
      )
    )
    or (
      estado='Pendiente por existencia'
      and coalesce(es_pendiente_existencia,false)
      and orden_origen_id is not null
      and (
        public.es_admin_operativo()
        or public.tiene_algun_modulo(array['carniceria'],'editar')
      )
    )
  )
);

create policy v9397_ordenes_update_operativo
on public.ordenes for update to authenticated
using(
  public.es_admin_operativo()
  or public.tiene_algun_modulo(
    array['ordenes','control','carniceria','facturacion','validacion','delivery','liquidacion'],
    'editar'
  )
)
with check(
  public.es_admin_operativo()
  or public.tiene_algun_modulo(
    array['ordenes','control','carniceria','facturacion','validacion','delivery','liquidacion'],
    'editar'
  )
);

-- El detalle conserva edición operativa, pero Carnicería solo puede
-- tocar directamente una orden tomada desde la misma cuenta.
drop policy if exists v551_orden_detalle_select_operativo on public.orden_detalle;
drop policy if exists v551_orden_detalle_write_operativo on public.orden_detalle;
drop policy if exists v552_orden_detalle_insert_operativo on public.orden_detalle;
drop policy if exists v552_orden_detalle_update_operativo on public.orden_detalle;
drop policy if exists v552_orden_detalle_delete_admin on public.orden_detalle;
drop policy if exists v9397_orden_detalle_select_operativo on public.orden_detalle;
drop policy if exists v9397_orden_detalle_insert_operativo on public.orden_detalle;
drop policy if exists v9397_orden_detalle_update_responsable on public.orden_detalle;

create policy v9397_orden_detalle_select_operativo
on public.orden_detalle for select to authenticated
using(
  public.es_admin_operativo()
  or public.tiene_algun_modulo(
    array['ordenes','control','carniceria','facturacion','validacion','delivery','liquidacion'],
    'ver'
  )
);

create policy v9397_orden_detalle_insert_operativo
on public.orden_detalle for insert to authenticated
with check(
  public.es_admin_operativo()
  or public.tiene_algun_modulo(array['ordenes','control'],'editar')
);

create policy v9397_orden_detalle_update_responsable
on public.orden_detalle for update to authenticated
using(
  public.es_admin_operativo()
  or public.tiene_algun_modulo(array['ordenes','control','facturacion'],'editar')
  or (
    public.tiene_algun_modulo(array['carniceria'],'editar')
    and exists(
      select 1 from public.ordenes o
      where o.id=orden_detalle.orden_id
        and o.estado='En preparación'
        and o.tomado_por_user=auth.uid()
    )
  )
)
with check(
  public.es_admin_operativo()
  or public.tiene_algun_modulo(array['ordenes','control','facturacion'],'editar')
  or (
    public.tiene_algun_modulo(array['carniceria'],'editar')
    and exists(
      select 1 from public.ordenes o
      where o.id=orden_detalle.orden_id
        and o.estado='En preparación'
        and o.tomado_por_user=auth.uid()
    )
  )
);

revoke delete on public.ordenes,public.orden_detalle from anon,authenticated;

-- Tablas históricas sustituidas por el flujo actual: solo lectura.
do $$
begin
  if to_regclass('public.orden_facturas') is not null then
    execute 'drop policy if exists orden_facturas_all on public.orden_facturas';
    execute 'drop policy if exists v9397_orden_facturas_select on public.orden_facturas';
    execute $p$create policy v9397_orden_facturas_select
      on public.orden_facturas for select to authenticated
      using(public.es_admin_operativo() or
        public.tiene_algun_modulo(array['facturacion','validacion','ordenes'],'ver'))$p$;
    execute 'revoke insert,update,delete on public.orden_facturas from anon,authenticated';
  end if;
  if to_regclass('public.viajes_delivery') is not null then
    execute 'drop policy if exists viajes_delivery_all on public.viajes_delivery';
    execute 'drop policy if exists v9397_viajes_delivery_select on public.viajes_delivery';
    execute $p$create policy v9397_viajes_delivery_select
      on public.viajes_delivery for select to authenticated
      using(public.es_admin_operativo() or
        public.tiene_algun_modulo(array['delivery','validacion','liquidacion'],'ver'))$p$;
    execute 'revoke insert,update,delete on public.viajes_delivery from anon,authenticated';
  end if;
  if to_regclass('public.viaje_ordenes') is not null then
    execute 'drop policy if exists viaje_ordenes_all on public.viaje_ordenes';
    execute 'drop policy if exists v9397_viaje_ordenes_select on public.viaje_ordenes';
    execute $p$create policy v9397_viaje_ordenes_select
      on public.viaje_ordenes for select to authenticated
      using(public.es_admin_operativo() or
        public.tiene_algun_modulo(array['delivery','validacion','liquidacion'],'ver'))$p$;
    execute 'revoke insert,update,delete on public.viaje_ordenes from anon,authenticated';
  end if;
end $$;

-- ---------------------------------------------------------
-- 2. INSERT DE ÓRDENES: ESTADO E IDENTIDAD DEL SERVIDOR
-- ---------------------------------------------------------
create or replace function public.pc_validar_insert_orden_v9397()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_uid uuid:=auth.uid();
begin
  if v_uid is null then
    raise exception 'Sesión no válida.';
  end if;

  new.estado:=coalesce(nullif(btrim(new.estado),''),'Pedido recibido');

  if new.estado in('Programada','Pedido recibido') then
    if not public.es_admin_operativo()
       and not public.tiene_algun_modulo(array['ordenes','control'],'editar') then
      raise exception 'Solo Órdenes/Control puede crear órdenes.';
    end if;
  elsif new.estado='Pendiente por existencia'
        and coalesce(new.es_pendiente_existencia,false)
        and new.orden_origen_id is not null then
    if not public.es_admin_operativo()
       and not public.tiene_algun_modulo(array['carniceria'],'editar') then
      raise exception 'Solo Carnicería puede crear un pendiente por existencia.';
    end if;
  else
    raise exception 'Una orden nueva no puede iniciar en el estado %.',new.estado;
  end if;

  new.creado_por:=v_uid;
  new.actualizado_por:=v_uid;
  new.creado_en:=coalesce(new.creado_en,now());
  new.actualizado_en:=now();
  return new;
end;
$$;

drop trigger if exists trg_pc_insert_orden_v9397 on public.ordenes;
create trigger trg_pc_insert_orden_v9397
before insert on public.ordenes
for each row execute function public.pc_validar_insert_orden_v9397();

-- ---------------------------------------------------------
-- 3. IDENTIDAD DE TOMA Y PREPARACIÓN
-- ---------------------------------------------------------
create or replace function public.pc_validar_identidad_preparacion_v9397()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_uid uuid:=auth.uid();
  v_perfil public.perfiles%rowtype;
  v_empleado public.empleados_operativos%rowtype;
  v_es_admin boolean:=false;
  v_cola integer:=0;
  v_es_toma boolean:=
    old.estado='Pedido recibido' and new.estado='En preparación';
  v_limpieza_valida boolean:=false;
begin
  if v_uid is null then raise exception 'Sesión no válida.'; end if;

  select * into v_perfil from public.perfiles where id=v_uid;
  if not found or coalesce(v_perfil.activo,true)=false then
    raise exception 'El perfil de usuario no existe o está inactivo.';
  end if;
  v_es_admin:=public.es_admin_operativo();

  if v_es_toma then
    if not v_es_admin
       and not public.tiene_algun_modulo(array['carniceria'],'editar') then
      raise exception 'No tienes permiso para tomar órdenes en Carnicería.';
    end if;

    if coalesce(v_perfil.tipo_cuenta,'empleado')='estacion' then
      if new.tomado_por_empleado_id is null then
        raise exception 'La cuenta de estación debe seleccionar un empleado de Carnicería.';
      end if;
      select * into v_empleado
      from public.empleados_operativos
      where id=new.tomado_por_empleado_id and coalesce(activo,true);
      if not found then raise exception 'El empleado seleccionado no existe o está inactivo.'; end if;
    elsif v_perfil.empleado_id is not null then
      select * into v_empleado
      from public.empleados_operativos
      where id=v_perfil.empleado_id and coalesce(activo,true);
      if not found then raise exception 'El empleado vinculado está inactivo o no existe.'; end if;
      if new.tomado_por_empleado_id is not null
         and new.tomado_por_empleado_id<>v_empleado.id then
        raise exception 'Un usuario personal no puede tomar una orden a nombre de otro empleado.';
      end if;
    elsif v_es_admin then
      if new.tomado_por_empleado_id is not null then
        select * into v_empleado
        from public.empleados_operativos
        where id=new.tomado_por_empleado_id and coalesce(activo,true);
        if not found then raise exception 'El empleado seleccionado no existe o está inactivo.'; end if;
      elsif nullif(btrim(coalesce(new.tomado_por,'')),'') is null then
        raise exception 'Indica quién toma la orden.';
      end if;
    else
      raise exception 'Vincula este usuario con un empleado antes de tomar órdenes.';
    end if;

    if v_empleado.id is not null then
      if lower(unaccent(coalesce(v_empleado.area,'')))<>'carniceria'
         and not exists(
           select 1 from unnest(coalesce(v_empleado.areas_adicionales,'{}'::text[])) a
           where lower(unaccent(a))='carniceria'
         ) then
        raise exception 'El empleado seleccionado no está habilitado para Carnicería.';
      end if;
      new.tomado_por:=v_empleado.nombre;
      new.tomado_por_empleado_id:=v_empleado.id;
    else
      new.tomado_por:=btrim(new.tomado_por);
      new.tomado_por_empleado_id:=null;
    end if;
    new.tomado_por_user:=v_uid;
    new.tomado_en:=now();
    new.preparado_por:=null;
    new.preparado_en:=null;

    if not v_es_admin and new.tomado_por_empleado_id is not null then
      select count(*) into v_cola
      from public.ordenes o
      where o.id<>old.id
        and o.estado='En preparación'
        and coalesce(o.archivada,false)=false
        and o.tomado_por_empleado_id=new.tomado_por_empleado_id;
      if v_cola>=3 then
        raise exception '% ya tiene 3 órdenes en preparación.',new.tomado_por;
      end if;
    end if;
  end if;

  -- Quien tomó la orden (o un administrador) es quien puede guardar,
  -- finalizar o liberar su preparación.
  if old.estado='En preparación' then
    if not v_es_admin and old.tomado_por_user is distinct from v_uid then
      raise exception 'Esta orden fue tomada desde otra cuenta. No puedes modificar su preparación.';
    end if;
    if new.estado='Lista para facturar' then
      new.tomado_por:=old.tomado_por;
      new.tomado_por_empleado_id:=old.tomado_por_empleado_id;
      new.tomado_por_user:=old.tomado_por_user;
      new.tomado_en:=old.tomado_en;
      new.preparado_por:=old.tomado_por;
      new.preparado_en:=now();
    end if;
  end if;

  -- La identidad de toma solo puede establecerse al tomar la orden.
  -- Puede limpiarse al liberar o al reiniciar una composición auditada.
  v_limpieza_valida:=
    new.estado='Pedido recibido'
    and new.tomado_por is null
    and new.tomado_por_empleado_id is null
    and new.tomado_por_user is null
    and new.tomado_en is null
    and (
      old.estado='En preparación'
      or v_es_admin
      or public.tiene_algun_modulo(array['ordenes','control'],'editar')
    );

  if not v_es_toma
     and (new.tomado_por,new.tomado_por_empleado_id,new.tomado_por_user,new.tomado_en)
         is distinct from
         (old.tomado_por,old.tomado_por_empleado_id,old.tomado_por_user,old.tomado_en)
     and not v_limpieza_valida then
    raise exception 'La identidad de quien tomó la orden está protegida.';
  end if;

  if new.preparado_por is distinct from old.preparado_por
     and not (
       old.estado='En preparación'
       and new.estado='Lista para facturar'
       and new.preparado_por=old.tomado_por
     )
     and not (
       new.estado='Pedido recibido'
       and new.preparado_por is null
       and (
         v_es_admin
         or public.tiene_algun_modulo(array['ordenes','control'],'editar')
         or old.tomado_por_user is not distinct from v_uid
       )
     ) then
    raise exception 'La identidad del preparador está protegida.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_pc_identidad_preparacion_v9397 on public.ordenes;
create trigger trg_pc_identidad_preparacion_v9397
before update on public.ordenes
for each row execute function public.pc_validar_identidad_preparacion_v9397();

-- RPC dedicada. Las tabletas V9.3.9.6 pueden seguir usando la RPC
-- genérica; el trigger anterior les aplica exactamente las mismas reglas.
create or replace function public.tomar_orden_v9397(
  p_orden_id bigint,
  p_estado_esperado text,
  p_empleado_id bigint default null,
  p_nombre text default null,
  p_comentario text default null
) returns table(id bigint,codigo text,estado text)
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'Sesión no válida.'; end if;
  return query
  select *
  from public.cambiar_estado_orden_v9382(
    p_orden_id,
    p_estado_esperado,
    'En preparación',
    jsonb_build_object(
      'tomado_por',nullif(btrim(coalesce(p_nombre,'')),''),
      'tomado_por_empleado_id',p_empleado_id,
      'tomado_en',now(),
      'tomado_por_user',auth.uid(),
      'preparado_por',null,
      'preparado_en',null,
      'liberado_por',null,
      'liberado_en',null,
      'motivo_liberacion',null
    ),
    coalesce(
      nullif(btrim(p_comentario),''),
      'Orden tomada mediante control de identidad V9.3.9.7'
    ),
    'carniceria'
  );
end;
$$;

revoke all on function public.tomar_orden_v9397(bigint,text,bigint,text,text)
  from public,anon;
grant execute on function public.tomar_orden_v9397(bigint,text,bigint,text,text)
  to authenticated;

-- ---------------------------------------------------------
-- 4. CREACIÓN TRANSACCIONAL DE CASOS ESPECIALES
-- ---------------------------------------------------------
create or replace function public.crear_caso_especial_v9397(p_caso jsonb)
returns table(id bigint,codigo text,estado text)
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_uid uuid:=auth.uid();
  v_cliente public.clientes%rowtype;
  v_id bigint;
  v_codigo text;
  v_tipo text;
  v_prep boolean;
  v_factura boolean;
  v_delivery boolean;
  v_responsable text;
  v_accion text;
  v_notas text;
begin
  if v_uid is null then raise exception 'Sesión no válida.'; end if;
  if not public.es_admin_operativo()
     and not public.tiene_algun_modulo(array['ordenes','control'],'editar') then
    raise exception 'No tienes permiso para crear casos especiales.';
  end if;
  if jsonb_typeof(p_caso)<>'object' then raise exception 'Caso especial no válido.'; end if;

  select * into v_cliente
  from public.clientes
  where id=nullif(p_caso->>'cliente_id','')::bigint
    and coalesce(archivado,false)=false;
  if not found then raise exception 'El cliente no existe o está archivado.'; end if;

  v_tipo:=p_caso->>'tipo_orden';
  if v_tipo not in('Devolución / recogida','Cambio / sustitución','Incidente / reclamo') then
    raise exception 'Tipo de caso especial no válido.';
  end if;

  v_prep:=v_tipo='Cambio / sustitución';
  v_factura:=v_tipo='Cambio / sustitución';
  v_delivery:=case
    when v_tipo in('Devolución / recogida','Cambio / sustitución') then true
    else coalesce((p_caso->>'requiere_delivery')::boolean,false)
  end;
  v_responsable:=nullif(btrim(p_caso->>'responsable_caso'),'');
  v_accion:=nullif(btrim(p_caso->>'accion_caso'),'');
  if v_accion is null then raise exception 'Describe la acción requerida para el caso.'; end if;

  v_notas:=concat_ws(E'\n',
    'Caso especial creado.',
    'Tipo: '||v_tipo,
    'Responsable: '||coalesce(v_responsable,'Sin asignar'),
    'Acción: '||v_accion,
    case when nullif(btrim(p_caso->>'producto_recoger'),'') is not null
      then 'Recoger: '||btrim(p_caso->>'producto_recoger') end,
    case when nullif(btrim(p_caso->>'producto_entregar'),'') is not null
      then 'Entregar/cambio: '||btrim(p_caso->>'producto_entregar') end
  );

  insert into public.ordenes(
    cliente_id,tipo_cliente_orden,cliente_nombre_orden,cliente_telefono_orden,
    cliente_sector_orden,cliente_direccion_orden,cliente_referencia_orden,
    modalidad_entrega,fecha,fecha_despacho,prioridad,tipo_orden,
    requiere_preparacion,requiere_facturacion,requiere_delivery,canal,vendedor,
    estado,condicion_pago,total_estimado,total_factura,zona,notas,
    estado_caso_especial,responsable_caso,accion_caso,producto_recoger,
    producto_entregar,fecha_compromiso,requiere_nota_credito,
    creado_por,actualizado_por
  ) values (
    v_cliente.id,'Registrado',v_cliente.negocio,v_cliente.telefono,
    v_cliente.sector,v_cliente.direccion,v_cliente.referencia,
    case when v_delivery then 'Delivery' else 'No aplica' end,
    current_date,current_date,'Alta',v_tipo,
    v_prep,v_factura,v_delivery,'Caso especial',
    coalesce((select vendedor from public.perfiles where id=v_uid),v_cliente.vendedor),
    'Pedido recibido','Crédito',0,0,v_cliente.sector,v_notas,
    'Abierto',v_responsable,v_accion,nullif(btrim(p_caso->>'producto_recoger'),''),
    nullif(btrim(p_caso->>'producto_entregar'),''),
    nullif(p_caso->>'fecha_compromiso','')::date,
    coalesce((p_caso->>'requiere_nota_credito')::boolean,false),
    v_uid,v_uid
  )
  returning ordenes.id,ordenes.codigo into v_id,v_codigo;

  insert into public.orden_casos_historial(
    orden_id,estado_caso,comentario,usuario
  ) values (
    v_id,'Abierto','Caso especial creado de forma transaccional.',v_uid
  );

  insert into public.orden_estados_historial(
    orden_id,estado_anterior,estado_nuevo,comentario,usuario
  ) values (
    v_id,null,'Pedido recibido',
    'Caso especial creado: '||v_tipo||'. '||v_accion,v_uid
  );

  return query
  select o.id,o.codigo,o.estado from public.ordenes o where o.id=v_id;
end;
$$;

revoke all on function public.crear_caso_especial_v9397(jsonb)
  from public,anon;
grant execute on function public.crear_caso_especial_v9397(jsonb)
  to authenticated;

-- ---------------------------------------------------------
-- 5. RETIRO CONTROLADO DE RPC ANTIGUAS
-- Se conservan para llamadas internas de las RPC nuevas, pero ya no
-- pueden invocarse directamente desde un navegador autenticado.
-- ---------------------------------------------------------
revoke all on function public.recibir_orden_cxc_v937(bigint,text,numeric,text,text,text)
  from public,anon,authenticated;
revoke all on function public.recibir_lote_cxc_v937(bigint,jsonb,text,text)
  from public,anon,authenticated;
revoke all on function public.recibir_lote_cxc_v9392_r2(bigint,jsonb,text,text)
  from public,anon,authenticated;

comment on function public.tomar_orden_v9397 is
  'V9.3.9.7: toma concurrente con empleado, cuenta de estación e identidad del servidor.';
comment on function public.crear_caso_especial_v9397 is
  'V9.3.9.7: crea el caso y sus historiales en una sola transacción.';
comment on function public.pc_validar_insert_orden_v9397 is
  'V9.3.9.7: impide que una orden nueva nazca en un estado operativo avanzado.';
comment on function public.pc_validar_identidad_preparacion_v9397 is
  'V9.3.9.7: protege quién toma, prepara y libera una orden.';

notify pgrst,'reload schema';
commit;

select
  not exists(
    select 1 from pg_policies
    where schemaname='public' and tablename='ordenes' and policyname='ordenes_all'
  ) as politica_permisiva_eliminada,
  to_regprocedure('public.tomar_orden_v9397(bigint,text,bigint,text,text)') is not null
    as toma_segura,
  to_regprocedure('public.crear_caso_especial_v9397(jsonb)') is not null
    as casos_transaccionales,
  has_function_privilege(
    'authenticated',
    'public.recibir_orden_cxc_v937(bigint,text,numeric,text,text,text)',
    'execute'
  )=false as rpc_antigua_retirada,
  '9.3.9.7' as version;

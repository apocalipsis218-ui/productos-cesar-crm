-- =========================================================
-- 53 - V9.4.0 R2 · VALIDACIÓN CENTRALIZADA DE ÁREAS
-- Productos César CRM
--
-- Corrige el falso rechazo:
--   empleado activo de Carnicería -> "no está habilitado"
--
-- Garantías:
--   1) La fecha se valida en el servidor con horario dominicano.
--   2) Las órdenes futuras continúan bloqueadas.
--   3) El área se valida directamente por empleado_id en una sola función.
--   4) La operación sigue siendo concurrente y transaccional.
--   5) No modifica ni elimina órdenes existentes.
-- =========================================================

begin;

-- ---------------------------------------------------------
-- 0. PRERREQUISITOS
-- ---------------------------------------------------------
do $$
begin
  if to_regprocedure(
       'public.tomar_orden_v9397(bigint,text,bigint,text,text)'
     ) is null
     or to_regprocedure(
       'public.cambiar_estado_orden_v9382(bigint,text,text,jsonb,text,text)'
     ) is null then
    raise exception 'Falta la seguridad operativa de los SQL 40 y 50.';
  end if;

  if to_regclass('public.cxc_cobros') is null
     or to_regclass('public.cxc_cobro_aplicaciones') is null then
    raise exception 'Falta SQL 51: primero aplica la V9.4.0 de CXC.';
  end if;
end $$;

-- ---------------------------------------------------------
-- 1. AUTORIZACIÓN CENTRALIZADA POR EMPLEADO Y ÁREA
-- ---------------------------------------------------------
create or replace function public.empleado_habilitado_area_v940r2(
  p_empleado_id bigint,
  p_area text
) returns boolean
language sql
stable
security definer
set search_path=public,pg_temp
as $$
  select exists(
    select 1
    from public.empleados_operativos e
    where e.id=p_empleado_id
      and coalesce(e.activo,true)
      and (
        lower(unaccent(btrim(coalesce(e.area,''))))=
          lower(unaccent(btrim(coalesce(p_area,''))))
        or exists(
          select 1
          from unnest(
            coalesce(e.areas_adicionales,'{}'::text[])
          ) a
          where lower(unaccent(btrim(coalesce(a,''))))=
            lower(unaccent(btrim(coalesce(p_area,''))))
        )
      )
  );
$$;

revoke all on function public.empleado_habilitado_area_v940r2(
  bigint,
  text
) from public,anon;

grant execute on function public.empleado_habilitado_area_v940r2(
  bigint,
  text
) to authenticated;

-- La transición directa solo existe para Carnicería. Los triggers y la
-- RPC dedicada validan adicionalmente que la fecha de despacho ya llegó.
insert into public.orden_transiciones_v9382(
  estado_anterior,
  estado_nuevo,
  modulo,
  activo
) values(
  'Programada',
  'En preparación',
  'carniceria',
  true
)
on conflict(estado_anterior,estado_nuevo)
do update set modulo=excluded.modulo,activo=true;

-- ---------------------------------------------------------
-- 2. PROGRAMACIÓN: FECHA DOMINICANA Y BLOQUEO EXPLÍCITO
-- ---------------------------------------------------------
create or replace function public.fn_orden_programacion_flags()
returns trigger
language plpgsql
set search_path=public,pg_temp
as $$
declare
  v_hoy_rd date:=timezone('America/Santo_Domingo',now())::date;
  v_fecha_cambio boolean:=false;
  v_futura boolean:=false;
  v_final boolean:=false;
begin
  if new.fecha_despacho is null then
    new.fecha_despacho:=coalesce(new.fecha,v_hoy_rd);
  end if;

  if tg_op='INSERT' then
    v_fecha_cambio:=true;
  else
    v_fecha_cambio:=new.fecha_despacho is distinct from old.fecha_despacho;
  end if;

  v_futura:=new.fecha_despacho>v_hoy_rd;
  v_final:=coalesce(new.estado,'') in(
    'Anulado',
    'Cerrado',
    'Cobrado',
    'Entregado a crédito',
    'No entregado',
    'Devuelto parcial'
  );

  -- Al crear o reprogramar se conserva el comportamiento histórico:
  -- una fecha futura coloca la orden en Programada; una fecha alcanzada
  -- la devuelve a Pedido recibido si todavía no inició su operación.
  if v_fecha_cambio then
    new.es_programada:=v_futura;

    if v_futura and not v_final then
      new.estado:='Programada';
      if new.fecha_programacion is null then
        new.fecha_programacion:=now();
      end if;
    elsif not v_futura and new.estado='Programada' then
      new.estado:='Pedido recibido';
    end if;

    return new;
  end if;

  -- Si solo cambia el estado, una orden futura no puede activarse.
  -- Se genera un error claro en lugar de devolverla silenciosamente a
  -- Programada y crear un historial que no corresponda.
  new.es_programada:=v_futura;
  if v_futura
     and not v_final
     and new.estado<>'Programada' then
    raise exception
      'La orden está programada para %. Podrá tomarse cuando llegue esa fecha.',
      new.fecha_despacho;
  end if;

  if not v_futura and new.estado='Programada' then
    new.estado:='Pedido recibido';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_orden_programacion_flags on public.ordenes;
create trigger trg_orden_programacion_flags
before insert or update of fecha_despacho,estado
on public.ordenes
for each row
execute function public.fn_orden_programacion_flags();

-- ---------------------------------------------------------
-- 3. IDENTIDAD: PROGRAMADA VENCIDA TAMBIÉN ES UNA TOMA
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
  v_hoy_rd date:=timezone('America/Santo_Domingo',now())::date;
  v_es_toma boolean:=
    old.estado in('Pedido recibido','Programada')
    and new.estado='En preparación';
  v_limpieza_valida boolean:=false;
begin
  if v_uid is null then raise exception 'Sesión no válida.'; end if;

  select * into v_perfil
  from public.perfiles
  where id=v_uid;

  if not found or coalesce(v_perfil.activo,true)=false then
    raise exception 'El perfil de usuario no existe o está inactivo.';
  end if;

  v_es_admin:=public.es_admin_operativo();

  if v_es_toma then
    if old.estado='Programada'
       and coalesce(old.fecha_despacho,old.fecha,v_hoy_rd)>v_hoy_rd then
      raise exception
        'La orden está programada para %. Podrá tomarse cuando llegue esa fecha.',
        coalesce(old.fecha_despacho,old.fecha);
    end if;

    if not v_es_admin
       and not public.tiene_algun_modulo(array['carniceria'],'editar') then
      raise exception 'No tienes permiso para tomar órdenes en Carnicería.';
    end if;

    if coalesce(v_perfil.tipo_cuenta,'empleado')='estacion' then
      if new.tomado_por_empleado_id is null then
        raise exception
          'La cuenta de estación debe seleccionar un empleado de Carnicería.';
      end if;

      select * into v_empleado
      from public.empleados_operativos
      where id=new.tomado_por_empleado_id
        and coalesce(activo,true);

      if not found then
        raise exception 'El empleado seleccionado no existe o está inactivo.';
      end if;
    elsif v_perfil.empleado_id is not null then
      select * into v_empleado
      from public.empleados_operativos
      where id=v_perfil.empleado_id
        and coalesce(activo,true);

      if not found then
        raise exception 'El empleado vinculado está inactivo o no existe.';
      end if;

      if new.tomado_por_empleado_id is not null
         and new.tomado_por_empleado_id<>v_empleado.id then
        raise exception
          'Un usuario personal no puede tomar una orden a nombre de otro empleado.';
      end if;
    elsif v_es_admin then
      if new.tomado_por_empleado_id is not null then
        select * into v_empleado
        from public.empleados_operativos
        where id=new.tomado_por_empleado_id
          and coalesce(activo,true);

        if not found then
          raise exception 'El empleado seleccionado no existe o está inactivo.';
        end if;
      elsif nullif(btrim(coalesce(new.tomado_por,'')),'') is null then
        raise exception 'Indica quién toma la orden.';
      end if;
    else
      raise exception
        'Vincula este usuario con un empleado antes de tomar órdenes.';
    end if;

    if v_empleado.id is not null then
      if not public.empleado_habilitado_area_v940r2(
        v_empleado.id,
        'Carnicería'
      ) then
        raise exception
          'El empleado seleccionado no está habilitado para Carnicería.';
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

    if not v_es_admin
       and new.tomado_por_empleado_id is not null then
      select count(*) into v_cola
      from public.ordenes o
      where o.id<>old.id
        and o.estado='En preparación'
        and coalesce(o.archivada,false)=false
        and o.tomado_por_empleado_id=new.tomado_por_empleado_id;

      if v_cola>=3 then
        raise exception
          '% ya tiene 3 órdenes en preparación.',
          new.tomado_por;
      end if;
    end if;
  end if;

  -- Quien tomó la orden (o un administrador) es quien puede guardar,
  -- finalizar o liberar su preparación.
  if old.estado='En preparación' then
    if not v_es_admin
       and old.tomado_por_user is distinct from v_uid then
      raise exception
        'Esta orden fue tomada desde otra cuenta. No puedes modificar su preparación.';
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
     and (
       new.tomado_por,
       new.tomado_por_empleado_id,
       new.tomado_por_user,
       new.tomado_en
     ) is distinct from (
       old.tomado_por,
       old.tomado_por_empleado_id,
       old.tomado_por_user,
       old.tomado_en
     )
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

drop trigger if exists trg_pc_identidad_preparacion_v9397
  on public.ordenes;
create trigger trg_pc_identidad_preparacion_v9397
before update on public.ordenes
for each row
execute function public.pc_validar_identidad_preparacion_v9397();

-- ---------------------------------------------------------
-- 4. TOMA CONCURRENTE Y TRANSACCIONAL
-- ---------------------------------------------------------
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
declare
  v_orden public.ordenes%rowtype;
  v_hoy_rd date:=timezone('America/Santo_Domingo',now())::date;
begin
  if auth.uid() is null then
    raise exception 'Sesión no válida.';
  end if;

  if p_empleado_id is not null
     and not public.empleado_habilitado_area_v940r2(
       p_empleado_id,
       'Carnicería'
     ) then
    raise exception
      'El empleado seleccionado no está habilitado para Carnicería.';
  end if;

  -- El bloqueo impide que dos despachadores tomen la misma orden.
  select * into v_orden
  from public.ordenes o
  where o.id=p_orden_id
  for update;

  if not found then
    raise exception 'La orden no existe.';
  end if;

  if v_orden.estado is distinct from p_estado_esperado then
    raise exception
      'La orden cambió de estado: se esperaba %, pero está en %.',
      p_estado_esperado,
      v_orden.estado;
  end if;

  if v_orden.estado not in('Programada','Pedido recibido') then
    raise exception
      'Solo se puede tomar una orden programada habilitada o un pedido recibido.';
  end if;

  if v_orden.estado='Programada'
     and coalesce(
       v_orden.fecha_despacho,
       v_orden.fecha,
       v_hoy_rd
     )>v_hoy_rd then
    raise exception
      'La orden está programada para %. Podrá tomarse cuando llegue esa fecha.',
      coalesce(v_orden.fecha_despacho,v_orden.fecha);
  end if;

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
      'Orden tomada mediante control de áreas V9.4.0 R2'
    ),
    'carniceria'
  );
end;
$$;

revoke all on function public.tomar_orden_v9397(
  bigint,
  text,
  bigint,
  text,
  text
) from public,anon;

grant execute on function public.tomar_orden_v9397(
  bigint,
  text,
  bigint,
  text,
  text
) to authenticated;

comment on function public.fn_orden_programacion_flags is
  'V9.4.0 R2: usa la fecha dominicana y bloquea la activación anticipada.';
comment on function public.empleado_habilitado_area_v940r2 is
  'V9.4.0 R2: valida directamente el área principal o adicional de un empleado activo.';
comment on function public.pc_validar_identidad_preparacion_v9397 is
  'V9.4.0 R2: protege identidad y valida el área mediante un único predicado.';
comment on function public.tomar_orden_v9397 is
  'V9.4.0 R2: valida empleado/área y permite tomar Programada al llegar su fecha.';

notify pgrst,'reload schema';
commit;

-- ---------------------------------------------------------
-- 5. CONTROLES FINALES
-- ---------------------------------------------------------
select
  exists(
    select 1
    from public.orden_transiciones_v9382
    where estado_anterior='Programada'
      and estado_nuevo='En preparación'
      and modulo='carniceria'
      and activo
  ) as transicion_programada_activa,
  position(
    'America/Santo_Domingo'
    in pg_get_functiondef(
      'public.fn_orden_programacion_flags()'::regprocedure
    )
  )>0 as fecha_dominicana_activa,
  position(
    'empleado_habilitado_area_v940r2'
    in pg_get_functiondef(
      'public.pc_validar_identidad_preparacion_v9397()'::regprocedure
    )
  )>0
  and position(
    'empleado_habilitado_area_v940r2'
    in pg_get_functiondef(
      'public.tomar_orden_v9397(bigint,text,bigint,text,text)'::regprocedure
    )
  )>0 as validacion_area_centralizada,
  to_regprocedure(
    'public.empleado_habilitado_area_v940r2(bigint,text)'
  ) is not null as funcion_area_activa,
  exists(
    select 1
    from pg_trigger
    where tgrelid='public.ordenes'::regclass
      and tgname='trg_pc_identidad_preparacion_v9397'
      and not tgisinternal
      and tgenabled<>'D'
  ) as trigger_identidad_activo,
  has_function_privilege(
    'authenticated',
    'public.tomar_orden_v9397(bigint,text,bigint,text,text)',
    'execute'
  ) as toma_autenticada_activa,
  '9.4.0 R2' as version;

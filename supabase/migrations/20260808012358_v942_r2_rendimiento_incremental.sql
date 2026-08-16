-- =========================================================
-- V9.4.2 R2 · RENDIMIENTO INCREMENTAL Y RLS EFICIENTE
-- Productos César CRM
-- =========================================================

begin;

-- ---------------------------------------------------------
-- 0. PRERREQUISITOS
-- ---------------------------------------------------------
do $$
begin
  if to_regclass('public.ordenes') is null
     or to_regclass('public.orden_detalle') is null
     or to_regclass('public.clientes') is null then
    raise exception 'Faltan tablas operativas requeridas por V9.4.2 R2.';
  end if;

  if to_regprocedure('public.es_admin_operativo()') is null
     or to_regprocedure('public.tiene_modulo(text,text)') is null
     or to_regprocedure('public.tiene_algun_modulo(text[],text)') is null then
    raise exception 'Faltan funciones de autorización requeridas por V9.4.2 R2.';
  end if;
end $$;

-- ---------------------------------------------------------
-- 1. ÍNDICES PARA LAS CONSULTAS QUE REALMENTE USA EL CRM
-- ---------------------------------------------------------
create index if not exists idx_orden_pesos_creado_v942
  on public.orden_pesos(creado_en desc);
create index if not exists idx_orden_entregas_creado_v942
  on public.orden_entregas(creado_en desc);
create index if not exists idx_orden_pagos_creado_v942
  on public.orden_pagos(creado_en desc);
create index if not exists idx_orden_historial_creado_v942
  on public.orden_estados_historial(creado_en desc);

-- ---------------------------------------------------------
-- 2. CARGA DE ÓRDENES EN UNA SOLA RPC
--    - permiso comprobado una sola vez;
--    - máximo 500 recientes + 2,000 pendientes;
--    - admite actualización incremental de hasta 100 IDs.
-- ---------------------------------------------------------
create or replace function public.cargar_ordenes_v942(
  p_modulo text,
  p_ids bigint[] default null,
  p_limite_recientes integer default 250
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_uid uuid:=auth.uid();
  v_modulo text:=lower(btrim(coalesce(p_modulo,'')));
  v_limite integer:=greatest(50,least(coalesce(p_limite_recientes,250),500));
  v_ids bigint[];
  v_result jsonb;
begin
  if v_uid is null then
    raise exception 'Sesión requerida.';
  end if;

  if v_modulo <> all(array[
    'inicio','control','clientes','ordenes','carniceria','facturacion',
    'validacion','delivery','liquidacion','alertas','kanban',
    'productividad','reportes','auditoria'
  ]::text[]) then
    raise exception 'Módulo no válido para la carga de órdenes.';
  end if;

  if not public.es_admin_operativo()
     and not public.tiene_algun_modulo(
       array['ordenes','control','carniceria','facturacion',
             'validacion','delivery','liquidacion'],
       'ver'
     ) then
    raise exception 'No tienes permiso para consultar este módulo.';
  end if;

  if p_ids is not null then
    select coalesce(array_agg(distinct x order by x),array[]::bigint[])
      into v_ids
    from unnest(p_ids) x
    where x is not null and x>0;

    if cardinality(v_ids)>100 then
      raise exception 'La actualización incremental admite hasta 100 órdenes.';
    end if;
  end if;

  with selected_ids as materialized (
    select x.id
    from unnest(coalesce(v_ids,array[]::bigint[])) x(id)
    where p_ids is not null

    union

    select pending.id
    from (
      select o.id
      from public.ordenes o
      where p_ids is null
        and coalesce(o.archivada,false)=false
        and o.estado=any(array[
          'Programada','Pendiente por existencia','Pedido recibido','En preparación',
          'Lista para facturar','Impresa para facturar','Facturada','Lista para retiro',
          'Validada para delivery','Asignada a delivery','En ruta','Entregado'
        ]::text[])
      order by o.id desc
      limit 2000
    ) pending

    union

    select recent.id
    from (
      select o.id
      from public.ordenes o
      where p_ids is null and coalesce(o.archivada,false)=false
      order by o.id desc
      limit v_limite
    ) recent
  ), rows_with_relations as (
    select
      o.*,
      case when c.id is null then null else jsonb_build_object(
        'id',c.id,'codigo',c.codigo,'negocio',c.negocio,'contacto',c.contacto,
        'telefono',c.telefono,'sector',c.sector,'direccion',c.direccion,
        'referencia',c.referencia,'tipo',c.tipo,'vendedor',c.vendedor,
        'estado',c.estado,'ultimo_pedido',c.ultimo_pedido,'credito',c.credito,
        'limite_credito',c.limite_credito
      ) end as cliente,
      coalesce((
        select jsonb_agg(to_jsonb(d) order by d.id)
        from public.orden_detalle d
        where d.orden_id=o.id
      ),'[]'::jsonb) as items
    from selected_ids s
    join public.ordenes o on o.id=s.id
    left join public.clientes c on c.id=o.cliente_id
    where coalesce(o.archivada,false)=false
  )
  select coalesce(jsonb_agg(to_jsonb(r) order by r.id desc),'[]'::jsonb)
    into v_result
  from rows_with_relations r;

  return coalesce(v_result,'[]'::jsonb);
end;
$$;

revoke all on function public.cargar_ordenes_v942(text,bigint[],integer)
  from public,anon,authenticated;
grant execute on function public.cargar_ordenes_v942(text,bigint[],integer)
  to authenticated;

-- ---------------------------------------------------------
-- 3. RLS: AUTORIZACIÓN COMO INITPLAN, NO UNA VEZ POR FILA
-- ---------------------------------------------------------
drop policy if exists v9397_ordenes_select_operativo on public.ordenes;
create policy v9397_ordenes_select_operativo
  on public.ordenes for select to authenticated
  using (
    (select public.es_admin_operativo())
    or (select public.tiene_algun_modulo(
      array['ordenes','control','carniceria','facturacion','validacion','delivery','liquidacion'],
      'ver'
    ))
  );

drop policy if exists v9397_orden_detalle_select_operativo on public.orden_detalle;
create policy v9397_orden_detalle_select_operativo
  on public.orden_detalle for select to authenticated
  using (
    (select public.es_admin_operativo())
    or (select public.tiene_algun_modulo(
      array['ordenes','control','carniceria','facturacion','validacion','delivery','liquidacion'],
      'ver'
    ))
  );

drop policy if exists v551_orden_pesos_select_operativo on public.orden_pesos;
create policy v551_orden_pesos_select_operativo
  on public.orden_pesos for select to authenticated
  using ((select public.tiene_algun_modulo(
    array['ordenes','carniceria','facturacion','validacion','liquidacion'],'ver'
  )));

drop policy if exists v551_orden_entregas_select_operativo on public.orden_entregas;
create policy v551_orden_entregas_select_operativo
  on public.orden_entregas for select to authenticated
  using ((select public.tiene_algun_modulo(
    array['validacion','delivery','liquidacion','ordenes'],'ver'
  )));

drop policy if exists v551_orden_pagos_select_operativo on public.orden_pagos;
create policy v551_orden_pagos_select_operativo
  on public.orden_pagos for select to authenticated
  using ((select public.tiene_algun_modulo(array['liquidacion','ordenes'],'ver')));

drop policy if exists v551_historial_select_operativo on public.orden_estados_historial;
create policy v551_historial_select_operativo
  on public.orden_estados_historial for select to authenticated
  using ((select public.tiene_algun_modulo(
    array['ordenes','control','carniceria','facturacion','validacion','delivery','liquidacion'],
    'ver'
  )));

drop policy if exists v551_clientes_select_operativo on public.clientes;
create policy v551_clientes_select_operativo
  on public.clientes for select to authenticated
  using ((select public.tiene_algun_modulo(
    array['clientes','control','ordenes','carniceria','facturacion','validacion','delivery','liquidacion'],
    'ver'
  )));

drop policy if exists v551_llamadas_select_operativo on public.llamadas;
create policy v551_llamadas_select_operativo
  on public.llamadas for select to authenticated
  using ((select public.tiene_algun_modulo(array['control','clientes','ordenes'],'ver')));

drop policy if exists v551_productos_select_operativo on public.productos_despacho;
create policy v551_productos_select_operativo
  on public.productos_despacho for select to authenticated
  using ((select public.tiene_algun_modulo(
    array['productos','control','ordenes','carniceria','facturacion','validacion'],'ver'
  )));

-- Catálogos de autorización: conservar el acceso actual, retirando políticas
-- SELECT duplicadas que multiplicaban el trabajo del planificador.
drop policy if exists perfiles_select_auth on public.perfiles;
drop policy if exists v551_perfiles_select on public.perfiles;
drop policy if exists perf_self_read on public.perfiles;
drop policy if exists v942_perfiles_select on public.perfiles;
create policy v942_perfiles_select
  on public.perfiles for select to authenticated using (true);

drop policy if exists usuario_modulos_read on public.usuario_modulos;
drop policy if exists usuario_modulos_select on public.usuario_modulos;
drop policy if exists v551_usuario_modulos_select on public.usuario_modulos;
drop policy if exists v942_usuario_modulos_select on public.usuario_modulos;
create policy v942_usuario_modulos_select
  on public.usuario_modulos for select to authenticated using (true);

drop policy if exists perm_read on public.roles_permisos;
drop policy if exists roles_permisos_select on public.roles_permisos;
drop policy if exists v551_roles_select on public.roles_permisos;
drop policy if exists v942_roles_permisos_select on public.roles_permisos;
create policy v942_roles_permisos_select
  on public.roles_permisos for select to authenticated using (true);

drop policy if exists modulos_sistema_read on public.modulos_sistema;
drop policy if exists modulos_sistema_select on public.modulos_sistema;
drop policy if exists v551_modulos_select on public.modulos_sistema;
drop policy if exists v942_modulos_select on public.modulos_sistema;
create policy v942_modulos_select
  on public.modulos_sistema for select to authenticated using (true);

notify pgrst,'reload schema';

commit;

-- ---------------------------------------------------------
-- 4. VERIFICACIÓN DE LA MIGRACIÓN
-- ---------------------------------------------------------
select
  to_regprocedure('public.cargar_ordenes_v942(text,bigint[],integer)') is not null
    as rpc_carga_disponible,
  has_function_privilege(
    'authenticated','public.cargar_ordenes_v942(text,bigint[],integer)','execute'
  ) as rpc_authenticated,
  not has_function_privilege(
    'anon','public.cargar_ordenes_v942(text,bigint[],integer)','execute'
  ) as rpc_cerrada_anon,
  (select count(*) from pg_policies
   where schemaname='public' and tablename='usuario_modulos' and cmd='SELECT')=1
    as usuario_modulos_sin_select_duplicado,
  (select count(*) from pg_policies
   where schemaname='public' and tablename='roles_permisos' and cmd='SELECT')=1
    as roles_permisos_sin_select_duplicado,
  '9.4.2-r2' as version;

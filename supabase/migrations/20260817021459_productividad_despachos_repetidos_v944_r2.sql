-- V9.4.4 R2 - Incentivos por cada despacho de cliente realizado.
--
-- Conserva clientes únicos como KPI analítico, pero nunca deduplica las unidades
-- del incentivo: dos pedidos finalizados del mismo cliente cuentan como dos
-- despachos. Reemplaza únicamente la RPC creada por R1 y no modifica datos.

create or replace function public.resumen_productividad_mensual_v944(
  p_mes date default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_rol text;
  v_mes date := date_trunc(
    'month',
    coalesce(p_mes, (now() at time zone 'America/Santo_Domingo')::date)::timestamp
  )::date;
  v_inicio timestamptz;
  v_fin timestamptz;
  v_cfg jsonb := '{}'::jsonb;
  v_result jsonb;
begin
  if v_uid is null then
    raise exception 'Sesión requerida.' using errcode = '42501';
  end if;

  select p.rol into v_rol
  from public.perfiles p
  where p.id = v_uid and coalesce(p.activo, true)
  limit 1;

  if not found then
    raise exception 'Perfil activo requerido.' using errcode = '42501';
  end if;

  if coalesce(v_rol, '') not in ('Gerente', 'Administrador', 'Supervisor')
     and not public.es_admin_operativo()
     and not public.tiene_modulo('productividad', 'ver') then
    raise exception 'No tienes acceso al módulo Productividad.' using errcode = '42501';
  end if;

  select coalesce(s.valor, '{}'::jsonb) into v_cfg
  from public.sistema_configuracion s
  where s.clave = 'incentivos'
  limit 1;

  v_cfg := coalesce(v_cfg, '{}'::jsonb);
  v_inicio := v_mes::timestamp at time zone 'America/Santo_Domingo';
  v_fin := (v_mes + interval '1 month')::timestamp at time zone 'America/Santo_Domingo';

  with employees as materialized (
    select
      e.id,
      e.nombre,
      e.area,
      e.areas_adicionales,
      e.activo,
      regexp_replace(
        translate(lower(trim(e.nombre)), 'áéíóúüñ', 'aeiouun'),
        '[[:space:]]+', ' ', 'g'
      ) as nombre_clave
    from public.empleados_operativos e
  ),
  preparadas as materialized (
    select
      o.id as orden_id,
      coalesce(e_id.id, e_name.id) as empleado_id,
      case
        when o.cliente_id is not null then 'cliente:' || o.cliente_id::text
        when nullif(regexp_replace(coalesce(o.cliente_telefono_orden, ''), '[^0-9]', '', 'g'), '') is not null
          then 'telefono:' || regexp_replace(o.cliente_telefono_orden, '[^0-9]', '', 'g')
        else 'orden:' || o.id::text
      end as cliente_clave,
      coalesce(nullif(o.total_factura, 0), o.total_estimado, 0)::numeric as monto_facturado,
      coalesce(o.peso_preparado, 0)::numeric as libras,
      (
        o.validado_en is not null
        or o.estado in (
          'Validada para delivery', 'Asignada a delivery', 'En ruta',
          'Entregado', 'Entregado a crédito', 'Cobrado', 'No entregado',
          'Devuelto parcial', 'Cerrado'
        )
      ) as validada,
      case
        when o.tomado_en is not null
          then extract(epoch from (o.preparado_en - o.tomado_en)) / 60
        else null
      end as duracion_minutos
    from public.ordenes o
    left join employees e_id on e_id.id = o.tomado_por_empleado_id
    left join lateral (
      select e.id
      from employees e
      where o.tomado_por_empleado_id is null
        and e.nombre_clave = regexp_replace(
          translate(lower(trim(coalesce(o.preparado_por, ''))), 'áéíóúüñ', 'aeiouun'),
          '[[:space:]]+', ' ', 'g'
        )
      order by e.activo desc, e.id
      limit 1
    ) e_name on true
    where o.preparado_en >= v_inicio
      and o.preparado_en < v_fin
      and o.estado not in ('Anulado', 'Cancelado')
  ),
  prep_role as (
    select
      p.empleado_id,
      'Despachador'::text as rol,
      count(distinct p.cliente_clave)::bigint as clientes_unicos,
      count(distinct p.cliente_clave) filter (where p.validada)::bigint as clientes_validos,
      count(*)::bigint as operaciones,
      count(*)::bigint as operaciones_validas,
      0::bigint as viajes,
      round(coalesce(sum(p.libras), 0), 2) as libras,
      round(coalesce(sum(p.monto_facturado), 0), 2) as facturado,
      0::numeric as cobrado,
      0::numeric as credito,
      count(*) filter (
        where p.duracion_minutos is not null
          and (p.duracion_minutos < 0 or p.duracion_minutos > 480)
      )::bigint as incidencias,
      coalesce(round(avg(p.duracion_minutos) filter (
        where p.duracion_minutos between 0 and 480
      ), 1), 0) as tiempo_promedio_minutos,
      jsonb_build_object(
        'ordenes_avanzadas', count(*) filter (where p.validada),
        'ordenes_solo_preparadas', count(*) filter (where not p.validada),
        'duraciones_atipicas', count(*) filter (
          where p.duracion_minutos is not null
            and (p.duracion_minutos < 0 or p.duracion_minutos > 480)
        )
      ) as detalle
    from preparadas p
    where p.empleado_id is not null
    group by p.empleado_id
  ),
  lots as materialized (
    select
      l.id,
      l.codigo_lote,
      coalesce(e_id.id, e_name.id) as empleado_id
    from public.entrega_lotes l
    left join employees e_id on e_id.id = l.responsable_empleado_id
    left join lateral (
      select e.id
      from employees e
      where l.responsable_empleado_id is null
        and e.nombre_clave = regexp_replace(
          translate(
            lower(trim(coalesce(nullif(l.responsable_nombre, ''), l.delivery_nombre, ''))),
            'áéíóúüñ', 'aeiouun'
          ),
          '[[:space:]]+', ' ', 'g'
        )
      order by e.activo desc, e.id
      limit 1
    ) e_name on true
    where coalesce(l.fecha_entrega, l.creado_en) >= v_inicio
      and coalesce(l.fecha_entrega, l.creado_en) < v_fin
      and coalesce(l.estado, '') <> 'Revertido'
  ),
  delivery_details as materialized (
    select
      l.id as lote_id,
      l.empleado_id,
      d.orden_id,
      case
        when d.cliente_id is not null then 'cliente:' || d.cliente_id::text
        when nullif(regexp_replace(coalesce(d.telefono, ''), '[^0-9]', '', 'g'), '') is not null
          then 'telefono:' || regexp_replace(d.telefono, '[^0-9]', '', 'g')
        else 'orden:' || coalesce(d.orden_id, d.id)::text
      end as cliente_clave,
      coalesce(d.resultado_entrega, d.estado_liquidacion, '') as resultado,
      coalesce(d.monto_factura, 0)::numeric as monto_factura,
      coalesce(d.monto_cobrado, 0)::numeric as monto_cobrado,
      coalesce(d.monto_credito, 0)::numeric as monto_credito,
      (
        coalesce(d.resultado_entrega, d.estado_liquidacion, '') in ('Cobrado', 'Entregado')
        or (
          coalesce((v_cfg #>> '{delivery,cuentaCredito}')::boolean, true)
          and coalesce(d.resultado_entrega, d.estado_liquidacion, '') = 'Entregado a crédito'
        )
        or (
          coalesce((v_cfg #>> '{delivery,cuentaDevueltoParcial}')::boolean, false)
          and coalesce(d.resultado_entrega, d.estado_liquidacion, '') = 'Devuelto parcial'
        )
      ) as valida
    from lots l
    join public.entrega_lote_detalle d
      on d.lote_id = l.id
      or (d.lote_id is null and d.codigo_lote = l.codigo_lote)
  ),
  delivery_role as (
    select
      d.empleado_id,
      'Delivery'::text as rol,
      count(distinct d.cliente_clave) filter (where d.valida)::bigint as clientes_unicos,
      count(distinct d.cliente_clave) filter (where d.valida)::bigint as clientes_validos,
      count(distinct d.orden_id)::bigint as operaciones,
      count(distinct d.orden_id) filter (where d.valida)::bigint as operaciones_validas,
      count(distinct d.lote_id)::bigint as viajes,
      0::numeric as libras,
      round(coalesce(sum(d.monto_factura) filter (where d.valida), 0), 2) as facturado,
      round(coalesce(sum(d.monto_cobrado) filter (where d.valida), 0), 2) as cobrado,
      round(coalesce(sum(d.monto_credito) filter (where d.valida), 0), 2) as credito,
      count(*) filter (where d.resultado = 'No entregado')::bigint as incidencias,
      0::numeric as tiempo_promedio_minutos,
      jsonb_build_object(
        'no_entregados', count(*) filter (where d.resultado = 'No entregado'),
        'creditos', count(*) filter (where d.resultado = 'Entregado a crédito')
      ) as detalle
    from delivery_details d
    where d.empleado_id is not null
    group by d.empleado_id
  ),
  payment_orders as materialized (
    select
      p.orden_id,
      sum(p.monto)::numeric as cobrado
    from public.orden_pagos p
    where p.creado_en >= v_inicio
      and p.creado_en < v_fin
      and coalesce(p.reversado, false) = false
    group by p.orden_id
  ),
  seller_paid_orders as materialized (
    select
      po.orden_id,
      e.id as empleado_id,
      case
        when o.cliente_id is not null then 'cliente:' || o.cliente_id::text
        when nullif(regexp_replace(coalesce(o.cliente_telefono_orden, ''), '[^0-9]', '', 'g'), '') is not null
          then 'telefono:' || regexp_replace(o.cliente_telefono_orden, '[^0-9]', '', 'g')
        else 'orden:' || o.id::text
      end as cliente_clave,
      coalesce(nullif(o.total_factura, 0), o.total_estimado, 0)::numeric as monto_facturado,
      po.cobrado
    from payment_orders po
    join public.ordenes o on o.id = po.orden_id
    left join lateral (
      select x.id
      from employees x
      where x.nombre_clave = regexp_replace(
        translate(lower(trim(coalesce(o.vendedor, ''))), 'áéíóúüñ', 'aeiouun'),
        '[[:space:]]+', ' ', 'g'
      )
      order by x.activo desc, x.id
      limit 1
    ) e on true
    where o.estado not in ('Anulado', 'Cancelado')
  ),
  seller_invoiced_orders as materialized (
    select
      o.id as orden_id,
      e.id as empleado_id,
      case
        when o.cliente_id is not null then 'cliente:' || o.cliente_id::text
        when nullif(regexp_replace(coalesce(o.cliente_telefono_orden, ''), '[^0-9]', '', 'g'), '') is not null
          then 'telefono:' || regexp_replace(o.cliente_telefono_orden, '[^0-9]', '', 'g')
        else 'orden:' || o.id::text
      end as cliente_clave,
      coalesce(nullif(o.total_factura, 0), o.total_estimado, 0)::numeric as monto_facturado
    from public.ordenes o
    left join lateral (
      select x.id
      from employees x
      where x.nombre_clave = regexp_replace(
        translate(lower(trim(coalesce(o.vendedor, ''))), 'áéíóúüñ', 'aeiouun'),
        '[[:space:]]+', ' ', 'g'
      )
      order by x.activo desc, x.id
      limit 1
    ) e on true
    where o.facturado_en >= v_inicio
      and o.facturado_en < v_fin
      and o.estado not in ('Anulado', 'Cancelado')
  ),
  seller_activity as materialized (
    select
      s.orden_id,
      s.empleado_id,
      s.cliente_clave,
      s.monto_facturado,
      0::numeric as cobrado
    from seller_invoiced_orders s
    union all
    select
      s.orden_id,
      s.empleado_id,
      s.cliente_clave,
      0::numeric as monto_facturado,
      s.cobrado
    from seller_paid_orders s
  ),
  seller_role as (
    select
      s.empleado_id,
      'Vendedor'::text as rol,
      count(distinct s.cliente_clave)::bigint as clientes_unicos,
      count(distinct s.cliente_clave)::bigint as clientes_validos,
      count(distinct s.orden_id)::bigint as operaciones,
      count(distinct s.orden_id)::bigint as operaciones_validas,
      0::bigint as viajes,
      0::numeric as libras,
      round(coalesce(sum(s.monto_facturado), 0), 2) as facturado,
      round(coalesce(sum(s.cobrado), 0), 2) as cobrado,
      0::numeric as credito,
      0::bigint as incidencias,
      0::numeric as tiempo_promedio_minutos,
      jsonb_build_object('ordenes_con_pago', count(*)) as detalle
    from seller_activity s
    where s.empleado_id is not null
    group by s.empleado_id
  ),
  invoiced as materialized (
    select
      o.id as orden_id,
      e.id as empleado_id,
      case
        when o.cliente_id is not null then 'cliente:' || o.cliente_id::text
        when nullif(regexp_replace(coalesce(o.cliente_telefono_orden, ''), '[^0-9]', '', 'g'), '') is not null
          then 'telefono:' || regexp_replace(o.cliente_telefono_orden, '[^0-9]', '', 'g')
        else 'orden:' || o.id::text
      end as cliente_clave,
      coalesce(nullif(o.total_factura, 0), o.total_estimado, 0)::numeric as monto_facturado
    from public.ordenes o
    left join lateral (
      select x.id
      from employees x
      where x.nombre_clave = regexp_replace(
        translate(lower(trim(coalesce(o.facturado_por, ''))), 'áéíóúüñ', 'aeiouun'),
        '[[:space:]]+', ' ', 'g'
      )
      order by x.activo desc, x.id
      limit 1
    ) e on true
    where o.facturado_en >= v_inicio
      and o.facturado_en < v_fin
      and o.estado not in ('Anulado', 'Cancelado')
  ),
  invoice_role as (
    select
      i.empleado_id,
      'Facturación'::text as rol,
      count(distinct i.cliente_clave)::bigint as clientes_unicos,
      count(distinct i.cliente_clave)::bigint as clientes_validos,
      count(*)::bigint as operaciones,
      count(*)::bigint as operaciones_validas,
      0::bigint as viajes,
      0::numeric as libras,
      round(coalesce(sum(i.monto_facturado), 0), 2) as facturado,
      0::numeric as cobrado,
      0::numeric as credito,
      0::bigint as incidencias,
      0::numeric as tiempo_promedio_minutos,
      '{}'::jsonb as detalle
    from invoiced i
    where i.empleado_id is not null
    group by i.empleado_id
  ),
  validated as materialized (
    select
      o.id as orden_id,
      e.id as empleado_id,
      case
        when o.cliente_id is not null then 'cliente:' || o.cliente_id::text
        when nullif(regexp_replace(coalesce(o.cliente_telefono_orden, ''), '[^0-9]', '', 'g'), '') is not null
          then 'telefono:' || regexp_replace(o.cliente_telefono_orden, '[^0-9]', '', 'g')
        else 'orden:' || o.id::text
      end as cliente_clave,
      case
        when o.preparado_en is not null
          then extract(epoch from (o.validado_en - o.preparado_en)) / 60
        else null
      end as duracion_minutos
    from public.ordenes o
    left join lateral (
      select x.id
      from employees x
      where x.nombre_clave = regexp_replace(
        translate(lower(trim(coalesce(o.validado_por, ''))), 'áéíóúüñ', 'aeiouun'),
        '[[:space:]]+', ' ', 'g'
      )
      order by x.activo desc, x.id
      limit 1
    ) e on true
    where o.validado_en >= v_inicio
      and o.validado_en < v_fin
      and o.estado not in ('Anulado', 'Cancelado')
  ),
  validation_role as (
    select
      v.empleado_id,
      'Validación'::text as rol,
      count(distinct v.cliente_clave)::bigint as clientes_unicos,
      count(distinct v.cliente_clave)::bigint as clientes_validos,
      count(*)::bigint as operaciones,
      count(*)::bigint as operaciones_validas,
      0::bigint as viajes,
      0::numeric as libras,
      0::numeric as facturado,
      0::numeric as cobrado,
      0::numeric as credito,
      count(*) filter (
        where v.duracion_minutos is not null
          and (v.duracion_minutos < 0 or v.duracion_minutos > 480)
      )::bigint as incidencias,
      coalesce(round(avg(v.duracion_minutos) filter (
        where v.duracion_minutos between 0 and 480
      ), 1), 0) as tiempo_promedio_minutos,
      '{}'::jsonb as detalle
    from validated v
    where v.empleado_id is not null
    group by v.empleado_id
  ),
  liquidated_lots as materialized (
    select
      l.id,
      e.id as empleado_id,
      coalesce(l.total_facturado, 0)::numeric as facturado,
      coalesce(l.efectivo_recibido, 0)::numeric as cobrado,
      coalesce(l.credito_pendiente, 0)::numeric as credito,
      coalesce(l.diferencia, 0)::numeric as diferencia
    from public.liquidaciones_lotes l
    left join lateral (
      select x.id
      from employees x
      where x.nombre_clave = regexp_replace(
        translate(lower(trim(coalesce(l.recibido_por, ''))), 'áéíóúüñ', 'aeiouun'),
        '[[:space:]]+', ' ', 'g'
      )
      order by x.activo desc, x.id
      limit 1
    ) e on true
    where l.fecha_liquidacion >= v_inicio
      and l.fecha_liquidacion < v_fin
      and coalesce(l.estado, '') <> 'Revertido'
  ),
  liquidation_lot_role as (
    select
      l.empleado_id,
      count(*)::bigint as viajes,
      round(coalesce(sum(l.facturado), 0), 2) as facturado,
      round(coalesce(sum(l.cobrado), 0), 2) as cobrado,
      round(coalesce(sum(l.credito), 0), 2) as credito,
      count(*) filter (where abs(l.diferencia) > 0.01)::bigint as incidencias
    from liquidated_lots l
    where l.empleado_id is not null
    group by l.empleado_id
  ),
  liquidation_client_role as (
    select
      l.empleado_id,
      count(distinct case
        when d.cliente_id is not null then 'cliente:' || d.cliente_id::text
        else 'orden:' || coalesce(d.orden_id, d.id)::text
      end)::bigint as clientes_unicos,
      count(distinct d.orden_id)::bigint as operaciones
    from liquidated_lots l
    join public.liquidacion_lote_detalle d on d.liquidacion_id = l.id
    where l.empleado_id is not null
    group by l.empleado_id
  ),
  liquidation_role as (
    select
      l.empleado_id,
      'Liquidación'::text as rol,
      coalesce(d.clientes_unicos, 0)::bigint as clientes_unicos,
      coalesce(d.clientes_unicos, 0)::bigint as clientes_validos,
      coalesce(d.operaciones, 0)::bigint as operaciones,
      coalesce(d.operaciones, 0)::bigint as operaciones_validas,
      l.viajes,
      0::numeric as libras,
      l.facturado,
      l.cobrado,
      l.credito,
      l.incidencias,
      0::numeric as tiempo_promedio_minutos,
      jsonb_build_object(
        'lotes_con_diferencia', l.incidencias
      ) as detalle
    from liquidation_lot_role l
    left join liquidation_client_role d using (empleado_id)
  ),
  calls as materialized (
    select
      c.id,
      e.id as empleado_id,
      'cliente:' || c.cliente_id::text as cliente_clave,
      c.contactado,
      c.resultado
    from public.llamadas c
    left join lateral (
      select x.id
      from employees x
      where x.nombre_clave = regexp_replace(
        translate(lower(trim(coalesce(c.vendedor, ''))), 'áéíóúüñ', 'aeiouun'),
        '[[:space:]]+', ' ', 'g'
      )
      order by x.activo desc, x.id
      limit 1
    ) e on true
    where c.fecha >= v_mes
      and c.fecha < (v_mes + interval '1 month')::date
  ),
  control_role as (
    select
      c.empleado_id,
      'Control'::text as rol,
      count(distinct c.cliente_clave)::bigint as clientes_unicos,
      count(distinct c.cliente_clave) filter (where c.contactado)::bigint as clientes_validos,
      count(*)::bigint as operaciones,
      count(*) filter (where c.contactado)::bigint as operaciones_validas,
      0::bigint as viajes,
      0::numeric as libras,
      0::numeric as facturado,
      0::numeric as cobrado,
      0::numeric as credito,
      count(*) filter (where not c.contactado)::bigint as incidencias,
      0::numeric as tiempo_promedio_minutos,
      jsonb_build_object(
        'contactadas', count(*) filter (where c.contactado),
        'no_contactadas', count(*) filter (where not c.contactado)
      ) as detalle
    from calls c
    where c.empleado_id is not null
    group by c.empleado_id
  ),
  role_rows as materialized (
    select * from prep_role
    union all select * from delivery_role
    union all select * from seller_role
    union all select * from invoice_role
    union all select * from validation_role
    union all select * from liquidation_role
    union all select * from control_role
  ),
  configured_rows as materialized (
    select
      r.*,
      e.nombre as empleado_nombre,
      e.area,
      e.areas_adicionales,
      e.activo as empleado_activo,
      case r.rol
        when 'Delivery' then coalesce(v_cfg #>> '{delivery,base}', 'cliente_entregado')
        when 'Despachador' then coalesce(v_cfg #>> '{despachador,base}', 'cliente_despachado')
        when 'Vendedor' then coalesce(v_cfg #>> '{vendedor,base}', 'ventas_cobradas')
        else ''
      end as base_clave,
      case r.rol
        when 'Delivery' then coalesce((v_cfg #>> '{delivery,valor}')::numeric, 3)
        when 'Despachador' then coalesce((v_cfg #>> '{despachador,valor}')::numeric, 3)
        when 'Vendedor' then coalesce((v_cfg #>> '{vendedor,valor}')::numeric, 1)
        else 0
      end as valor_base,
      case r.rol
        when 'Delivery' then coalesce(v_cfg #>> '{delivery,tipo}', 'monto_fijo')
        when 'Despachador' then coalesce(v_cfg #>> '{despachador,tipo}', 'monto_fijo')
        when 'Vendedor' then coalesce(v_cfg #>> '{vendedor,tipo}', 'porcentaje')
        else 'sin_incentivo'
      end as tipo_incentivo,
      case r.rol
        when 'Delivery' then coalesce((v_cfg #>> '{delivery,activo}')::boolean, true)
        when 'Despachador' then coalesce((v_cfg #>> '{despachador,activo}')::boolean, true)
        when 'Vendedor' then coalesce((v_cfg #>> '{vendedor,activo}')::boolean, true)
        else false
      end as incentivo_activo,
      case
        when r.rol = 'Delivery' and coalesce(v_cfg #>> '{delivery,base}', 'cliente_entregado') = 'lote_viaje'
          then r.viajes::numeric
        when r.rol = 'Delivery' and coalesce(v_cfg #>> '{delivery,base}', 'cliente_entregado') = 'orden'
          then r.operaciones_validas::numeric
        when r.rol = 'Delivery' then r.operaciones_validas::numeric
        when r.rol = 'Despachador' then r.operaciones_validas::numeric
        when r.rol = 'Vendedor' then r.operaciones::numeric
        else 0::numeric
      end as medida_incentivo,
      case
        when r.rol = 'Vendedor' and coalesce(v_cfg #>> '{vendedor,base}', 'ventas_cobradas') = 'ventas_facturadas'
          then r.facturado
        when r.rol = 'Vendedor' then r.cobrado
        when r.rol = 'Delivery' then r.cobrado
        when r.rol = 'Despachador' then r.facturado
        else 0::numeric
      end as monto_base_incentivo
    from role_rows r
    join employees e on e.id = r.empleado_id
  ),
  final_rows as materialized (
    select
      c.*,
      round(
        case
          when not c.incentivo_activo then 0
          when c.tipo_incentivo = 'porcentaje'
            then c.monto_base_incentivo * c.valor_base / 100
          else c.medida_incentivo * c.valor_base
        end,
        2
      ) as incentivo
    from configured_rows c
  ),
  all_clients as (
    select cliente_clave from preparadas
    union select cliente_clave from delivery_details where valida
    union select cliente_clave from seller_paid_orders
    union select cliente_clave from seller_invoiced_orders
    union select cliente_clave from invoiced
    union select cliente_clave from validated
    union select case
      when d.cliente_id is not null then 'cliente:' || d.cliente_id::text
      else 'orden:' || coalesce(d.orden_id, d.id)::text
    end
    from liquidated_lots l
    join public.liquidacion_lote_detalle d on d.liquidacion_id = l.id
    union select cliente_clave from calls
  ),
  quality as (
    select jsonb_build_object(
      'preparaciones_sin_empleado', (select count(*) from preparadas where empleado_id is null),
      'viajes_sin_empleado', (select count(*) from lots where empleado_id is null),
      'ventas_cobradas_sin_empleado', (select count(*) from seller_paid_orders where empleado_id is null),
      'ventas_facturadas_sin_empleado', (select count(*) from seller_invoiced_orders where empleado_id is null),
      'facturas_sin_empleado', (select count(*) from invoiced where empleado_id is null),
      'validaciones_sin_empleado', (select count(*) from validated where empleado_id is null),
      'liquidaciones_sin_empleado', (select count(*) from liquidated_lots where empleado_id is null),
      'llamadas_sin_empleado', (select count(*) from calls where empleado_id is null),
      'empleados_con_nombre_duplicado', (
        select count(*)
        from (
          select nombre_clave
          from employees
          where nombre_clave <> ''
          group by nombre_clave
          having count(*) > 1
        ) duplicated_names
      ),
      'pagos_reversados', (
        select count(*) from public.orden_pagos p
        where p.creado_en >= v_inicio and p.creado_en < v_fin and coalesce(p.reversado, false)
      )
    ) as value
  ),
  employee_without_activity as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'empleado_id', e.id,
      'empleado_nombre', e.nombre,
      'area', e.area
    ) order by e.nombre), '[]'::jsonb) as value
    from employees e
    where e.activo
      and not exists (select 1 from final_rows r where r.empleado_id = e.id)
  )
  select jsonb_build_object(
    'version', 'V9.4.4 R2',
    'mes_inicio', v_mes,
    'mes_fin', (v_mes + interval '1 month - 1 day')::date,
    'zona_horaria', 'America/Santo_Domingo',
    'generado_en', now(),
    'resumen', jsonb_build_object(
      'clientes_unicos_equipo', (select count(*) from all_clients),
      'empleados_con_actividad', (select count(distinct empleado_id) from final_rows),
      'roles_con_actividad', (select count(*) from final_rows),
      'operaciones_productivas', (select coalesce(sum(operaciones), 0) from final_rows),
      'viajes', (select count(*) from lots),
      'cobrado_mes', (
        select round(coalesce(sum(p.monto), 0), 2)
        from public.orden_pagos p
        where p.creado_en >= v_inicio
          and p.creado_en < v_fin
          and coalesce(p.reversado, false) = false
      ),
      'incentivo_estimado', (select round(coalesce(sum(incentivo), 0), 2) from final_rows)
    ),
    'filas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'empleado_id', r.empleado_id,
        'empleado_nombre', r.empleado_nombre,
        'empleado_activo', r.empleado_activo,
        'area', r.area,
        'areas_adicionales', r.areas_adicionales,
        'rol', r.rol,
        'clientes_unicos', r.clientes_unicos,
        'clientes_validos', r.clientes_validos,
        'operaciones', r.operaciones,
        'operaciones_validas', r.operaciones_validas,
        'viajes', r.viajes,
        'libras', r.libras,
        'facturado', r.facturado,
        'cobrado', r.cobrado,
        'credito', r.credito,
        'tiempo_promedio_minutos', r.tiempo_promedio_minutos,
        'incidencias', r.incidencias,
        'detalle', r.detalle,
        'base_clave', r.base_clave,
        'valor_base', r.valor_base,
        'tipo_incentivo', r.tipo_incentivo,
        'medida_incentivo', r.medida_incentivo,
        'monto_base_incentivo', r.monto_base_incentivo,
        'incentivo', r.incentivo
      ) order by r.incentivo desc, r.empleado_nombre, r.rol)
      from final_rows r
    ), '[]'::jsonb),
    'calidad', (select value from quality),
    'empleados_sin_actividad', (select value from employee_without_activity)
  ) into v_result;

  return v_result;
end;
$$;

comment on function public.resumen_productividad_mensual_v944(date) is
  'Productividad mensual integral V9.4.4 R2. Mantiene clientes únicos como KPI y calcula el incentivo por cada despacho de cliente finalizado, incluso si el cliente repite pedidos.';

revoke all on function public.resumen_productividad_mensual_v944(date) from public;
revoke all on function public.resumen_productividad_mensual_v944(date) from anon;
revoke all on function public.resumen_productividad_mensual_v944(date) from authenticated;
grant execute on function public.resumen_productividad_mensual_v944(date) to authenticated;

notify pgrst, 'reload schema';

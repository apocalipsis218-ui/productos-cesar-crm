-- =========================================================
-- V9.4.5 R2 · DESGLOSE DE EFECTIVO INDIVIDUAL Y POR LOTE
-- Extiende el conteo físico V9.4.5 R1 sin reescribirlo.
-- Cada recepción individual conserva su propio snapshot y,
-- al cerrar el último cliente, se vincula a la liquidación.
-- =========================================================
begin;

alter table public.liquidacion_efectivo_conteos_v945
  add column if not exists orden_id bigint references public.ordenes(id) on delete set null,
  add column if not exists tipo_recepcion text not null default 'lote',
  add column if not exists metodo text,
  add column if not exists monto_recibido_total numeric(14,2);

alter table public.liquidacion_efectivo_conteos_v945
  drop constraint if exists liquidacion_efectivo_conteos_v945_liquidacion_uq;

do $$
begin
  if not exists(
    select 1 from pg_constraint
    where conname='liquidacion_efectivo_conteos_v945_tipo_ck'
      and conrelid='public.liquidacion_efectivo_conteos_v945'::regclass
  ) then
    alter table public.liquidacion_efectivo_conteos_v945
      add constraint liquidacion_efectivo_conteos_v945_tipo_ck
      check(tipo_recepcion in('lote','individual'));
  end if;
end $$;

create unique index if not exists uq_liquidacion_efectivo_v945_lote
  on public.liquidacion_efectivo_conteos_v945(liquidacion_id)
  where tipo_recepcion='lote' and liquidacion_id is not null;

create unique index if not exists uq_liquidacion_efectivo_v945_orden
  on public.liquidacion_efectivo_conteos_v945(orden_id)
  where tipo_recepcion='individual' and orden_id is not null;

create index if not exists idx_liquidacion_efectivo_v945_orden
  on public.liquidacion_efectivo_conteos_v945(orden_id,creado_en desc)
  where orden_id is not null;

create index if not exists idx_liquidacion_efectivo_v945_creado_por
  on public.liquidacion_efectivo_conteos_v945(creado_por)
  where creado_por is not null;

create or replace function public.recibir_orden_cxc_v945(
  p_orden_id bigint,
  p_resultado text,
  p_monto_recibido numeric,
  p_metodo text,
  p_efectivo_fisico numeric,
  p_desglose jsonb,
  p_ajuste_fraccion numeric,
  p_recibido_por text,
  p_observacion text default null,
  p_lineas jsonb default null
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_uid uuid:=auth.uid();
  v_lote public.entrega_lotes%rowtype;
  v_result jsonb;
  v_liquidacion_id bigint;
  v_metodo text:=coalesce(nullif(btrim(p_metodo),''),'Efectivo');
  v_recibido numeric(14,2):=round(coalesce(p_monto_recibido,0),2);
  v_esperado numeric(14,2):=round(coalesce(p_efectivo_fisico,0),2);
  v_contado numeric(14,2);
  v_ajuste numeric(14,2):=round(coalesce(p_ajuste_fraccion,0),2);
  v_ajuste_esperado numeric(14,2);
  v_conciliado numeric(14,2);
  v_diferencia numeric(14,2);
  v_desglose_normalizado jsonb;
begin
  if v_uid is null then raise exception 'Sesión no válida.'; end if;
  if not public.puede_modulo_v930r5('liquidacion','editar') then
    raise exception 'No tienes permiso para recibir liquidaciones.';
  end if;
  if p_orden_id is null then raise exception 'La orden es obligatoria.'; end if;
  if v_recibido<0 or v_esperado<0 then
    raise exception 'Los montos recibidos no pueden ser negativos.';
  end if;
  if v_metodo not in('Efectivo','Transferencia','Mixto','Crédito','No aplica') then
    raise exception 'Método de recepción inválido.';
  end if;
  if v_metodo='Efectivo' and abs(v_esperado-v_recibido)>0.009 then
    raise exception 'En efectivo, el conteo físico debe cubrir todo el monto recibido.';
  elsif v_metodo='Mixto' and v_esperado>v_recibido+0.009 then
    raise exception 'En pago mixto, el efectivo físico no puede superar el monto recibido.';
  elsif v_metodo not in('Efectivo','Mixto') and abs(v_esperado)>0.009 then
    raise exception 'El método seleccionado no admite efectivo físico.';
  end if;
  if coalesce(jsonb_typeof(p_desglose),'')<>'array' or jsonb_array_length(p_desglose)<>10 then
    raise exception 'El desglose debe incluir exactamente las diez denominaciones de caja.';
  end if;
  if exists(
    select 1 from jsonb_array_elements(p_desglose) j
    where case when coalesce(j->>'denominacion','')~'^[0-9]+$'
      then (j->>'denominacion')::integer else null end is null
      or case when coalesce(j->>'denominacion','')~'^[0-9]+$'
        then (j->>'denominacion')::integer else null end
        not in(2000,1000,500,200,100,50,25,10,5,1)
      or case when coalesce(j->>'cantidad','')~'^[0-9]+$'
        then (j->>'cantidad')::integer else null end is null
  ) then
    raise exception 'El desglose contiene denominaciones o cantidades inválidas.';
  end if;
  if (select count(distinct (j->>'denominacion')::integer) from jsonb_array_elements(p_desglose) j)<>10 then
    raise exception 'El desglose contiene una denominación repetida o ausente.';
  end if;
  if abs(v_ajuste)>=1 then
    raise exception 'El ajuste de fracción debe ser menor de RD$1.';
  end if;

  select l.* into v_lote
  from public.entrega_lote_detalle d
  join public.entrega_lotes l on l.id=d.lote_id
  where d.orden_id=p_orden_id and lower(coalesce(l.estado,''))<>'revertido'
  order by d.id desc limit 1
  for update of l;
  if not found then raise exception 'La orden no tiene un lote activo.'; end if;

  select
    coalesce(sum(x.denominacion*x.cantidad),0)::numeric(14,2),
    jsonb_agg(jsonb_build_object(
      'denominacion',x.denominacion,
      'cantidad',x.cantidad,
      'subtotal',x.denominacion*x.cantidad
    ) order by x.denominacion desc)
  into v_contado,v_desglose_normalizado
  from (
    select (j->>'denominacion')::integer denominacion,
           (j->>'cantidad')::integer cantidad
    from jsonb_array_elements(p_desglose) j
  ) x;

  v_ajuste_esperado:=round(v_esperado-round(v_esperado,0),2);
  if v_contado<>round(v_esperado,0) then
    raise exception 'El efectivo físico no cuadra. Esperado: %, efectivo entero requerido: %, contado: %.',
      v_esperado,round(v_esperado,0),v_contado;
  end if;
  if abs(v_ajuste-v_ajuste_esperado)>0.009 then
    raise exception 'El ajuste de fracción no corresponde al redondeo requerido. Esperado: %, recibido: %.',
      v_ajuste_esperado,v_ajuste;
  end if;
  v_conciliado:=round(v_contado+v_ajuste,2);
  v_diferencia:=round(v_conciliado-v_esperado,2);
  if abs(v_diferencia)>0.009 then
    raise exception 'El efectivo físico no cuadra. Esperado: %, contado: %, ajuste: %, diferencia: %.',
      v_esperado,v_contado,v_ajuste,v_diferencia;
  end if;

  if p_resultado='Devuelto parcial' then
    if coalesce(jsonb_typeof(p_lineas),'')<>'array' or jsonb_array_length(p_lineas)=0 then
      raise exception 'La devolución parcial debe incluir el detalle de artículos.';
    end if;
    v_result:=public.registrar_devolucion_parcial_v9392(
      p_orden_id,p_lineas,v_recibido,v_metodo,p_recibido_por,p_observacion
    );
  else
    v_result:=public.recibir_orden_cxc_v9393(
      p_orden_id,p_resultado,v_recibido,v_metodo,p_recibido_por,p_observacion
    );
  end if;

  v_liquidacion_id:=nullif(v_result->>'liquidacion_id','')::bigint;

  insert into public.liquidacion_efectivo_conteos_v945(
    liquidacion_id,lote_id,orden_id,tipo_recepcion,codigo_lote,metodo,
    monto_recibido_total,efectivo_esperado,efectivo_contado,
    ajuste_fraccion,diferencia,desglose,motivo_ajuste,recibido_por,creado_por
  ) values (
    v_liquidacion_id,v_lote.id,p_orden_id,'individual',v_lote.codigo_lote,v_metodo,
    v_recibido,v_esperado,v_contado,v_ajuste,v_diferencia,v_desglose_normalizado,
    case when abs(v_ajuste)>0.009 then 'Ajuste automático por fracción menor de RD$1 no representable con las denominaciones configuradas.' end,
    nullif(btrim(p_recibido_por),''),v_uid
  )
  on conflict(orden_id) where tipo_recepcion='individual' and orden_id is not null
  do update set
    liquidacion_id=excluded.liquidacion_id,
    lote_id=excluded.lote_id,
    codigo_lote=excluded.codigo_lote,
    metodo=excluded.metodo,
    monto_recibido_total=excluded.monto_recibido_total,
    efectivo_esperado=excluded.efectivo_esperado,
    efectivo_contado=excluded.efectivo_contado,
    ajuste_fraccion=excluded.ajuste_fraccion,
    diferencia=excluded.diferencia,
    desglose=excluded.desglose,
    motivo_ajuste=excluded.motivo_ajuste,
    recibido_por=excluded.recibido_por,
    creado_por=excluded.creado_por,
    creado_en=now();

  if v_liquidacion_id is not null then
    update public.liquidacion_efectivo_conteos_v945
    set liquidacion_id=v_liquidacion_id
    where lote_id=v_lote.id and tipo_recepcion='individual' and liquidacion_id is null;
  end if;

  insert into public.liquidacion_lote_eventos(
    lote_id,codigo_lote,liquidacion_id,accion,motivo,
    usuario_id,usuario_nombre,metadata
  ) values (
    v_lote.id,v_lote.codigo_lote,v_liquidacion_id,'efectivo_desglosado_individual',
    case when abs(v_ajuste)>0.009 then 'Conciliación individual con ajuste de fracción.' else 'Conteo físico individual exacto.' end,
    v_uid,nullif(btrim(p_recibido_por),''),
    jsonb_build_object('version','9.4.5-r2','orden_id',p_orden_id,
      'metodo',v_metodo,'monto_recibido_total',v_recibido,
      'efectivo_esperado',v_esperado,'efectivo_contado',v_contado,
      'ajuste_fraccion',v_ajuste,'efectivo_conciliado',v_conciliado,
      'diferencia',v_diferencia,'desglose',v_desglose_normalizado)
  );

  return v_result||jsonb_build_object(
    'version_desglose','9.4.5-r2','tipo_recepcion','individual',
    'efectivo_esperado',v_esperado,'efectivo_contado',v_contado,
    'ajuste_fraccion',v_ajuste,'efectivo_conciliado',v_conciliado,
    'diferencia',v_diferencia,'desglose',v_desglose_normalizado
  );
end;
$$;

revoke execute on function public.recibir_orden_cxc_v945(bigint,text,numeric,text,numeric,jsonb,numeric,text,text,jsonb)
  from public,anon;
grant execute on function public.recibir_orden_cxc_v945(bigint,text,numeric,text,numeric,jsonb,numeric,text,text,jsonb)
  to authenticated;

notify pgrst,'reload schema';
commit;

select
  to_regprocedure('public.recibir_orden_cxc_v945(bigint,text,numeric,text,numeric,jsonb,numeric,text,text,jsonb)') is not null as rpc_individual,
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='liquidacion_efectivo_conteos_v945' and column_name='orden_id') as columna_orden;

-- =========================================================
-- V9.4.5.2 · SOBRANTES VISIBLES Y AUTORIZACIÓN RESTRINGIDA
-- - Solo Gerencia o Administración autoriza sobrantes.
-- - El cierre individual consolida su diferencia en el lote.
-- - No elimina ni reescribe movimientos operativos.
-- =========================================================
begin;

create or replace function public.validar_autorizacion_sobrante_v9452()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_uid uuid:=auth.uid();
  v_rol text;
  v_autorizacion_nueva boolean:=false;
begin
  if coalesce(new.sobrante_autorizado,false) is not true then
    return new;
  end if;

  if tg_op='INSERT' then
    v_autorizacion_nueva:=true;
  else
    v_autorizacion_nueva:=coalesce(old.sobrante_autorizado,false) is not true
      or old.sobrante_monto is distinct from new.sobrante_monto
      or old.sobrante_autorizado_por is distinct from new.sobrante_autorizado_por;
  end if;

  -- Una actualización posterior que solo vincula el conteo con la
  -- liquidación conserva la autorización histórica sin reasignarla.
  if not v_autorizacion_nueva then
    return new;
  end if;

  if v_uid is null then
    raise exception 'Sesión no válida para autorizar un sobrante de efectivo.';
  end if;

  select p.rol into v_rol
  from public.perfiles p
  where p.id=v_uid and coalesce(p.activo,true)
  limit 1;

  if coalesce(lower(v_rol),'') not in('gerente','administrador') then
    raise exception 'Solo Gerencia o Administración puede autorizar un sobrante de efectivo.';
  end if;

  new.sobrante_autorizado_por:=v_uid;
  new.sobrante_autorizado_en:=now();
  return new;
end;
$$;

drop trigger if exists trg_validar_autorizacion_sobrante_v9452
  on public.liquidacion_efectivo_conteos_v945;
create trigger trg_validar_autorizacion_sobrante_v9452
before insert or update of sobrante_autorizado,sobrante_monto,sobrante_autorizado_por
on public.liquidacion_efectivo_conteos_v945
for each row execute function public.validar_autorizacion_sobrante_v9452();

create or replace function public.sincronizar_diferencia_individual_v9452()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if new.tipo_recepcion='individual' and new.liquidacion_id is not null then
    update public.liquidaciones_lotes l
    set diferencia=coalesce((
      select round(sum(c.diferencia),2)
      from public.liquidacion_efectivo_conteos_v945 c
      where c.liquidacion_id=new.liquidacion_id
        and c.tipo_recepcion='individual'
    ),0)
    where l.id=new.liquidacion_id
      and not exists(
        select 1
        from public.liquidacion_efectivo_conteos_v945 lote_count
        where lote_count.liquidacion_id=new.liquidacion_id
          and lote_count.tipo_recepcion='lote'
      );
  end if;

  if tg_op='UPDATE'
    and old.tipo_recepcion='individual'
    and old.liquidacion_id is not null
    and old.liquidacion_id is distinct from new.liquidacion_id then
    update public.liquidaciones_lotes l
    set diferencia=coalesce((
      select round(sum(c.diferencia),2)
      from public.liquidacion_efectivo_conteos_v945 c
      where c.liquidacion_id=old.liquidacion_id
        and c.tipo_recepcion='individual'
    ),0)
    where l.id=old.liquidacion_id
      and not exists(
        select 1
        from public.liquidacion_efectivo_conteos_v945 lote_count
        where lote_count.liquidacion_id=old.liquidacion_id
          and lote_count.tipo_recepcion='lote'
      );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sincronizar_diferencia_individual_v9452
  on public.liquidacion_efectivo_conteos_v945;
create trigger trg_sincronizar_diferencia_individual_v9452
after insert or update of liquidacion_id,diferencia,tipo_recepcion
on public.liquidacion_efectivo_conteos_v945
for each row execute function public.sincronizar_diferencia_individual_v9452();

-- Corrige únicamente el resumen de cierres individuales ya vinculados.
with diferencias as (
  select c.liquidacion_id,round(sum(c.diferencia),2) diferencia
  from public.liquidacion_efectivo_conteos_v945 c
  where c.tipo_recepcion='individual'
    and c.liquidacion_id is not null
    and not exists(
      select 1
      from public.liquidacion_efectivo_conteos_v945 lote_count
      where lote_count.liquidacion_id=c.liquidacion_id
        and lote_count.tipo_recepcion='lote'
    )
  group by c.liquidacion_id
)
update public.liquidaciones_lotes l
set diferencia=d.diferencia
from diferencias d
where l.id=d.liquidacion_id
  and l.diferencia is distinct from d.diferencia;

revoke all on function public.validar_autorizacion_sobrante_v9452()
  from public,anon,authenticated;
revoke all on function public.sincronizar_diferencia_individual_v9452()
  from public,anon,authenticated;

comment on function public.validar_autorizacion_sobrante_v9452() is
  'V9.4.5.2: exige Gerencia o Administración para autorizar sobrantes de efectivo.';
comment on function public.sincronizar_diferencia_individual_v9452() is
  'V9.4.5.2: consolida la diferencia de recepciones individuales en liquidaciones_lotes.';

commit;

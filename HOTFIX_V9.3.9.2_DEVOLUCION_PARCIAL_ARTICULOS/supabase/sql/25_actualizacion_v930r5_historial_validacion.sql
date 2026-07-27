-- =========================================================
-- 25 - V9.3.0 R5 HISTORIAL DE ENTREGAS EN VALIDACIÓN
-- Productos César CRM
--
-- Agrega:
--   • Snapshot permanente de la hoja de ruta
--   • Responsable original de Validación
--   • Contador y auditoría de reimpresiones
--   • Datos históricos de cliente en el detalle del lote
--   • Permisos RLS vinculados al módulo Validación
--
-- No elimina órdenes, lotes, liquidaciones ni historial.
-- Ejecutar completo en Supabase SQL Editor.
-- =========================================================

begin;

-- ---------------------------------------------------------
-- 1. Ampliar lotes de entrega
-- ---------------------------------------------------------
alter table public.entrega_lotes
  add column if not exists validado_por text,
  add column if not exists hoja_ruta_snapshot jsonb,
  add column if not exists cantidad_reimpresiones integer not null default 0,
  add column if not exists ultima_reimpresion_en timestamptz,
  add column if not exists ultima_reimpresion_por uuid;

comment on column public.entrega_lotes.hoja_ruta_snapshot is
'Fotografía inmutable de los datos usados al crear la hoja de ruta: empresa, delivery, validador, clientes, facturas, montos y pesos.';

comment on column public.entrega_lotes.cantidad_reimpresiones is
'Cantidad de reimpresiones registradas desde el historial de Validación.';

-- ---------------------------------------------------------
-- 2. Conservar datos visibles del cliente en cada detalle
-- ---------------------------------------------------------
alter table public.entrega_lote_detalle
  add column if not exists cliente_nombre text,
  add column if not exists telefono text,
  add column if not exists sector text,
  add column if not exists direccion text;

-- Recuperar nombre histórico para detalles anteriores cuando todavía
-- existe la relación con el cliente.
update public.entrega_lote_detalle d
set cliente_nombre = coalesce(d.cliente_nombre, c.negocio),
    telefono       = coalesce(d.telefono, c.telefono),
    sector         = coalesce(d.sector, c.sector)
from public.clientes c
where c.id = d.cliente_id
  and (d.cliente_nombre is null or d.telefono is null or d.sector is null);

-- Recuperar responsable para lotes anteriores cuando es posible.
update public.entrega_lotes l
set validado_por = x.validado_por
from (
  select distinct on (d.codigo_lote)
         d.codigo_lote,
         o.validado_por
  from public.entrega_lote_detalle d
  join public.ordenes o on o.id = d.orden_id
  where nullif(trim(coalesce(o.validado_por, '')), '') is not null
  order by d.codigo_lote, d.id
) x
where l.codigo_lote = x.codigo_lote
  and nullif(trim(coalesce(l.validado_por, '')), '') is null;

-- ---------------------------------------------------------
-- 3. Auditoría documental
-- ---------------------------------------------------------
create table if not exists public.entrega_documentos_historial (
  id bigserial primary key,
  lote_id bigint references public.entrega_lotes(id) on delete set null,
  codigo_lote text not null,
  tipo_documento text not null,
  tipo_evento text not null,
  fecha_evento timestamptz not null default now(),
  usuario_id uuid references auth.users(id) on delete set null,
  usuario_nombre text,
  fecha_original timestamptz,
  filtro_desde date,
  filtro_hasta date,
  metadata jsonb not null default '{}'::jsonb,
  constraint entrega_documentos_tipo_evento_valido
    check (tipo_evento in ('Original','Reimpresión','Impresión'))
);

create index if not exists idx_entrega_documentos_lote_fecha
on public.entrega_documentos_historial(codigo_lote, fecha_evento desc);

create index if not exists idx_entrega_documentos_usuario_fecha
on public.entrega_documentos_historial(usuario_id, fecha_evento desc);

create index if not exists idx_entrega_lotes_fecha_historial
on public.entrega_lotes(fecha_entrega desc, delivery_nombre);

-- ---------------------------------------------------------
-- 4. Permiso reutilizable por módulo
-- ---------------------------------------------------------
create or replace function public.puede_modulo_v930r5(
  p_modulo text,
  p_nivel text default 'ver'
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.perfiles p
    where p.id = auth.uid()
      and coalesce(p.activo, true) = true
      and (
        p.rol in ('Gerente','Administrador','Supervisor')
        or (
          case coalesce(
            (select um.nivel
             from public.usuario_modulos um
             where um.usuario_id = p.id
               and um.modulo = p_modulo
             limit 1),
            (select rp.nivel
             from public.roles_permisos rp
             where rp.rol = p.rol
               and rp.modulo = p_modulo
             limit 1),
            'none'
          )
            when 'editar' then 2
            when 'ver' then 1
            else 0
          end
        ) >=
          case p_nivel
            when 'editar' then 2
            when 'ver' then 1
            else 0
          end
      )
  );
$$;

-- ---------------------------------------------------------
-- 5. RLS de auditoría
-- ---------------------------------------------------------
alter table public.entrega_documentos_historial enable row level security;

drop policy if exists entrega_documentos_select_v930r5
on public.entrega_documentos_historial;
create policy entrega_documentos_select_v930r5
on public.entrega_documentos_historial
for select to authenticated
using (public.puede_modulo_v930r5('validacion','ver'));

drop policy if exists entrega_documentos_insert_v930r5
on public.entrega_documentos_historial;
create policy entrega_documentos_insert_v930r5
on public.entrega_documentos_historial
for insert to authenticated
with check (
  public.puede_modulo_v930r5('validacion','editar')
  and usuario_id = auth.uid()
);

-- No se habilita UPDATE ni DELETE desde el frontend: la auditoría
-- documental debe permanecer inmutable.

grant select, insert on public.entrega_documentos_historial to authenticated;
grant usage, select on sequence public.entrega_documentos_historial_id_seq to authenticated;
grant execute on function public.puede_modulo_v930r5(text,text) to authenticated;

notify pgrst, 'reload schema';

commit;

-- =========================================================
-- VERIFICACIÓN
-- Debe devolver tabla_r5 = true y las cinco columnas nuevas.
-- =========================================================
select
  to_regclass('public.entrega_documentos_historial') is not null as tabla_r5,
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='entrega_lotes' and column_name='hoja_ruta_snapshot') as snapshot,
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='entrega_lotes' and column_name='validado_por') as validado_por,
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='entrega_lotes' and column_name='cantidad_reimpresiones') as reimpresiones,
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='entrega_lote_detalle' and column_name='cliente_nombre') as cliente_historico;

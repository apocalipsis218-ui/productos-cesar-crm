-- =========================================================
-- 55 - V9.4.1 · ENDURECIMIENTO DE SEGURIDAD
-- Productos César CRM
-- =========================================================

begin;

-- ---------------------------------------------------------
-- 0. PRERREQUISITOS
-- ---------------------------------------------------------
do $$
begin
  if to_regclass('public.v_clientes_riesgo') is null then
    raise exception 'No existe public.v_clientes_riesgo.';
  end if;

  if to_regprocedure(
       'public.guardar_orden_desde_llamada_v940r3(jsonb,jsonb,jsonb,text)'
     ) is null then
    raise exception 'Falta SQL 54: guardado atómico R3.';
  end if;
end $$;

-- ---------------------------------------------------------
-- 1. LA VISTA DE CLIENTES DEBE RESPETAR RLS
-- ---------------------------------------------------------
alter view public.v_clientes_riesgo
  set (security_invoker=true);

-- ---------------------------------------------------------
-- 2. FIJAR SEARCH_PATH DE FUNCIONES REPORTADAS
-- ---------------------------------------------------------
alter function public.agenda_del_dia(date)
  set search_path=public,pg_temp;

alter function public.fn_codigo_orden()
  set search_path=public,pg_temp;

alter function public.fn_orden_set_actualizado()
  set search_path=public,pg_temp;

alter function public.fn_auditar_orden()
  set search_path=public,pg_temp;

-- ---------------------------------------------------------
-- 3. CERRAR TODAS LAS SECURITY DEFINER AL NAVEGADOR
-- ---------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as fn
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.prosecdef
  loop
    execute format(
      'revoke execute on function %s from public, anon, authenticated',
      r.fn
    );
  end loop;
end $$;

-- ---------------------------------------------------------
-- 4. REABRIR SOLO RPC Y AYUDANTES NECESARIOS
-- ---------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as fn
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.prosecdef
      and p.proname=any(array[
        -- 27 RPC utilizadas directamente por el CRM
        'actualizar_usuario_permisos_v930r9',
        'actualizar_vencimiento_cxc_v940',
        'agregar_sector_si_no_existe',
        'cambiar_estado_orden_v9382',
        'cancelar_orden_v9383',
        'consolidar_liquidaciones_duplicadas_v937',
        'corregir_lote_entrega_v936',
        'crear_caso_especial_v9397',
        'crear_lote_entrega_v9371',
        'editar_composicion_lote_v9379',
        'guardar_configuracion_v9390',
        'guardar_orden_desde_llamada_v940r3',
        'guardar_orden_v9381',
        'guardar_preparacion_faltantes_v9391',
        'guardar_preparacion_v9381',
        'liberar_orden_v9382',
        'liberar_pendiente_existencia_v9391',
        'recibir_lote_cxc_v9393',
        'recibir_orden_cxc_v9393',
        'registrar_cobro_cxc_v940',
        'registrar_devolucion_parcial_v9392',
        'registrar_excepcion_v9378',
        'reversar_cobro_cxc_v940',
        'revertir_gestion_segura',
        'revisar_excepcion_v9378',
        'tomar_orden_v9397',
        'transferir_orden_lote_v9371',

        -- Ayudantes necesarios para RLS y permisos
        'cfg_int',
        'empleado_habilitado_area_v940r2',
        'es_admin_operativo',
        'mi_rol',
        'mi_rol_text',
        'mi_vendedor',
        'modulo_nivel_actual',
        'puede_configurar_usuarios_v9214',
        'puede_modulo_v930r5',
        'tiene_algun_modulo',
        'tiene_modulo'
      ]::text[])
  loop
    execute format(
      'grant execute on function %s to authenticated',
      r.fn
    );
  end loop;
end $$;

notify pgrst,'reload schema';

commit;

-- ---------------------------------------------------------
-- 5. VERIFICACIÓN
-- ---------------------------------------------------------
select
  (
    select reloptions @> array['security_invoker=true']
    from pg_class
    where oid='public.v_clientes_riesgo'::regclass
  ) as vista_respeta_rls,

  count(*) filter(
    where p.prosecdef
      and has_function_privilege('anon',p.oid,'execute')
  ) as security_definer_anon,

  count(*) filter(
    where p.prosecdef
      and exists(
        select 1
        from pg_trigger t
        where t.tgfoid=p.oid
          and not t.tgisinternal
      )
      and has_function_privilege(
        'authenticated',p.oid,'execute'
      )
  ) as triggers_expuestos_authenticated,

  count(*) filter(
    where p.prosecdef
      and has_function_privilege(
        'authenticated',p.oid,'execute'
      )
  ) as security_definer_authenticated,

  '9.4.1' as version
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public';

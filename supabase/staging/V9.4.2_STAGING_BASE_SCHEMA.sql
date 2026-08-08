-- V9.4.2 — Línea base exclusiva para STAGING
-- Productos César CRM
--
-- Origen: metadatos del esquema de producción leídos el 2026-08-08.
-- Contenido: solo DDL, permisos y configuración Realtime. No contiene registros
-- de clientes, órdenes, productos, usuarios, configuraciones ni credenciales.
--
-- IMPORTANTE:
--   1. Este archivo NO pertenece a supabase/migrations.
--   2. Solo se ejecuta una vez sobre un proyecto Supabase de staging vacío.
--   3. El guardado inicial aborta si encuentra tablas públicas preexistentes.
--   4. Después de esta base se aplican R1 y R2, en ese orden.
--
-- Huella de origen:
--   tablas=52; vistas=2; enums=4;
--   funciones=64; politicas_rls=133;
--   triggers=20; indices=155;
--   tablas_realtime=9.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '15min';
set local search_path = public, extensions, pg_catalog;

do $bootstrap$
begin
  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p', 'v', 'm')
      and not exists (
        select 1
        from pg_depend d
        where d.classid = 'pg_class'::regclass
          and d.objid = c.oid
          and d.deptype = 'e'
      )
  ) then
    raise exception
      'STAGING_BASE_SCHEMA abortado: el esquema public no está vacío.';
  end if;
end
$bootstrap$;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists unaccent with schema public;

-- -----------------------------------------------------------------------------
-- Tipos enumerados
-- -----------------------------------------------------------------------------

create type public.estado_cli as enum ('Activo', 'Inactivo', 'Prospecto', 'Cerrado', 'Suspendido');

create type public.estado_ped as enum ('Pendiente', 'Entregado', 'Cobrado', 'Anulado');

create type public.resultado_llam as enum ('Pidió', 'No pidió', 'No contestó', 'Reprogramar', 'Contactado', 'No disponible');

create type public.rol_usuario as enum ('Gerente', 'Vendedor', 'Cobrador', 'Supervisor', 'Carnicería', 'Facturación', 'Verificador', 'Delivery', 'CXC', 'Control', 'Validación', 'Liquidación', 'Sin perfil');

-- -----------------------------------------------------------------------------
-- Secuencias no identity
-- -----------------------------------------------------------------------------

create sequence public.cxc_recibo_seq_v940 as bigint increment by 1 minvalue 1 maxvalue 9223372036854775807 start with 1 cache 1 no cycle;

create sequence public.entrega_documentos_historial_id_seq as bigint increment by 1 minvalue 1 maxvalue 9223372036854775807 start with 1 cache 1 no cycle;

create sequence public.entrega_lote_correcciones_id_seq as bigint increment by 1 minvalue 1 maxvalue 9223372036854775807 start with 1 cache 1 no cycle;

create sequence public.entrega_lote_detalle_id_seq as bigint increment by 1 minvalue 1 maxvalue 9223372036854775807 start with 1 cache 1 no cycle;

create sequence public.entrega_lotes_id_seq as bigint increment by 1 minvalue 1 maxvalue 9223372036854775807 start with 1 cache 1 no cycle;

create sequence public.entrega_pedido_transferencias_id_seq as bigint increment by 1 minvalue 1 maxvalue 9223372036854775807 start with 1 cache 1 no cycle;

create sequence public.liquidacion_lote_detalle_id_seq as bigint increment by 1 minvalue 1 maxvalue 9223372036854775807 start with 1 cache 1 no cycle;

create sequence public.liquidacion_lote_eventos_id_seq as bigint increment by 1 minvalue 1 maxvalue 9223372036854775807 start with 1 cache 1 no cycle;

create sequence public.liquidaciones_lotes_id_seq as bigint increment by 1 minvalue 1 maxvalue 9223372036854775807 start with 1 cache 1 no cycle;

create sequence public.orden_casos_historial_id_seq as bigint increment by 1 minvalue 1 maxvalue 9223372036854775807 start with 1 cache 1 no cycle;

create sequence public.ordenes_seq as bigint increment by 1 minvalue 1 maxvalue 9223372036854775807 start with 1 cache 1 no cycle;

create sequence public.usuarios_permisos_historial_id_seq as bigint increment by 1 minvalue 1 maxvalue 9223372036854775807 start with 1 cache 1 no cycle;

-- -----------------------------------------------------------------------------
-- Función requerida por un valor predeterminado
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_codigo_orden()
 RETURNS text
 LANGUAGE sql
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select 'ORD-' || to_char(now(), 'YYMMDD') || '-' || lpad(nextval('public.ordenes_seq')::text, 4, '0');
$function$
;

-- -----------------------------------------------------------------------------
-- Tablas públicas
-- -----------------------------------------------------------------------------

create table public.abonos (
  id bigint generated always as identity not null,
  cobranza_id bigint not null,
  fecha date default CURRENT_DATE not null,
  monto numeric(12,2) not null,
  registrado_por text
);

create table public.auditoria (
  id bigint generated always as identity not null,
  ts timestamp with time zone default now() not null,
  usuario uuid,
  accion text,
  entidad text,
  registro text,
  detalle jsonb
);

create table public.auditoria_excepciones (
  id bigint generated by default as identity not null,
  creado_en timestamp with time zone default now() not null,
  usuario_id uuid not null,
  usuario_nombre text not null,
  usuario_rol text,
  empleado_id_texto text,
  empleado_nombre text,
  cuenta_estacion text,
  modulo text not null,
  tipo_evento text not null,
  gravedad text default 'Advertencia'::text not null,
  accion text default 'Continuó bajo responsabilidad'::text not null,
  motivo text not null,
  orden_id bigint,
  orden_codigo text,
  cliente_nombre text,
  lote_codigo text,
  valor_esperado numeric,
  valor_registrado numeric,
  diferencia numeric,
  tolerancia_aviso numeric,
  tolerancia_maxima numeric,
  unidad text,
  detalle jsonb default '{}'::jsonb not null,
  dispositivo text,
  estado_revision text default 'Pendiente'::text not null,
  revisado_por uuid,
  revisado_en timestamp with time zone,
  nota_administrativa text
);

create table public.catalogo_items (
  id bigint generated always as identity not null,
  catalogo_id text not null,
  valor text not null,
  descripcion text,
  color text,
  activo boolean default true not null,
  orden integer default 100 not null,
  creado_en timestamp with time zone default now() not null,
  actualizado_en timestamp with time zone default now() not null
);

create table public.catalogos (
  id text not null,
  nombre text not null,
  descripcion text,
  activo boolean default true not null,
  orden integer default 100 not null,
  creado_en timestamp with time zone default now() not null,
  actualizado_en timestamp with time zone default now() not null
);

create table public.cierres_dia (
  fecha date not null,
  cerrado_por uuid,
  cerrado_en timestamp with time zone default now()
);

create table public.clientes (
  id bigint generated always as identity not null,
  codigo text not null,
  contacto text,
  negocio text not null,
  tipo text default 'Otro'::text,
  sector text,
  telefono text,
  vendedor text,
  dia_contacto text,
  dia_contacto2 text,
  frecuencia text default 'Semanal'::text,
  estado estado_cli default 'Inactivo'::estado_cli not null,
  ultimo_pedido date,
  reprogramado_para date,
  prioridad text,
  whatsapp boolean default true,
  credito boolean default false,
  limite_credito numeric(12,2) default 0,
  observaciones text,
  archivado boolean default false not null,
  creado_en timestamp with time zone default now() not null,
  actualizado_en timestamp with time zone default now() not null,
  direccion text,
  referencia text
);

create table public.cobranza (
  id bigint generated always as identity not null,
  cliente_id bigint not null,
  pedido_id bigint,
  fecha date default CURRENT_DATE not null,
  vendedor text,
  cobrador text,
  monto numeric(12,2) not null,
  abonado numeric(12,2) default 0 not null,
  vencimiento date,
  creado_en timestamp with time zone default now() not null,
  orden_id bigint
);

create table public.config (
  clave text not null,
  valor text,
  editable boolean default true
);

create table public.cxc_cobro_aplicaciones (
  id bigint generated always as identity not null,
  cobro_id bigint not null,
  orden_id bigint not null,
  monto_aplicado numeric(14,2) not null,
  saldo_antes numeric(14,2) not null,
  saldo_despues numeric(14,2) not null,
  vencimiento date,
  creado_en timestamp with time zone default now() not null
);

create table public.cxc_cobros (
  id bigint generated always as identity not null,
  numero_recibo text not null,
  cliente_clave text not null,
  cliente_id bigint,
  cliente_nombre text not null,
  cliente_telefono text,
  fecha_cobro timestamp with time zone default now() not null,
  monto_total numeric(14,2) not null,
  metodo text not null,
  referencia text,
  recibido_por text not null,
  observacion text,
  estado text default 'Activo'::text not null,
  creado_por uuid not null,
  creado_en timestamp with time zone default now() not null,
  reversado_por uuid,
  reversado_en timestamp with time zone,
  motivo_reversion text
);

create table public.cxc_eventos (
  id bigint generated always as identity not null,
  cobro_id bigint,
  orden_id bigint,
  tipo text not null,
  motivo text,
  datos jsonb default '{}'::jsonb not null,
  usuario_id uuid not null,
  creado_en timestamp with time zone default now() not null
);

create table public.deliverys_config (
  id bigint generated always as identity not null,
  nombre text not null,
  telefono text,
  zona text,
  activo boolean default true not null,
  observaciones text,
  creado_en timestamp with time zone default now() not null,
  actualizado_en timestamp with time zone default now() not null
);

create table public.empleados_operativos (
  id bigint generated always as identity not null,
  nombre text not null,
  area text not null,
  activo boolean default true not null,
  observaciones text,
  creado_en timestamp with time zone default now() not null,
  actualizado_en timestamp with time zone default now() not null,
  areas_adicionales text[] default '{}'::text[] not null
);

create table public.entrega_documentos_historial (
  id bigint default nextval('entrega_documentos_historial_id_seq'::regclass) not null,
  lote_id bigint,
  codigo_lote text not null,
  tipo_documento text not null,
  tipo_evento text not null,
  fecha_evento timestamp with time zone default now() not null,
  usuario_id uuid,
  usuario_nombre text,
  fecha_original timestamp with time zone,
  filtro_desde date,
  filtro_hasta date,
  metadata jsonb default '{}'::jsonb not null
);

create table public.entrega_lote_correcciones (
  id bigint default nextval('entrega_lote_correcciones_id_seq'::regclass) not null,
  lote_id bigint not null,
  codigo_lote text not null,
  accion text not null,
  delivery_anterior text,
  delivery_nuevo text,
  motivo text not null,
  usuario_id uuid,
  usuario_nombre text,
  fecha_evento timestamp with time zone default now() not null,
  metadata jsonb default '{}'::jsonb not null
);

create table public.entrega_lote_detalle (
  id bigint default nextval('entrega_lote_detalle_id_seq'::regclass) not null,
  lote_id bigint,
  codigo_lote text not null,
  orden_id bigint,
  cliente_id bigint,
  codigo_orden text,
  factura_no text,
  monto_factura numeric(14,2) default 0 not null,
  peso_esperado numeric(12,2) default 0 not null,
  peso_entregado numeric(12,2) default 0 not null,
  estado_liquidacion text default 'Pendiente'::text not null,
  resultado_entrega text,
  monto_cobrado numeric(14,2) default 0 not null,
  monto_credito numeric(14,2) default 0 not null,
  observacion text,
  creado_en timestamp with time zone default now() not null,
  cliente_nombre text,
  telefono text,
  sector text,
  direccion text
);

create table public.entrega_lotes (
  id bigint default nextval('entrega_lotes_id_seq'::regclass) not null,
  codigo_lote text not null,
  delivery_nombre text not null,
  fecha_entrega timestamp with time zone default now() not null,
  cantidad_ordenes integer default 0 not null,
  peso_esperado numeric(12,2) default 0 not null,
  peso_entregado numeric(12,2) default 0 not null,
  total_facturado numeric(14,2) default 0 not null,
  estado text default 'Abierto'::text not null,
  creado_por uuid,
  creado_en timestamp with time zone default now() not null,
  validado_por text,
  hoja_ruta_snapshot jsonb,
  cantidad_reimpresiones integer default 0 not null,
  ultima_reimpresion_en timestamp with time zone,
  ultima_reimpresion_por uuid,
  corregido_en timestamp with time zone,
  corregido_por uuid,
  motivo_correccion text,
  responsable_nombre text default 'Sin responsable'::text not null,
  responsable_tipo text default 'delivery_registrado'::text not null,
  responsable_empleado_id bigint,
  es_transferencia boolean default false not null,
  lote_origen_id bigint,
  codigo_lote_origen text
);

create table public.entrega_pedido_transferencias (
  id bigint default nextval('entrega_pedido_transferencias_id_seq'::regclass) not null,
  orden_id bigint not null,
  lote_origen_id bigint not null,
  lote_destino_id bigint not null,
  codigo_lote_origen text not null,
  codigo_lote_destino text not null,
  responsable_anterior text not null,
  responsable_nuevo text not null,
  responsable_tipo_nuevo text not null,
  monto_factura numeric(14,2) default 0 not null,
  peso_entregado numeric(12,2) default 0 not null,
  motivo text not null,
  usuario_id uuid,
  usuario_nombre text,
  metadata jsonb default '{}'::jsonb not null,
  creado_en timestamp with time zone default now() not null
);

create table public.importaciones_log (
  id bigint generated always as identity not null,
  tipo text not null,
  archivo text,
  importados integer default 0 not null,
  actualizados integer default 0 not null,
  errores integer default 0 not null,
  detalle jsonb,
  usuario uuid,
  creado_en timestamp with time zone default now() not null
);

create table public.liquidacion_lote_detalle (
  id bigint default nextval('liquidacion_lote_detalle_id_seq'::regclass) not null,
  liquidacion_id bigint,
  orden_id bigint,
  cliente_id bigint,
  codigo_orden text,
  cliente_nombre text,
  factura_no text,
  resultado_entrega text,
  total_factura numeric(14,2) default 0 not null,
  monto_cobrado numeric(14,2) default 0 not null,
  monto_credito numeric(14,2) default 0 not null,
  monto_no_entregado numeric(14,2) default 0 not null,
  observacion text,
  creado_en timestamp with time zone default now() not null
);

create table public.liquidacion_lote_eventos (
  id bigint default nextval('liquidacion_lote_eventos_id_seq'::regclass) not null,
  lote_id bigint,
  codigo_lote text,
  liquidacion_id bigint,
  accion text not null,
  motivo text,
  usuario_id uuid,
  usuario_nombre text,
  metadata jsonb default '{}'::jsonb not null,
  creado_en timestamp with time zone default now() not null
);

create table public.liquidaciones_lotes (
  id bigint default nextval('liquidaciones_lotes_id_seq'::regclass) not null,
  lote_id bigint,
  codigo_lote text not null,
  delivery_nombre text not null,
  fecha_liquidacion timestamp with time zone default now() not null,
  total_facturado numeric(14,2) default 0 not null,
  efectivo_reportado numeric(14,2) default 0 not null,
  efectivo_recibido numeric(14,2) default 0 not null,
  credito_pendiente numeric(14,2) default 0 not null,
  no_entregado numeric(14,2) default 0 not null,
  diferencia numeric(14,2) default 0 not null,
  recibido_por text,
  observacion text,
  estado text default 'Cerrado'::text not null,
  creado_por uuid,
  creado_en timestamp with time zone default now() not null
);

create table public.llamadas (
  id bigint generated always as identity not null,
  cliente_id bigint not null,
  fecha date default CURRENT_DATE not null,
  vendedor text,
  contactado boolean default true,
  resultado resultado_llam not null,
  monto numeric(12,2) default 0,
  proximo_contacto date,
  observacion text,
  creado_en timestamp with time zone default now() not null,
  hora text,
  idempotencia_orden_v940r3 uuid
);

create table public.metas (
  id bigint generated always as identity not null,
  meta_pedidos integer default 50,
  meta_monto numeric(12,2) default 100000,
  comision_pct numeric(5,2) default 3,
  vigente_desde date default CURRENT_DATE
);

create table public.modulos_sistema (
  id text not null,
  nombre text not null,
  grupo text default 'Operación'::text not null,
  descripcion text,
  orden integer default 100 not null,
  activo boolean default true not null,
  actualizado_en timestamp with time zone default now() not null
);

create table public.orden_archivos_v9383 (
  id bigint generated by default as identity not null,
  orden_id bigint not null,
  orden_codigo text not null,
  accion text not null,
  motivo text not null,
  estado_anterior text not null,
  usuario_id uuid not null,
  creado_en timestamp with time zone default now() not null,
  snapshot jsonb not null
);

create table public.orden_auditoria (
  id bigint generated always as identity not null,
  ts timestamp with time zone default now() not null,
  usuario uuid,
  entidad text,
  registro text,
  accion text,
  detalle jsonb
);

create table public.orden_casos_historial (
  id bigint default nextval('orden_casos_historial_id_seq'::regclass) not null,
  orden_id bigint,
  estado_caso text,
  comentario text,
  usuario uuid,
  creado_en timestamp with time zone default now()
);

create table public.orden_detalle (
  id bigint generated always as identity not null,
  orden_id bigint not null,
  producto_id bigint,
  producto_nombre text not null,
  cantidad_pedida numeric(14,2) default 0 not null,
  cantidad_despachada numeric(14,2),
  unidad text default 'lb'::text not null,
  precio numeric(14,2) default 0 not null,
  subtotal numeric(14,2) default 0 not null,
  notas text,
  creado_en timestamp with time zone default now() not null,
  cantidad_preparada numeric,
  estado_preparacion text default 'Pendiente'::text not null,
  nota_preparacion text,
  tipo_despacho_peso text,
  requiere_pesaje boolean,
  peso_estandar_lb numeric(12,3),
  tolerancia_lb numeric(12,3),
  suma_peso_final boolean,
  peso_equivalente_solicitado numeric(12,3),
  peso_equivalente_preparado numeric(12,3),
  permite_fraccion boolean
);

create table public.orden_devolucion_detalle (
  id bigint generated by default as identity not null,
  devolucion_id bigint not null,
  orden_detalle_id bigint not null,
  producto_id bigint,
  producto_nombre text not null,
  unidad text,
  cantidad_entregada numeric(14,3) not null,
  cantidad_devuelta numeric(14,3) not null,
  precio numeric(14,4) not null,
  monto_devuelto numeric(14,2) not null,
  peso_devuelto numeric(14,3) default 0 not null,
  destino text not null,
  motivo text not null
);

create table public.orden_devoluciones (
  id bigint generated by default as identity not null,
  orden_id bigint not null,
  monto_original numeric(14,2) not null,
  monto_devuelto numeric(14,2) not null,
  monto_neto numeric(14,2) not null,
  peso_original numeric(14,3) default 0 not null,
  peso_devuelto numeric(14,3) default 0 not null,
  peso_neto numeric(14,3) default 0 not null,
  estado text default 'Confirmada'::text not null,
  observacion text,
  recibido_por text not null,
  creado_por uuid not null,
  creado_en timestamp with time zone default now() not null
);

create table public.orden_entregas (
  id bigint generated always as identity not null,
  orden_id bigint not null,
  resultado text not null,
  monto_cobrado numeric(14,2) default 0 not null,
  monto_pendiente numeric(14,2) default 0 not null,
  notas text,
  creado_por uuid,
  creado_en timestamp with time zone default now() not null
);

create table public.orden_estados_historial (
  id bigint generated always as identity not null,
  orden_id bigint not null,
  estado_anterior text,
  estado_nuevo text not null,
  comentario text,
  usuario uuid,
  creado_en timestamp with time zone default now() not null
);

create table public.orden_facturas (
  id bigint generated always as identity not null,
  orden_id bigint not null,
  factura_no text not null,
  monto numeric(14,2) default 0 not null,
  peso_facturado numeric(14,2),
  condicion_pago text default 'Crédito'::text not null,
  notas text,
  creado_por uuid,
  creado_en timestamp with time zone default now() not null
);

create table public.orden_pagos (
  id bigint generated always as identity not null,
  orden_id bigint not null,
  cliente_id bigint,
  monto numeric(14,2) not null,
  metodo text default 'Efectivo'::text not null,
  recibido_por uuid,
  creado_en timestamp with time zone default now() not null,
  cliente_nombre text,
  cliente_telefono text,
  tipo_cliente text,
  cxc_cobro_id bigint,
  tipo_pago text default 'Liquidación inicial'::text not null,
  reversado boolean default false not null,
  reversado_en timestamp with time zone,
  reversado_por uuid
);

create table public.orden_pesos (
  id bigint generated always as identity not null,
  orden_id bigint not null,
  tipo text not null,
  libras numeric(14,2) not null,
  paquetes integer,
  notas text,
  creado_por uuid,
  creado_en timestamp with time zone default now() not null
);

create table public.orden_transiciones_v9382 (
  estado_anterior text not null,
  estado_nuevo text not null,
  modulo text not null,
  activo boolean default true not null
);

create table public.ordenes (
  id bigint generated always as identity not null,
  codigo text default fn_codigo_orden() not null,
  cliente_id bigint,
  llamada_id bigint,
  pedido_crm_id bigint,
  fecha date default CURRENT_DATE not null,
  canal text default 'WhatsApp'::text not null,
  vendedor text,
  estado text default 'Pedido recibido'::text not null,
  condicion_pago text default 'Crédito'::text not null,
  total_estimado numeric(14,2) default 0 not null,
  total_factura numeric(14,2) default 0 not null,
  factura_no text,
  delivery_nombre text,
  zona text,
  notas text,
  creado_por uuid,
  actualizado_por uuid,
  creado_en timestamp with time zone default now() not null,
  actualizado_en timestamp with time zone default now() not null,
  preparado_por text,
  peso_preparado numeric(14,2),
  paquetes_preparados integer,
  preparado_en timestamp with time zone,
  notas_preparacion text,
  facturado_por text,
  facturado_en timestamp with time zone,
  peso_facturado numeric(14,2),
  validado_por text,
  peso_validado numeric(14,2),
  validado_en timestamp with time zone,
  notas_validacion text,
  asignado_delivery_en timestamp with time zone,
  en_ruta_en timestamp with time zone,
  recibido_por text,
  recibido_en timestamp with time zone,
  resultado_entrega text,
  monto_cobrado numeric(14,2) default 0 not null,
  monto_pendiente numeric(14,2) default 0 not null,
  notas_liquidacion text,
  cantidad_impresiones integer default 0 not null,
  ultima_impresion timestamp with time zone,
  impreso_por uuid,
  fecha_despacho date,
  hora_despacho time without time zone,
  es_programada boolean default false not null,
  nota_programacion text,
  programada_por uuid,
  fecha_programacion timestamp with time zone,
  prioridad text default 'Normal'::text not null,
  permitir_adelantar boolean default false not null,
  tomado_por text,
  tomado_en timestamp with time zone,
  tomado_por_user uuid,
  liberado_por uuid,
  liberado_en timestamp with time zone,
  motivo_liberacion text,
  impresiones_preparacion integer default 0 not null,
  ultima_impresion_preparacion timestamp with time zone,
  impreso_preparacion_por uuid,
  peso_calculado_preparado numeric,
  tipo_orden text default 'Pedido normal'::text not null,
  requiere_preparacion boolean default true not null,
  requiere_facturacion boolean default true not null,
  requiere_delivery boolean default true not null,
  accion_operativa text,
  estado_caso_especial text default 'Abierto'::text,
  responsable_caso text,
  accion_caso text,
  producto_recoger text,
  producto_entregar text,
  monto_ajuste numeric(14,2) default 0,
  fecha_compromiso date,
  requiere_nota_credito boolean default false,
  resolucion_caso text,
  caso_resuelto_en timestamp with time zone,
  caso_resuelto_por text,
  modalidad_entrega text default 'Delivery'::text not null,
  tipo_cliente_orden text default 'Registrado'::text not null,
  cliente_nombre_orden text,
  cliente_telefono_orden text,
  cliente_sector_orden text,
  retirado_por text,
  entregado_mostrador_por text,
  entregado_mostrador_en timestamp with time zone,
  notas_retiro text,
  cliente_direccion_orden text,
  cliente_referencia_orden text,
  tomado_por_empleado_id bigint,
  archivada boolean default false not null,
  archivada_en timestamp with time zone,
  archivada_por uuid,
  motivo_anulacion text,
  orden_origen_id bigint,
  es_pendiente_existencia boolean default false not null,
  liberado_existencia_en timestamp with time zone,
  liberado_existencia_por uuid,
  monto_devuelto numeric(14,2) default 0 not null,
  peso_devuelto numeric(14,3) default 0 not null,
  total_neto_liquidacion numeric(14,2),
  peso_neto_entregado numeric(14,3),
  ultimo_resultado_delivery text,
  ultimo_lote_no_entregado text,
  ultimo_no_entregado_en timestamp with time zone,
  no_entregado_reintentos integer default 0 not null,
  cxc_saldo_inicial numeric(14,2),
  cxc_pagado_acumulado numeric(14,2) default 0 not null,
  cxc_vencimiento date,
  cxc_estado text default 'No aplica'::text not null,
  cxc_ultimo_pago_en timestamp with time zone
);

create table public.pedidos (
  id bigint generated always as identity not null,
  cliente_id bigint not null,
  llamada_id bigint,
  fecha date default CURRENT_DATE not null,
  vendedor text,
  monto numeric(12,2) not null,
  estado estado_ped default 'Pendiente'::estado_ped not null,
  observaciones text,
  creado_en timestamp with time zone default now() not null
);

create table public.perfiles (
  id uuid not null,
  nombre text not null,
  rol text default 'Sin perfil'::text not null,
  vendedor text,
  activo boolean default true not null,
  creado_en timestamp with time zone default now() not null,
  actualizado_en timestamp with time zone default now(),
  correo text,
  empleado_id bigint,
  tipo_cuenta text default 'empleado'::text not null
);

create table public.plantillas (
  id bigint generated always as identity not null,
  texto text not null,
  orden integer default 0,
  activo boolean default true
);

create table public.plantillas_whatsapp (
  id bigint generated always as identity not null,
  nombre text not null,
  categoria text default 'clientes'::text not null,
  texto text not null,
  activo boolean default true not null,
  orden integer default 100 not null,
  creado_en timestamp with time zone default now() not null,
  actualizado_en timestamp with time zone default now() not null
);

create table public.productos_despacho (
  id bigint generated always as identity not null,
  nombre text not null,
  unidad text default 'lb'::text not null,
  precio_defecto numeric(14,2) default 0 not null,
  activo boolean default true not null,
  creado_en timestamp with time zone default now() not null,
  actualizado_en timestamp with time zone default now() not null,
  codigo text,
  categoria text,
  observaciones text,
  tipo_despacho_peso text default 'Por libra'::text not null,
  requiere_pesaje boolean default true not null,
  peso_estandar_lb numeric(12,3),
  tolerancia_lb numeric(12,3) default 0.25 not null,
  suma_peso_final boolean default true not null,
  permitir_ajustar_peso boolean default true not null,
  permite_fraccion boolean default true
);

create table public.roles_permisos (
  rol text not null,
  modulo text not null,
  nivel text default 'none'::text not null,
  actualizado_en timestamp with time zone default now()
);

create table public.sistema_configuracion (
  clave text not null,
  valor jsonb default '{}'::jsonb not null,
  actualizado_en timestamp with time zone default now() not null,
  actualizado_por uuid,
  revision bigint default 1 not null
);

create table public.sistema_configuracion_historial_v9390 (
  id bigint generated by default as identity not null,
  clave text not null,
  valor_anterior jsonb,
  valor_nuevo jsonb not null,
  revision_anterior bigint,
  revision_nueva bigint not null,
  usuario_id uuid not null,
  creado_en timestamp with time zone default now() not null
);

create table public.usuario_modulos (
  usuario_id uuid not null,
  modulo text not null,
  nivel text default 'none'::text not null,
  actualizado_en timestamp with time zone default now() not null
);

create table public.usuarios_permisos_historial (
  id bigint default nextval('usuarios_permisos_historial_id_seq'::regclass) not null,
  usuario_objetivo uuid not null,
  cambiado_por uuid not null,
  antes jsonb,
  despues jsonb,
  creado_en timestamp with time zone default now() not null
);

create table public.vendedores (
  id bigint generated always as identity not null,
  nombre text not null,
  activo boolean default true not null,
  comision_pct numeric(5,2) default 3
);

create table public.viaje_ordenes (
  id bigint generated always as identity not null,
  viaje_id bigint not null,
  orden_id bigint not null,
  creado_en timestamp with time zone default now() not null
);

create table public.viajes_delivery (
  id bigint generated always as identity not null,
  codigo text default ((('VIA-'::text || to_char(now(), 'YYMMDD'::text)) || '-'::text) || upper(substr((gen_random_uuid())::text, 1, 4))) not null,
  delivery_nombre text not null,
  zona text,
  estado text default 'En ruta'::text not null,
  salida_en timestamp with time zone default now() not null,
  cierre_en timestamp with time zone,
  notas text,
  creado_por uuid
);

-- -----------------------------------------------------------------------------
-- Restricciones
-- -----------------------------------------------------------------------------

alter table only public.abonos add constraint abonos_pkey PRIMARY KEY (id);

alter table only public.auditoria add constraint auditoria_pkey PRIMARY KEY (id);

alter table only public.auditoria_excepciones add constraint auditoria_excepciones_pkey PRIMARY KEY (id);

alter table only public.catalogo_items add constraint catalogo_items_pkey PRIMARY KEY (id);

alter table only public.catalogos add constraint catalogos_pkey PRIMARY KEY (id);

alter table only public.cierres_dia add constraint cierres_dia_pkey PRIMARY KEY (fecha);

alter table only public.clientes add constraint clientes_pkey PRIMARY KEY (id);

alter table only public.cobranza add constraint cobranza_pkey PRIMARY KEY (id);

alter table only public.config add constraint config_pkey PRIMARY KEY (clave);

alter table only public.cxc_cobro_aplicaciones add constraint cxc_cobro_aplicaciones_pkey PRIMARY KEY (id);

alter table only public.cxc_cobros add constraint cxc_cobros_pkey PRIMARY KEY (id);

alter table only public.cxc_eventos add constraint cxc_eventos_pkey PRIMARY KEY (id);

alter table only public.deliverys_config add constraint deliverys_config_pkey PRIMARY KEY (id);

alter table only public.empleados_operativos add constraint empleados_operativos_pkey PRIMARY KEY (id);

alter table only public.entrega_documentos_historial add constraint entrega_documentos_historial_pkey PRIMARY KEY (id);

alter table only public.entrega_lote_correcciones add constraint entrega_lote_correcciones_pkey PRIMARY KEY (id);

alter table only public.entrega_lote_detalle add constraint entrega_lote_detalle_pkey PRIMARY KEY (id);

alter table only public.entrega_lotes add constraint entrega_lotes_pkey PRIMARY KEY (id);

alter table only public.entrega_pedido_transferencias add constraint entrega_pedido_transferencias_pkey PRIMARY KEY (id);

alter table only public.importaciones_log add constraint importaciones_log_pkey PRIMARY KEY (id);

alter table only public.liquidacion_lote_detalle add constraint liquidacion_lote_detalle_pkey PRIMARY KEY (id);

alter table only public.liquidacion_lote_eventos add constraint liquidacion_lote_eventos_pkey PRIMARY KEY (id);

alter table only public.liquidaciones_lotes add constraint liquidaciones_lotes_pkey PRIMARY KEY (id);

alter table only public.llamadas add constraint llamadas_pkey PRIMARY KEY (id);

alter table only public.metas add constraint metas_pkey PRIMARY KEY (id);

alter table only public.modulos_sistema add constraint modulos_sistema_pkey PRIMARY KEY (id);

alter table only public.orden_archivos_v9383 add constraint orden_archivos_v9383_pkey PRIMARY KEY (id);

alter table only public.orden_auditoria add constraint orden_auditoria_pkey PRIMARY KEY (id);

alter table only public.orden_casos_historial add constraint orden_casos_historial_pkey PRIMARY KEY (id);

alter table only public.orden_detalle add constraint orden_detalle_pkey PRIMARY KEY (id);

alter table only public.orden_devolucion_detalle add constraint orden_devolucion_detalle_pkey PRIMARY KEY (id);

alter table only public.orden_devoluciones add constraint orden_devoluciones_pkey PRIMARY KEY (id);

alter table only public.orden_entregas add constraint orden_entregas_pkey PRIMARY KEY (id);

alter table only public.orden_estados_historial add constraint orden_estados_historial_pkey PRIMARY KEY (id);

alter table only public.orden_facturas add constraint orden_facturas_pkey PRIMARY KEY (id);

alter table only public.orden_pagos add constraint orden_pagos_pkey PRIMARY KEY (id);

alter table only public.orden_pesos add constraint orden_pesos_pkey PRIMARY KEY (id);

alter table only public.orden_transiciones_v9382 add constraint orden_transiciones_v9382_pkey PRIMARY KEY (estado_anterior, estado_nuevo);

alter table only public.ordenes add constraint ordenes_pkey PRIMARY KEY (id);

alter table only public.pedidos add constraint pedidos_pkey PRIMARY KEY (id);

alter table only public.perfiles add constraint perfiles_pkey PRIMARY KEY (id);

alter table only public.plantillas add constraint plantillas_pkey PRIMARY KEY (id);

alter table only public.plantillas_whatsapp add constraint plantillas_whatsapp_pkey PRIMARY KEY (id);

alter table only public.productos_despacho add constraint productos_despacho_pkey PRIMARY KEY (id);

alter table only public.roles_permisos add constraint roles_permisos_pkey PRIMARY KEY (rol, modulo);

alter table only public.sistema_configuracion add constraint sistema_configuracion_pkey PRIMARY KEY (clave);

alter table only public.sistema_configuracion_historial_v9390 add constraint sistema_configuracion_historial_v9390_pkey PRIMARY KEY (id);

alter table only public.usuario_modulos add constraint usuario_modulos_pkey PRIMARY KEY (usuario_id, modulo);

alter table only public.usuarios_permisos_historial add constraint usuarios_permisos_historial_pkey PRIMARY KEY (id);

alter table only public.vendedores add constraint vendedores_pkey PRIMARY KEY (id);

alter table only public.viaje_ordenes add constraint viaje_ordenes_pkey PRIMARY KEY (id);

alter table only public.viajes_delivery add constraint viajes_delivery_pkey PRIMARY KEY (id);

alter table only public.catalogo_items add constraint catalogo_items_catalogo_id_valor_key UNIQUE (catalogo_id, valor);

alter table only public.clientes add constraint clientes_codigo_key UNIQUE (codigo);

alter table only public.cxc_cobro_aplicaciones add constraint cxc_cobro_aplicaciones_cobro_id_orden_id_key UNIQUE (cobro_id, orden_id);

alter table only public.cxc_cobros add constraint cxc_cobros_numero_recibo_key UNIQUE (numero_recibo);

alter table only public.deliverys_config add constraint deliverys_config_nombre_key UNIQUE (nombre);

alter table only public.empleados_operativos add constraint empleados_operativos_nombre_area_key UNIQUE (nombre, area);

alter table only public.entrega_lotes add constraint entrega_lotes_codigo_lote_key UNIQUE (codigo_lote);

alter table only public.orden_devolucion_detalle add constraint orden_devolucion_detalle_devolucion_id_orden_detalle_id_key UNIQUE (devolucion_id, orden_detalle_id);

alter table only public.ordenes add constraint ordenes_codigo_key UNIQUE (codigo);

alter table only public.ordenes add constraint ordenes_llamada_id_key UNIQUE (llamada_id);

alter table only public.productos_despacho add constraint productos_despacho_nombre_key UNIQUE (nombre);

alter table only public.vendedores add constraint vendedores_nombre_key UNIQUE (nombre);

alter table only public.viaje_ordenes add constraint viaje_ordenes_viaje_id_orden_id_key UNIQUE (viaje_id, orden_id);

alter table only public.viajes_delivery add constraint viajes_delivery_codigo_key UNIQUE (codigo);

alter table only public.abonos add constraint abonos_monto_check CHECK (monto > 0::numeric);

alter table only public.auditoria_excepciones add constraint auditoria_excepciones_estado_revision_check CHECK (estado_revision = ANY (ARRAY['Pendiente'::text, 'Revisado'::text, 'Requiere seguimiento'::text]));

alter table only public.auditoria_excepciones add constraint auditoria_excepciones_gravedad_check CHECK (gravedad = ANY (ARRAY['Informativa'::text, 'Advertencia'::text, 'Crítica'::text]));

alter table only public.auditoria_excepciones add constraint auditoria_excepciones_motivo_check CHECK (char_length(btrim(motivo)) >= 5);

alter table only public.cxc_cobro_aplicaciones add constraint cxc_cobro_aplicaciones_monto_aplicado_check CHECK (monto_aplicado > 0::numeric);

alter table only public.cxc_cobro_aplicaciones add constraint cxc_cobro_aplicaciones_saldo_antes_check CHECK (saldo_antes >= 0::numeric);

alter table only public.cxc_cobro_aplicaciones add constraint cxc_cobro_aplicaciones_saldo_despues_check CHECK (saldo_despues >= 0::numeric);

alter table only public.cxc_cobros add constraint cxc_cobros_estado_check CHECK (estado = ANY (ARRAY['Activo'::text, 'Reversado'::text]));

alter table only public.cxc_cobros add constraint cxc_cobros_metodo_check CHECK (metodo = ANY (ARRAY['Efectivo'::text, 'Transferencia'::text, 'Mixto'::text]));

alter table only public.cxc_cobros add constraint cxc_cobros_monto_total_check CHECK (monto_total > 0::numeric);

alter table only public.empleados_operativos add constraint chk_empleados_areas_adicionales_v9375 CHECK (areas_adicionales <@ ARRAY['Carnicería'::text, 'Facturación'::text, 'Validación'::text, 'Delivery'::text, 'Liquidación'::text, 'CXC'::text, 'Vendedor'::text, 'Control'::text, 'Gerencia'::text, 'Supervisor'::text, 'Administración'::text] AND NOT (area = ANY (areas_adicionales)));

alter table only public.empleados_operativos add constraint chk_empleados_operativos_area CHECK (area = ANY (ARRAY['Carnicería'::text, 'Facturación'::text, 'Validación'::text, 'Delivery'::text, 'Liquidación'::text, 'CXC'::text, 'Vendedor'::text, 'Control'::text, 'Gerencia'::text, 'Supervisor'::text, 'Administración'::text]));

alter table only public.entrega_documentos_historial add constraint entrega_documentos_tipo_evento_valido CHECK (tipo_evento = ANY (ARRAY['Original'::text, 'Reimpresión'::text, 'Impresión'::text]));

alter table only public.entrega_lote_correcciones add constraint entrega_lote_correcciones_accion_check CHECK (accion = ANY (ARRAY['cambiar_delivery'::text, 'revertir_lote'::text]));

alter table only public.entrega_lote_correcciones add constraint entrega_lote_correcciones_motivo_check CHECK (length(TRIM(BOTH FROM motivo)) >= 5);

alter table only public.entrega_lotes add constraint entrega_lotes_responsable_tipo_v9371_chk CHECK (responsable_tipo = ANY (ARRAY['delivery_registrado'::text, 'otro_empleado'::text, 'manual_externo'::text]));

alter table only public.entrega_pedido_transferencias add constraint entrega_pedido_transferencias_motivo_check CHECK (length(TRIM(BOTH FROM motivo)) >= 5);

alter table only public.entrega_pedido_transferencias add constraint entrega_pedido_transferencias_responsable_tipo_nuevo_check CHECK (responsable_tipo_nuevo = ANY (ARRAY['delivery_registrado'::text, 'otro_empleado'::text, 'manual_externo'::text]));

alter table only public.llamadas add constraint chk_reprog_con_fecha CHECK (resultado <> 'Reprogramar'::resultado_llam OR proximo_contacto IS NOT NULL);

alter table only public.orden_archivos_v9383 add constraint orden_archivos_v9383_accion_check CHECK (accion = ANY (ARRAY['Anulada'::text, 'Archivada'::text]));

alter table only public.orden_archivos_v9383 add constraint orden_archivos_v9383_motivo_check CHECK (char_length(btrim(motivo)) >= 5);

alter table only public.orden_devolucion_detalle add constraint orden_devolucion_detalle_cantidad_devuelta_check CHECK (cantidad_devuelta > 0::numeric);

alter table only public.orden_devolucion_detalle add constraint orden_devolucion_detalle_destino_check CHECK (destino = ANY (ARRAY['Inventario'::text, 'Merma'::text, 'Revision'::text]));

alter table only public.orden_devolucion_detalle add constraint orden_devolucion_detalle_monto_devuelto_check CHECK (monto_devuelto >= 0::numeric);

alter table only public.orden_devolucion_detalle add constraint orden_devolucion_detalle_motivo_check CHECK (length(btrim(motivo)) >= 3);

alter table only public.orden_devolucion_detalle add constraint orden_devolucion_detalle_peso_devuelto_check CHECK (peso_devuelto >= 0::numeric);

alter table only public.orden_devolucion_detalle add constraint orden_devolucion_detalle_precio_check CHECK (precio >= 0::numeric);

alter table only public.orden_devoluciones add constraint orden_devoluciones_estado_check CHECK (estado = ANY (ARRAY['Confirmada'::text, 'Anulada'::text]));

alter table only public.orden_devoluciones add constraint orden_devoluciones_monto_devuelto_check CHECK (monto_devuelto > 0::numeric);

alter table only public.orden_devoluciones add constraint orden_devoluciones_monto_neto_check CHECK (monto_neto >= 0::numeric);

alter table only public.orden_devoluciones add constraint orden_devoluciones_peso_devuelto_check CHECK (peso_devuelto >= 0::numeric);

alter table only public.orden_devoluciones add constraint orden_devoluciones_peso_neto_check CHECK (peso_neto >= 0::numeric);

alter table only public.orden_entregas add constraint chk_orden_entrega_resultado CHECK (resultado = ANY (ARRAY['Cobrado'::text, 'Entregado a crédito'::text, 'No entregado'::text, 'Devuelto parcial'::text, 'entregado_cobrado'::text, 'entregado_credito'::text, 'no_entregado'::text, 'devuelto_parcial'::text]));

alter table only public.orden_facturas add constraint chk_orden_factura_cond CHECK (condicion_pago = ANY (ARRAY['Crédito'::text, 'Contado'::text]));

alter table only public.orden_pagos add constraint orden_pagos_monto_check CHECK (monto > 0::numeric);

alter table only public.orden_pesos add constraint chk_orden_peso_tipo CHECK (tipo = ANY (ARRAY['Preparado'::text, 'Facturado'::text, 'Entregado a delivery'::text, 'Devuelto'::text]));

alter table only public.orden_pesos add constraint orden_pesos_libras_check CHECK (libras > 0::numeric);

alter table only public.ordenes add constraint chk_orden_condicion CHECK (condicion_pago = ANY (ARRAY['Crédito'::text, 'Contado'::text]));

alter table only public.ordenes add constraint chk_orden_cxc_estado_v940 CHECK (cxc_estado = ANY (ARRAY['No aplica'::text, 'Pendiente'::text, 'Abonado'::text, 'Pagado'::text]));

alter table only public.ordenes add constraint chk_orden_estado CHECK (estado = ANY (ARRAY['Programada'::text, 'Pendiente por existencia'::text, 'Pedido recibido'::text, 'En preparación'::text, 'Preparado'::text, 'Lista para facturar'::text, 'Impresa para facturar'::text, 'Facturada'::text, 'Lista para validar'::text, 'Validada para ruta'::text, 'Validada para delivery'::text, 'Lista para retiro'::text, 'Entregada en negocio'::text, 'Asignada a delivery'::text, 'En ruta'::text, 'Entregado'::text, 'Entregado a crédito'::text, 'Cobrado'::text, 'No entregado'::text, 'Devuelto parcial'::text, 'Cerrado'::text, 'Anulado'::text])) NOT VALID;

alter table only public.ordenes add constraint ordenes_cliente_nombre_obligatorio_chk CHECK (cliente_nombre_orden IS NOT NULL AND btrim(cliente_nombre_orden) <> ''::text);

alter table only public.ordenes add constraint ordenes_cliente_ocasional_chk CHECK (tipo_cliente_orden <> 'Ocasional'::text OR cliente_id IS NULL AND (modalidad_entrega <> 'Delivery'::text OR NULLIF(btrim(cliente_telefono_orden), ''::text) IS NOT NULL AND NULLIF(btrim(cliente_sector_orden), ''::text) IS NOT NULL AND NULLIF(btrim(cliente_direccion_orden), ''::text) IS NOT NULL));

alter table only public.ordenes add constraint ordenes_cliente_registrado_chk CHECK (tipo_cliente_orden <> 'Registrado'::text OR cliente_id IS NOT NULL);

alter table only public.ordenes add constraint ordenes_delivery_activo_chk CHECK (modalidad_entrega <> 'Delivery'::text OR requiere_delivery = true);

alter table only public.ordenes add constraint ordenes_modalidad_entrega_chk CHECK (modalidad_entrega = ANY (ARRAY['Delivery'::text, 'Retiro en negocio'::text, 'No aplica'::text]));

alter table only public.ordenes add constraint ordenes_retiro_sin_delivery_chk CHECK ((modalidad_entrega <> ALL (ARRAY['Retiro en negocio'::text, 'No aplica'::text])) OR requiere_delivery = false AND delivery_nombre IS NULL);

alter table only public.ordenes add constraint ordenes_tipo_cliente_orden_chk CHECK (tipo_cliente_orden = ANY (ARRAY['Registrado'::text, 'Ocasional'::text, 'Venta interna'::text]));

alter table only public.ordenes add constraint ordenes_venta_interna_chk CHECK (tipo_cliente_orden <> 'Venta interna'::text OR cliente_id IS NULL AND modalidad_entrega = 'Retiro en negocio'::text AND condicion_pago = 'Contado'::text AND requiere_delivery = false);

alter table only public.pedidos add constraint pedidos_monto_check CHECK (monto > 0::numeric);

alter table only public.perfiles add constraint perfiles_tipo_cuenta_check CHECK (tipo_cuenta = ANY (ARRAY['empleado'::text, 'estacion'::text]));

alter table only public.roles_permisos add constraint roles_permisos_nivel_check CHECK (nivel = ANY (ARRAY['none'::text, 'ver'::text, 'editar'::text]));

alter table only public.usuario_modulos add constraint usuario_modulos_nivel_check CHECK (nivel = ANY (ARRAY['none'::text, 'ver'::text, 'editar'::text]));

alter table only public.viajes_delivery add constraint chk_viaje_estado CHECK (estado = ANY (ARRAY['Abierto'::text, 'En ruta'::text, 'Cerrado'::text, 'Anulado'::text]));

alter table only public.abonos add constraint abonos_cobranza_id_fkey FOREIGN KEY (cobranza_id) REFERENCES cobranza(id) ON DELETE CASCADE;

alter table only public.auditoria_excepciones add constraint auditoria_excepciones_orden_id_fkey FOREIGN KEY (orden_id) REFERENCES ordenes(id) ON DELETE SET NULL;

alter table only public.catalogo_items add constraint catalogo_items_catalogo_id_fkey FOREIGN KEY (catalogo_id) REFERENCES catalogos(id) ON DELETE CASCADE;

alter table only public.cobranza add constraint cobranza_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES clientes(id);

alter table only public.cobranza add constraint cobranza_orden_id_fkey FOREIGN KEY (orden_id) REFERENCES ordenes(id);

alter table only public.cobranza add constraint cobranza_pedido_id_fkey FOREIGN KEY (pedido_id) REFERENCES pedidos(id);

alter table only public.cxc_cobro_aplicaciones add constraint cxc_cobro_aplicaciones_cobro_id_fkey FOREIGN KEY (cobro_id) REFERENCES cxc_cobros(id) ON DELETE RESTRICT;

alter table only public.cxc_cobro_aplicaciones add constraint cxc_cobro_aplicaciones_orden_id_fkey FOREIGN KEY (orden_id) REFERENCES ordenes(id) ON DELETE RESTRICT;

alter table only public.cxc_cobros add constraint cxc_cobros_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE RESTRICT;

alter table only public.cxc_cobros add constraint cxc_cobros_creado_por_fkey FOREIGN KEY (creado_por) REFERENCES auth.users(id);

alter table only public.cxc_cobros add constraint cxc_cobros_reversado_por_fkey FOREIGN KEY (reversado_por) REFERENCES auth.users(id);

alter table only public.cxc_eventos add constraint cxc_eventos_cobro_id_fkey FOREIGN KEY (cobro_id) REFERENCES cxc_cobros(id) ON DELETE RESTRICT;

alter table only public.cxc_eventos add constraint cxc_eventos_orden_id_fkey FOREIGN KEY (orden_id) REFERENCES ordenes(id) ON DELETE RESTRICT;

alter table only public.cxc_eventos add constraint cxc_eventos_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES auth.users(id);

alter table only public.entrega_documentos_historial add constraint entrega_documentos_historial_lote_id_fkey FOREIGN KEY (lote_id) REFERENCES entrega_lotes(id) ON DELETE SET NULL;

alter table only public.entrega_documentos_historial add constraint entrega_documentos_historial_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table only public.entrega_lote_correcciones add constraint entrega_lote_correcciones_lote_id_fkey FOREIGN KEY (lote_id) REFERENCES entrega_lotes(id) ON DELETE RESTRICT;

alter table only public.entrega_lote_correcciones add constraint entrega_lote_correcciones_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table only public.entrega_lote_detalle add constraint entrega_lote_detalle_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE SET NULL;

alter table only public.entrega_lote_detalle add constraint entrega_lote_detalle_lote_id_fkey FOREIGN KEY (lote_id) REFERENCES entrega_lotes(id) ON DELETE CASCADE;

alter table only public.entrega_lote_detalle add constraint entrega_lote_detalle_orden_id_fkey FOREIGN KEY (orden_id) REFERENCES ordenes(id) ON DELETE SET NULL;

alter table only public.entrega_lotes add constraint entrega_lotes_corregido_por_fkey FOREIGN KEY (corregido_por) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table only public.entrega_lotes add constraint entrega_lotes_creado_por_fkey FOREIGN KEY (creado_por) REFERENCES auth.users(id);

alter table only public.entrega_lotes add constraint entrega_lotes_lote_origen_id_fkey FOREIGN KEY (lote_origen_id) REFERENCES entrega_lotes(id) ON DELETE SET NULL;

alter table only public.entrega_pedido_transferencias add constraint entrega_pedido_transferencias_lote_destino_id_fkey FOREIGN KEY (lote_destino_id) REFERENCES entrega_lotes(id) ON DELETE RESTRICT;

alter table only public.entrega_pedido_transferencias add constraint entrega_pedido_transferencias_lote_origen_id_fkey FOREIGN KEY (lote_origen_id) REFERENCES entrega_lotes(id) ON DELETE RESTRICT;

alter table only public.entrega_pedido_transferencias add constraint entrega_pedido_transferencias_orden_id_fkey FOREIGN KEY (orden_id) REFERENCES ordenes(id) ON DELETE RESTRICT;

alter table only public.entrega_pedido_transferencias add constraint entrega_pedido_transferencias_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table only public.importaciones_log add constraint importaciones_log_usuario_fkey FOREIGN KEY (usuario) REFERENCES auth.users(id);

alter table only public.liquidacion_lote_detalle add constraint liquidacion_lote_detalle_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE SET NULL;

alter table only public.liquidacion_lote_detalle add constraint liquidacion_lote_detalle_liquidacion_id_fkey FOREIGN KEY (liquidacion_id) REFERENCES liquidaciones_lotes(id) ON DELETE CASCADE;

alter table only public.liquidacion_lote_detalle add constraint liquidacion_lote_detalle_orden_id_fkey FOREIGN KEY (orden_id) REFERENCES ordenes(id) ON DELETE SET NULL;

alter table only public.liquidacion_lote_eventos add constraint liquidacion_lote_eventos_liquidacion_id_fkey FOREIGN KEY (liquidacion_id) REFERENCES liquidaciones_lotes(id) ON DELETE SET NULL;

alter table only public.liquidacion_lote_eventos add constraint liquidacion_lote_eventos_lote_id_fkey FOREIGN KEY (lote_id) REFERENCES entrega_lotes(id) ON DELETE SET NULL;

alter table only public.liquidacion_lote_eventos add constraint liquidacion_lote_eventos_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table only public.liquidaciones_lotes add constraint liquidaciones_lotes_creado_por_fkey FOREIGN KEY (creado_por) REFERENCES auth.users(id);

alter table only public.liquidaciones_lotes add constraint liquidaciones_lotes_lote_id_fkey FOREIGN KEY (lote_id) REFERENCES entrega_lotes(id) ON DELETE SET NULL;

alter table only public.llamadas add constraint llamadas_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE;

alter table only public.orden_archivos_v9383 add constraint orden_archivos_v9383_orden_id_fkey FOREIGN KEY (orden_id) REFERENCES ordenes(id) ON DELETE RESTRICT;

alter table only public.orden_archivos_v9383 add constraint orden_archivos_v9383_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES auth.users(id);

alter table only public.orden_casos_historial add constraint orden_casos_historial_orden_id_fkey FOREIGN KEY (orden_id) REFERENCES ordenes(id) ON DELETE CASCADE;

alter table only public.orden_detalle add constraint orden_detalle_orden_id_fkey FOREIGN KEY (orden_id) REFERENCES ordenes(id) ON DELETE CASCADE;

alter table only public.orden_detalle add constraint orden_detalle_producto_id_fkey FOREIGN KEY (producto_id) REFERENCES productos_despacho(id);

alter table only public.orden_devolucion_detalle add constraint orden_devolucion_detalle_devolucion_id_fkey FOREIGN KEY (devolucion_id) REFERENCES orden_devoluciones(id) ON DELETE RESTRICT;

alter table only public.orden_devolucion_detalle add constraint orden_devolucion_detalle_orden_detalle_id_fkey FOREIGN KEY (orden_detalle_id) REFERENCES orden_detalle(id) ON DELETE RESTRICT;

alter table only public.orden_devoluciones add constraint orden_devoluciones_creado_por_fkey FOREIGN KEY (creado_por) REFERENCES auth.users(id);

alter table only public.orden_devoluciones add constraint orden_devoluciones_orden_id_fkey FOREIGN KEY (orden_id) REFERENCES ordenes(id) ON DELETE RESTRICT;

alter table only public.orden_entregas add constraint orden_entregas_creado_por_fkey FOREIGN KEY (creado_por) REFERENCES auth.users(id);

alter table only public.orden_entregas add constraint orden_entregas_orden_id_fkey FOREIGN KEY (orden_id) REFERENCES ordenes(id) ON DELETE CASCADE;

alter table only public.orden_estados_historial add constraint orden_estados_historial_orden_id_fkey FOREIGN KEY (orden_id) REFERENCES ordenes(id) ON DELETE CASCADE;

alter table only public.orden_estados_historial add constraint orden_estados_historial_usuario_fkey FOREIGN KEY (usuario) REFERENCES auth.users(id);

alter table only public.orden_facturas add constraint orden_facturas_creado_por_fkey FOREIGN KEY (creado_por) REFERENCES auth.users(id);

alter table only public.orden_facturas add constraint orden_facturas_orden_id_fkey FOREIGN KEY (orden_id) REFERENCES ordenes(id) ON DELETE CASCADE;

alter table only public.orden_pagos add constraint orden_pagos_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES clientes(id);

alter table only public.orden_pagos add constraint orden_pagos_cxc_cobro_id_fkey FOREIGN KEY (cxc_cobro_id) REFERENCES cxc_cobros(id) ON DELETE RESTRICT;

alter table only public.orden_pagos add constraint orden_pagos_orden_id_fkey FOREIGN KEY (orden_id) REFERENCES ordenes(id) ON DELETE CASCADE;

alter table only public.orden_pagos add constraint orden_pagos_recibido_por_fkey FOREIGN KEY (recibido_por) REFERENCES auth.users(id);

alter table only public.orden_pagos add constraint orden_pagos_reversado_por_fkey FOREIGN KEY (reversado_por) REFERENCES auth.users(id);

alter table only public.orden_pesos add constraint orden_pesos_creado_por_fkey FOREIGN KEY (creado_por) REFERENCES auth.users(id);

alter table only public.orden_pesos add constraint orden_pesos_orden_id_fkey FOREIGN KEY (orden_id) REFERENCES ordenes(id) ON DELETE CASCADE;

alter table only public.ordenes add constraint ordenes_actualizado_por_fkey FOREIGN KEY (actualizado_por) REFERENCES auth.users(id);

alter table only public.ordenes add constraint ordenes_archivada_por_fkey FOREIGN KEY (archivada_por) REFERENCES auth.users(id);

alter table only public.ordenes add constraint ordenes_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES clientes(id);

alter table only public.ordenes add constraint ordenes_creado_por_fkey FOREIGN KEY (creado_por) REFERENCES auth.users(id);

alter table only public.ordenes add constraint ordenes_impreso_por_fkey FOREIGN KEY (impreso_por) REFERENCES auth.users(id);

alter table only public.ordenes add constraint ordenes_impreso_preparacion_por_fkey FOREIGN KEY (impreso_preparacion_por) REFERENCES auth.users(id);

alter table only public.ordenes add constraint ordenes_liberado_existencia_por_fkey FOREIGN KEY (liberado_existencia_por) REFERENCES auth.users(id);

alter table only public.ordenes add constraint ordenes_liberado_por_fkey FOREIGN KEY (liberado_por) REFERENCES auth.users(id);

alter table only public.ordenes add constraint ordenes_llamada_id_fkey FOREIGN KEY (llamada_id) REFERENCES llamadas(id);

alter table only public.ordenes add constraint ordenes_orden_origen_id_fkey FOREIGN KEY (orden_origen_id) REFERENCES ordenes(id) ON DELETE RESTRICT;

alter table only public.ordenes add constraint ordenes_pedido_crm_id_fkey FOREIGN KEY (pedido_crm_id) REFERENCES pedidos(id);

alter table only public.ordenes add constraint ordenes_programada_por_fkey FOREIGN KEY (programada_por) REFERENCES auth.users(id);

alter table only public.ordenes add constraint ordenes_tomado_por_empleado_fk FOREIGN KEY (tomado_por_empleado_id) REFERENCES empleados_operativos(id) ON DELETE SET NULL;

alter table only public.ordenes add constraint ordenes_tomado_por_user_fkey FOREIGN KEY (tomado_por_user) REFERENCES auth.users(id);

alter table only public.pedidos add constraint pedidos_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES clientes(id);

alter table only public.pedidos add constraint pedidos_llamada_id_fkey FOREIGN KEY (llamada_id) REFERENCES llamadas(id);

alter table only public.perfiles add constraint perfiles_empleado_id_fkey FOREIGN KEY (empleado_id) REFERENCES empleados_operativos(id) ON UPDATE CASCADE ON DELETE SET NULL;

alter table only public.perfiles add constraint perfiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table only public.sistema_configuracion add constraint sistema_configuracion_actualizado_por_fkey FOREIGN KEY (actualizado_por) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table only public.sistema_configuracion_historial_v9390 add constraint sistema_configuracion_historial_v9390_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES auth.users(id);

alter table only public.usuario_modulos add constraint usuario_modulos_modulo_fkey FOREIGN KEY (modulo) REFERENCES modulos_sistema(id) ON DELETE CASCADE;

alter table only public.usuario_modulos add constraint usuario_modulos_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table only public.viaje_ordenes add constraint viaje_ordenes_orden_id_fkey FOREIGN KEY (orden_id) REFERENCES ordenes(id) ON DELETE CASCADE;

alter table only public.viaje_ordenes add constraint viaje_ordenes_viaje_id_fkey FOREIGN KEY (viaje_id) REFERENCES viajes_delivery(id) ON DELETE CASCADE;

alter table only public.viajes_delivery add constraint viajes_delivery_creado_por_fkey FOREIGN KEY (creado_por) REFERENCES auth.users(id);

-- -----------------------------------------------------------------------------
-- Propiedad de secuencias
-- -----------------------------------------------------------------------------

alter sequence public.entrega_documentos_historial_id_seq owned by public.entrega_documentos_historial.id;

alter sequence public.entrega_lote_correcciones_id_seq owned by public.entrega_lote_correcciones.id;

alter sequence public.entrega_lote_detalle_id_seq owned by public.entrega_lote_detalle.id;

alter sequence public.entrega_lotes_id_seq owned by public.entrega_lotes.id;

alter sequence public.entrega_pedido_transferencias_id_seq owned by public.entrega_pedido_transferencias.id;

alter sequence public.liquidacion_lote_detalle_id_seq owned by public.liquidacion_lote_detalle.id;

alter sequence public.liquidacion_lote_eventos_id_seq owned by public.liquidacion_lote_eventos.id;

alter sequence public.liquidaciones_lotes_id_seq owned by public.liquidaciones_lotes.id;

alter sequence public.orden_casos_historial_id_seq owned by public.orden_casos_historial.id;

alter sequence public.usuarios_permisos_historial_id_seq owned by public.usuarios_permisos_historial.id;

-- -----------------------------------------------------------------------------
-- Comentarios de esquema
-- -----------------------------------------------------------------------------

comment on column public.empleados_operativos.areas_adicionales is 'Áreas donde el empleado también puede operar sin cambiar su área principal, rol ni permisos del CRM.';

comment on column public.entrega_lotes.hoja_ruta_snapshot is 'Fotografía inmutable de los datos usados al crear la hoja de ruta: empresa, delivery, validador, clientes, facturas, montos y pesos.';

comment on column public.entrega_lotes.cantidad_reimpresiones is 'Cantidad de reimpresiones registradas desde el historial de Validación.';

comment on column public.orden_detalle.peso_equivalente_preparado is 'Peso en libras calculado por Carnicería según la configuración de despacho del producto';

comment on column public.orden_detalle.permite_fraccion is 'Snapshot de la regla del producto al crear la orden; Carnicería bloquea fracciones cuando es false';

comment on table public.orden_transiciones_v9382 is 'Transiciones operativas autorizadas V9.3.8.2.';

comment on column public.ordenes.tipo_orden is 'Pedido normal, Devolución / recogida, Cambio / sustitución o Incidente / reclamo.';

comment on column public.ordenes.requiere_preparacion is 'Indica si la orden debe aparecer en Carnicería.';

comment on column public.ordenes.requiere_facturacion is 'Indica si la orden debe pasar por Facturación.';

comment on column public.ordenes.requiere_delivery is 'Indica si requiere asignación a delivery o ruta.';

comment on column public.ordenes.accion_operativa is 'Nota corta para casos especiales: recoger, cambiar, revisar reclamo, etc.';

comment on column public.ordenes.modalidad_entrega is 'Delivery, Retiro en negocio o No aplica. Es independiente del tipo de orden.';

comment on column public.ordenes.tipo_cliente_orden is 'Registrado o Venta interna. La venta interna no crea ficha en clientes.';

comment on column public.ordenes.cliente_nombre_orden is 'Copia histórica obligatoria del nombre del cliente/comprador al crear la orden.';

comment on column public.ordenes.retirado_por is 'Nombre de la persona que retiró la mercancía en el negocio.';

comment on column public.ordenes.entregado_mostrador_por is 'Empleado o usuario que entregó la mercancía en el mostrador.';

comment on column public.ordenes.entregado_mostrador_en is 'Fecha y hora de confirmación de la entrega en el negocio.';

comment on column public.ordenes.notas_retiro is 'Observación de la entrega en mostrador: autorización, cédula, vehículo u otro detalle.';

comment on column public.ordenes.cliente_direccion_orden is 'Snapshot de dirección usado por la orden; permite clientes ocasionales y conserva historial.';

comment on column public.ordenes.cliente_referencia_orden is 'Referencia de ubicación vigente al crear o editar la orden.';

comment on column public.ordenes.tomado_por_empleado_id is 'Empleado real que tomó el pedido, incluso cuando se utilizó una cuenta compartida de estación.';

comment on column public.perfiles.empleado_id is 'Empleado operativo real vinculado al usuario. Un empleado solo puede pertenecer a un usuario.';

comment on column public.perfiles.tipo_cuenta is 'empleado = acceso personal; estacion = acceso compartido sin persona vinculada.';

comment on column public.productos_despacho.tipo_despacho_peso is 'Por libra, Unidad peso fijo, Unidad peso variable o No pesa';

comment on column public.productos_despacho.peso_estandar_lb is 'Libras equivalentes por cada unidad cuando el tipo es Unidad peso fijo';

comment on column public.productos_despacho.permite_fraccion is 'Si es false, el producto no se despacha al granel: solo cantidades enteras (1,2,3...)';

-- -----------------------------------------------------------------------------
-- Funciones propias restantes
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.mi_rol()
 RETURNS rol_usuario
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r text;
  salida public.rol_usuario;
BEGIN
  SELECT p.rol::text INTO r
  FROM public.perfiles p
  WHERE p.id = auth.uid()
  LIMIT 1;

  IF r IS NULL OR length(trim(r)) = 0 THEN
    RETURN NULL;
  END IF;

  IF r = ANY (enum_range(NULL::public.rol_usuario)::text[]) THEN
    EXECUTE 'SELECT $1::public.rol_usuario' INTO salida USING r;
    RETURN salida;
  END IF;

  RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.mi_vendedor()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select vendedor from public.perfiles where id = auth.uid();
$function$
;

CREATE OR REPLACE FUNCTION public.agenda_del_dia(p_fecha date)
 RETURNS SETOF clientes
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select * from public.clientes c
  where c.archivado = false
    and c.estado = 'Activo'
    and c.dia_contacto = (array['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'])[extract(dow from p_fecha)::int + 1]
    and not exists (                     -- oculta los ya gestionados ese día
      select 1 from public.llamadas l where l.cliente_id = c.id and l.fecha = p_fecha
    );
$function$
;

CREATE OR REPLACE FUNCTION public.fn_tras_llamada()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_auditar()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_ref text;
begin
  begin
    v_ref := coalesce((to_jsonb(new)->>'codigo'), (to_jsonb(new)->>'id'), (to_jsonb(old)->>'id'));
  exception when others then v_ref := null;
  end;
  insert into public.auditoria (usuario, accion, entidad, registro, detalle)
  values (auth.uid(), tg_op, tg_table_name, v_ref, to_jsonb(coalesce(new, old)));
  return coalesce(new, old);
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_nuevo_perfil()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.perfiles (id, nombre, rol, activo)
  values (new.id, coalesce(new.raw_user_meta_data->>'nombre', new.email), 'Vendedor', true)
  on conflict (id) do nothing;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.cfg_int(p_clave text, p_def integer)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(
    nullif(regexp_replace(coalesce((select valor from public.config where clave = p_clave), ''), '[^0-9]', '', 'g'), '')::int,
    p_def);
$function$
;

CREATE OR REPLACE FUNCTION public.fn_llamada_upd()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_orden_set_actualizado()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  new.actualizado_en = now();
  new.actualizado_por = auth.uid();
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_auditar_orden()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  insert into public.orden_auditoria(usuario, entidad, registro, accion, detalle)
  values (auth.uid(), tg_table_name, coalesce(new.id::text, old.id::text), tg_op, to_jsonb(coalesce(new, old)));
  return coalesce(new, old);
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_orden_desde_llamada()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_orden_programacion_flags()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_hoy_rd date:=timezone('America/Santo_Domingo',now())::date;
  v_fecha_cambio boolean:=false;
  v_hora_cambio boolean:=false;
  v_programacion_cambio boolean:=false;
  v_futura boolean:=false;
  v_final boolean:=false;
  v_preoperativa boolean:=false;
  v_es_admin boolean:=false;
begin
  if new.fecha_despacho is null then
    new.fecha_despacho:=coalesce(new.fecha,v_hoy_rd);
  end if;

  if tg_op='INSERT' then
    v_fecha_cambio:=true;
    v_hora_cambio:=new.hora_despacho is not null;
    v_preoperativa:=true;
  else
    v_fecha_cambio:=new.fecha_despacho is distinct from old.fecha_despacho;
    v_hora_cambio:=new.hora_despacho is distinct from old.hora_despacho;
    v_preoperativa:=old.estado in('Programada','Pedido recibido');
    v_es_admin:=public.es_admin_operativo();
  end if;

  v_programacion_cambio:=v_fecha_cambio or v_hora_cambio;
  v_futura:=new.fecha_despacho>v_hoy_rd;
  v_final:=coalesce(new.estado,'') in(
    'Anulado','Cerrado','Cobrado','Entregado a crédito','No entregado',
    'Devuelto parcial','Entregada en negocio'
  );

  if tg_op='INSERT' then
    new.es_programada:=v_futura;
    if v_futura and not v_final then
      new.estado:='Programada';
      new.fecha_programacion:=coalesce(new.fecha_programacion,now());
    elsif new.estado='Programada' then
      new.estado:='Pedido recibido';
    end if;
    return new;
  end if;

  if v_programacion_cambio then
    if not v_preoperativa then
      if not v_es_admin then
        raise exception
          'La fecha de una orden procesada está protegida. Solicita una corrección administrativa.';
      end if;
      if v_futura then
        raise exception
          'Una orden procesada no puede reprogramarse a una fecha futura.';
      end if;
      new.es_programada:=false;
      return new;
    end if;

    new.es_programada:=v_futura;
    if v_futura and not v_final then
      new.estado:='Programada';
      new.fecha_programacion:=coalesce(new.fecha_programacion,now());
      new.programada_por:=coalesce(new.programada_por,auth.uid());
    elsif not v_futura and new.estado='Programada' then
      new.estado:='Pedido recibido';
    end if;
    return new;
  end if;

  new.es_programada:=v_futura;
  if v_futura and not v_final and new.estado<>'Programada' then
    raise exception
      'La orden está programada para %. Podrá tomarse cuando llegue esa fecha.',
      new.fecha_despacho;
  end if;
  if not v_futura and new.estado='Programada' then
    new.estado:='Pedido recibido';
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.mi_rol_text()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p.rol::text
  FROM public.perfiles p
  WHERE p.id = auth.uid()
  LIMIT 1;
$function$
;

CREATE OR REPLACE FUNCTION public.modulo_nivel_actual(p_modulo text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rol text;
  v_override text;
  v_base text;
BEGIN
  SELECT p.rol::text
    INTO v_rol
  FROM public.perfiles p
  WHERE p.id = auth.uid()
    AND COALESCE(p.activo,true) = true
  LIMIT 1;

  IF v_rol IS NULL OR length(trim(v_rol)) = 0 THEN
    RETURN 'none';
  END IF;

  IF v_rol = 'Gerente' THEN
    RETURN 'editar';
  END IF;

  SELECT um.nivel
    INTO v_override
  FROM public.usuario_modulos um
  WHERE um.usuario_id = auth.uid()
    AND um.modulo = p_modulo
  LIMIT 1;

  IF v_override IS NOT NULL THEN
    RETURN COALESCE(v_override,'none');
  END IF;

  SELECT rp.nivel
    INTO v_base
  FROM public.roles_permisos rp
  WHERE rp.rol = v_rol
    AND rp.modulo = p_modulo
  LIMIT 1;

  RETURN COALESCE(v_base,'none');
END;
$function$
;

CREATE OR REPLACE FUNCTION public.tiene_modulo(p_modulo text, p_requerido text DEFAULT 'ver'::text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_nivel text;
BEGIN
  v_nivel := public.modulo_nivel_actual(p_modulo);

  IF p_requerido = 'editar' THEN
    RETURN v_nivel = 'editar';
  END IF;

  RETURN v_nivel IN ('ver','editar');
END;
$function$
;

CREATE OR REPLACE FUNCTION public.tiene_algun_modulo(p_modulos text[], p_requerido text DEFAULT 'ver'::text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM unnest(p_modulos) AS m
    WHERE public.tiene_modulo(m, p_requerido)
  );
$function$
;

CREATE OR REPLACE FUNCTION public.es_admin_operativo()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(public.mi_rol_text() IN ('Gerente','Administrador') OR public.tiene_modulo('config','editar'), false);
$function$
;

CREATE OR REPLACE FUNCTION public.puede_modulo_v930r5(p_modulo text, p_nivel text DEFAULT 'ver'::text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.sincronizar_perfil_empleado_v930r9()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.perfiles
  set nombre=new.nombre,
      vendedor=new.nombre,
      activo=case when new.activo=false then false else activo end,
      actualizado_en=now()
  where empleado_id=new.id;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.puede_configurar_usuarios_v9214()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.perfiles p
    where p.id=auth.uid()
      and coalesce(p.activo,true)=true
      and (
        p.rol='Gerente'
        or coalesce(
          (select um.nivel from public.usuario_modulos um where um.usuario_id=p.id and um.modulo='config' limit 1),
          (select rp.nivel from public.roles_permisos rp where rp.rol=p.rol and rp.modulo='config' limit 1),
          'none'
        )='editar'
      )
  );
$function$
;

CREATE OR REPLACE FUNCTION public.actualizar_usuario_permisos_v930r9(p_usuario_id uuid, p_nombre text, p_rol text, p_activo boolean, p_vendedor text, p_empleado_id bigint, p_tipo_cuenta text, p_modulos jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_antes jsonb;
  v_despues jsonb;
  v_config_final text;
  v_empleado public.empleados_operativos%rowtype;
  v_nombre_final text;
  v_vendedor_final text;
begin
  if auth.uid() is null then
    raise exception 'Sesión no válida';
  end if;

  if not public.puede_configurar_usuarios_v9214() then
    raise exception 'No tienes permiso para editar usuarios';
  end if;

  if p_usuario_id is null or not exists(select 1 from public.perfiles where id=p_usuario_id) then
    raise exception 'El perfil indicado no existe';
  end if;

  if nullif(trim(coalesce(p_rol,'')),'') is null then
    raise exception 'El rol es obligatorio';
  end if;

  if coalesce(p_tipo_cuenta,'') not in ('empleado','estacion') then
    raise exception 'Tipo de cuenta no válido';
  end if;

  if jsonb_typeof(coalesce(p_modulos,'[]'::jsonb)) <> 'array' then
    raise exception 'p_modulos debe ser un arreglo JSON';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(coalesce(p_modulos,'[]'::jsonb)) as x(modulo text,nivel text)
    where x.nivel not in ('none','ver','editar')
       or not exists(select 1 from public.modulos_sistema m where m.id=x.modulo)
  ) then
    raise exception 'Existe un módulo o nivel de permiso no válido';
  end if;

  if p_tipo_cuenta='empleado' then
    if p_empleado_id is null then
      raise exception 'Selecciona el empleado vinculado';
    end if;

    select * into v_empleado
    from public.empleados_operativos
    where id=p_empleado_id;

    if not found then
      raise exception 'El empleado seleccionado no existe';
    end if;

    if coalesce(p_activo,true)=true and v_empleado.activo=false then
      raise exception 'No se puede activar un usuario vinculado a un empleado inactivo';
    end if;

    if exists (
      select 1
      from public.perfiles p
      where p.empleado_id=p_empleado_id
        and p.id<>p_usuario_id
    ) then
      raise exception 'Ese empleado ya está vinculado a otro usuario';
    end if;

    v_nombre_final:=trim(v_empleado.nombre);
    v_vendedor_final:=trim(v_empleado.nombre);
  else
    if p_empleado_id is not null then
      raise exception 'Una cuenta de estación no puede tener empleado vinculado';
    end if;
    if nullif(trim(coalesce(p_nombre,'')),'') is null then
      raise exception 'Escribe el nombre de la estación';
    end if;
    v_nombre_final:=trim(p_nombre);
    v_vendedor_final:=nullif(trim(coalesce(p_vendedor,'')),'');
  end if;

  if p_usuario_id=auth.uid() and coalesce(p_activo,false)=false then
    raise exception 'No puedes desactivar tu propia cuenta';
  end if;

  select jsonb_build_object(
    'perfil',to_jsonb(p),
    'modulos',coalesce((select jsonb_agg(to_jsonb(um) order by um.modulo) from public.usuario_modulos um where um.usuario_id=p.id),'[]'::jsonb)
  ) into v_antes
  from public.perfiles p
  where p.id=p_usuario_id;

  if p_rol='Gerente' then
    v_config_final:='editar';
  else
    select coalesce(
      (select x.nivel from jsonb_to_recordset(coalesce(p_modulos,'[]'::jsonb)) as x(modulo text,nivel text) where x.modulo='config' limit 1),
      (select rp.nivel from public.roles_permisos rp where rp.rol=p_rol and rp.modulo='config' limit 1),
      'none'
    ) into v_config_final;
  end if;

  if p_usuario_id=auth.uid() and v_config_final<>'editar' then
    raise exception 'No puedes quitarte Configuración = Editar desde tu propia sesión';
  end if;

  update public.perfiles
  set nombre=v_nombre_final,
      rol=trim(p_rol),
      activo=coalesce(p_activo,true),
      vendedor=v_vendedor_final,
      empleado_id=case when p_tipo_cuenta='empleado' then p_empleado_id else null end,
      tipo_cuenta=p_tipo_cuenta,
      actualizado_en=now()
  where id=p_usuario_id;

  delete from public.usuario_modulos
  where usuario_id=p_usuario_id;

  if p_rol<>'Gerente' then
    insert into public.usuario_modulos(usuario_id,modulo,nivel,actualizado_en)
    select p_usuario_id,x.modulo,x.nivel,now()
    from jsonb_to_recordset(coalesce(p_modulos,'[]'::jsonb)) as x(modulo text,nivel text)
    on conflict (usuario_id,modulo) do update
      set nivel=excluded.nivel,
          actualizado_en=now();
  end if;

  select jsonb_build_object(
    'perfil',to_jsonb(p),
    'empleado',case when p.empleado_id is null then null else (select to_jsonb(e) from public.empleados_operativos e where e.id=p.empleado_id) end,
    'modulos',coalesce((select jsonb_agg(to_jsonb(um) order by um.modulo) from public.usuario_modulos um where um.usuario_id=p.id),'[]'::jsonb)
  ) into v_despues
  from public.perfiles p
  where p.id=p_usuario_id;

  insert into public.usuarios_permisos_historial(usuario_objetivo,cambiado_por,antes,despues)
  values(p_usuario_id,auth.uid(),v_antes,v_despues);

  return jsonb_build_object(
    'ok',true,
    'usuario_id',p_usuario_id,
    'empleado_id',case when p_tipo_cuenta='empleado' then p_empleado_id else null end,
    'tipo_cuenta',p_tipo_cuenta,
    'config_final',v_config_final
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.pc_normalizar_flujo_orden_v933()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_negocio text;
  v_telefono text;
  v_sector text;
  v_direccion text;
  v_referencia text;
begin
  new.tipo_cliente_orden := coalesce(nullif(btrim(new.tipo_cliente_orden), ''), 'Registrado');
  new.modalidad_entrega := coalesce(nullif(btrim(new.modalidad_entrega), ''), 'Delivery');

  if new.tipo_cliente_orden not in ('Registrado', 'Ocasional', 'Venta interna') then
    raise exception 'Tipo de cliente de orden no válido: %', new.tipo_cliente_orden;
  end if;

  if new.modalidad_entrega not in ('Delivery', 'Retiro en negocio', 'No aplica') then
    raise exception 'Modalidad de entrega no válida: %', new.modalidad_entrega;
  end if;

  if new.tipo_cliente_orden = 'Registrado' then
    if new.cliente_id is null then
      raise exception 'Una orden de cliente registrado requiere cliente_id.';
    end if;

    select c.negocio, c.telefono, c.sector, c.direccion, c.referencia
      into v_negocio, v_telefono, v_sector, v_direccion, v_referencia
    from public.clientes c
    where c.id = new.cliente_id;

    if not found then
      raise exception 'No existe el cliente registrado con id %.', new.cliente_id;
    end if;

    if tg_op = 'INSERT' or new.cliente_id is distinct from old.cliente_id then
      new.cliente_nombre_orden := coalesce(nullif(btrim(new.cliente_nombre_orden), ''), nullif(btrim(v_negocio), ''));
      new.cliente_telefono_orden := coalesce(nullif(btrim(new.cliente_telefono_orden), ''), nullif(btrim(v_telefono), ''));
      new.cliente_sector_orden := coalesce(nullif(btrim(new.cliente_sector_orden), ''), nullif(btrim(v_sector), ''));
      new.cliente_direccion_orden := coalesce(nullif(btrim(new.cliente_direccion_orden), ''), nullif(btrim(v_direccion), ''));
      new.cliente_referencia_orden := coalesce(nullif(btrim(new.cliente_referencia_orden), ''), nullif(btrim(v_referencia), ''));
    end if;
  elsif new.tipo_cliente_orden = 'Venta interna' then
    new.cliente_id := null;
    new.modalidad_entrega := 'Retiro en negocio';
    new.condicion_pago := 'Contado';
    new.requiere_delivery := false;
    new.delivery_nombre := null;
    new.cliente_sector_orden := coalesce(nullif(btrim(new.cliente_sector_orden), ''), 'Mostrador');
  else
    new.cliente_id := null;
    if new.modalidad_entrega = 'Delivery' then
      if nullif(btrim(new.cliente_telefono_orden), '') is null
         or nullif(btrim(new.cliente_sector_orden), '') is null
         or nullif(btrim(new.cliente_direccion_orden), '') is null then
        raise exception 'Cliente ocasional con delivery requiere teléfono, sector y dirección.';
      end if;
      new.requiere_delivery := true;
    end if;
  end if;

  new.cliente_nombre_orden := nullif(btrim(new.cliente_nombre_orden), '');
  new.cliente_telefono_orden := nullif(btrim(new.cliente_telefono_orden), '');
  new.cliente_sector_orden := nullif(btrim(new.cliente_sector_orden), '');
  new.cliente_direccion_orden := nullif(btrim(new.cliente_direccion_orden), '');
  new.cliente_referencia_orden := nullif(btrim(new.cliente_referencia_orden), '');

  if new.cliente_nombre_orden is null then
    raise exception 'El nombre del cliente o comprador es obligatorio.';
  end if;

  if new.modalidad_entrega in ('Retiro en negocio', 'No aplica') then
    new.requiere_delivery := false;
    new.delivery_nombre := null;
  else
    new.requiere_delivery := true;
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.corregir_lote_entrega_v936(p_lote_id bigint, p_accion text, p_nuevo_delivery text DEFAULT NULL::text, p_motivo text DEFAULT NULL::text, p_usuario_nombre text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_lote public.entrega_lotes%rowtype;
  v_order_ids bigint[];
  v_blocked integer := 0;
  v_user_name text;
  v_user_role text;
  v_now timestamptz := now();
  v_new_name text := regexp_replace(trim(coalesce(p_nuevo_delivery,'')),'[[:space:]]+',' ','g');
  v_new_type text;
  v_employee_id bigint;
begin
  if not public.puede_modulo_v930r5('validacion','editar') then
    raise exception 'No tienes permiso para corregir lotes.';
  end if;
  if p_accion not in ('cambiar_delivery','revertir_lote') then
    raise exception 'Acción de corrección inválida.';
  end if;
  if length(trim(coalesce(p_motivo,''))) < 5 then
    raise exception 'El motivo debe tener al menos 5 caracteres.';
  end if;

  select * into v_lote from public.entrega_lotes where id=p_lote_id for update;
  if not found then raise exception 'No se encontró el lote.'; end if;
  if lower(coalesce(v_lote.estado,'Abierto')) <> 'abierto' then
    raise exception 'El lote está % y no puede corregirse.', v_lote.estado;
  end if;
  if exists(
    select 1 from public.liquidaciones_lotes
    where lote_id=v_lote.id or upper(codigo_lote)=upper(v_lote.codigo_lote)
  ) then
    raise exception 'El lote ya tiene una liquidación registrada.';
  end if;

  select array_agg(d.orden_id order by d.id) into v_order_ids
  from public.entrega_lote_detalle d
  where d.lote_id=v_lote.id and d.orden_id is not null;
  if coalesce(array_length(v_order_ids,1),0)=0 then
    raise exception 'El lote no tiene órdenes formales vinculadas.';
  end if;

  select count(*) into v_blocked
  from public.ordenes o
  where o.id=any(v_order_ids)
    and (
      o.recibido_en is not null
      or nullif(trim(coalesce(o.resultado_entrega,'')),'') is not null
      or o.estado in ('Cobrado','Entregado a crédito','No entregado','Devuelto parcial','Cerrado','Liquidado')
    );
  if v_blocked>0 then
    raise exception 'El lote ya tiene resultado, cobro o recepción posterior.';
  end if;

  select
    coalesce(nullif(trim(p_usuario_nombre),''),nullif(trim(p.nombre),''),'Usuario'),
    p.rol
  into v_user_name,v_user_role
  from public.perfiles p
  where p.id=auth.uid();
  v_user_name:=coalesce(v_user_name,nullif(trim(p_usuario_nombre),''),'Usuario');

  if p_accion='cambiar_delivery' then
    if v_new_name='' then raise exception 'Selecciona el nuevo responsable.'; end if;
    if lower(v_new_name)=lower(trim(coalesce(v_lote.responsable_nombre,v_lote.delivery_nombre,''))) then
      raise exception 'Selecciona un responsable diferente.';
    end if;

    select e.id,
      case when lower(coalesce(e.area,'')) like '%delivery%'
        then 'delivery_registrado' else 'otro_empleado' end
    into v_employee_id,v_new_type
    from public.empleados_operativos e
    where e.activo is not false and lower(trim(e.nombre))=lower(v_new_name)
    order by e.id limit 1;
    v_new_type:=coalesce(v_new_type,'manual_externo');

    update public.entrega_lotes
    set delivery_nombre=v_new_name,
        responsable_nombre=v_new_name,
        responsable_tipo=v_new_type,
        responsable_empleado_id=v_employee_id,
        corregido_en=v_now,
        corregido_por=auth.uid(),
        motivo_correccion=trim(p_motivo),
        hoja_ruta_snapshot=jsonb_set(
          jsonb_set(
            jsonb_set(coalesce(hoja_ruta_snapshot,'{}'::jsonb),'{delivery_nombre}',to_jsonb(v_new_name),true),
            '{responsable_nombre}',to_jsonb(v_new_name),true
          ),
          '{responsable_tipo}',to_jsonb(v_new_type),true
        )
    where id=v_lote.id;

    update public.ordenes
    set delivery_nombre=v_new_name,
        notas_validacion=concat_ws(' | ',nullif(trim(notas_validacion),''),
          'Responsable corregido V9.3.7.8: '||v_new_name||' ('||v_new_type||'). Motivo: '||trim(p_motivo))
    where id=any(v_order_ids);
  else
    insert into public.orden_estados_historial(
      orden_id,estado_anterior,estado_nuevo,comentario,usuario
    )
    select o.id,o.estado,'Facturada',
      'Lote '||v_lote.codigo_lote||' revertido desde Validación. Motivo: '||trim(p_motivo),
      auth.uid()
    from public.ordenes o
    where o.id=any(v_order_ids);

    update public.ordenes
    set estado='Facturada',
        delivery_nombre=null,
        asignado_delivery_en=null,
        resultado_entrega=null,
        monto_cobrado=0,
        monto_pendiente=0,
        recibido_en=null,
        notas_validacion=concat_ws(' | ',nullif(trim(notas_validacion),''),
          'Corrección V9.3.7.8: lote '||v_lote.codigo_lote||' revertido. Motivo: '||trim(p_motivo))
    where id=any(v_order_ids);

    update public.entrega_lotes
    set estado='Revertido',
        corregido_en=v_now,
        corregido_por=auth.uid(),
        motivo_correccion=trim(p_motivo),
        hoja_ruta_snapshot=jsonb_set(
          coalesce(hoja_ruta_snapshot,'{}'::jsonb),
          '{estado}',to_jsonb('Revertido'::text),true
        )
    where id=v_lote.id;

    insert into public.auditoria_excepciones(
      usuario_id,usuario_nombre,usuario_rol,modulo,tipo_evento,gravedad,
      accion,motivo,lote_codigo,detalle,dispositivo
    )
    values(
      auth.uid(),v_user_name,v_user_role,'Validación','Reversión de lote de entrega','Crítica',
      'Revirtió lote y devolvió órdenes a Validación',trim(p_motivo),v_lote.codigo_lote,
      jsonb_build_object(
        'lote_id',v_lote.id,
        'orden_ids',v_order_ids,
        'cantidad_ordenes',coalesce(array_length(v_order_ids,1),0),
        'responsable_anterior',coalesce(v_lote.responsable_nombre,v_lote.delivery_nombre),
        'estado_anterior',v_lote.estado,
        'estado_nuevo','Revertido',
        'ordenes_estado_nuevo','Facturada'
      ),
      'RPC corregir_lote_entrega_v936'
    );
  end if;

  insert into public.entrega_lote_correcciones(
    lote_id,codigo_lote,accion,delivery_anterior,delivery_nuevo,motivo,
    usuario_id,usuario_nombre,metadata
  )
  values(
    v_lote.id,v_lote.codigo_lote,p_accion,
    coalesce(v_lote.responsable_nombre,v_lote.delivery_nombre),
    case when p_accion='cambiar_delivery' then v_new_name else null end,
    trim(p_motivo),auth.uid(),v_user_name,
    jsonb_build_object(
      'orden_ids',v_order_ids,
      'estado_anterior',v_lote.estado,
      'responsable_tipo_nuevo',v_new_type,
      'monto_pendiente_restablecido',case when p_accion='revertir_lote' then 0 else null end
    )
  );

  return jsonb_build_object(
    'ok',true,'lote_id',v_lote.id,'codigo_lote',v_lote.codigo_lote,'accion',p_accion,
    'responsable_nuevo',case when p_accion='cambiar_delivery' then v_new_name else null end,
    'responsable_tipo_nuevo',case when p_accion='cambiar_delivery' then v_new_type else null end,
    'ordenes',coalesce(array_length(v_order_ids,1),0)
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.pc_finalizar_lote_cxc_v937(p_lote_id bigint, p_recibido_por text, p_observacion text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_lote public.entrega_lotes%rowtype;
  v_pending integer := 0;
  v_total_orders integer := 0;
  v_total numeric(14,2) := 0;
  v_cash numeric(14,2) := 0;
  v_credit numeric(14,2) := 0;
  v_no_delivered numeric(14,2) := 0;
  v_liquidacion_id bigint;
  v_now timestamptz := now();
begin
  select * into v_lote
  from public.entrega_lotes
  where id = p_lote_id
  for update;

  if not found then
    raise exception 'No se encontró el lote.';
  end if;

  select count(*),
         count(*) filter (where o.id is null or o.recibido_en is null)
  into v_total_orders, v_pending
  from public.entrega_lote_detalle d
  left join public.ordenes o on o.id = d.orden_id
  where d.lote_id = v_lote.id;

  if v_total_orders = 0 then
    raise exception 'El lote no tiene órdenes formales vinculadas.';
  end if;

  if v_pending > 0 then
    update public.entrega_lotes
    set estado = 'Recibido parcial'
    where id = v_lote.id
      and lower(coalesce(estado,'')) <> 'revertido';

    return jsonb_build_object(
      'ok', true,
      'lote_cerrado', false,
      'lote_id', v_lote.id,
      'codigo_lote', v_lote.codigo_lote,
      'pendientes', v_pending,
      'total_ordenes', v_total_orders
    );
  end if;

  select
    coalesce(sum(coalesce(o.total_factura,o.total_estimado,0)),0),
    coalesce(sum(coalesce(o.monto_cobrado,0)),0),
    coalesce(sum(case when coalesce(o.resultado_entrega,o.estado) = 'Entregado a crédito' then coalesce(o.monto_pendiente,0) else 0 end),0),
    coalesce(sum(case
      when coalesce(o.resultado_entrega,o.estado) = 'No entregado' then coalesce(o.total_factura,o.total_estimado,0)
      when coalesce(o.resultado_entrega,o.estado) = 'Devuelto parcial' then coalesce(o.monto_pendiente,0)
      else 0 end),0)
  into v_total, v_cash, v_credit, v_no_delivered
  from public.entrega_lote_detalle d
  join public.ordenes o on o.id = d.orden_id
  where d.lote_id = v_lote.id;

  select id into v_liquidacion_id
  from public.liquidaciones_lotes
  where lote_id = v_lote.id
     or upper(trim(codigo_lote)) = upper(trim(v_lote.codigo_lote))
  order by id
  limit 1
  for update;

  if v_liquidacion_id is null then
    insert into public.liquidaciones_lotes(
      lote_id, codigo_lote, delivery_nombre, fecha_liquidacion,
      total_facturado, efectivo_reportado, efectivo_recibido,
      credito_pendiente, no_entregado, diferencia, recibido_por,
      observacion, estado, creado_por
    ) values (
      v_lote.id, v_lote.codigo_lote, v_lote.delivery_nombre, v_now,
      v_total, v_cash, v_cash, v_credit, v_no_delivered, 0,
      nullif(trim(p_recibido_por),''), nullif(trim(p_observacion),''),
      'Cerrado', auth.uid()
    ) returning id into v_liquidacion_id;
  else
    update public.liquidaciones_lotes
    set lote_id = v_lote.id,
        codigo_lote = v_lote.codigo_lote,
        delivery_nombre = v_lote.delivery_nombre,
        fecha_liquidacion = v_now,
        total_facturado = v_total,
        efectivo_reportado = v_cash,
        efectivo_recibido = v_cash,
        credito_pendiente = v_credit,
        no_entregado = v_no_delivered,
        diferencia = 0,
        recibido_por = coalesce(nullif(trim(p_recibido_por),''), recibido_por),
        observacion = concat_ws(' | ', nullif(trim(observacion),''), nullif(trim(p_observacion),'')),
        estado = 'Cerrado'
    where id = v_liquidacion_id;
  end if;

  insert into public.liquidacion_lote_detalle(
    liquidacion_id, orden_id, cliente_id, codigo_orden, cliente_nombre,
    factura_no, resultado_entrega, total_factura, monto_cobrado,
    monto_credito, monto_no_entregado, observacion
  )
  select
    v_liquidacion_id, o.id, o.cliente_id, o.codigo,
    coalesce(nullif(trim(o.cliente_nombre_orden),''), nullif(trim(c.negocio),''), 'Cliente'),
    o.factura_no, coalesce(o.resultado_entrega,o.estado),
    coalesce(o.total_factura,o.total_estimado,0), coalesce(o.monto_cobrado,0),
    case when coalesce(o.resultado_entrega,o.estado) = 'Entregado a crédito' then coalesce(o.monto_pendiente,0) else 0 end,
    case
      when coalesce(o.resultado_entrega,o.estado) = 'No entregado' then coalesce(o.total_factura,o.total_estimado,0)
      when coalesce(o.resultado_entrega,o.estado) = 'Devuelto parcial' then coalesce(o.monto_pendiente,0)
      else 0 end,
    o.notas_liquidacion
  from public.entrega_lote_detalle d
  join public.ordenes o on o.id = d.orden_id
  left join public.clientes c on c.id = o.cliente_id
  where d.lote_id = v_lote.id
  on conflict (liquidacion_id, orden_id) where orden_id is not null
  do update set
    cliente_id = excluded.cliente_id,
    codigo_orden = excluded.codigo_orden,
    cliente_nombre = excluded.cliente_nombre,
    factura_no = excluded.factura_no,
    resultado_entrega = excluded.resultado_entrega,
    total_factura = excluded.total_factura,
    monto_cobrado = excluded.monto_cobrado,
    monto_credito = excluded.monto_credito,
    monto_no_entregado = excluded.monto_no_entregado,
    observacion = excluded.observacion;

  update public.entrega_lote_detalle d
  set estado_liquidacion = 'Recibido',
      resultado_entrega = coalesce(o.resultado_entrega,o.estado),
      monto_cobrado = coalesce(o.monto_cobrado,0),
      monto_credito = case when coalesce(o.resultado_entrega,o.estado) = 'Entregado a crédito' then coalesce(o.monto_pendiente,0) else 0 end,
      observacion = o.notas_liquidacion
  from public.ordenes o
  where d.lote_id = v_lote.id
    and o.id = d.orden_id;

  update public.entrega_lotes
  set estado = 'Cerrado'
  where id = v_lote.id;

  insert into public.liquidacion_lote_eventos(
    lote_id, codigo_lote, liquidacion_id, accion, motivo,
    usuario_id, usuario_nombre, metadata
  ) values (
    v_lote.id, v_lote.codigo_lote, v_liquidacion_id,
    'lote_cerrado', nullif(trim(p_observacion),''), auth.uid(),
    nullif(trim(p_recibido_por),''),
    jsonb_build_object('ordenes',v_total_orders,'total_facturado',v_total,'efectivo',v_cash,'credito',v_credit,'no_entregado',v_no_delivered)
  );

  return jsonb_build_object(
    'ok', true,
    'lote_cerrado', true,
    'lote_id', v_lote.id,
    'codigo_lote', v_lote.codigo_lote,
    'liquidacion_id', v_liquidacion_id,
    'pendientes', 0,
    'total_ordenes', v_total_orders
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.recibir_orden_cxc_v937(p_orden_id bigint, p_resultado text, p_monto_recibido numeric, p_metodo text, p_recibido_por text, p_observacion text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_orden public.ordenes%rowtype;
  v_lote public.entrega_lotes%rowtype;
  v_total numeric(14,2);
  v_cash numeric(14,2);
  v_credit numeric(14,2);
  v_result text;
  v_now timestamptz := now();
  v_final jsonb;
begin
  if not public.puede_modulo_v930r5('liquidacion','editar') then
    raise exception 'No tienes permiso para recibir liquidaciones.';
  end if;

  select * into v_orden
  from public.ordenes
  where id = p_orden_id
  for update;

  if not found then raise exception 'No se encontró la orden.'; end if;
  if v_orden.recibido_en is not null then raise exception 'Esta orden ya fue recibida por CXC.'; end if;
  if coalesce(v_orden.modalidad_entrega,'Delivery') <> 'Delivery' then
    raise exception 'Esta orden no pertenece a un viaje de delivery.';
  end if;

  select l.* into v_lote
  from public.entrega_lote_detalle d
  join public.entrega_lotes l on l.id = d.lote_id
  where d.orden_id = v_orden.id
    and lower(coalesce(l.estado,'')) <> 'revertido'
  order by l.id desc
  limit 1
  for update of l;

  if not found then raise exception 'La orden no tiene un lote de delivery activo.'; end if;
  if lower(coalesce(v_lote.estado,'')) = 'cerrado' then raise exception 'El lote ya está cerrado.'; end if;

  v_total := coalesce(v_orden.total_factura,v_orden.total_estimado,0);
  if v_total <= 0 then raise exception 'La factura debe ser mayor que cero.'; end if;

  v_result := trim(coalesce(p_resultado,''));
  if v_result not in ('Cobrado','Entregado a crédito','No entregado','Devuelto parcial') then
    raise exception 'Resultado de recepción inválido.';
  end if;

  v_cash := round(coalesce(p_monto_recibido,0),2);
  if v_cash < 0 then raise exception 'El monto recibido no puede ser negativo.'; end if;
  if v_cash > v_total + 0.01 then raise exception 'El monto recibido no puede superar la factura.'; end if;

  if v_result = 'Cobrado' and abs(v_cash-v_total) > 0.01 then
    raise exception 'Para marcar Cobrado debe recibirse el total de la factura.';
  elsif v_result = 'Entregado a crédito' and v_cash >= v_total - 0.01 then
    raise exception 'Si recibió el total, seleccione Cobrado.';
  elsif v_result = 'No entregado' and v_cash > 0.01 then
    raise exception 'Una orden no entregada no puede registrar efectivo.';
  end if;

  if v_result in ('Entregado a crédito','Devuelto parcial') then
    -- monto_pendiente conserva el saldo no recibido; el cierre formal clasifica
    -- Entregado a crédito como crédito y Devuelto parcial como no entregado/devuelto.
    v_credit := greatest(v_total-v_cash,0);
  else
    v_credit := 0;
  end if;

  if v_cash > 0.01 then
    insert into public.orden_pagos(orden_id,cliente_id,monto,metodo,recibido_por)
    values(v_orden.id,v_orden.cliente_id,v_cash,coalesce(nullif(trim(p_metodo),''),'Efectivo'),auth.uid());
  end if;

  insert into public.orden_entregas(
    orden_id, resultado, monto_cobrado, monto_pendiente, notas, creado_por
  ) values (
    v_orden.id, v_result, v_cash, v_credit,
    concat_ws(' | ', nullif(trim(p_observacion),''), 'Recepción centralizada V9.3.7 por CXC.'),
    auth.uid()
  );

  update public.ordenes
  set estado = v_result,
      resultado_entrega = v_result,
      monto_cobrado = v_cash,
      monto_pendiente = v_credit,
      recibido_por = nullif(trim(p_recibido_por),''),
      recibido_en = v_now,
      notas_liquidacion = concat_ws(' | ', nullif(trim(notas_liquidacion),''), nullif(trim(p_observacion),''),
        'V9.3.7: recibido por CXC. Resultado: ' || v_result || '. Efectivo: ' || v_cash || '. Pendiente: ' || v_credit || '.')
  where id = v_orden.id;

  update public.entrega_lote_detalle
  set estado_liquidacion = 'Recibido',
      resultado_entrega = v_result,
      monto_cobrado = v_cash,
      monto_credito = case when v_result='Entregado a crédito' then v_credit else 0 end,
      observacion = concat_ws(' | ', nullif(trim(observacion),''), nullif(trim(p_observacion),''))
  where lote_id = v_lote.id
    and orden_id = v_orden.id;

  insert into public.orden_estados_historial(
    orden_id, estado_anterior, estado_nuevo, comentario, usuario
  ) values (
    v_orden.id, v_orden.estado, v_result,
    'Liquidación centralizada V9.3.7. Lote ' || v_lote.codigo_lote || '. Recibido por ' || coalesce(nullif(trim(p_recibido_por),''),'CXC') || '.',
    auth.uid()
  );

  v_final := public.pc_finalizar_lote_cxc_v937(v_lote.id,p_recibido_por,p_observacion);

  return v_final || jsonb_build_object(
    'orden_id', v_orden.id,
    'resultado', v_result,
    'monto_recibido', v_cash,
    'monto_pendiente', v_credit
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.recibir_lote_cxc_v937(p_lote_id bigint, p_items jsonb, p_recibido_por text, p_observacion text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_lote public.entrega_lotes%rowtype;
  v_item jsonb;
  v_missing integer;
  v_invalid integer;
  v_result jsonb;
begin
  if not public.puede_modulo_v930r5('liquidacion','editar') then
    raise exception 'No tienes permiso para recibir liquidaciones.';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items)=0 then
    raise exception 'El lote no contiene clientes para recibir.';
  end if;

  select * into v_lote from public.entrega_lotes where id=p_lote_id for update;
  if not found then raise exception 'No se encontró el lote.'; end if;
  if lower(coalesce(v_lote.estado,'')) in ('cerrado','revertido') then
    raise exception 'El lote está % y no puede recibirse.', v_lote.estado;
  end if;

  select count(*) into v_invalid
  from jsonb_array_elements(p_items) j
  where nullif(j->>'orden_id','') is null
     or not exists (
       select 1
       from public.entrega_lote_detalle d
       join public.ordenes o on o.id=d.orden_id
       where d.lote_id=v_lote.id
         and d.orden_id=(j->>'orden_id')::bigint
         and o.recibido_en is null
     );

  if v_invalid>0 then
    raise exception 'La recepción contiene % cliente(s) que no pertenecen a este lote o ya fueron recibidos.', v_invalid;
  end if;

  if (select count(*) from jsonb_array_elements(p_items)) <>
     (select count(distinct (j->>'orden_id')) from jsonb_array_elements(p_items) j) then
    raise exception 'La recepción contiene una orden repetida dentro del mismo lote.';
  end if;

  select count(*) into v_missing
  from public.entrega_lote_detalle d
  join public.ordenes o on o.id=d.orden_id
  where d.lote_id=v_lote.id
    and o.recibido_en is null
    and not exists (
      select 1 from jsonb_array_elements(p_items) j
      where (j->>'orden_id')::bigint=o.id
    );

  if v_missing>0 then
    raise exception 'Faltan % cliente(s) pendientes dentro de la recepción del lote.', v_missing;
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_result := public.recibir_orden_cxc_v937(
      (v_item->>'orden_id')::bigint,
      v_item->>'resultado',
      coalesce(nullif(v_item->>'monto_recibido','')::numeric,0),
      coalesce(v_item->>'metodo','Efectivo'),
      p_recibido_por,
      concat_ws(' | ', nullif(trim(v_item->>'observacion'),''), nullif(trim(p_observacion),''))
    );
  end loop;

  -- La última recepción individual ya ejecuta el cierre formal cuando corresponde.
  -- Devolver ese resultado evita duplicar eventos de cierre o recalcular el lote dos veces.
  return coalesce(v_result, jsonb_build_object('ok',false,'mensaje','No se procesaron clientes.'));
end;
$function$
;

CREATE OR REPLACE FUNCTION public.consolidar_liquidaciones_duplicadas_v937(p_codigo_lote text, p_motivo text DEFAULT NULL::text, p_usuario_nombre text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_code text := upper(trim(coalesce(p_codigo_lote,'')));
  v_keep_id bigint;
  v_ids bigint[];
  v_dup_ids bigint[];
  v_count integer;
  v_total numeric(14,2);
  v_cash numeric(14,2);
  v_credit numeric(14,2);
  v_no_delivered numeric(14,2);
begin
  if not public.puede_modulo_v930r5('liquidacion','editar') then
    raise exception 'No tienes permiso para consolidar liquidaciones.';
  end if;
  if v_code='' or v_code='SIN-LOTE' then raise exception 'Código de lote inválido.'; end if;
  if length(trim(coalesce(p_motivo,'')))<5 then raise exception 'Escribe un motivo de al menos 5 caracteres.'; end if;

  select min(id), array_agg(id order by id), count(*)
  into v_keep_id, v_ids, v_count
  from public.liquidaciones_lotes
  where upper(trim(codigo_lote))=v_code;

  if coalesce(v_count,0)<=1 then
    return jsonb_build_object('ok',true,'codigo_lote',v_code,'duplicados_eliminados',0,'mensaje','El lote ya tiene una sola liquidación.');
  end if;

  v_dup_ids:=array_remove(v_ids,v_keep_id);

  insert into public.liquidacion_lote_detalle(
    liquidacion_id, orden_id, cliente_id, codigo_orden, cliente_nombre,
    factura_no, resultado_entrega, total_factura, monto_cobrado,
    monto_credito, monto_no_entregado, observacion, creado_en
  )
  select distinct on (coalesce(d.orden_id::text, nullif(trim(d.codigo_orden),''), d.id::text))
    v_keep_id, d.orden_id, d.cliente_id, d.codigo_orden, d.cliente_nombre,
    d.factura_no, d.resultado_entrega, d.total_factura, d.monto_cobrado,
    d.monto_credito, d.monto_no_entregado, d.observacion, d.creado_en
  from public.liquidacion_lote_detalle d
  where d.liquidacion_id=any(v_ids)
  on conflict (liquidacion_id, orden_id) where orden_id is not null do nothing;

  delete from public.liquidacion_lote_detalle where liquidacion_id=any(v_dup_ids);
  delete from public.liquidaciones_lotes where id=any(v_dup_ids);

  select coalesce(sum(total_factura),0),coalesce(sum(monto_cobrado),0),
         coalesce(sum(monto_credito),0),coalesce(sum(monto_no_entregado),0)
  into v_total,v_cash,v_credit,v_no_delivered
  from public.liquidacion_lote_detalle where liquidacion_id=v_keep_id;

  update public.liquidaciones_lotes
  set total_facturado=v_total,efectivo_reportado=v_cash,efectivo_recibido=v_cash,
      credito_pendiente=v_credit,no_entregado=v_no_delivered,diferencia=0,
      observacion=concat_ws(' | ',nullif(trim(observacion),''),trim(p_motivo))
  where id=v_keep_id;

  insert into public.liquidacion_lote_eventos(
    lote_id,codigo_lote,liquidacion_id,accion,motivo,usuario_id,usuario_nombre,metadata
  )
  select lote_id,codigo_lote,id,'consolidacion_manual',trim(p_motivo),auth.uid(),
         coalesce(nullif(trim(p_usuario_nombre),''),'Usuario'),
         jsonb_build_object('ids_eliminados',v_dup_ids,'cantidad_original',v_count)
  from public.liquidaciones_lotes where id=v_keep_id;

  return jsonb_build_object('ok',true,'codigo_lote',v_code,'liquidacion_id',v_keep_id,'duplicados_eliminados',array_length(v_dup_ids,1));
end;
$function$
;

CREATE OR REPLACE FUNCTION public.crear_lote_entrega_v9371(p_codigo_lote text, p_responsable_nombre text, p_responsable_tipo text, p_items jsonb, p_validado_por text, p_snapshot jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_code text := upper(trim(coalesce(p_codigo_lote,'')));
  v_name text := regexp_replace(trim(coalesce(p_responsable_nombre,'')),'[[:space:]]+',' ','g');
  v_type text := trim(coalesce(p_responsable_tipo,''));
  v_lote_id bigint;
  v_employee_id bigint;
  v_count integer;
  v_invalid integer;
  v_now timestamptz := now();
begin
  if not public.puede_modulo_v930r5('validacion','editar') then
    raise exception 'No tienes permiso para crear lotes de entrega.';
  end if;
  if v_code='' then raise exception 'Código de lote inválido.'; end if;
  if v_name='' then raise exception 'Es obligatorio identificar al responsable del viaje.'; end if;
  if v_type not in ('delivery_registrado','otro_empleado','manual_externo') then
    raise exception 'Tipo de responsable inválido.';
  end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then
    raise exception 'Selecciona al menos una orden para el lote.';
  end if;
  if exists(select 1 from public.entrega_lotes where upper(codigo_lote)=v_code) then
    raise exception 'Ya existe un lote con el código %.',v_code;
  end if;
  if (select count(*) from jsonb_array_elements(p_items)) <>
     (select count(distinct (x->>'orden_id')) from jsonb_array_elements(p_items) x) then
    raise exception 'El lote contiene una orden repetida.';
  end if;

  select count(*) into v_invalid
  from jsonb_array_elements(p_items) x
  left join public.ordenes o on o.id=(x->>'orden_id')::bigint
  where o.id is null
     or o.estado not in ('Facturada','Validada para delivery')
     or coalesce((x->>'monto')::numeric,0)<=0
     or exists (
       select 1 from public.entrega_lote_detalle d
       join public.entrega_lotes l on l.id=d.lote_id
       where d.orden_id=o.id
         and lower(coalesce(l.estado,'')) not in ('revertido','cerrado','transferido totalmente')
     );
  if v_invalid>0 then
    raise exception 'Hay % orden(es) inválidas, sin monto o ya asignadas a otro lote.',v_invalid;
  end if;

  select e.id into v_employee_id
  from public.empleados_operativos e
  where e.activo is not false and lower(trim(e.nombre))=lower(v_name)
  order by e.id limit 1;

  insert into public.entrega_lotes(
    codigo_lote, delivery_nombre, responsable_nombre, responsable_tipo,
    responsable_empleado_id, fecha_entrega, cantidad_ordenes,
    peso_esperado, peso_entregado, total_facturado, estado,
    creado_por, validado_por, hoja_ruta_snapshot
  )
  select
    v_code, v_name, v_name, v_type, v_employee_id, v_now,
    count(*),
    round(sum(coalesce((x->>'peso_esperado')::numeric,0)),2),
    round(sum(coalesce((x->>'peso_entregado')::numeric,0)),2),
    round(sum(coalesce((x->>'monto')::numeric,0)),2),
    'Abierto', auth.uid(), nullif(trim(p_validado_por),''),
    jsonb_set(
      jsonb_set(coalesce(p_snapshot,'{}'::jsonb),'{responsable_nombre}',to_jsonb(v_name),true),
      '{responsable_tipo}',to_jsonb(v_type),true
    )
  from jsonb_array_elements(p_items) x
  returning id into v_lote_id;

  insert into public.entrega_lote_detalle(
    lote_id,codigo_lote,orden_id,cliente_id,codigo_orden,
    cliente_nombre,telefono,sector,direccion,factura_no,
    monto_factura,peso_esperado,peso_entregado,estado_liquidacion
  )
  select
    v_lote_id,v_code,o.id,o.cliente_id,o.codigo,
    coalesce(nullif(trim(o.cliente_nombre_orden),''),c.negocio,'Cliente'),
    coalesce(nullif(trim(o.cliente_telefono_orden),''),c.telefono),
    coalesce(nullif(trim(o.cliente_sector_orden),''),c.sector,o.zona),
    coalesce(nullif(trim(o.zona),''),nullif(trim(o.cliente_sector_orden),''),c.sector),o.factura_no,
    round((x->>'monto')::numeric,2),
    round(coalesce((x->>'peso_esperado')::numeric,0),2),
    round(coalesce((x->>'peso_entregado')::numeric,0),2),'Pendiente'
  from jsonb_array_elements(p_items) x
  join public.ordenes o on o.id=(x->>'orden_id')::bigint
  left join public.clientes c on c.id=o.cliente_id;

  insert into public.orden_pesos(orden_id,tipo,libras,notas,creado_por)
  select o.id,'Entregado a delivery',round((x->>'peso_entregado')::numeric,2),
         concat_ws(' | ','Lote: '||v_code,nullif(trim(x->>'alerta'),'')),auth.uid()
  from jsonb_array_elements(p_items) x
  join public.ordenes o on o.id=(x->>'orden_id')::bigint
  where coalesce((x->>'peso_entregado')::numeric,0)>0;

  insert into public.orden_estados_historial(orden_id,estado_anterior,estado_nuevo,comentario,usuario)
  select o.id,o.estado,'Asignada a delivery',
         'Lote '||v_code||' asignado a '||v_name||' ('||v_type||'). Monto final: '||round((x->>'monto')::numeric,2)||'. Peso final: '||round(coalesce((x->>'peso_entregado')::numeric,0),2)||' lb.',
         auth.uid()
  from jsonb_array_elements(p_items) x
  join public.ordenes o on o.id=(x->>'orden_id')::bigint;

  update public.ordenes o
  set estado='Asignada a delivery',
      total_factura=round((x.item->>'monto')::numeric,2),
      validado_por=nullif(trim(p_validado_por),''),
      peso_validado=nullif(round(coalesce((x.item->>'peso_entregado')::numeric,0),2),0),
      validado_en=v_now,
      delivery_nombre=v_name,
      asignado_delivery_en=v_now,
      notas_validacion=concat_ws(' | ','Lote: '||v_code,nullif(trim(x.item->>'alerta'),''),'Responsable: '||v_name||' ('||v_type||')')
  from (select value as item from jsonb_array_elements(p_items)) x
  where o.id=(x.item->>'orden_id')::bigint;

  select count(*) into v_count from public.entrega_lote_detalle where lote_id=v_lote_id;
  return jsonb_build_object('ok',true,'lote_id',v_lote_id,'codigo_lote',v_code,
    'responsable_nombre',v_name,'responsable_tipo',v_type,'ordenes',v_count);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.transferir_orden_lote_v9371(p_lote_origen_id bigint, p_orden_id bigint, p_responsable_nuevo text, p_responsable_tipo_nuevo text, p_motivo text, p_usuario_nombre text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_source public.entrega_lotes%rowtype;
  v_order public.ordenes%rowtype;
  v_detail public.entrega_lote_detalle%rowtype;
  v_target_id bigint;
  v_target_code text;
  v_name text := regexp_replace(trim(coalesce(p_responsable_nuevo,'')),'[[:space:]]+',' ','g');
  v_type text := trim(coalesce(p_responsable_tipo_nuevo,''));
  v_reason text := trim(coalesce(p_motivo,''));
  v_employee_id bigint;
  v_remaining integer;
  v_user_name text;
  v_now timestamptz := now();
begin
  if not public.puede_modulo_v930r5('validacion','editar') then
    raise exception 'No tienes permiso para transferir pedidos.';
  end if;
  if v_name='' then raise exception 'Selecciona el nuevo responsable.'; end if;
  if v_type not in ('delivery_registrado','otro_empleado','manual_externo') then raise exception 'Tipo de responsable inválido.'; end if;
  if length(v_reason)<5 then raise exception 'El motivo debe tener al menos 5 caracteres.'; end if;

  select * into v_source from public.entrega_lotes where id=p_lote_origen_id for update;
  if not found then raise exception 'No se encontró el lote de origen.'; end if;
  if lower(coalesce(v_source.estado,'')) in ('cerrado','revertido','transferido totalmente') then
    raise exception 'El lote de origen está % y no admite transferencias.',v_source.estado;
  end if;
  if exists(select 1 from public.liquidaciones_lotes where lote_id=v_source.id or upper(codigo_lote)=upper(v_source.codigo_lote)) then
    raise exception 'El lote ya tiene una liquidación formal.';
  end if;

  select * into v_order from public.ordenes where id=p_orden_id for update;
  if not found then raise exception 'No se encontró la orden.'; end if;
  if v_order.recibido_en is not null then raise exception 'La orden ya fue recibida por CXC.'; end if;
  if coalesce(v_order.resultado_entrega,'')<>'' or v_order.estado in ('Cobrado','Entregado a crédito','No entregado','Devuelto parcial','Cerrado','Liquidado') then
    raise exception 'La orden ya tiene un resultado final y no puede transferirse.';
  end if;

  select * into v_detail
  from public.entrega_lote_detalle
  where lote_id=v_source.id and orden_id=v_order.id
  for update;
  if not found then raise exception 'La orden no pertenece al lote indicado.'; end if;
  if lower(trim(v_name))=lower(trim(coalesce(v_source.responsable_nombre,v_source.delivery_nombre))) then
    raise exception 'Selecciona un responsable diferente al actual.';
  end if;

  select e.id into v_employee_id
  from public.empleados_operativos e
  where e.activo is not false and lower(trim(e.nombre))=lower(v_name)
  order by e.id limit 1;

  v_target_code := 'TRF-'||to_char(v_now at time zone 'America/Santo_Domingo','YYMMDD-HH24MISS')||'-'||v_order.id;
  if exists(select 1 from public.entrega_lotes where codigo_lote=v_target_code) then
    v_target_code := v_target_code||'-'||txid_current();
  end if;

  insert into public.entrega_lotes(
    codigo_lote,delivery_nombre,responsable_nombre,responsable_tipo,responsable_empleado_id,
    fecha_entrega,cantidad_ordenes,peso_esperado,peso_entregado,total_facturado,estado,
    creado_por,validado_por,es_transferencia,lote_origen_id,codigo_lote_origen,hoja_ruta_snapshot
  ) values (
    v_target_code,v_name,v_name,v_type,v_employee_id,v_now,1,
    coalesce(v_detail.peso_esperado,0),coalesce(v_detail.peso_entregado,0),coalesce(v_detail.monto_factura,0),'Abierto',
    auth.uid(),coalesce(nullif(trim(p_usuario_nombre),''),v_source.validado_por),true,v_source.id,v_source.codigo_lote,
    jsonb_build_object('version','V9.3.7.1 PWA','codigo_lote',v_target_code,
      'responsable_nombre',v_name,'responsable_tipo',v_type,'es_transferencia',true,
      'codigo_lote_origen',v_source.codigo_lote,'orden_id',v_order.id,'fecha_entrega',v_now)
  ) returning id into v_target_id;

  update public.entrega_lote_detalle
  set lote_id=v_target_id,codigo_lote=v_target_code
  where id=v_detail.id;

  update public.ordenes
  set delivery_nombre=v_name,
      asignado_delivery_en=v_now,
      notas_validacion=concat_ws(' | ',nullif(trim(notas_validacion),''),
        'Transferencia V9.3.7.1: '||v_source.codigo_lote||' → '||v_target_code||'. Nuevo responsable: '||v_name||' ('||v_type||'). Motivo: '||v_reason)
  where id=v_order.id;

  update public.entrega_lotes l
  set cantidad_ordenes=s.cnt,
      peso_esperado=s.peso_esperado,
      peso_entregado=s.peso_entregado,
      total_facturado=s.total_facturado,
      estado=case when s.cnt=0 then 'Transferido totalmente' else l.estado end
  from (
    select count(*)::integer cnt,
           coalesce(round(sum(peso_esperado),2),0) peso_esperado,
           coalesce(round(sum(peso_entregado),2),0) peso_entregado,
           coalesce(round(sum(monto_factura),2),0) total_facturado
    from public.entrega_lote_detalle where lote_id=v_source.id
  ) s
  where l.id=v_source.id;

  select count(*) into v_remaining from public.entrega_lote_detalle where lote_id=v_source.id;

  select coalesce(nullif(trim(p_usuario_nombre),''),nullif(trim(p.nombre),''),'Usuario')
  into v_user_name from public.perfiles p where p.id=auth.uid();
  v_user_name:=coalesce(v_user_name,nullif(trim(p_usuario_nombre),''),'Usuario');

  insert into public.entrega_pedido_transferencias(
    orden_id,lote_origen_id,lote_destino_id,codigo_lote_origen,codigo_lote_destino,
    responsable_anterior,responsable_nuevo,responsable_tipo_nuevo,monto_factura,peso_entregado,
    motivo,usuario_id,usuario_nombre,metadata
  ) values (
    v_order.id,v_source.id,v_target_id,v_source.codigo_lote,v_target_code,
    coalesce(v_source.responsable_nombre,v_source.delivery_nombre),v_name,v_type,
    coalesce(v_detail.monto_factura,0),coalesce(v_detail.peso_entregado,0),v_reason,
    auth.uid(),v_user_name,jsonb_build_object('orden_codigo',v_order.codigo,'clientes_restantes_origen',v_remaining)
  );

  insert into public.orden_estados_historial(orden_id,estado_anterior,estado_nuevo,comentario,usuario)
  values(v_order.id,v_order.estado,v_order.estado,
    'Pedido transferido del lote '||v_source.codigo_lote||' ('||coalesce(v_source.responsable_nombre,v_source.delivery_nombre)||') al lote '||v_target_code||' ('||v_name||'). Motivo: '||v_reason,
    auth.uid());

  return jsonb_build_object('ok',true,'orden_id',v_order.id,'lote_origen_id',v_source.id,
    'lote_destino_id',v_target_id,'codigo_lote_destino',v_target_code,
    'responsable_nuevo',v_name,'responsable_tipo_nuevo',v_type,'restantes_origen',v_remaining);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.agregar_sector_si_no_existe(p_sector text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_sector text := nullif(btrim(p_sector), '');
  v_existente text;
  v_orden integer;
begin
  if auth.uid() is null then
    raise exception 'Autenticación requerida';
  end if;

  if v_sector is null then
    raise exception 'El sector es obligatorio';
  end if;

  select ci.valor
    into v_existente
  from public.catalogo_items ci
  where ci.catalogo_id = 'sectores'
    and lower(regexp_replace(translate(ci.valor, 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun'), '[^a-zA-Z0-9]+', '', 'g'))
        = lower(regexp_replace(translate(v_sector, 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun'), '[^a-zA-Z0-9]+', '', 'g'))
  order by ci.activo desc, ci.id
  limit 1;

  if v_existente is not null then
    return v_existente;
  end if;

  select coalesce(max(ci.orden), 0) + 1
    into v_orden
  from public.catalogo_items ci
  where ci.catalogo_id = 'sectores';

  insert into public.catalogo_items (catalogo_id, valor, orden, activo)
  values ('sectores', v_sector, v_orden, true);

  return v_sector;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.registrar_excepcion_v9378(p_evento jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_perfil public.perfiles%rowtype;
  v_id bigint;
  v_motivo text := btrim(coalesce(p_evento->>'motivo',''));
begin
  if v_uid is null then raise exception 'Sesión requerida'; end if;
  if char_length(v_motivo) < 5 then raise exception 'El motivo debe tener al menos 5 caracteres'; end if;

  select * into v_perfil from public.perfiles where id = v_uid;
  if coalesce(v_perfil.activo,false) is not true then raise exception 'Usuario inactivo'; end if;

  insert into public.auditoria_excepciones (
    usuario_id, usuario_nombre, usuario_rol, empleado_id_texto, empleado_nombre,
    cuenta_estacion, modulo, tipo_evento, gravedad, accion, motivo,
    orden_id, orden_codigo, cliente_nombre, lote_codigo,
    valor_esperado, valor_registrado, diferencia,
    tolerancia_aviso, tolerancia_maxima, unidad, detalle, dispositivo
  ) values (
    v_uid,
    coalesce(nullif(p_evento->>'usuario_nombre',''), v_perfil.nombre, v_perfil.correo, v_uid::text),
    v_perfil.rol,
    nullif(p_evento->>'empleado_id',''),
    nullif(p_evento->>'empleado_nombre',''),
    nullif(p_evento->>'cuenta_estacion',''),
    coalesce(nullif(p_evento->>'modulo',''),'Sistema'),
    coalesce(nullif(p_evento->>'tipo_evento',''),'Excepción operativa'),
    case when p_evento->>'gravedad' in ('Informativa','Advertencia','Crítica')
      then p_evento->>'gravedad' else 'Advertencia' end,
    coalesce(nullif(p_evento->>'accion',''),'Continuó bajo responsabilidad'),
    v_motivo,
    nullif(p_evento->>'orden_id','')::bigint,
    nullif(p_evento->>'orden_codigo',''),
    nullif(p_evento->>'cliente_nombre',''),
    nullif(p_evento->>'lote_codigo',''),
    nullif(p_evento->>'valor_esperado','')::numeric,
    nullif(p_evento->>'valor_registrado','')::numeric,
    nullif(p_evento->>'diferencia','')::numeric,
    nullif(p_evento->>'tolerancia_aviso','')::numeric,
    nullif(p_evento->>'tolerancia_maxima','')::numeric,
    nullif(p_evento->>'unidad',''),
    coalesce(p_evento->'detalle','{}'::jsonb),
    left(coalesce(p_evento->>'dispositivo',''),500)
  ) returning id into v_id;

  return v_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.revisar_excepcion_v9378(p_id bigint, p_estado text, p_nota text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
begin
  if auth.uid() is null or not public.es_admin_operativo() then
    raise exception 'Solo Gerente/Administrador puede revisar excepciones';
  end if;
  if p_estado not in ('Pendiente','Revisado','Requiere seguimiento') then
    raise exception 'Estado de revisión no válido';
  end if;

  update public.auditoria_excepciones
  set estado_revision = p_estado,
      nota_administrativa = nullif(btrim(coalesce(p_nota,'')),''),
      revisado_por = auth.uid(),
      revisado_en = now()
  where id = p_id;

  if not found then raise exception 'Excepción no encontrada'; end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.editar_composicion_lote_v9379(p_lote_id bigint, p_agregar_ordenes bigint[] DEFAULT '{}'::bigint[], p_retirar_ordenes bigint[] DEFAULT '{}'::bigint[], p_motivo text DEFAULT NULL::text, p_usuario_nombre text DEFAULT NULL::text, p_snapshot jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_lote public.entrega_lotes%rowtype;
  v_reason text := btrim(coalesce(p_motivo,''));
  v_add bigint[] := coalesce(p_agregar_ordenes,'{}'::bigint[]);
  v_remove bigint[] := coalesce(p_retirar_ordenes,'{}'::bigint[]);
  v_current_count integer;
  v_new_count integer;
  v_invalid integer;
  v_user_name text;
  v_user_role text;
  v_before jsonb;
  v_after jsonb;
  v_now timestamptz := now();
begin
  if auth.uid() is null then raise exception 'Sesión requerida.'; end if;
  if not public.puede_modulo_v930r5('validacion','editar') then
    raise exception 'No tienes permiso para editar lotes.';
  end if;
  if char_length(v_reason)<5 then
    raise exception 'El motivo debe tener al menos 5 caracteres.';
  end if;
  if cardinality(v_add)=0 and cardinality(v_remove)=0 then
    raise exception 'Selecciona al menos una orden para agregar o retirar.';
  end if;
  if exists(
    select 1
    from unnest(v_add) as a(id)
    join unnest(v_remove) as r(id) on r.id=a.id
  ) then
    raise exception 'Una misma orden no puede agregarse y retirarse a la vez.';
  end if;
  if cardinality(v_add)<>(select count(distinct id) from unnest(v_add) as x(id))
     or cardinality(v_remove)<>(select count(distinct id) from unnest(v_remove) as x(id)) then
    raise exception 'La solicitud contiene órdenes repetidas.';
  end if;

  select * into v_lote
  from public.entrega_lotes
  where id=p_lote_id
  for update;
  if not found then raise exception 'No se encontró el lote.'; end if;
  if lower(coalesce(v_lote.estado,'Abierto')) <> 'abierto' then
    raise exception 'El lote está % y no puede editarse.',v_lote.estado;
  end if;
  if exists(
    select 1 from public.liquidaciones_lotes
    where lote_id=v_lote.id or upper(codigo_lote)=upper(v_lote.codigo_lote)
  ) then
    raise exception 'El lote ya tiene una liquidación registrada.';
  end if;
  if exists(
    select 1
    from public.entrega_lote_detalle d
    join public.ordenes o on o.id=d.orden_id
    where d.lote_id=v_lote.id
      and (
        o.recibido_en is not null
        or nullif(btrim(coalesce(o.resultado_entrega,'')),'') is not null
        or o.estado in ('Cobrado','Entregado a crédito','No entregado','Devuelto parcial','Cerrado','Liquidado')
      )
  ) then
    raise exception 'El lote tiene resultados, recepción o cierre posterior y no puede editarse.';
  end if;

  select count(*) into v_current_count
  from public.entrega_lote_detalle
  where lote_id=v_lote.id;

  select count(*) into v_invalid
  from unnest(v_remove) x
  where not exists(
    select 1 from public.entrega_lote_detalle d
    where d.lote_id=v_lote.id and d.orden_id=x
  );
  if v_invalid>0 then
    raise exception 'Hay % orden(es) seleccionadas para retirar que no pertenecen al lote.',v_invalid;
  end if;

  select count(*) into v_invalid
  from unnest(v_add) x
  left join public.ordenes o on o.id=x
  where o.id is null
     or o.estado not in ('Facturada','Validada para delivery')
     or coalesce(o.total_factura,o.total_estimado,0)<=0
     or o.recibido_en is not null
     or nullif(btrim(coalesce(o.resultado_entrega,'')),'') is not null
     or exists(
       select 1
       from public.entrega_lote_detalle d
       join public.entrega_lotes l on l.id=d.lote_id
       where d.orden_id=o.id
         and lower(coalesce(l.estado,'')) not in ('revertido','cerrado','transferido totalmente')
     );
  if v_invalid>0 then
    raise exception 'Hay % orden(es) inválidas, sin monto o asignadas a otro lote.',v_invalid;
  end if;

  if v_current_count-cardinality(v_remove)+cardinality(v_add)<1 then
    raise exception 'El lote debe conservar al menos una orden. Para eliminarlo completo utiliza Revertir lote.';
  end if;

  v_before:=jsonb_build_object(
    'cantidad_ordenes',v_lote.cantidad_ordenes,
    'peso_esperado',v_lote.peso_esperado,
    'peso_entregado',v_lote.peso_entregado,
    'total_facturado',v_lote.total_facturado
  );

  insert into public.orden_estados_historial(
    orden_id,estado_anterior,estado_nuevo,comentario,usuario
  )
  select o.id,o.estado,'Facturada',
    'Orden retirada del lote '||v_lote.codigo_lote||'. Motivo: '||v_reason,
    auth.uid()
  from public.ordenes o
  where o.id=any(v_remove);

  delete from public.entrega_lote_detalle
  where lote_id=v_lote.id and orden_id=any(v_remove);

  update public.ordenes
  set estado='Facturada',
      delivery_nombre=null,
      asignado_delivery_en=null,
      resultado_entrega=null,
      monto_cobrado=0,
      monto_pendiente=0,
      recibido_en=null,
      notas_validacion=concat_ws(
        ' | ',nullif(btrim(notas_validacion),''),
        'Retirada del lote '||v_lote.codigo_lote||' V9.3.7.9. Motivo: '||v_reason
      )
  where id=any(v_remove);

  insert into public.entrega_lote_detalle(
    lote_id,codigo_lote,orden_id,cliente_id,codigo_orden,
    cliente_nombre,telefono,sector,direccion,factura_no,
    monto_factura,peso_esperado,peso_entregado,estado_liquidacion
  )
  select
    v_lote.id,v_lote.codigo_lote,o.id,o.cliente_id,o.codigo,
    coalesce(nullif(btrim(o.cliente_nombre_orden),''),c.negocio,'Cliente'),
    coalesce(nullif(btrim(o.cliente_telefono_orden),''),c.telefono),
    coalesce(nullif(btrim(o.cliente_sector_orden),''),c.sector,o.zona),
    coalesce(nullif(btrim(o.zona),''),nullif(btrim(o.cliente_sector_orden),''),c.sector),
    o.factura_no,
    round(coalesce(o.total_factura,o.total_estimado,0),2),
    round(coalesce(o.peso_preparado,0),2),
    round(coalesce(o.peso_validado,o.peso_preparado,0),2),
    'Pendiente'
  from public.ordenes o
  left join public.clientes c on c.id=o.cliente_id
  where o.id=any(v_add);

  insert into public.orden_estados_historial(
    orden_id,estado_anterior,estado_nuevo,comentario,usuario
  )
  select o.id,o.estado,'Asignada a delivery',
    'Orden agregada al lote '||v_lote.codigo_lote||' con responsable '||
    coalesce(v_lote.responsable_nombre,v_lote.delivery_nombre)||'. Motivo: '||v_reason,
    auth.uid()
  from public.ordenes o
  where o.id=any(v_add);

  update public.ordenes
  set estado='Asignada a delivery',
      delivery_nombre=coalesce(v_lote.responsable_nombre,v_lote.delivery_nombre),
      asignado_delivery_en=v_now,
      validado_en=coalesce(validado_en,v_now),
      validado_por=coalesce(validado_por,v_lote.validado_por),
      notas_validacion=concat_ws(
        ' | ',nullif(btrim(notas_validacion),''),
        'Agregada al lote '||v_lote.codigo_lote||' V9.3.7.9. Motivo: '||v_reason
      )
  where id=any(v_add);

  update public.entrega_lotes l
  set cantidad_ordenes=s.cnt,
      peso_esperado=s.peso_esperado,
      peso_entregado=s.peso_entregado,
      total_facturado=s.total_facturado,
      hoja_ruta_snapshot=coalesce(p_snapshot,l.hoja_ruta_snapshot),
      corregido_en=v_now,
      corregido_por=auth.uid(),
      motivo_correccion=v_reason
  from(
    select count(*)::integer cnt,
      coalesce(round(sum(peso_esperado),2),0) peso_esperado,
      coalesce(round(sum(peso_entregado),2),0) peso_entregado,
      coalesce(round(sum(monto_factura),2),0) total_facturado
    from public.entrega_lote_detalle
    where lote_id=v_lote.id
  ) s
  where l.id=v_lote.id;

  select cantidad_ordenes into v_new_count
  from public.entrega_lotes
  where id=v_lote.id;

  select jsonb_build_object(
    'cantidad_ordenes',cantidad_ordenes,
    'peso_esperado',peso_esperado,
    'peso_entregado',peso_entregado,
    'total_facturado',total_facturado
  )
  into v_after
  from public.entrega_lotes
  where id=v_lote.id;

  select
    coalesce(nullif(btrim(p_usuario_nombre),''),nullif(btrim(p.nombre),''),'Usuario'),
    p.rol
  into v_user_name,v_user_role
  from public.perfiles p
  where p.id=auth.uid();
  v_user_name:=coalesce(v_user_name,nullif(btrim(p_usuario_nombre),''),'Usuario');

  insert into public.auditoria_excepciones(
    usuario_id,usuario_nombre,usuario_rol,modulo,tipo_evento,gravedad,
    accion,motivo,lote_codigo,detalle,dispositivo
  )
  values(
    auth.uid(),v_user_name,v_user_role,'Validación','Edición de composición de lote','Crítica',
    'Agregó o retiró órdenes de un lote existente',v_reason,v_lote.codigo_lote,
    jsonb_build_object(
      'lote_id',v_lote.id,
      'ordenes_agregadas',v_add,
      'ordenes_retiradas',v_remove,
      'totales_anteriores',v_before,
      'totales_nuevos',v_after,
      'responsable',coalesce(v_lote.responsable_nombre,v_lote.delivery_nombre)
    ),
    'RPC editar_composicion_lote_v9379'
  );

  return jsonb_build_object(
    'ok',true,
    'lote_id',v_lote.id,
    'codigo_lote',v_lote.codigo_lote,
    'agregadas',cardinality(v_add),
    'retiradas',cardinality(v_remove),
    'cantidad_ordenes',v_new_count,
    'totales',v_after
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.guardar_orden_v9381(p_orden_id bigint, p_llamada_id bigint, p_orden jsonb, p_items jsonb, p_composicion_cambio boolean DEFAULT false, p_comentario text DEFAULT NULL::text, p_llamada_observacion text DEFAULT NULL::text)
 RETURNS TABLE(id bigint, codigo text, estado text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_id bigint;
  v_codigo text;
  v_estado_anterior text;
  v_estado_nuevo text;
  v_item jsonb;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Sesión no válida.'; end if;
  if not public.tiene_algun_modulo(array['ordenes','control','carniceria','facturacion'], 'editar')
     and not public.es_admin_operativo() then
    raise exception 'No tienes permiso para guardar órdenes.';
  end if;
  if jsonb_typeof(p_orden) <> 'object' then raise exception 'Encabezado de orden no válido.'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items)=0 then
    raise exception 'La orden debe contener al menos un artículo.';
  end if;

  if p_orden_id is not null then
    select o.id,o.codigo,o.estado into v_id,v_codigo,v_estado_anterior
    from public.ordenes o where o.id=p_orden_id for update;
    if v_id is null then raise exception 'La orden ya no existe.'; end if;
  elsif p_llamada_id is not null then
    select o.id,o.codigo,o.estado into v_id,v_codigo,v_estado_anterior
    from public.ordenes o where o.llamada_id=p_llamada_id for update;
  end if;

  if v_id is null then
    insert into public.ordenes(
      cliente_id,llamada_id,tipo_cliente_orden,cliente_nombre_orden,cliente_telefono_orden,
      cliente_sector_orden,cliente_direccion_orden,cliente_referencia_orden,modalidad_entrega,
      fecha,fecha_despacho,hora_despacho,es_programada,nota_programacion,programada_por,
      fecha_programacion,prioridad,tipo_orden,requiere_preparacion,requiere_facturacion,
      requiere_delivery,canal,vendedor,estado,condicion_pago,total_estimado,total_factura,
      factura_no,delivery_nombre,zona,notas,creado_por,actualizado_por
    ) values (
      nullif(p_orden->>'cliente_id','')::bigint,p_llamada_id,p_orden->>'tipo_cliente_orden',
      p_orden->>'cliente_nombre_orden',p_orden->>'cliente_telefono_orden',
      p_orden->>'cliente_sector_orden',p_orden->>'cliente_direccion_orden',
      p_orden->>'cliente_referencia_orden',p_orden->>'modalidad_entrega',
      coalesce(nullif(p_orden->>'fecha','')::date,current_date),
      nullif(p_orden->>'fecha_despacho','')::date,nullif(p_orden->>'hora_despacho','')::time,
      coalesce((p_orden->>'es_programada')::boolean,false),p_orden->>'nota_programacion',
      nullif(p_orden->>'programada_por','')::uuid,nullif(p_orden->>'fecha_programacion','')::timestamptz,
      p_orden->>'prioridad',p_orden->>'tipo_orden',
      coalesce((p_orden->>'requiere_preparacion')::boolean,true),
      coalesce((p_orden->>'requiere_facturacion')::boolean,true),
      coalesce((p_orden->>'requiere_delivery')::boolean,true),
      p_orden->>'canal',p_orden->>'vendedor',p_orden->>'estado',p_orden->>'condicion_pago',
      coalesce((p_orden->>'total_estimado')::numeric,0),coalesce((p_orden->>'total_factura')::numeric,0),
      p_orden->>'factura_no',p_orden->>'delivery_nombre',p_orden->>'zona',p_orden->>'notas',v_uid,v_uid
    ) returning ordenes.id,ordenes.codigo,ordenes.estado into v_id,v_codigo,v_estado_anterior;
  else
    update public.ordenes o set
      cliente_id=nullif(p_orden->>'cliente_id','')::bigint,
      tipo_cliente_orden=p_orden->>'tipo_cliente_orden',
      cliente_nombre_orden=p_orden->>'cliente_nombre_orden',
      cliente_telefono_orden=p_orden->>'cliente_telefono_orden',
      cliente_sector_orden=p_orden->>'cliente_sector_orden',
      cliente_direccion_orden=p_orden->>'cliente_direccion_orden',
      cliente_referencia_orden=p_orden->>'cliente_referencia_orden',
      modalidad_entrega=p_orden->>'modalidad_entrega',
      fecha=coalesce(nullif(p_orden->>'fecha','')::date,o.fecha),
      fecha_despacho=nullif(p_orden->>'fecha_despacho','')::date,
      hora_despacho=nullif(p_orden->>'hora_despacho','')::time,
      es_programada=coalesce((p_orden->>'es_programada')::boolean,false),
      nota_programacion=p_orden->>'nota_programacion',
      programada_por=nullif(p_orden->>'programada_por','')::uuid,
      fecha_programacion=nullif(p_orden->>'fecha_programacion','')::timestamptz,
      prioridad=p_orden->>'prioridad',tipo_orden=p_orden->>'tipo_orden',
      requiere_preparacion=coalesce((p_orden->>'requiere_preparacion')::boolean,true),
      requiere_facturacion=coalesce((p_orden->>'requiere_facturacion')::boolean,true),
      requiere_delivery=coalesce((p_orden->>'requiere_delivery')::boolean,true),
      canal=p_orden->>'canal',vendedor=p_orden->>'vendedor',estado=p_orden->>'estado',
      condicion_pago=p_orden->>'condicion_pago',
      total_estimado=coalesce((p_orden->>'total_estimado')::numeric,0),
      total_factura=coalesce((p_orden->>'total_factura')::numeric,0),
      factura_no=p_orden->>'factura_no',delivery_nombre=p_orden->>'delivery_nombre',
      zona=p_orden->>'zona',notas=p_orden->>'notas',
      tomado_por=case when p_orden ? 'tomado_por' then p_orden->>'tomado_por' else o.tomado_por end,
      tomado_por_empleado_id=case when p_orden ? 'tomado_por_empleado_id' then nullif(p_orden->>'tomado_por_empleado_id','')::bigint else o.tomado_por_empleado_id end,
      tomado_en=case when p_orden ? 'tomado_en' then nullif(p_orden->>'tomado_en','')::timestamptz else o.tomado_en end,
      tomado_por_user=case when p_orden ? 'tomado_por_user' then nullif(p_orden->>'tomado_por_user','')::uuid else o.tomado_por_user end,
      preparado_por=case when p_orden ? 'preparado_por' then p_orden->>'preparado_por' else o.preparado_por end,
      preparado_en=case when p_orden ? 'preparado_en' then nullif(p_orden->>'preparado_en','')::timestamptz else o.preparado_en end,
      peso_preparado=case when p_orden ? 'peso_preparado' then nullif(p_orden->>'peso_preparado','')::numeric else o.peso_preparado end,
      peso_calculado_preparado=case when p_orden ? 'peso_calculado_preparado' then nullif(p_orden->>'peso_calculado_preparado','')::numeric else o.peso_calculado_preparado end,
      paquetes_preparados=case when p_orden ? 'paquetes_preparados' then nullif(p_orden->>'paquetes_preparados','')::integer else o.paquetes_preparados end,
      notas_preparacion=case when p_orden ? 'notas_preparacion' then p_orden->>'notas_preparacion' else o.notas_preparacion end,
      facturado_por=case when p_orden ? 'facturado_por' then p_orden->>'facturado_por' else o.facturado_por end,
      facturado_en=case when p_orden ? 'facturado_en' then nullif(p_orden->>'facturado_en','')::timestamptz else o.facturado_en end,
      peso_facturado=case when p_orden ? 'peso_facturado' then nullif(p_orden->>'peso_facturado','')::numeric else o.peso_facturado end,
      peso_validado=case when p_orden ? 'peso_validado' then nullif(p_orden->>'peso_validado','')::numeric else o.peso_validado end,
      validado_por=case when p_orden ? 'validado_por' then p_orden->>'validado_por' else o.validado_por end,
      validado_en=case when p_orden ? 'validado_en' then nullif(p_orden->>'validado_en','')::timestamptz else o.validado_en end,
      actualizado_por=v_uid,actualizado_en=now()
    where o.id=v_id
    returning o.estado into v_estado_nuevo;
  end if;

  delete from public.orden_detalle where orden_id=v_id;
  for v_item in select value from jsonb_array_elements(p_items)
  loop
    insert into public.orden_detalle(
      orden_id,producto_id,producto_nombre,cantidad_pedida,unidad,precio,subtotal,notas,
      cantidad_preparada,estado_preparacion,nota_preparacion,peso_equivalente_preparado,
      tipo_despacho_peso,requiere_pesaje,peso_estandar_lb,tolerancia_lb,suma_peso_final,
      permite_fraccion,peso_equivalente_solicitado
    ) values (
      v_id,nullif(v_item->>'producto_id','')::bigint,v_item->>'producto_nombre',
      coalesce((v_item->>'cantidad_pedida')::numeric,0),coalesce(v_item->>'unidad','lb'),
      coalesce((v_item->>'precio')::numeric,0),coalesce((v_item->>'subtotal')::numeric,0),
      v_item->>'notas',nullif(v_item->>'cantidad_preparada','')::numeric,
      coalesce(v_item->>'estado_preparacion','Pendiente'),v_item->>'nota_preparacion',
      nullif(v_item->>'peso_equivalente_preparado','')::numeric,v_item->>'tipo_despacho_peso',
      nullif(v_item->>'requiere_pesaje','')::boolean,nullif(v_item->>'peso_estandar_lb','')::numeric,
      nullif(v_item->>'tolerancia_lb','')::numeric,nullif(v_item->>'suma_peso_final','')::boolean,
      nullif(v_item->>'permite_fraccion','')::boolean,nullif(v_item->>'peso_equivalente_solicitado','')::numeric
    );
  end loop;

  if p_composicion_cambio then
    insert into public.orden_estados_historial(orden_id,estado_anterior,estado_nuevo,comentario,usuario)
    values(v_id,v_estado_anterior,coalesce(v_estado_nuevo,p_orden->>'estado'),p_comentario,v_uid);
  end if;

  if p_llamada_id is not null then
    update public.llamadas set resultado='Pidió',
      monto=coalesce((p_orden->>'total_estimado')::numeric,0),
      observacion=regexp_replace(
        coalesce(p_llamada_observacion,''),
        'Orden la nueva orden',
        'Orden '||v_codigo
      )
    where llamadas.id=p_llamada_id;
  end if;

  return query select o.id,o.codigo,o.estado from public.ordenes o where o.id=v_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.guardar_preparacion_v9381(p_orden_id bigint, p_lineas jsonb, p_cabecera jsonb, p_final boolean DEFAULT false)
 RETURNS TABLE(id bigint, codigo text, estado text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_orden public.ordenes%rowtype;
  v_linea jsonb;
  v_actualizadas integer := 0;
  v_total integer;
  v_nuevo_estado text;
  v_peso numeric;
begin
  if v_uid is null then raise exception 'Sesión no válida.'; end if;
  if not public.tiene_algun_modulo(array['carniceria'], 'editar') and not public.es_admin_operativo() then
    raise exception 'No tienes permiso para guardar preparación.';
  end if;
  if jsonb_typeof(p_lineas) <> 'array' then raise exception 'Detalle de preparación no válido.'; end if;

  select * into v_orden from public.ordenes where ordenes.id=p_orden_id for update;
  if not found then raise exception 'La orden ya no existe.'; end if;
  if v_orden.estado not in ('Pedido recibido','En preparación') then
    raise exception 'La orden cambió de etapa. Actualiza la pantalla antes de guardar.';
  end if;
  select count(*) into v_total from public.orden_detalle where orden_id=p_orden_id;
  if v_total<>jsonb_array_length(p_lineas) then
    raise exception 'El detalle cambió mientras preparabas la orden. Actualiza y vuelve a revisar.';
  end if;

  for v_linea in select value from jsonb_array_elements(p_lineas)
  loop
    update public.orden_detalle set
      cantidad_preparada=nullif(v_linea->>'cantidad_preparada','')::numeric,
      estado_preparacion=coalesce(v_linea->>'estado_preparacion','Pendiente'),
      nota_preparacion=v_linea->>'nota_preparacion',
      peso_equivalente_preparado=coalesce(nullif(v_linea->>'peso_equivalente_preparado','')::numeric,0),
      peso_equivalente_solicitado=coalesce(nullif(v_linea->>'peso_equivalente_solicitado','')::numeric,0)
    where orden_detalle.id=nullif(v_linea->>'id','')::bigint and orden_id=p_orden_id;
    if found then v_actualizadas:=v_actualizadas+1; end if;
  end loop;
  if v_actualizadas<>v_total then raise exception 'No se pudieron confirmar todas las líneas de la orden.'; end if;

  v_nuevo_estado:=case when p_final then 'Lista para facturar' else 'En preparación' end;
  v_peso:=nullif(p_cabecera->>'peso_preparado','')::numeric;
  update public.ordenes set
    estado=v_nuevo_estado,
    tomado_por=coalesce(nullif(p_cabecera->>'tomado_por',''),v_orden.tomado_por),
    tomado_en=coalesce(nullif(p_cabecera->>'tomado_en','')::timestamptz,v_orden.tomado_en,now()),
    tomado_por_user=coalesce(nullif(p_cabecera->>'tomado_por_user','')::uuid,v_orden.tomado_por_user,v_uid),
    peso_preparado=v_peso,
    peso_calculado_preparado=nullif(p_cabecera->>'peso_calculado_preparado','')::numeric,
    paquetes_preparados=nullif(p_cabecera->>'paquetes_preparados','')::integer,
    notas_preparacion=p_cabecera->>'notas_preparacion',
    total_estimado=coalesce(nullif(p_cabecera->>'total_estimado','')::numeric,v_orden.total_estimado),
    preparado_por=case when p_final then p_cabecera->>'tomado_por' else null end,
    preparado_en=case when p_final then now() else null end,
    actualizado_por=v_uid,actualizado_en=now()
  where ordenes.id=p_orden_id;

  if p_final and coalesce(v_peso,0)>0 then
    insert into public.orden_pesos(orden_id,tipo,libras,paquetes,notas,creado_por)
    values(p_orden_id,'Preparado',v_peso,nullif(p_cabecera->>'paquetes_preparados','')::integer,
      p_cabecera->>'notas_preparacion',v_uid);
  end if;
  insert into public.orden_estados_historial(orden_id,estado_anterior,estado_nuevo,comentario,usuario)
  values(p_orden_id,v_orden.estado,v_nuevo_estado,
    case when p_final then 'Preparada, detallada y pesada' else 'Avance de preparación guardado sin marcar como preparado' end,v_uid);

  return query select o.id,o.codigo,o.estado from public.ordenes o where o.id=p_orden_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.pc_validar_transicion_orden_v9382()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_modulo text;
begin
  if new.id is distinct from old.id
     or new.codigo is distinct from old.codigo
     or new.creado_por is distinct from old.creado_por
     or new.creado_en is distinct from old.creado_en then
    raise exception 'No se permite modificar la identidad original de la orden.';
  end if;
  if new.estado is distinct from old.estado then
    select t.modulo into v_modulo from public.orden_transiciones_v9382 t
    where t.estado_anterior=old.estado and t.estado_nuevo=new.estado and t.activo;
    if v_modulo is null then raise exception 'Transición no autorizada: % → %.',old.estado,new.estado; end if;
    if not public.es_admin_operativo()
       and not public.tiene_algun_modulo(array[v_modulo],'editar') then
      raise exception 'No tienes permiso para mover la orden desde el módulo %.',v_modulo;
    end if;
  end if;
  if not public.es_admin_operativo()
     and (new.tomado_por,new.preparado_por,new.peso_preparado,new.paquetes_preparados,new.preparado_en)
         is distinct from
         (old.tomado_por,old.preparado_por,old.peso_preparado,old.paquetes_preparados,old.preparado_en)
     and not public.tiene_algun_modulo(array['carniceria','ordenes'],'editar') then
    raise exception 'Los campos de preparación están protegidos.';
  end if;
  if not public.es_admin_operativo()
     and (new.facturado_por,new.factura_no,new.total_factura,new.peso_facturado,new.facturado_en)
         is distinct from
         (old.facturado_por,old.factura_no,old.total_factura,old.peso_facturado,old.facturado_en)
     and not public.tiene_algun_modulo(array['facturacion','validacion','ordenes'],'editar') then
    raise exception 'Los campos de facturación están protegidos.';
  end if;
  if not public.es_admin_operativo()
     and (new.validado_por,new.peso_validado,new.validado_en)
         is distinct from (old.validado_por,old.peso_validado,old.validado_en)
     and not public.tiene_algun_modulo(array['validacion'],'editar') then
    raise exception 'Los campos de validación están protegidos.';
  end if;
  if not public.es_admin_operativo()
     and (new.resultado_entrega,new.monto_cobrado,new.monto_pendiente,new.recibido_en)
         is distinct from (old.resultado_entrega,old.monto_cobrado,old.monto_pendiente,old.recibido_en)
     and not public.tiene_algun_modulo(array['delivery','liquidacion'],'editar') then
    raise exception 'Los campos financieros de liquidación están protegidos.';
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.cambiar_estado_orden_v9382(p_orden_id bigint, p_estado_esperado text, p_estado_nuevo text, p_cambios jsonb DEFAULT '{}'::jsonb, p_comentario text DEFAULT 'Cambio desde sistema'::text, p_modulo text DEFAULT 'ordenes'::text)
 RETURNS TABLE(id bigint, codigo text, estado text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid:=auth.uid();
  v_o public.ordenes%rowtype;
  v_modulo text;
  v_keys text[];
  v_allowed constant text[]:=array[
    'facturado_por','facturado_en','factura_no','total_factura','peso_facturado',
    'condicion_pago','delivery_nombre','validado_por','validado_en','peso_validado',
    'retirado_por','entregado_mostrador_por','entregado_mostrador_en','notas_retiro',
    'recibido_por','recibido_en','resultado_entrega','monto_cobrado','monto_pendiente',
    'notas_liquidacion','cantidad_impresiones','ultima_impresion','impreso_por',
    'tomado_por','tomado_por_empleado_id','tomado_en','tomado_por_user',
    'preparado_por','preparado_en','peso_preparado','paquetes_preparados',
    'notas_preparacion','liberado_por','liberado_en','motivo_liberacion','notas'
  ];
begin
  if v_uid is null then raise exception 'Sesión no válida.'; end if;
  if jsonb_typeof(coalesce(p_cambios,'{}'::jsonb))<>'object' then raise exception 'Cambios no válidos.'; end if;
  select array_agg(k) into v_keys from jsonb_object_keys(coalesce(p_cambios,'{}'::jsonb)) k;
  if exists(select 1 from unnest(coalesce(v_keys,array[]::text[])) k where not(k=any(v_allowed))) then
    raise exception 'La operación intenta modificar un campo protegido.';
  end if;
  select * into v_o from public.ordenes where ordenes.id=p_orden_id for update;
  if not found then raise exception 'La orden no existe.'; end if;
  if v_o.estado<>p_estado_esperado then
    raise exception 'La orden cambió de estado: se esperaba %, pero está en %.',p_estado_esperado,v_o.estado;
  end if;
  if p_estado_nuevo<>v_o.estado then
    select t.modulo into v_modulo from public.orden_transiciones_v9382 t
    where t.estado_anterior=v_o.estado and t.estado_nuevo=p_estado_nuevo and t.activo;
    if v_modulo is null then raise exception 'Transición no autorizada: % → %.',v_o.estado,p_estado_nuevo; end if;
  else v_modulo:=p_modulo;
  end if;
  if not public.es_admin_operativo()
     and not public.tiene_algun_modulo(array[coalesce(v_modulo,p_modulo)],'editar') then
    raise exception 'No tienes permiso para realizar esta transición en %.',coalesce(v_modulo,p_modulo);
  end if;

  update public.ordenes o set
    estado=p_estado_nuevo,
    facturado_por=case when p_cambios?'facturado_por' then p_cambios->>'facturado_por' else o.facturado_por end,
    facturado_en=case when p_cambios?'facturado_en' then nullif(p_cambios->>'facturado_en','')::timestamptz else o.facturado_en end,
    factura_no=case when p_cambios?'factura_no' then p_cambios->>'factura_no' else o.factura_no end,
    total_factura=case when p_cambios?'total_factura' then coalesce(nullif(p_cambios->>'total_factura','')::numeric,0) else o.total_factura end,
    peso_facturado=case when p_cambios?'peso_facturado' then nullif(p_cambios->>'peso_facturado','')::numeric else o.peso_facturado end,
    condicion_pago=case when p_cambios?'condicion_pago' then p_cambios->>'condicion_pago' else o.condicion_pago end,
    delivery_nombre=case when p_cambios?'delivery_nombre' then p_cambios->>'delivery_nombre' else o.delivery_nombre end,
    validado_por=case when p_cambios?'validado_por' then p_cambios->>'validado_por' else o.validado_por end,
    validado_en=case when p_cambios?'validado_en' then nullif(p_cambios->>'validado_en','')::timestamptz else o.validado_en end,
    peso_validado=case when p_cambios?'peso_validado' then nullif(p_cambios->>'peso_validado','')::numeric else o.peso_validado end,
    retirado_por=case when p_cambios?'retirado_por' then p_cambios->>'retirado_por' else o.retirado_por end,
    entregado_mostrador_por=case when p_cambios?'entregado_mostrador_por' then p_cambios->>'entregado_mostrador_por' else o.entregado_mostrador_por end,
    entregado_mostrador_en=case when p_cambios?'entregado_mostrador_en' then nullif(p_cambios->>'entregado_mostrador_en','')::timestamptz else o.entregado_mostrador_en end,
    notas_retiro=case when p_cambios?'notas_retiro' then p_cambios->>'notas_retiro' else o.notas_retiro end,
    recibido_por=case when p_cambios?'recibido_por' then p_cambios->>'recibido_por' else o.recibido_por end,
    recibido_en=case when p_cambios?'recibido_en' then nullif(p_cambios->>'recibido_en','')::timestamptz else o.recibido_en end,
    resultado_entrega=case when p_cambios?'resultado_entrega' then p_cambios->>'resultado_entrega' else o.resultado_entrega end,
    monto_cobrado=case when p_cambios?'monto_cobrado' then coalesce(nullif(p_cambios->>'monto_cobrado','')::numeric,0) else o.monto_cobrado end,
    monto_pendiente=case when p_cambios?'monto_pendiente' then coalesce(nullif(p_cambios->>'monto_pendiente','')::numeric,0) else o.monto_pendiente end,
    notas_liquidacion=case when p_cambios?'notas_liquidacion' then p_cambios->>'notas_liquidacion' else o.notas_liquidacion end,
    cantidad_impresiones=case when p_cambios?'cantidad_impresiones' then coalesce(nullif(p_cambios->>'cantidad_impresiones','')::integer,0) else o.cantidad_impresiones end,
    ultima_impresion=case when p_cambios?'ultima_impresion' then nullif(p_cambios->>'ultima_impresion','')::timestamptz else o.ultima_impresion end,
    impreso_por=case when p_cambios?'impreso_por' then nullif(p_cambios->>'impreso_por','')::uuid else o.impreso_por end,
    tomado_por=case when p_cambios?'tomado_por' then p_cambios->>'tomado_por' else o.tomado_por end,
    tomado_por_empleado_id=case when p_cambios?'tomado_por_empleado_id' then nullif(p_cambios->>'tomado_por_empleado_id','')::bigint else o.tomado_por_empleado_id end,
    tomado_en=case when p_cambios?'tomado_en' then nullif(p_cambios->>'tomado_en','')::timestamptz else o.tomado_en end,
    tomado_por_user=case when p_cambios?'tomado_por_user' then nullif(p_cambios->>'tomado_por_user','')::uuid else o.tomado_por_user end,
    preparado_por=case when p_cambios?'preparado_por' then p_cambios->>'preparado_por' else o.preparado_por end,
    preparado_en=case when p_cambios?'preparado_en' then nullif(p_cambios->>'preparado_en','')::timestamptz else o.preparado_en end,
    peso_preparado=case when p_cambios?'peso_preparado' then nullif(p_cambios->>'peso_preparado','')::numeric else o.peso_preparado end,
    paquetes_preparados=case when p_cambios?'paquetes_preparados' then nullif(p_cambios->>'paquetes_preparados','')::integer else o.paquetes_preparados end,
    notas_preparacion=case when p_cambios?'notas_preparacion' then p_cambios->>'notas_preparacion' else o.notas_preparacion end,
    liberado_por=case when p_cambios?'liberado_por' then nullif(p_cambios->>'liberado_por','')::uuid else o.liberado_por end,
    liberado_en=case when p_cambios?'liberado_en' then nullif(p_cambios->>'liberado_en','')::timestamptz else o.liberado_en end,
    motivo_liberacion=case when p_cambios?'motivo_liberacion' then p_cambios->>'motivo_liberacion' else o.motivo_liberacion end,
    notas=case when p_cambios?'notas' then p_cambios->>'notas' else o.notas end,
    actualizado_por=v_uid,actualizado_en=now()
  where o.id=p_orden_id;

  insert into public.orden_estados_historial(orden_id,estado_anterior,estado_nuevo,comentario,usuario)
  values(p_orden_id,v_o.estado,p_estado_nuevo,coalesce(nullif(trim(p_comentario),''),'Cambio desde sistema'),v_uid);
  return query select o.id,o.codigo,o.estado from public.ordenes o where o.id=p_orden_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.liberar_orden_v9382(p_orden_id bigint, p_estado_esperado text, p_motivo text)
 RETURNS TABLE(id bigint, codigo text, estado text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_o public.ordenes%rowtype; v_uid uuid:=auth.uid();
begin
  if v_uid is null then raise exception 'Sesión no válida.'; end if;
  if trim(coalesce(p_motivo,''))='' then raise exception 'El motivo es obligatorio.'; end if;
  if not public.es_admin_operativo() and not public.tiene_algun_modulo(array['carniceria'],'editar') then
    raise exception 'No tienes permiso para liberar órdenes.';
  end if;
  select * into v_o from public.ordenes where ordenes.id=p_orden_id for update;
  if not found then raise exception 'La orden no existe.'; end if;
  if v_o.estado<>p_estado_esperado then raise exception 'La orden cambió de estado. Actualiza la pantalla.'; end if;
  if v_o.estado<>'En preparación' then raise exception 'Solo se puede liberar una orden en preparación.'; end if;
  update public.ordenes set estado='Pedido recibido',tomado_por=null,tomado_por_empleado_id=null,
    tomado_en=null,tomado_por_user=null,preparado_por=null,preparado_en=null,peso_preparado=null,
    peso_calculado_preparado=null,paquetes_preparados=null,notas_preparacion=null,
    liberado_por=v_uid,liberado_en=now(),motivo_liberacion=trim(p_motivo),
    actualizado_por=v_uid,actualizado_en=now() where ordenes.id=p_orden_id;
  update public.orden_detalle set cantidad_preparada=null,estado_preparacion='Pendiente',
    nota_preparacion=null,peso_equivalente_preparado=null where orden_id=p_orden_id;
  insert into public.orden_estados_historial(orden_id,estado_anterior,estado_nuevo,comentario,usuario)
  values(p_orden_id,v_o.estado,'Pedido recibido','Pedido soltado/liberado. '||trim(p_motivo),v_uid);
  return query select o.id,o.codigo,o.estado from public.ordenes o where o.id=p_orden_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.pc_bloquear_borrado_trazabilidad_v9383()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  raise exception 'El borrado físico está bloqueado. Utiliza Cancelar/Archivar para conservar la trazabilidad.';
end;
$function$
;

CREATE OR REPLACE FUNCTION public.cancelar_orden_v9383(p_orden_id bigint, p_estado_esperado text, p_motivo text, p_archivar boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid:=auth.uid();
  v_o public.ordenes%rowtype;
  v_avanzada boolean:=false;
  v_retorno_no_entregado boolean:=false;
  v_snapshot jsonb;
  v_accion text;
  v_perfil public.perfiles%rowtype;
begin
  if v_uid is null then raise exception 'Sesión requerida.'; end if;
  if not public.es_admin_operativo() then
    raise exception 'Solo Gerente/Administrador puede cancelar o archivar órdenes.';
  end if;
  if char_length(btrim(coalesce(p_motivo,'')))<5 then
    raise exception 'El motivo debe tener al menos 5 caracteres.';
  end if;

  select * into v_o from public.ordenes where id=p_orden_id for update;
  if not found then raise exception 'La orden no existe.'; end if;
  if v_o.estado<>p_estado_esperado then
    raise exception 'La orden cambió de estado: se esperaba %, pero está en %.',p_estado_esperado,v_o.estado;
  end if;
  if v_o.estado='Anulado' or coalesce(v_o.archivada,false) then
    raise exception 'La orden ya está anulada o archivada.';
  end if;

  -- Cerrado, Revertido y Transferido totalmente son estados históricos,
  -- no una asignación activa que deba bloquear la anulación.
  if exists(
    select 1 from public.entrega_lote_detalle d
    join public.entrega_lotes l on l.id=d.lote_id
    where d.orden_id=p_orden_id
      and lower(btrim(coalesce(l.estado,''))) not in
        ('cerrado','revertido','transferido totalmente')
  ) then
    raise exception 'La orden pertenece a un lote activo. Corrige o revierte el lote antes de cancelarla.';
  end if;

  -- Excepción estricta: se puede cancelar una orden devuelta a Validación
  -- tras uno o varios intentos No entregado, únicamente si no existe dinero
  -- recibido ni otro resultado de entrega.
  v_retorno_no_entregado :=
    v_o.estado='Facturada'
    and v_o.resultado_entrega is null
    and v_o.recibido_en is null
    and v_o.ultimo_resultado_delivery='No entregado'
    and nullif(btrim(coalesce(v_o.ultimo_lote_no_entregado,'')),'') is not null
    and not exists(
      select 1 from public.orden_pagos p
      where p.orden_id=p_orden_id and coalesce(p.monto,0)>0
    )
    and exists(
      select 1 from public.orden_entregas e
      where e.orden_id=p_orden_id
        and lower(btrim(coalesce(e.resultado,''))) in ('no entregado','no_entregado')
    )
    and not exists(
      select 1 from public.orden_entregas e
      where e.orden_id=p_orden_id
        and (
          lower(btrim(coalesce(e.resultado,''))) not in ('no entregado','no_entregado')
          or coalesce(e.monto_cobrado,0)>0
          or coalesce(e.monto_pendiente,0)>0
        )
    );

  if (
    exists(select 1 from public.orden_pagos where orden_id=p_orden_id)
    or exists(select 1 from public.orden_entregas where orden_id=p_orden_id)
  ) and not v_retorno_no_entregado then
    raise exception 'La orden tiene entrega o pago registrado. Debe corregirse desde Liquidación antes de cancelarla.';
  end if;

  v_avanzada :=
    coalesce(v_o.estado,'') not in ('Programada','Pedido recibido')
    or v_o.tomado_por is not null
    or v_o.preparado_por is not null
    or v_o.facturado_por is not null
    or v_o.validado_por is not null
    or v_o.factura_no is not null
    or coalesce(v_o.cantidad_impresiones,0)>0
    or exists(select 1 from public.orden_pesos where orden_id=p_orden_id);

  if p_archivar and v_avanzada then
    raise exception 'Esta orden ya avanzó. Puede anularse, pero no ocultarse como una orden recién creada.';
  end if;

  select jsonb_build_object(
    'orden',to_jsonb(v_o),
    'detalle',coalesce((select jsonb_agg(to_jsonb(d) order by d.id) from public.orden_detalle d where d.orden_id=p_orden_id),'[]'::jsonb),
    'pesos',coalesce((select jsonb_agg(to_jsonb(p) order by p.id) from public.orden_pesos p where p.orden_id=p_orden_id),'[]'::jsonb),
    'entregas',coalesce((select jsonb_agg(to_jsonb(e) order by e.id) from public.orden_entregas e where e.orden_id=p_orden_id),'[]'::jsonb),
    'pagos',coalesce((select jsonb_agg(to_jsonb(pg) order by pg.id) from public.orden_pagos pg where pg.orden_id=p_orden_id),'[]'::jsonb),
    'lotes',coalesce((
      select jsonb_agg(
        jsonb_build_object('detalle',to_jsonb(d),'lote',to_jsonb(l))
        order by d.id
      )
      from public.entrega_lote_detalle d
      join public.entrega_lotes l on l.id=d.lote_id
      where d.orden_id=p_orden_id
    ),'[]'::jsonb)
  ) into v_snapshot;

  v_accion:=case when p_archivar then 'Archivada' else 'Anulada' end;

  update public.ordenes
  set estado='Anulado',
      archivada=p_archivar,
      archivada_en=case when p_archivar then now() else null end,
      archivada_por=case when p_archivar then v_uid else null end,
      motivo_anulacion=btrim(p_motivo),
      notas=concat_ws(E'\n',nullif(notas,''),
        '['||to_char(now(),'DD/MM/YYYY HH24:MI')||'] '||v_accion||': '||btrim(p_motivo)),
      actualizado_por=v_uid,
      actualizado_en=now()
  where id=p_orden_id;

  insert into public.orden_estados_historial(
    orden_id,estado_anterior,estado_nuevo,comentario,usuario
  ) values(
    p_orden_id,v_o.estado,'Anulado',
    v_accion||' de forma segura: '||btrim(p_motivo)||
      case when v_retorno_no_entregado
        then ' Orden retornada desde No entregado; lote e intento conservados como historial.'
        else '' end,
    v_uid
  );

  insert into public.orden_archivos_v9383(
    orden_id,orden_codigo,accion,motivo,estado_anterior,usuario_id,snapshot
  ) values(
    p_orden_id,v_o.codigo,v_accion,btrim(p_motivo),v_o.estado,v_uid,v_snapshot
  );

  select * into v_perfil from public.perfiles where id=v_uid;
  insert into public.auditoria_excepciones(
    usuario_id,usuario_nombre,usuario_rol,modulo,tipo_evento,gravedad,
    accion,motivo,orden_id,orden_codigo,cliente_nombre,detalle
  ) values(
    v_uid,coalesce(v_perfil.nombre,v_perfil.correo,v_uid::text),v_perfil.rol,
    'Órdenes','Cancelación segura de orden','Crítica',v_accion,btrim(p_motivo),
    p_orden_id,v_o.codigo,coalesce(v_o.cliente_nombre_orden,'Cliente'),
    jsonb_build_object(
      'estado_anterior',v_o.estado,
      'archivada',p_archivar,
      'retornada_desde_no_entregado',v_retorno_no_entregado,
      'lote_historico',v_o.ultimo_lote_no_entregado,
      'snapshot_id',currval(pg_get_serial_sequence('public.orden_archivos_v9383','id')),
      'version','9.3.9.6'
    )
  );

  return jsonb_build_object(
    'ok',true,'orden_id',p_orden_id,'codigo',v_o.codigo,
    'accion',v_accion,'estado','Anulado','archivada',p_archivar,
    'retornada_desde_no_entregado',v_retorno_no_entregado,
    'version','9.3.9.6'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.revertir_gestion_segura(p_llamada_id bigint, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid:=auth.uid();
  v_o public.ordenes%rowtype;
  v_total integer:=0;
  v_motivo text:=btrim(coalesce(p_motivo,''));
begin
  if v_uid is null then raise exception 'Sesión requerida.'; end if;
  if not public.es_admin_operativo() then raise exception 'Solo Gerente/Administrador puede revertir gestiones con órdenes.'; end if;
  if char_length(v_motivo)<5 then raise exception 'El motivo debe tener al menos 5 caracteres.'; end if;
  if not exists(select 1 from public.llamadas where id=p_llamada_id for update) then
    raise exception 'La gestión no existe o ya fue revertida.';
  end if;

  for v_o in select * from public.ordenes where llamada_id=p_llamada_id for update loop
    perform public.cancelar_orden_v9383(
      v_o.id,v_o.estado,'Reverso de gestión: '||v_motivo,
      v_o.estado in('Programada','Pedido recibido')
      and v_o.tomado_por is null and v_o.preparado_por is null
      and v_o.facturado_por is null and v_o.validado_por is null
      and not exists(select 1 from public.orden_pesos p where p.orden_id=v_o.id)
    );
    update public.ordenes
    set llamada_id=null,pedido_crm_id=null,actualizado_por=v_uid,actualizado_en=now()
    where id=v_o.id;
    v_total:=v_total+1;
  end loop;

  delete from public.pedidos where llamada_id=p_llamada_id;
  delete from public.llamadas where id=p_llamada_id;

  return jsonb_build_object(
    'ok',true,'message','Gestión revertida sin destruir órdenes ni trazabilidad.',
    'orders_archived_or_annulled',v_total
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.guardar_configuracion_v9390(p_clave text, p_valor jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid:=auth.uid();
  v_actual public.sistema_configuracion%rowtype;
  v_revision bigint;
begin
  if v_uid is null then raise exception 'Sesión requerida.'; end if;
  if not public.es_admin_operativo() then
    raise exception 'Solo administración puede modificar la configuración global.';
  end if;
  if nullif(btrim(coalesce(p_clave,'')),'') is null then
    raise exception 'La clave de configuración es obligatoria.';
  end if;
  if p_valor is null then raise exception 'El valor de configuración es obligatorio.'; end if;

  select * into v_actual
  from public.sistema_configuracion
  where clave=p_clave
  for update;

  if found then
    v_revision:=coalesce(v_actual.revision,1)+1;
    update public.sistema_configuracion
       set valor=p_valor,
           actualizado_por=v_uid,
           actualizado_en=now(),
           revision=v_revision
     where clave=p_clave;
  else
    v_revision:=1;
    insert into public.sistema_configuracion(
      clave,valor,actualizado_por,actualizado_en,revision
    ) values(
      p_clave,p_valor,v_uid,now(),v_revision
    );
  end if;

  insert into public.sistema_configuracion_historial_v9390(
    clave,valor_anterior,valor_nuevo,revision_anterior,revision_nueva,usuario_id
  ) values(
    p_clave,
    case when v_actual.clave is null then null else v_actual.valor end,
    p_valor,
    case when v_actual.clave is null then null else v_actual.revision end,
    v_revision,
    v_uid
  );

  return jsonb_build_object(
    'ok',true,'clave',p_clave,'revision',v_revision,'actualizado_en',now()
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.pc_snapshot_pago_cliente_v9391()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_orden public.ordenes%rowtype;
begin
  select * into v_orden from public.ordenes where id=new.orden_id;
  if not found then raise exception 'La orden asociada al pago no existe.'; end if;

  new.cliente_id:=coalesce(new.cliente_id,v_orden.cliente_id);
  new.cliente_nombre:=coalesce(
    nullif(btrim(new.cliente_nombre),''),
    nullif(btrim(v_orden.cliente_nombre_orden),''),
    (select nullif(btrim(c.negocio),'') from public.clientes c where c.id=v_orden.cliente_id),
    'Cliente ocasional'
  );
  new.cliente_telefono:=coalesce(
    nullif(btrim(new.cliente_telefono),''),
    nullif(btrim(v_orden.cliente_telefono_orden),''),
    (select nullif(btrim(c.telefono),'') from public.clientes c where c.id=v_orden.cliente_id)
  );
  new.tipo_cliente:=coalesce(
    nullif(btrim(new.tipo_cliente),''),
    nullif(btrim(v_orden.tipo_cliente_orden),''),
    case when v_orden.cliente_id is null then 'Ocasional' else 'Registrado' end
  );

  if new.cliente_id is null and nullif(btrim(new.cliente_nombre),'') is null then
    raise exception 'El pago de un cliente ocasional requiere el nombre conservado en la orden.';
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.guardar_preparacion_faltantes_v9391(p_orden_id bigint, p_lineas jsonb, p_cabecera jsonb, p_generar_pendiente boolean DEFAULT false, p_fecha_estimada date DEFAULT NULL::date, p_observacion text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid:=auth.uid();
  v_origen public.ordenes%rowtype;
  v_pendiente_id bigint;
  v_pendiente_codigo text;
  v_faltantes integer;
  v_resultado record;
begin
  if v_uid is null then raise exception 'Sesión no válida.'; end if;
  if jsonb_typeof(p_lineas)<>'array' then raise exception 'Detalle de preparación no válido.'; end if;

  select * into v_origen from public.ordenes where id=p_orden_id for update;
  if not found then raise exception 'La orden original ya no existe.'; end if;

  select count(*) into v_faltantes
  from jsonb_array_elements(p_lineas) l
  where l->>'estado_preparacion'='Sin existencia';

  if p_generar_pendiente and v_faltantes=0 then
    raise exception 'No existen artículos marcados Sin existencia para generar seguimiento.';
  end if;

  -- El guardado final y la creación del pendiente comparten la misma transacción.
  select * into v_resultado
  from public.guardar_preparacion_v9381(p_orden_id,p_lineas,p_cabecera,true);

  if p_generar_pendiente then
    select id,codigo into v_pendiente_id,v_pendiente_codigo
    from public.ordenes
    where orden_origen_id=p_orden_id
      and es_pendiente_existencia
      and estado<>'Anulado'
    for update;

    if v_pendiente_id is null then
      insert into public.ordenes(
        cliente_id,tipo_cliente_orden,cliente_nombre_orden,cliente_telefono_orden,
        cliente_sector_orden,cliente_direccion_orden,cliente_referencia_orden,
        modalidad_entrega,fecha,fecha_despacho,hora_despacho,es_programada,
        nota_programacion,prioridad,tipo_orden,requiere_preparacion,
        requiere_facturacion,requiere_delivery,canal,vendedor,estado,
        condicion_pago,total_estimado,total_factura,delivery_nombre,zona,notas,
        orden_origen_id,es_pendiente_existencia,creado_por,actualizado_por
      ) values (
        v_origen.cliente_id,v_origen.tipo_cliente_orden,v_origen.cliente_nombre_orden,
        v_origen.cliente_telefono_orden,v_origen.cliente_sector_orden,
        v_origen.cliente_direccion_orden,v_origen.cliente_referencia_orden,
        v_origen.modalidad_entrega,current_date,
        coalesce(p_fecha_estimada,current_date+1),v_origen.hora_despacho,true,
        concat_ws(' · ','Pendiente por artículos sin existencia de '||v_origen.codigo,
          nullif(btrim(p_observacion),'')),
        coalesce(v_origen.prioridad,'Normal'),coalesce(v_origen.tipo_orden,'Pedido normal'),
        true,true,v_origen.requiere_delivery,v_origen.canal,v_origen.vendedor,
        'Pendiente por existencia',v_origen.condicion_pago,0,0,
        v_origen.delivery_nombre,v_origen.zona,
        'Generada automáticamente desde '||v_origen.codigo||'. No preparar hasta liberar existencia.',
        p_orden_id,true,v_uid,v_uid
      ) returning id,codigo into v_pendiente_id,v_pendiente_codigo;

      insert into public.orden_detalle(
        orden_id,producto_id,producto_nombre,cantidad_pedida,unidad,precio,subtotal,notas,
        cantidad_preparada,estado_preparacion,nota_preparacion,
        peso_equivalente_preparado,tipo_despacho_peso,requiere_pesaje,peso_estandar_lb,
        tolerancia_lb,suma_peso_final,permite_fraccion,peso_equivalente_solicitado
      )
      select
        v_pendiente_id,d.producto_id,d.producto_nombre,d.cantidad_pedida,d.unidad,d.precio,
        round(d.cantidad_pedida*d.precio,2),
        concat_ws(' | ',nullif(btrim(d.notas),''),'Faltante de '||v_origen.codigo),
        null,'Pendiente',null,0,d.tipo_despacho_peso,d.requiere_pesaje,d.peso_estandar_lb,
        d.tolerancia_lb,d.suma_peso_final,d.permite_fraccion,d.peso_equivalente_solicitado
      from public.orden_detalle d
      join jsonb_array_elements(p_lineas) l
        on nullif(l->>'id','')::bigint=d.id
      where d.orden_id=p_orden_id
        and l->>'estado_preparacion'='Sin existencia';

      update public.ordenes p
      set total_estimado=coalesce((
        select sum(subtotal) from public.orden_detalle where orden_id=p.id
      ),0)
      where p.id=v_pendiente_id;

      insert into public.orden_estados_historial(
        orden_id,estado_anterior,estado_nuevo,comentario,usuario
      ) values (
        v_pendiente_id,null,'Pendiente por existencia',
        'Generada desde '||v_origen.codigo||' con '||v_faltantes||' artículo(s) sin existencia.',
        v_uid
      );
      insert into public.orden_estados_historial(
        orden_id,estado_anterior,estado_nuevo,comentario,usuario
      ) values (
        p_orden_id,v_origen.estado,'Lista para facturar',
        'Se creó '||v_pendiente_codigo||' para dar seguimiento a artículos sin existencia.',
        v_uid
      );
    end if;
  end if;

  return jsonb_build_object(
    'ok',true,'orden_id',p_orden_id,'orden_codigo',v_resultado.codigo,
    'faltantes',v_faltantes,'pendiente_generada',p_generar_pendiente,
    'pendiente_id',v_pendiente_id,'pendiente_codigo',v_pendiente_codigo
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.liberar_pendiente_existencia_v9391(p_orden_id bigint, p_observacion text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid:=auth.uid();
  v_orden public.ordenes%rowtype;
begin
  if v_uid is null then raise exception 'Sesión no válida.'; end if;
  if not public.tiene_algun_modulo(array['ordenes','carniceria'],'editar')
     and not public.es_admin_operativo() then
    raise exception 'No tienes permiso para liberar esta orden.';
  end if;
  select * into v_orden from public.ordenes where id=p_orden_id for update;
  if not found then raise exception 'La orden pendiente no existe.'; end if;
  if not v_orden.es_pendiente_existencia or v_orden.estado<>'Pendiente por existencia' then
    raise exception 'La orden ya fue liberada o no corresponde a un faltante.';
  end if;

  update public.ordenes
  set estado='Pedido recibido',fecha_despacho=current_date,es_programada=false,
      liberado_existencia_en=now(),liberado_existencia_por=v_uid,
      nota_programacion=concat_ws(' · ',nota_programacion,nullif(btrim(p_observacion),'')),
      actualizado_por=v_uid,actualizado_en=now()
  where id=p_orden_id;

  insert into public.orden_estados_historial(
    orden_id,estado_anterior,estado_nuevo,comentario,usuario
  ) values (
    p_orden_id,'Pendiente por existencia','Pedido recibido',
    concat_ws(' · ','Existencia confirmada; enviada a Carnicería.',nullif(btrim(p_observacion),'')),
    v_uid
  );
  return jsonb_build_object('ok',true,'orden_id',p_orden_id,'codigo',v_orden.codigo);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.registrar_devolucion_parcial_v9392(p_orden_id bigint, p_lineas jsonb, p_monto_recibido numeric, p_metodo text, p_recibido_por text, p_observacion text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid:=auth.uid();
  v_orden public.ordenes%rowtype;
  v_lote public.entrega_lotes%rowtype;
  v_linea jsonb;
  v_det public.orden_detalle%rowtype;
  v_devolucion_id bigint;
  v_total numeric(14,2);
  v_devuelto numeric(14,2):=0;
  v_neto numeric(14,2);
  v_cash numeric(14,2):=round(coalesce(p_monto_recibido,0),2);
  v_peso_original numeric(14,3);
  v_peso_devuelto numeric(14,3):=0;
  v_peso_neto numeric(14,3);
  v_qty numeric(14,3);
  v_weight numeric(14,3);
  v_delivered numeric(14,3);
  v_amount numeric(14,2);
  v_final jsonb;
begin
  if v_uid is null then raise exception 'Sesión no válida.'; end if;
  if not public.puede_modulo_v930r5('liquidacion','editar') then
    raise exception 'No tienes permiso para recibir devoluciones.';
  end if;
  if jsonb_typeof(p_lineas)<>'array' or jsonb_array_length(p_lineas)=0 then
    raise exception 'Selecciona al menos un artículo devuelto.';
  end if;

  select * into v_orden from public.ordenes where id=p_orden_id for update;
  if not found then raise exception 'No se encontró la orden.'; end if;
  if v_orden.recibido_en is not null then raise exception 'Esta orden ya fue recibida por CXC.'; end if;
  if exists(select 1 from public.orden_devoluciones where orden_id=p_orden_id and estado='Confirmada') then
    raise exception 'Esta orden ya tiene una devolución parcial confirmada.';
  end if;

  select l.* into v_lote
  from public.entrega_lote_detalle d
  join public.entrega_lotes l on l.id=d.lote_id
  where d.orden_id=p_orden_id and lower(coalesce(l.estado,''))<>'revertido'
  order by l.id desc limit 1 for update of l;
  if not found then raise exception 'La orden no tiene un lote de delivery activo.'; end if;
  if lower(coalesce(v_lote.estado,''))='cerrado' then raise exception 'El lote ya está cerrado.'; end if;

  v_total:=round(coalesce(v_orden.total_factura,v_orden.total_estimado,0),2);
  v_peso_original:=round(coalesce(v_orden.peso_validado,v_orden.peso_preparado,0),3);

  for v_linea in select value from jsonb_array_elements(p_lineas)
  loop
    select * into v_det from public.orden_detalle
    where id=nullif(v_linea->>'detalle_id','')::bigint and orden_id=p_orden_id
    for update;
    if not found then raise exception 'Uno de los artículos no pertenece a la orden.'; end if;
    v_delivered:=coalesce(v_det.cantidad_preparada,v_det.cantidad_pedida,0);
    v_qty:=round(coalesce(nullif(v_linea->>'cantidad','')::numeric,0),3);
    v_weight:=round(coalesce(nullif(v_linea->>'peso','')::numeric,0),3);
    if v_qty<=0 or v_qty>v_delivered then
      raise exception 'Cantidad devuelta inválida para %.',v_det.producto_nombre;
    end if;
    if v_weight<0 or (v_peso_original>0 and v_peso_devuelto+v_weight>v_peso_original+0.001) then
      raise exception 'Peso devuelto inválido para %.',v_det.producto_nombre;
    end if;
    if coalesce(length(btrim(v_linea->>'motivo')),0)<3 then
      raise exception 'Escribe el motivo de devolución para %.',v_det.producto_nombre;
    end if;
    if coalesce(v_linea->>'destino','') not in('Inventario','Merma','Revision') then
      raise exception 'Destino de devolución inválido.';
    end if;
    v_amount:=round(v_qty*coalesce(v_det.precio,0),2);
    v_devuelto:=v_devuelto+v_amount;
    v_peso_devuelto:=v_peso_devuelto+v_weight;
  end loop;

  v_devuelto:=round(v_devuelto,2);
  v_peso_devuelto:=round(v_peso_devuelto,3);
  if v_devuelto<=0 then raise exception 'El valor devuelto debe ser mayor que cero.'; end if;
  if v_devuelto>=v_total-0.01 then raise exception 'La devolución total debe registrarse como No entregado.'; end if;
  v_neto:=round(v_total-v_devuelto,2);
  v_peso_neto:=greatest(round(v_peso_original-v_peso_devuelto,3),0);
  if abs(v_cash-v_neto)>0.01 then
    raise exception 'El efectivo debe coincidir con el total neto de %.',v_neto;
  end if;

  insert into public.orden_devoluciones(
    orden_id,monto_original,monto_devuelto,monto_neto,peso_original,peso_devuelto,
    peso_neto,observacion,recibido_por,creado_por
  ) values (
    p_orden_id,v_total,v_devuelto,v_neto,v_peso_original,v_peso_devuelto,
    v_peso_neto,nullif(btrim(p_observacion),''),coalesce(nullif(btrim(p_recibido_por),''),'CXC'),v_uid
  ) returning id into v_devolucion_id;

  for v_linea in select value from jsonb_array_elements(p_lineas)
  loop
    select * into v_det from public.orden_detalle
    where id=(v_linea->>'detalle_id')::bigint and orden_id=p_orden_id;
    v_delivered:=coalesce(v_det.cantidad_preparada,v_det.cantidad_pedida,0);
    v_qty:=round((v_linea->>'cantidad')::numeric,3);
    v_weight:=round(coalesce(nullif(v_linea->>'peso','')::numeric,0),3);
    v_amount:=round(v_qty*coalesce(v_det.precio,0),2);
    insert into public.orden_devolucion_detalle(
      devolucion_id,orden_detalle_id,producto_id,producto_nombre,unidad,
      cantidad_entregada,cantidad_devuelta,precio,monto_devuelto,peso_devuelto,destino,motivo
    ) values (
      v_devolucion_id,v_det.id,v_det.producto_id,v_det.producto_nombre,v_det.unidad,
      v_delivered,v_qty,coalesce(v_det.precio,0),v_amount,v_weight,
      v_linea->>'destino',btrim(v_linea->>'motivo')
    );
  end loop;

  if v_cash>0.01 then
    insert into public.orden_pagos(orden_id,cliente_id,monto,metodo,recibido_por)
    values(p_orden_id,v_orden.cliente_id,v_cash,coalesce(nullif(btrim(p_metodo),''),'Efectivo'),v_uid);
  end if;
  insert into public.orden_entregas(orden_id,resultado,monto_cobrado,monto_pendiente,notas,creado_por)
  values(p_orden_id,'Devuelto parcial',v_cash,v_devuelto,
    concat_ws(' | ',nullif(btrim(p_observacion),''),'Devolución V9.3.9.2 por artículos. Valor devuelto: '||v_devuelto||'. Total neto: '||v_neto||'.'),v_uid);

  update public.ordenes set
    estado='Devuelto parcial',resultado_entrega='Devuelto parcial',
    monto_cobrado=v_cash,monto_pendiente=v_devuelto,monto_devuelto=v_devuelto,
    total_neto_liquidacion=v_neto,peso_devuelto=v_peso_devuelto,peso_neto_entregado=v_peso_neto,
    recibido_por=coalesce(nullif(btrim(p_recibido_por),''),'CXC'),recibido_en=now(),
    notas_liquidacion=concat_ws(' | ',nullif(btrim(notas_liquidacion),''),
      nullif(btrim(p_observacion),''),'V9.3.9.2: devolución por artículos. Neto '||v_neto||'. Peso neto '||v_peso_neto||' lb.')
  where id=p_orden_id;

  update public.entrega_lote_detalle set
    estado_liquidacion='Recibido',resultado_entrega='Devuelto parcial',
    monto_cobrado=v_cash,monto_credito=0,
    monto_factura=v_neto,peso_entregado=v_peso_neto,
    observacion=concat_ws(' | ',nullif(btrim(observacion),''),'Devolución '||v_devuelto||' · peso devuelto '||v_peso_devuelto||' lb')
  where lote_id=v_lote.id and orden_id=p_orden_id;

  insert into public.orden_estados_historial(orden_id,estado_anterior,estado_nuevo,comentario,usuario)
  values(p_orden_id,v_orden.estado,'Devuelto parcial',
    'Devolución parcial V9.3.9.2. Factura original '||v_total||', devolución '||v_devuelto||', neto '||v_neto||', peso devuelto '||v_peso_devuelto||' lb.',v_uid);

  v_final:=public.pc_finalizar_lote_cxc_v937(v_lote.id,p_recibido_por,p_observacion);
  return v_final||jsonb_build_object(
    'orden_id',p_orden_id,'devolucion_id',v_devolucion_id,'resultado','Devuelto parcial',
    'monto_original',v_total,'monto_devuelto',v_devuelto,'monto_neto',v_neto,
    'peso_original',v_peso_original,'peso_devuelto',v_peso_devuelto,'peso_neto',v_peso_neto
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.recibir_lote_cxc_v9392_r2(p_lote_id bigint, p_items jsonb, p_recibido_por text, p_observacion text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_lote public.entrega_lotes%rowtype;
  v_item jsonb;
  v_resultado text;
  v_missing integer;
  v_invalid integer;
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Sesión no válida.'; end if;
  if not public.puede_modulo_v930r5('liquidacion','editar') then
    raise exception 'No tienes permiso para recibir liquidaciones.';
  end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then
    raise exception 'El lote no contiene clientes para recibir.';
  end if;

  select * into v_lote from public.entrega_lotes where id=p_lote_id for update;
  if not found then raise exception 'No se encontró el lote.'; end if;
  if lower(coalesce(v_lote.estado,'')) in('cerrado','revertido') then
    raise exception 'El lote está % y no puede recibirse.',v_lote.estado;
  end if;

  select count(*) into v_invalid
  from jsonb_array_elements(p_items) j
  where nullif(j->>'orden_id','') is null
     or coalesce(j->>'resultado','') not in('Cobrado','Entregado a crédito','No entregado','Devuelto parcial')
     or not exists(
       select 1 from public.entrega_lote_detalle d
       join public.ordenes o on o.id=d.orden_id
       where d.lote_id=v_lote.id
         and d.orden_id=(j->>'orden_id')::bigint
         and o.recibido_en is null
     );
  if v_invalid>0 then
    raise exception 'La recepción contiene % cliente(s) inválidos, ajenos al lote o ya recibidos.',v_invalid;
  end if;

  if (select count(*) from jsonb_array_elements(p_items)) <>
     (select count(distinct (j->>'orden_id')) from jsonb_array_elements(p_items) j) then
    raise exception 'La recepción contiene una orden repetida dentro del mismo lote.';
  end if;

  select count(*) into v_missing
  from public.entrega_lote_detalle d
  join public.ordenes o on o.id=d.orden_id
  where d.lote_id=v_lote.id and o.recibido_en is null
    and not exists(
      select 1 from jsonb_array_elements(p_items) j
      where (j->>'orden_id')::bigint=o.id
    );
  if v_missing>0 then
    raise exception 'Faltan % cliente(s) pendientes dentro de la recepción del lote.',v_missing;
  end if;

  if exists(
    select 1 from jsonb_array_elements(p_items) j
    where j->>'resultado'='Devuelto parcial'
      and (coalesce(jsonb_typeof(j->'lineas'),'')<>'array' or coalesce(jsonb_array_length(j->'lineas'),0)=0)
  ) then
    raise exception 'Toda devolución parcial debe incluir el detalle de artículos.';
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_resultado:=v_item->>'resultado';
    if v_resultado='Devuelto parcial' then
      v_result:=public.registrar_devolucion_parcial_v9392(
        (v_item->>'orden_id')::bigint,
        v_item->'lineas',
        coalesce(nullif(v_item->>'monto_recibido','')::numeric,0),
        coalesce(nullif(v_item->>'metodo',''),'Efectivo'),
        p_recibido_por,
        concat_ws(' | ',nullif(btrim(v_item->>'observacion'),''),nullif(btrim(p_observacion),''))
      );
    else
      v_result:=public.recibir_orden_cxc_v937(
        (v_item->>'orden_id')::bigint,
        v_resultado,
        coalesce(nullif(v_item->>'monto_recibido','')::numeric,0),
        coalesce(nullif(v_item->>'metodo',''),'Efectivo'),
        p_recibido_por,
        concat_ws(' | ',nullif(btrim(v_item->>'observacion'),''),nullif(btrim(p_observacion),''))
      );
    end if;
  end loop;

  return coalesce(v_result,jsonb_build_object('ok',false,'mensaje','No se procesaron clientes.'))
    ||jsonb_build_object('version','9.3.9.2 R2','cierre_atomico',true);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.pc_retornar_no_entregado_validacion_v9393(p_orden_id bigint, p_lote_id bigint, p_recibido_por text, p_observacion text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_orden public.ordenes%rowtype;
  v_lote public.entrega_lotes%rowtype;
  v_motivo text:=btrim(coalesce(p_observacion,''));
  v_now timestamptz:=now();
begin
  select * into v_orden from public.ordenes where id=p_orden_id for update;
  if not found then raise exception 'No se encontró la orden no entregada.'; end if;
  select * into v_lote from public.entrega_lotes where id=p_lote_id for update;
  if not found then raise exception 'No se encontró el lote del intento de entrega.'; end if;
  if v_motivo='' then raise exception 'Debes indicar el motivo por el cual el pedido no fue entregado.'; end if;

  if v_orden.estado='Facturada' and v_orden.resultado_entrega is null
     and v_orden.recibido_en is null
     and v_orden.ultimo_lote_no_entregado=v_lote.codigo_lote then
    return jsonb_build_object('ok',true,'orden_id',v_orden.id,
      'retornada_validacion',true,'ya_procesada',true,'codigo_lote',v_lote.codigo_lote);
  end if;

  if coalesce(v_orden.resultado_entrega,v_orden.estado)<>'No entregado'
     or v_orden.recibido_en is null then
    raise exception 'La orden no tiene una recepción No entregado pendiente de retorno.';
  end if;

  update public.ordenes
  set estado='Facturada', resultado_entrega=null, monto_cobrado=0, monto_pendiente=0,
      recibido_por=null, recibido_en=null, delivery_nombre=null,
      asignado_delivery_en=null, en_ruta_en=null,
      ultimo_resultado_delivery='No entregado',
      ultimo_lote_no_entregado=v_lote.codigo_lote,
      ultimo_no_entregado_en=v_now,
      no_entregado_reintentos=coalesce(no_entregado_reintentos,0)+1,
      notas_validacion=concat_ws(' | ',nullif(btrim(notas_validacion),''),
        'Pendiente de reasignación. No entregado en lote '||v_lote.codigo_lote||
        '. Motivo: '||v_motivo||'. Recibido en CXC por '||
        coalesce(nullif(btrim(p_recibido_por),''),'CXC')||'.')
  where id=v_orden.id;

  insert into public.orden_estados_historial(
    orden_id,estado_anterior,estado_nuevo,comentario,usuario
  ) values (
    v_orden.id,'No entregado','Facturada',
    'V9.3.9.5: pedido no entregado regresó a Validación para reasignación. '||
    'Lote anterior: '||v_lote.codigo_lote||'. Motivo: '||v_motivo||
    '. Factura y pesaje original conservados.',auth.uid()
  );

  insert into public.liquidacion_lote_eventos(
    lote_id,codigo_lote,liquidacion_id,accion,motivo,
    usuario_id,usuario_nombre,metadata
  ) values (
    v_lote.id,v_lote.codigo_lote,
    (select id from public.liquidaciones_lotes where lote_id=v_lote.id order by id limit 1),
    'no_entregado_retorna_validacion',v_motivo,auth.uid(),
    nullif(btrim(p_recibido_por),''),
    jsonb_build_object('orden_id',v_orden.id,'codigo_orden',v_orden.codigo,
      'estado_anterior','No entregado','estado_nuevo','Facturada',
      'pendiente_reasignacion',true,'factura_conservada',v_orden.factura_no,
      'peso_validado_conservado',v_orden.peso_validado,
      'reintento',coalesce(v_orden.no_entregado_reintentos,0)+1,
      'version','9.3.9.5')
  );

  return jsonb_build_object('ok',true,'orden_id',v_orden.id,
    'codigo_orden',v_orden.codigo,'retornada_validacion',true,
    'pendiente_reasignacion',true,'codigo_lote',v_lote.codigo_lote,
    'version','9.3.9.5');
end;
$function$
;

CREATE OR REPLACE FUNCTION public.pc_finalizar_lote_cxc_v9393(p_lote_id bigint, p_recibido_por text, p_observacion text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_ids bigint[];
  v_result jsonb;
begin
  select array_agg(o.id) into v_ids
  from public.entrega_lote_detalle d
  join public.entrega_lotes l on l.id=d.lote_id
  join public.ordenes o on o.id=d.orden_id
  where d.lote_id=p_lote_id
    and d.estado_liquidacion='Recibido'
    and d.resultado_entrega='No entregado'
    and o.estado='Facturada'
    and o.resultado_entrega is null
    and o.recibido_en is null
    and o.ultimo_lote_no_entregado=l.codigo_lote;

  if coalesce(array_length(v_ids,1),0)>0 then
    update public.ordenes
    set estado='No entregado',resultado_entrega='No entregado',
        recibido_en=coalesce(ultimo_no_entregado_en,now()),
        recibido_por=coalesce(nullif(btrim(p_recibido_por),''),'CXC'),
        monto_cobrado=0,monto_pendiente=0
    where id=any(v_ids);
  end if;

  v_result:=public.pc_finalizar_lote_cxc_v937(p_lote_id,p_recibido_por,p_observacion);

  if coalesce(array_length(v_ids,1),0)>0 then
    update public.ordenes
    set estado='Facturada',resultado_entrega=null,recibido_en=null,
        recibido_por=null,monto_cobrado=0,monto_pendiente=0
    where id=any(v_ids);
  end if;

  return v_result||jsonb_build_object(
    'version_finalizacion','9.3.9.3',
    'no_entregados_reabiertos',coalesce(array_length(v_ids,1),0)
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.recibir_orden_cxc_v9393(p_orden_id bigint, p_resultado text, p_monto_recibido numeric, p_metodo text, p_recibido_por text, p_observacion text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_lote_id bigint; v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Sesión no válida.'; end if;
  select d.lote_id into v_lote_id
  from public.entrega_lote_detalle d join public.entrega_lotes l on l.id=d.lote_id
  where d.orden_id=p_orden_id and lower(coalesce(l.estado,''))<>'revertido'
  order by d.id desc limit 1;
  if v_lote_id is null then raise exception 'La orden no tiene un lote activo.'; end if;

  v_result:=public.recibir_orden_cxc_v937(
    p_orden_id,p_resultado,p_monto_recibido,p_metodo,p_recibido_por,p_observacion);
  if p_resultado='No entregado' then
    v_result:=v_result||public.pc_retornar_no_entregado_validacion_v9393(
      p_orden_id,v_lote_id,p_recibido_por,p_observacion);
    v_result:=v_result||public.pc_finalizar_lote_cxc_v9393(
      v_lote_id,p_recibido_por,p_observacion);
  end if;
  return v_result||jsonb_build_object('version','9.3.9.3');
end;
$function$
;

CREATE OR REPLACE FUNCTION public.recibir_lote_cxc_v9393(p_lote_id bigint, p_items jsonb, p_recibido_por text, p_observacion text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_lote public.entrega_lotes%rowtype; v_item jsonb; v_resultado text;
  v_missing integer; v_invalid integer; v_result jsonb; v_returned integer:=0;
begin
  if auth.uid() is null then raise exception 'Sesión no válida.'; end if;
  if not public.puede_modulo_v930r5('liquidacion','editar') then
    raise exception 'No tienes permiso para recibir liquidaciones.';
  end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then
    raise exception 'El lote no contiene clientes para recibir.';
  end if;
  select * into v_lote from public.entrega_lotes where id=p_lote_id for update;
  if not found then raise exception 'No se encontró el lote.'; end if;
  if lower(coalesce(v_lote.estado,'')) in('cerrado','revertido') then
    raise exception 'El lote está % y no puede recibirse.',v_lote.estado;
  end if;

  select count(*) into v_invalid from jsonb_array_elements(p_items) j
  where nullif(j->>'orden_id','') is null
     or coalesce(j->>'resultado','') not in('Cobrado','Entregado a crédito','No entregado','Devuelto parcial')
     or not exists(select 1 from public.entrega_lote_detalle d
       join public.ordenes o on o.id=d.orden_id
       where d.lote_id=v_lote.id and d.orden_id=(j->>'orden_id')::bigint
         and o.recibido_en is null);
  if v_invalid>0 then
    raise exception 'La recepción contiene % cliente(s) inválidos, ajenos al lote o ya recibidos.',v_invalid;
  end if;
  if (select count(*) from jsonb_array_elements(p_items)) <>
     (select count(distinct (j->>'orden_id')) from jsonb_array_elements(p_items) j) then
    raise exception 'La recepción contiene una orden repetida dentro del mismo lote.';
  end if;
  select count(*) into v_missing from public.entrega_lote_detalle d
  join public.ordenes o on o.id=d.orden_id
  where d.lote_id=v_lote.id and o.recibido_en is null
    and not exists(select 1 from jsonb_array_elements(p_items) j
      where (j->>'orden_id')::bigint=o.id);
  if v_missing>0 then
    raise exception 'Faltan % cliente(s) pendientes dentro de la recepción del lote.',v_missing;
  end if;
  if exists(select 1 from jsonb_array_elements(p_items) j
    where j->>'resultado'='No entregado'
      and btrim(coalesce(j->>'observacion',p_observacion,''))='') then
    raise exception 'Cada pedido no entregado debe incluir el motivo del intento fallido.';
  end if;
  if exists(select 1 from jsonb_array_elements(p_items) j
    where j->>'resultado'='Devuelto parcial'
      and (coalesce(jsonb_typeof(j->'lineas'),'')<>'array'
        or coalesce(jsonb_array_length(j->'lineas'),0)=0)) then
    raise exception 'Toda devolución parcial debe incluir el detalle de artículos.';
  end if;

  -- Los no entregados van al final: así el lote genera primero su snapshot de cierre.
  for v_item in select value from jsonb_array_elements(p_items)
    order by case when value->>'resultado'='No entregado' then 1 else 0 end
  loop
    v_resultado:=v_item->>'resultado';
    if v_resultado='Devuelto parcial' then
      v_result:=public.registrar_devolucion_parcial_v9392(
        (v_item->>'orden_id')::bigint,v_item->'lineas',
        coalesce(nullif(v_item->>'monto_recibido','')::numeric,0),
        coalesce(nullif(v_item->>'metodo',''),'Efectivo'),p_recibido_por,
        concat_ws(' | ',nullif(btrim(v_item->>'observacion'),''),nullif(btrim(p_observacion),''))
      );
    else
      v_result:=public.recibir_orden_cxc_v937(
        (v_item->>'orden_id')::bigint,v_resultado,
        coalesce(nullif(v_item->>'monto_recibido','')::numeric,0),
        coalesce(nullif(v_item->>'metodo',''),'Efectivo'),p_recibido_por,
        concat_ws(' | ',nullif(btrim(v_item->>'observacion'),''),nullif(btrim(p_observacion),''))
      );
    end if;
  end loop;

  -- Después del cierre formal se reabren solo las órdenes no entregadas.
  for v_item in select value from jsonb_array_elements(p_items)
    where value->>'resultado'='No entregado'
  loop
    perform public.pc_retornar_no_entregado_validacion_v9393(
      (v_item->>'orden_id')::bigint,v_lote.id,p_recibido_por,
      concat_ws(' | ',nullif(btrim(v_item->>'observacion'),''),nullif(btrim(p_observacion),''))
    );
    v_returned:=v_returned+1;
  end loop;

  return coalesce(v_result,jsonb_build_object('ok',false,'mensaje','No se procesaron clientes.'))
    ||jsonb_build_object('version','9.3.9.3','cierre_atomico',true,
      'no_entregados_a_validacion',v_returned);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.pc_validar_insert_orden_v9397()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.pc_validar_identidad_preparacion_v9397()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.tomar_orden_v9397(p_orden_id bigint, p_estado_esperado text, p_empleado_id bigint DEFAULT NULL::bigint, p_nombre text DEFAULT NULL::text, p_comentario text DEFAULT NULL::text)
 RETURNS TABLE(id bigint, codigo text, estado text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.crear_caso_especial_v9397(p_caso jsonb)
 RETURNS TABLE(id bigint, codigo text, estado text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.pc_sincronizar_cxc_orden_v940()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.registrar_cobro_cxc_v940(p_cliente_clave text, p_monto numeric, p_metodo text, p_referencia text, p_recibido_por text, p_observacion text, p_aplicaciones jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.reversar_cobro_cxc_v940(p_cobro_id bigint, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.actualizar_vencimiento_cxc_v940(p_orden_id bigint, p_vencimiento date, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.empleado_habilitado_area_v940r2(p_empleado_id bigint, p_area text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.fn_registrar_reprogramacion_v940r3()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  insert into public.orden_estados_historial(
    orden_id,estado_anterior,estado_nuevo,comentario,usuario
  ) values(
    new.id,old.estado,new.estado,
    format(
      'Programación actualizada: %s %s -> %s %s%s',
      coalesce(old.fecha_despacho::text,'sin fecha'),
      coalesce(to_char(old.hora_despacho,'HH24:MI'),''),
      coalesce(new.fecha_despacho::text,'sin fecha'),
      coalesce(to_char(new.hora_despacho,'HH24:MI'),''),
      case when old.estado not in('Programada','Pedido recibido')
        then ' · corrección administrativa' else '' end
    ),
    auth.uid()
  );
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.pc_validar_orden_con_detalle_v940r3()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if exists(
       select 1 from public.ordenes o
       where o.id=new.id
         and coalesce(o.archivada,false)=false
         and o.estado<>'Anulado'
     )
     and not exists(
       select 1 from public.orden_detalle d where d.orden_id=new.id
     ) then
    raise exception
      'La orden debe contener al menos un artículo. La operación fue revertida.';
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.guardar_orden_desde_llamada_v940r3(p_llamada jsonb, p_orden jsonb, p_items jsonb, p_llamada_observacion text DEFAULT NULL::text)
 RETURNS TABLE(id bigint, codigo text, estado text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid:=auth.uid();
  v_hoy_rd date:=timezone('America/Santo_Domingo',now())::date;
  v_token uuid;
  v_cliente_id bigint;
  v_llamada_id bigint;
  v_orden_id bigint;
begin
  if v_uid is null then raise exception 'Sesión no válida.'; end if;
  if jsonb_typeof(p_llamada)<>'object' then
    raise exception 'La gestión de llamada no es válida.';
  end if;
  if jsonb_typeof(p_orden)<>'object' then
    raise exception 'El encabezado de orden no es válido.';
  end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then
    raise exception 'La orden debe contener al menos un artículo.';
  end if;

  begin
    v_token:=nullif(p_llamada->>'idempotencia_token','')::uuid;
  exception when invalid_text_representation then
    raise exception 'El identificador de la operación no es válido.';
  end;
  if v_token is null then
    raise exception 'Falta el identificador seguro de la operación.';
  end if;

  v_cliente_id:=nullif(p_llamada->>'cliente_id','')::bigint;
  if v_cliente_id is null then
    raise exception 'Selecciona el cliente de la gestión.';
  end if;
  if not exists(select 1 from public.clientes c where c.id=v_cliente_id) then
    raise exception 'El cliente seleccionado ya no existe.';
  end if;
  if nullif(p_orden->>'cliente_id','')::bigint
     is distinct from v_cliente_id then
    raise exception 'La gestión y la orden deben pertenecer al mismo cliente.';
  end if;

  insert into public.llamadas(
    cliente_id,fecha,hora,vendedor,resultado,monto,proximo_contacto,
    observacion,idempotencia_orden_v940r3
  ) values(
    v_cliente_id,
    coalesce(nullif(p_llamada->>'fecha','')::date,v_hoy_rd),
    coalesce(
      nullif(p_llamada->>'hora','')::time,
      timezone('America/Santo_Domingo',now())::time
    ),
    nullif(btrim(p_llamada->>'vendedor'),''),
    'Pidió',
    coalesce(nullif(p_llamada->>'monto','')::numeric,0),
    nullif(p_llamada->>'proximo_contacto','')::date,
    nullif(btrim(p_llamada->>'observacion'),''),
    v_token
  )
  on conflict(idempotencia_orden_v940r3)
    where idempotencia_orden_v940r3 is not null
  do update
    set idempotencia_orden_v940r3=excluded.idempotencia_orden_v940r3
  returning llamadas.id into v_llamada_id;

  select o.id into v_orden_id
  from public.ordenes o
  where o.llamada_id=v_llamada_id
    and exists(
      select 1 from public.orden_detalle d where d.orden_id=o.id
    )
  for update;

  if v_orden_id is not null then
    return query
    select o.id,o.codigo,o.estado
    from public.ordenes o where o.id=v_orden_id;
    return;
  end if;

  return query
  select *
  from public.guardar_orden_v9381(
    null,v_llamada_id,p_orden,p_items,false,null,p_llamada_observacion
  );
end;
$function$
;

-- -----------------------------------------------------------------------------
-- Vistas security-invoker
-- -----------------------------------------------------------------------------

create view public.cxc_saldos_v940 with (security_invoker=true) as
 SELECT o.id AS orden_id,
    o.codigo AS orden_codigo,
    o.factura_no,
    o.cliente_id,
        CASE
            WHEN o.cliente_id IS NOT NULL THEN 'REG:'::text || o.cliente_id::text
            ELSE 'ORD:'::text || o.id::text
        END AS cliente_clave,
    COALESCE(c.negocio, o.cliente_nombre_orden, 'Cliente ocasional'::text) AS cliente_nombre,
    COALESCE(c.telefono, o.cliente_telefono_orden) AS cliente_telefono,
    c.codigo AS cliente_codigo,
    o.fecha,
    o.recibido_en,
    o.total_factura,
    o.monto_cobrado AS recibido_en_liquidacion,
    GREATEST(COALESCE(o.cxc_saldo_inicial, o.monto_pendiente, 0::numeric), 0::numeric) AS saldo_inicial_cxc,
    GREATEST(COALESCE(o.cxc_pagado_acumulado, 0::numeric), 0::numeric) AS abonado_cxc,
    GREATEST(COALESCE(o.monto_pendiente, 0::numeric), 0::numeric) AS saldo_pendiente,
    o.cxc_vencimiento,
    GREATEST(CURRENT_DATE - COALESCE(o.cxc_vencimiento, CURRENT_DATE), 0) AS dias_atraso,
        CASE
            WHEN COALESCE(o.monto_pendiente, 0::numeric) <= 0.01 THEN 'Pagado'::text
            WHEN COALESCE(o.cxc_vencimiento, CURRENT_DATE) >= CURRENT_DATE THEN 'Al día'::text
            WHEN (CURRENT_DATE - o.cxc_vencimiento) <= 30 THEN '1-30 días'::text
            WHEN (CURRENT_DATE - o.cxc_vencimiento) <= 60 THEN '31-60 días'::text
            ELSE '+60 días'::text
        END AS antiguedad,
        CASE
            WHEN COALESCE(o.monto_pendiente, 0::numeric) <= 0.01 THEN 'Pagado'::text
            WHEN COALESCE(o.cxc_pagado_acumulado, 0::numeric) > 0.01 THEN 'Abonado'::text
            ELSE 'Pendiente'::text
        END AS estado_cxc,
    o.cxc_ultimo_pago_en
   FROM ordenes o
     LEFT JOIN clientes c ON c.id = o.cliente_id
  WHERE COALESCE(o.cxc_saldo_inicial, 0::numeric) > 0::numeric AND COALESCE(o.archivada, false) = false;;

create view public.v_clientes_riesgo with (security_invoker=true) as
 SELECT id,
    codigo,
    contacto,
    negocio,
    tipo,
    sector,
    telefono,
    vendedor,
    dia_contacto,
    dia_contacto2,
    frecuencia,
    estado,
    ultimo_pedido,
    reprogramado_para,
    prioridad,
    whatsapp,
    credito,
    limite_credito,
    observaciones,
    archivado,
    creado_en,
    actualizado_en,
    CURRENT_DATE - ultimo_pedido AS dias_sin_pedido,
        CASE
            WHEN ultimo_pedido IS NULL THEN 'Sin compras'::text
            WHEN (CURRENT_DATE - ultimo_pedido) >= cfg_int('dias_perdido'::text, 90) THEN 'Perdido'::text
            WHEN (CURRENT_DATE - ultimo_pedido) >= cfg_int('dias_urgente'::text, 60) THEN 'Urgente'::text
            WHEN (CURRENT_DATE - ultimo_pedido) >= cfg_int('dias_recuperacion'::text, 30) THEN 'Recuperación'::text
            WHEN (CURRENT_DATE - ultimo_pedido) >= cfg_int('dias_seguimiento'::text, 15) THEN 'Seguimiento'::text
            ELSE 'OK'::text
        END AS nivel_riesgo
   FROM clientes c
  WHERE archivado = false AND estado <> 'Cerrado'::estado_cli;;

-- -----------------------------------------------------------------------------
-- Índices no creados por restricciones
-- -----------------------------------------------------------------------------

CREATE INDEX idx_auditoria_excepciones_fecha ON public.auditoria_excepciones USING btree (creado_en DESC);

CREATE INDEX idx_auditoria_excepciones_orden ON public.auditoria_excepciones USING btree (orden_id);

CREATE INDEX idx_auditoria_excepciones_revision ON public.auditoria_excepciones USING btree (estado_revision, gravedad, creado_en DESC);

CREATE INDEX idx_auditoria_excepciones_usuario ON public.auditoria_excepciones USING btree (usuario_id, creado_en DESC);

CREATE INDEX idx_cli_dia ON public.clientes USING btree (dia_contacto);

CREATE INDEX idx_cli_estado ON public.clientes USING btree (estado);

CREATE INDEX idx_cli_vendedor ON public.clientes USING btree (vendedor);

CREATE INDEX idx_cob_cliente ON public.cobranza USING btree (cliente_id);

CREATE INDEX idx_cxc_aplicaciones_orden_v940 ON public.cxc_cobro_aplicaciones USING btree (orden_id, cobro_id);

CREATE INDEX idx_cxc_cobros_cliente_fecha_v940 ON public.cxc_cobros USING btree (cliente_clave, fecha_cobro DESC);

CREATE INDEX idx_deliverys_config_activo ON public.deliverys_config USING btree (activo);

CREATE INDEX idx_empleados_areas_adicionales_v9375 ON public.empleados_operativos USING gin (areas_adicionales);

CREATE INDEX idx_empleados_operativos_activo ON public.empleados_operativos USING btree (activo);

CREATE INDEX idx_empleados_operativos_area ON public.empleados_operativos USING btree (area);

CREATE INDEX idx_entrega_documentos_lote_fecha ON public.entrega_documentos_historial USING btree (codigo_lote, fecha_evento DESC);

CREATE INDEX idx_entrega_documentos_usuario_fecha ON public.entrega_documentos_historial USING btree (usuario_id, fecha_evento DESC);

CREATE INDEX idx_entrega_lote_correcciones_lote_fecha ON public.entrega_lote_correcciones USING btree (lote_id, fecha_evento DESC);

CREATE INDEX idx_entrega_lote_detalle_lote ON public.entrega_lote_detalle USING btree (codigo_lote);

CREATE INDEX idx_entrega_lote_detalle_orden ON public.entrega_lote_detalle USING btree (orden_id);

CREATE INDEX idx_lote_detalle_lote_v9384 ON public.entrega_lote_detalle USING btree (lote_id, orden_id);

CREATE INDEX idx_lote_detalle_orden_v9384 ON public.entrega_lote_detalle USING btree (orden_id, lote_id);

CREATE UNIQUE INDEX uq_entrega_lote_detalle_lote_orden_v937 ON public.entrega_lote_detalle USING btree (lote_id, orden_id) WHERE ((lote_id IS NOT NULL) AND (orden_id IS NOT NULL));

CREATE INDEX idx_entrega_lotes_codigo ON public.entrega_lotes USING btree (codigo_lote);

CREATE INDEX idx_entrega_lotes_delivery_fecha ON public.entrega_lotes USING btree (delivery_nombre, fecha_entrega DESC);

CREATE INDEX idx_entrega_lotes_fecha_historial ON public.entrega_lotes USING btree (fecha_entrega DESC, delivery_nombre);

CREATE INDEX idx_entrega_lotes_responsable_estado_v9371 ON public.entrega_lotes USING btree (lower(responsable_nombre), estado, fecha_entrega DESC);

CREATE INDEX idx_entrega_transferencias_lotes_v9371 ON public.entrega_pedido_transferencias USING btree (lote_origen_id, lote_destino_id);

CREATE INDEX idx_entrega_transferencias_orden_fecha_v9371 ON public.entrega_pedido_transferencias USING btree (orden_id, creado_en DESC);

CREATE INDEX idx_liquidacion_lote_detalle_liq ON public.liquidacion_lote_detalle USING btree (liquidacion_id);

CREATE INDEX idx_liquidacion_lote_detalle_orden ON public.liquidacion_lote_detalle USING btree (orden_id);

CREATE UNIQUE INDEX uq_liquidacion_lote_detalle_liq_orden_v937 ON public.liquidacion_lote_detalle USING btree (liquidacion_id, orden_id) WHERE (orden_id IS NOT NULL);

CREATE INDEX idx_liquidacion_lote_eventos_codigo_fecha ON public.liquidacion_lote_eventos USING btree (upper(COALESCE(codigo_lote, ''::text)), creado_en DESC);

CREATE INDEX idx_liquidaciones_lotes_codigo ON public.liquidaciones_lotes USING btree (codigo_lote);

CREATE INDEX idx_liquidaciones_lotes_delivery_fecha ON public.liquidaciones_lotes USING btree (delivery_nombre, fecha_liquidacion DESC);

CREATE UNIQUE INDEX uq_liquidaciones_lotes_codigo_v937 ON public.liquidaciones_lotes USING btree (upper(TRIM(BOTH FROM codigo_lote))) WHERE ((NULLIF(TRIM(BOTH FROM codigo_lote), ''::text) IS NOT NULL) AND (upper(TRIM(BOTH FROM codigo_lote)) <> 'SIN-LOTE'::text));

CREATE UNIQUE INDEX uq_liquidaciones_lotes_lote_v937 ON public.liquidaciones_lotes USING btree (lote_id) WHERE (lote_id IS NOT NULL);

CREATE INDEX idx_llam_cliente ON public.llamadas USING btree (cliente_id);

CREATE INDEX idx_llam_fecha ON public.llamadas USING btree (fecha);

CREATE UNIQUE INDEX uq_llamadas_idempotencia_orden_v940r3 ON public.llamadas USING btree (idempotencia_orden_v940r3) WHERE (idempotencia_orden_v940r3 IS NOT NULL);

CREATE INDEX idx_orden_archivos_v9383_orden ON public.orden_archivos_v9383 USING btree (orden_id, creado_en DESC);

CREATE INDEX idx_orden_casos_historial_creado ON public.orden_casos_historial USING btree (creado_en DESC);

CREATE INDEX idx_orden_casos_historial_orden ON public.orden_casos_historial USING btree (orden_id);

CREATE INDEX idx_orden_detalle_orden ON public.orden_detalle USING btree (orden_id);

CREATE INDEX idx_orden_detalle_orden_v9384 ON public.orden_detalle USING btree (orden_id, id);

CREATE INDEX idx_orden_detalle_preparacion ON public.orden_detalle USING btree (orden_id, estado_preparacion);

CREATE INDEX idx_devoluciones_orden_v9392 ON public.orden_devoluciones USING btree (orden_id, creado_en DESC);

CREATE UNIQUE INDEX uq_devolucion_activa_orden_v9392 ON public.orden_devoluciones USING btree (orden_id) WHERE (estado = 'Confirmada'::text);

CREATE INDEX idx_orden_entregas_orden ON public.orden_entregas USING btree (orden_id);

CREATE INDEX idx_orden_entregas_orden_fecha_v9384 ON public.orden_entregas USING btree (orden_id, creado_en DESC);

CREATE INDEX idx_orden_estados_historial_orden ON public.orden_estados_historial USING btree (orden_id);

CREATE INDEX idx_orden_historial_orden_fecha_v9384 ON public.orden_estados_historial USING btree (orden_id, creado_en DESC);

CREATE INDEX idx_orden_facturas_orden ON public.orden_facturas USING btree (orden_id);

CREATE INDEX idx_orden_pagos_cxc_v940 ON public.orden_pagos USING btree (cxc_cobro_id) WHERE (cxc_cobro_id IS NOT NULL);

CREATE INDEX idx_orden_pagos_orden ON public.orden_pagos USING btree (orden_id);

CREATE INDEX idx_orden_pagos_orden_fecha_v9384 ON public.orden_pagos USING btree (orden_id, creado_en DESC);

CREATE INDEX idx_orden_pesos_orden ON public.orden_pesos USING btree (orden_id);

CREATE INDEX idx_orden_pesos_orden_fecha_v9384 ON public.orden_pesos USING btree (orden_id, creado_en DESC);

CREATE INDEX idx_ordenes_archivada_estado ON public.ordenes USING btree (archivada, estado, id DESC);

CREATE INDEX idx_ordenes_cliente ON public.ordenes USING btree (cliente_id);

CREATE INDEX idx_ordenes_cliente_v9384 ON public.ordenes USING btree (cliente_id, id DESC) WHERE (archivada = false);

CREATE INDEX idx_ordenes_creado_reciente ON public.ordenes USING btree (creado_en DESC);

CREATE INDEX idx_ordenes_cxc_abierta_v940 ON public.ordenes USING btree (cxc_vencimiento, cliente_id, id) WHERE ((COALESCE(monto_pendiente, (0)::numeric) > 0.01) AND (COALESCE(resultado_entrega, estado) = 'Entregado a crédito'::text) AND (COALESCE(archivada, false) = false));

CREATE INDEX idx_ordenes_despacho_v9384 ON public.ordenes USING btree (fecha_despacho, estado, id DESC) WHERE (archivada = false);

CREATE INDEX idx_ordenes_estado ON public.ordenes USING btree (estado);

CREATE INDEX idx_ordenes_estado_fecha_despacho ON public.ordenes USING btree (estado, fecha_despacho);

CREATE INDEX idx_ordenes_estado_tomado ON public.ordenes USING btree (estado, tomado_por);

CREATE INDEX idx_ordenes_fecha ON public.ordenes USING btree (fecha);

CREATE INDEX idx_ordenes_fecha_despacho ON public.ordenes USING btree (fecha_despacho);

CREATE INDEX idx_ordenes_modalidad_estado_v933 ON public.ordenes USING btree (modalidad_entrega, estado);

CREATE INDEX idx_ordenes_operativas_v9384 ON public.ordenes USING btree (estado, id DESC) WHERE ((archivada = false) AND (estado <> ALL (ARRAY['Cobrado'::text, 'Entregada en negocio'::text, 'Anulado'::text])));

CREATE INDEX idx_ordenes_pendiente_existencia_v9391 ON public.ordenes USING btree (estado, fecha_despacho, creado_en DESC) WHERE es_pendiente_existencia;

CREATE INDEX idx_ordenes_recientes_v9384 ON public.ordenes USING btree (id DESC) WHERE (archivada = false);

CREATE INDEX idx_ordenes_retiro_entregado_v933 ON public.ordenes USING btree (entregado_mostrador_en DESC) WHERE (modalidad_entrega = 'Retiro en negocio'::text);

CREATE INDEX idx_ordenes_tipo_cliente_fecha_v933 ON public.ordenes USING btree (tipo_cliente_orden, fecha DESC);

CREATE INDEX idx_ordenes_tipo_estado ON public.ordenes USING btree (tipo_orden, estado);

CREATE INDEX idx_ordenes_tipo_orden ON public.ordenes USING btree (tipo_orden);

CREATE INDEX idx_ordenes_tomado_empleado ON public.ordenes USING btree (tomado_por_empleado_id) WHERE (tomado_por_empleado_id IS NOT NULL);

CREATE UNIQUE INDEX uq_orden_pendiente_existencia_origen_v9391 ON public.ordenes USING btree (orden_origen_id) WHERE (es_pendiente_existencia AND (estado <> 'Anulado'::text));

CREATE INDEX idx_ped_cliente ON public.pedidos USING btree (cliente_id);

CREATE INDEX perfiles_empleado_id_idx ON public.perfiles USING btree (empleado_id);

CREATE UNIQUE INDEX perfiles_empleado_id_unique ON public.perfiles USING btree (empleado_id) WHERE (empleado_id IS NOT NULL);

CREATE UNIQUE INDEX uq_plantillas_whatsapp_nombre_cat ON public.plantillas_whatsapp USING btree (nombre, categoria);

CREATE INDEX idx_productos_despacho_categoria ON public.productos_despacho USING btree (categoria);

CREATE UNIQUE INDEX uq_productos_despacho_codigo ON public.productos_despacho USING btree (codigo) WHERE (codigo IS NOT NULL);

CREATE INDEX idx_sistema_configuracion_revision_v9390 ON public.sistema_configuracion USING btree (revision DESC, clave);

CREATE INDEX idx_config_historial_v9390_clave_fecha ON public.sistema_configuracion_historial_v9390 USING btree (clave, creado_en DESC);

CREATE INDEX idx_usuarios_permisos_historial_objetivo ON public.usuarios_permisos_historial USING btree (usuario_objetivo, creado_en DESC);

CREATE INDEX idx_viaje_ordenes_orden ON public.viaje_ordenes USING btree (orden_id);

CREATE INDEX idx_viaje_ordenes_viaje ON public.viaje_ordenes USING btree (viaje_id);

-- -----------------------------------------------------------------------------
-- Triggers propios
-- -----------------------------------------------------------------------------

CREATE TRIGGER trg_nuevo_perfil AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION fn_nuevo_perfil();

CREATE TRIGGER trg_aud_clientes AFTER INSERT OR DELETE OR UPDATE ON clientes FOR EACH ROW EXECUTE FUNCTION fn_auditar();

CREATE TRIGGER empleados_sincronizar_perfil_v930r9 AFTER UPDATE OF nombre, activo ON empleados_operativos FOR EACH ROW EXECUTE FUNCTION sincronizar_perfil_empleado_v930r9();

CREATE TRIGGER trg_aud_llamadas AFTER INSERT OR DELETE OR UPDATE ON llamadas FOR EACH ROW EXECUTE FUNCTION fn_auditar();

CREATE TRIGGER trg_llamada_upd AFTER UPDATE ON llamadas FOR EACH ROW EXECUTE FUNCTION fn_llamada_upd();

CREATE TRIGGER trg_tras_llamada AFTER INSERT ON llamadas FOR EACH ROW EXECUTE FUNCTION fn_tras_llamada();

CREATE TRIGGER trg_bloquear_delete_archivo_v9383 BEFORE DELETE ON orden_archivos_v9383 FOR EACH ROW EXECUTE FUNCTION pc_bloquear_borrado_trazabilidad_v9383();

CREATE TRIGGER trg_bloquear_delete_historial_v9383 BEFORE DELETE ON orden_estados_historial FOR EACH ROW EXECUTE FUNCTION pc_bloquear_borrado_trazabilidad_v9383();

CREATE TRIGGER trg_snapshot_pago_cliente_v9391 BEFORE INSERT OR UPDATE OF orden_id, cliente_id, cliente_nombre, cliente_telefono, tipo_cliente ON orden_pagos FOR EACH ROW EXECUTE FUNCTION pc_snapshot_pago_cliente_v9391();

CREATE TRIGGER trg_aud_ordenes AFTER INSERT OR DELETE OR UPDATE ON ordenes FOR EACH ROW EXECUTE FUNCTION fn_auditar_orden();

CREATE TRIGGER trg_bloquear_delete_orden_v9383 BEFORE DELETE ON ordenes FOR EACH ROW EXECUTE FUNCTION pc_bloquear_borrado_trazabilidad_v9383();

CREATE TRIGGER trg_orden_programacion_flags BEFORE INSERT OR UPDATE OF fecha_despacho, hora_despacho, estado ON ordenes FOR EACH ROW EXECUTE FUNCTION fn_orden_programacion_flags();

CREATE TRIGGER trg_ordenes_actualizado BEFORE UPDATE ON ordenes FOR EACH ROW EXECUTE FUNCTION fn_orden_set_actualizado();

CREATE TRIGGER trg_pc_historial_reprogramacion_v940r3 AFTER UPDATE OF fecha_despacho, hora_despacho ON ordenes FOR EACH ROW WHEN (old.fecha_despacho IS DISTINCT FROM new.fecha_despacho OR old.hora_despacho IS DISTINCT FROM new.hora_despacho) EXECUTE FUNCTION fn_registrar_reprogramacion_v940r3();

CREATE TRIGGER trg_pc_identidad_preparacion_v9397 BEFORE UPDATE ON ordenes FOR EACH ROW EXECUTE FUNCTION pc_validar_identidad_preparacion_v9397();

CREATE TRIGGER trg_pc_insert_orden_v9397 BEFORE INSERT ON ordenes FOR EACH ROW EXECUTE FUNCTION pc_validar_insert_orden_v9397();

CREATE TRIGGER trg_pc_normalizar_flujo_orden_v933 BEFORE INSERT OR UPDATE OF cliente_id, tipo_cliente_orden, cliente_nombre_orden, cliente_telefono_orden, cliente_sector_orden, modalidad_entrega, condicion_pago, requiere_delivery, delivery_nombre ON ordenes FOR EACH ROW EXECUTE FUNCTION pc_normalizar_flujo_orden_v933();

CREATE CONSTRAINT TRIGGER trg_pc_orden_con_detalle_v940r3 AFTER INSERT ON ordenes DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION pc_validar_orden_con_detalle_v940r3();

CREATE TRIGGER trg_pc_sincronizar_cxc_orden_v940 BEFORE INSERT OR UPDATE OF estado, resultado_entrega, monto_pendiente, cxc_saldo_inicial, cxc_pagado_acumulado, cxc_vencimiento ON ordenes FOR EACH ROW EXECUTE FUNCTION pc_sincronizar_cxc_orden_v940();

CREATE TRIGGER trg_pc_validar_transicion_orden_v9382 BEFORE UPDATE ON ordenes FOR EACH ROW EXECUTE FUNCTION pc_validar_transicion_orden_v9382();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------

alter table public.abonos enable row level security;

alter table public.auditoria enable row level security;

alter table public.auditoria_excepciones enable row level security;

alter table public.catalogo_items enable row level security;

alter table public.catalogos enable row level security;

alter table public.cierres_dia enable row level security;

alter table public.clientes enable row level security;

alter table public.cobranza enable row level security;

alter table public.config enable row level security;

alter table public.cxc_cobro_aplicaciones enable row level security;

alter table public.cxc_cobros enable row level security;

alter table public.cxc_eventos enable row level security;

alter table public.deliverys_config enable row level security;

alter table public.empleados_operativos enable row level security;

alter table public.entrega_documentos_historial enable row level security;

alter table public.entrega_lote_correcciones enable row level security;

alter table public.entrega_lote_detalle enable row level security;

alter table public.entrega_lotes enable row level security;

alter table public.entrega_pedido_transferencias enable row level security;

alter table public.importaciones_log enable row level security;

alter table public.liquidacion_lote_detalle enable row level security;

alter table public.liquidacion_lote_eventos enable row level security;

alter table public.liquidaciones_lotes enable row level security;

alter table public.llamadas enable row level security;

alter table public.metas enable row level security;

alter table public.modulos_sistema enable row level security;

alter table public.orden_archivos_v9383 enable row level security;

alter table public.orden_auditoria enable row level security;

alter table public.orden_casos_historial enable row level security;

alter table public.orden_detalle enable row level security;

alter table public.orden_detalle replica identity full;

alter table public.orden_devolucion_detalle enable row level security;

alter table public.orden_devoluciones enable row level security;

alter table public.orden_entregas enable row level security;

alter table public.orden_entregas replica identity full;

alter table public.orden_estados_historial enable row level security;

alter table public.orden_estados_historial replica identity full;

alter table public.orden_facturas enable row level security;

alter table public.orden_pagos enable row level security;

alter table public.orden_pagos replica identity full;

alter table public.orden_pesos enable row level security;

alter table public.orden_pesos replica identity full;

alter table public.orden_transiciones_v9382 enable row level security;

alter table public.ordenes enable row level security;

alter table public.ordenes replica identity full;

alter table public.pedidos enable row level security;

alter table public.perfiles enable row level security;

alter table public.plantillas enable row level security;

alter table public.plantillas_whatsapp enable row level security;

alter table public.productos_despacho enable row level security;

alter table public.roles_permisos enable row level security;

alter table public.sistema_configuracion enable row level security;

alter table public.sistema_configuracion_historial_v9390 enable row level security;

alter table public.usuario_modulos enable row level security;

alter table public.usuarios_permisos_historial enable row level security;

alter table public.vendedores enable row level security;

alter table public.viaje_ordenes enable row level security;

alter table public.viajes_delivery enable row level security;

-- -----------------------------------------------------------------------------
-- Políticas RLS
-- -----------------------------------------------------------------------------

create policy abo_all on public.abonos as PERMISSIVE for all to public
using ((mi_rol() = ANY (ARRAY['Gerente'::rol_usuario, 'Cobrador'::rol_usuario])))
with check ((mi_rol() = ANY (ARRAY['Gerente'::rol_usuario, 'Cobrador'::rol_usuario])));

create policy aud_read on public.auditoria as PERMISSIVE for select to public
using ((mi_rol() = 'Gerente'::rol_usuario));

create policy v9378_excepciones_admin_select on public.auditoria_excepciones as PERMISSIVE for select to authenticated
using (es_admin_operativo());

create policy catalogo_items_admin on public.catalogo_items as PERMISSIVE for all to authenticated
using ((mi_rol() = 'Gerente'::rol_usuario))
with check ((mi_rol() = 'Gerente'::rol_usuario));

create policy catalogo_items_read on public.catalogo_items as PERMISSIVE for select to authenticated
using (true);

create policy v551_catalogo_items_select_operativo on public.catalogo_items as PERMISSIVE for select to authenticated
using (true);

create policy v551_catalogo_items_write_config on public.catalogo_items as PERMISSIVE for all to authenticated
using (tiene_modulo('config'::text, 'editar'::text))
with check (tiene_modulo('config'::text, 'editar'::text));

create policy catalogos_admin on public.catalogos as PERMISSIVE for all to authenticated
using ((mi_rol() = 'Gerente'::rol_usuario))
with check ((mi_rol() = 'Gerente'::rol_usuario));

create policy catalogos_read on public.catalogos as PERMISSIVE for select to authenticated
using (true);

create policy v551_catalogos_select_operativo on public.catalogos as PERMISSIVE for select to authenticated
using (true);

create policy v551_catalogos_write_config on public.catalogos as PERMISSIVE for all to authenticated
using (tiene_modulo('config'::text, 'editar'::text))
with check (tiene_modulo('config'::text, 'editar'::text));

create policy cd_all on public.cierres_dia as PERMISSIVE for all to public
using ((auth.role() = 'authenticated'::text))
with check ((auth.role() = 'authenticated'::text));

create policy cli_delete on public.clientes as PERMISSIVE for delete to public
using ((mi_rol() = 'Gerente'::rol_usuario));

create policy cli_insert on public.clientes as PERMISSIVE for insert to public
with check (((mi_rol() = 'Gerente'::rol_usuario) OR ((mi_rol() = 'Vendedor'::rol_usuario) AND (vendedor = mi_vendedor()))));

create policy cli_select on public.clientes as PERMISSIVE for select to public
using (((mi_rol() = ANY (ARRAY['Gerente'::rol_usuario, 'Supervisor'::rol_usuario, 'Cobrador'::rol_usuario])) OR ((mi_rol() = 'Vendedor'::rol_usuario) AND (vendedor = mi_vendedor()))));

create policy cli_update on public.clientes as PERMISSIVE for update to public
using (((mi_rol() = 'Gerente'::rol_usuario) OR ((mi_rol() = 'Vendedor'::rol_usuario) AND (vendedor = mi_vendedor()))));

create policy v551_clientes_select_operativo on public.clientes as PERMISSIVE for select to authenticated
using (tiene_algun_modulo(ARRAY['clientes'::text, 'control'::text, 'ordenes'::text, 'carniceria'::text, 'facturacion'::text, 'validacion'::text, 'delivery'::text, 'liquidacion'::text], 'ver'::text));

create policy v551_clientes_write_operativo on public.clientes as PERMISSIVE for all to authenticated
using (tiene_algun_modulo(ARRAY['clientes'::text, 'control'::text], 'editar'::text))
with check (tiene_algun_modulo(ARRAY['clientes'::text, 'control'::text], 'editar'::text));

create policy cob_select on public.cobranza as PERMISSIVE for select to public
using (((mi_rol() = ANY (ARRAY['Gerente'::rol_usuario, 'Supervisor'::rol_usuario, 'Cobrador'::rol_usuario])) OR ((mi_rol() = 'Vendedor'::rol_usuario) AND (vendedor = mi_vendedor()))));

create policy cob_write on public.cobranza as PERMISSIVE for all to public
using ((mi_rol() = ANY (ARRAY['Gerente'::rol_usuario, 'Cobrador'::rol_usuario])))
with check ((mi_rol() = ANY (ARRAY['Gerente'::rol_usuario, 'Cobrador'::rol_usuario])));

create policy v551_cobranza_select_operativo on public.cobranza as PERMISSIVE for select to authenticated
using (tiene_algun_modulo(ARRAY['liquidacion'::text, 'control'::text, 'clientes'::text], 'ver'::text));

create policy v551_cobranza_write_operativo on public.cobranza as PERMISSIVE for all to authenticated
using (tiene_algun_modulo(ARRAY['liquidacion'::text, 'control'::text], 'editar'::text))
with check (tiene_algun_modulo(ARRAY['liquidacion'::text, 'control'::text], 'editar'::text));

create policy cfg_admin on public.config as PERMISSIVE for all to public
using ((mi_rol() = 'Gerente'::rol_usuario))
with check ((mi_rol() = 'Gerente'::rol_usuario));

create policy cfg_read on public.config as PERMISSIVE for select to public
using ((auth.role() = 'authenticated'::text));

create policy v940_cxc_aplicaciones_select on public.cxc_cobro_aplicaciones as PERMISSIVE for select to authenticated
using ((es_admin_operativo() OR tiene_algun_modulo(ARRAY['liquidacion'::text, 'clientes'::text, 'control'::text], 'ver'::text)));

create policy v940_cxc_cobros_select on public.cxc_cobros as PERMISSIVE for select to authenticated
using ((es_admin_operativo() OR tiene_algun_modulo(ARRAY['liquidacion'::text, 'clientes'::text, 'control'::text], 'ver'::text)));

create policy v940_cxc_eventos_admin on public.cxc_eventos as PERMISSIVE for select to authenticated
using (es_admin_operativo());

create policy deliverys_config_all on public.deliverys_config as PERMISSIVE for all to authenticated
using (true)
with check (true);

create policy v551_deliverys_select_operativo on public.deliverys_config as PERMISSIVE for select to authenticated
using (tiene_algun_modulo(ARRAY['validacion'::text, 'delivery'::text, 'liquidacion'::text, 'config'::text], 'ver'::text));

create policy v551_deliverys_write_config on public.deliverys_config as PERMISSIVE for all to authenticated
using (tiene_modulo('config'::text, 'editar'::text))
with check (tiene_modulo('config'::text, 'editar'::text));

create policy empleados_operativos_all on public.empleados_operativos as PERMISSIVE for all to authenticated
using (true)
with check (true);

create policy v551_empleados_select_operativo on public.empleados_operativos as PERMISSIVE for select to authenticated
using (tiene_algun_modulo(ARRAY['carniceria'::text, 'facturacion'::text, 'validacion'::text, 'liquidacion'::text, 'config'::text], 'ver'::text));

create policy v551_empleados_write_config on public.empleados_operativos as PERMISSIVE for all to authenticated
using (tiene_modulo('config'::text, 'editar'::text))
with check (tiene_modulo('config'::text, 'editar'::text));

create policy entrega_documentos_insert_v930r5 on public.entrega_documentos_historial as PERMISSIVE for insert to authenticated
with check ((puede_modulo_v930r5('validacion'::text, 'editar'::text) AND (usuario_id = auth.uid())));

create policy entrega_documentos_select_v930r5 on public.entrega_documentos_historial as PERMISSIVE for select to authenticated
using (puede_modulo_v930r5('validacion'::text, 'ver'::text));

create policy entrega_lote_correcciones_select_v936 on public.entrega_lote_correcciones as PERMISSIVE for select to authenticated
using (puede_modulo_v930r5('validacion'::text, 'ver'::text));

create policy entrega_lote_detalle_auth_all on public.entrega_lote_detalle as PERMISSIVE for all to authenticated
using (true)
with check (true);

create policy entrega_lotes_auth_all on public.entrega_lotes as PERMISSIVE for all to authenticated
using (true)
with check (true);

create policy entrega_transferencias_select_v9371 on public.entrega_pedido_transferencias as PERMISSIVE for select to authenticated
using ((puede_modulo_v930r5('validacion'::text, 'ver'::text) OR puede_modulo_v930r5('delivery'::text, 'ver'::text) OR puede_modulo_v930r5('liquidacion'::text, 'ver'::text)));

create policy importaciones_log_insert on public.importaciones_log as PERMISSIVE for insert to authenticated
with check (true);

create policy importaciones_log_read on public.importaciones_log as PERMISSIVE for select to authenticated
using ((mi_rol() = 'Gerente'::rol_usuario));

create policy liquidacion_lote_detalle_auth_all on public.liquidacion_lote_detalle as PERMISSIVE for all to authenticated
using (true)
with check (true);

create policy liquidacion_lote_eventos_select_v937 on public.liquidacion_lote_eventos as PERMISSIVE for select to authenticated
using (puede_modulo_v930r5('liquidacion'::text, 'ver'::text));

create policy liquidaciones_lotes_auth_all on public.liquidaciones_lotes as PERMISSIVE for all to authenticated
using (true)
with check (true);

create policy llam_delete_v31 on public.llamadas as PERMISSIVE for delete to public
using (((mi_rol() = ANY (ARRAY['Gerente'::rol_usuario, 'Supervisor'::rol_usuario])) OR ((mi_rol() = 'Vendedor'::rol_usuario) AND (EXISTS ( SELECT 1
   FROM clientes c
  WHERE ((c.id = llamadas.cliente_id) AND (c.vendedor = mi_vendedor())))))));

create policy llam_delete_v32 on public.llamadas as PERMISSIVE for delete to public
using (((mi_rol() = ANY (ARRAY['Gerente'::rol_usuario, 'Supervisor'::rol_usuario])) OR ((mi_rol() = 'Vendedor'::rol_usuario) AND (EXISTS ( SELECT 1
   FROM clientes c
  WHERE ((c.id = llamadas.cliente_id) AND (c.vendedor = mi_vendedor())))))));

create policy llam_insert on public.llamadas as PERMISSIVE for insert to public
with check (((mi_rol() = 'Gerente'::rol_usuario) OR ((mi_rol() = 'Vendedor'::rol_usuario) AND (EXISTS ( SELECT 1
   FROM clientes c
  WHERE ((c.id = llamadas.cliente_id) AND (c.vendedor = mi_vendedor())))))));

create policy llam_select on public.llamadas as PERMISSIVE for select to public
using (((mi_rol() = ANY (ARRAY['Gerente'::rol_usuario, 'Supervisor'::rol_usuario])) OR ((mi_rol() = ANY (ARRAY['Vendedor'::rol_usuario, 'Cobrador'::rol_usuario])) AND (EXISTS ( SELECT 1
   FROM clientes c
  WHERE ((c.id = llamadas.cliente_id) AND ((mi_rol() = 'Cobrador'::rol_usuario) OR (c.vendedor = mi_vendedor()))))))));

create policy llam_update on public.llamadas as PERMISSIVE for update to public
using (((mi_rol() = ANY (ARRAY['Gerente'::rol_usuario, 'Supervisor'::rol_usuario])) OR ((mi_rol() = 'Vendedor'::rol_usuario) AND (EXISTS ( SELECT 1
   FROM clientes c
  WHERE ((c.id = llamadas.cliente_id) AND (c.vendedor = mi_vendedor())))))));

create policy llam_update_v31 on public.llamadas as PERMISSIVE for update to public
using (((mi_rol() = ANY (ARRAY['Gerente'::rol_usuario, 'Supervisor'::rol_usuario])) OR ((mi_rol() = 'Vendedor'::rol_usuario) AND (EXISTS ( SELECT 1
   FROM clientes c
  WHERE ((c.id = llamadas.cliente_id) AND (c.vendedor = mi_vendedor())))))))
with check (((mi_rol() = ANY (ARRAY['Gerente'::rol_usuario, 'Supervisor'::rol_usuario])) OR ((mi_rol() = 'Vendedor'::rol_usuario) AND (EXISTS ( SELECT 1
   FROM clientes c
  WHERE ((c.id = llamadas.cliente_id) AND (c.vendedor = mi_vendedor())))))));

create policy llam_update_v32 on public.llamadas as PERMISSIVE for update to public
using (((mi_rol() = ANY (ARRAY['Gerente'::rol_usuario, 'Supervisor'::rol_usuario])) OR ((mi_rol() = 'Vendedor'::rol_usuario) AND (EXISTS ( SELECT 1
   FROM clientes c
  WHERE ((c.id = llamadas.cliente_id) AND (c.vendedor = mi_vendedor())))))))
with check (((mi_rol() = ANY (ARRAY['Gerente'::rol_usuario, 'Supervisor'::rol_usuario])) OR ((mi_rol() = 'Vendedor'::rol_usuario) AND (EXISTS ( SELECT 1
   FROM clientes c
  WHERE ((c.id = llamadas.cliente_id) AND (c.vendedor = mi_vendedor())))))));

create policy v551_llamadas_select_operativo on public.llamadas as PERMISSIVE for select to authenticated
using (tiene_algun_modulo(ARRAY['control'::text, 'clientes'::text, 'ordenes'::text], 'ver'::text));

create policy v551_llamadas_write_operativo on public.llamadas as PERMISSIVE for all to authenticated
using (tiene_modulo('control'::text, 'editar'::text))
with check (tiene_modulo('control'::text, 'editar'::text));

create policy metas_admin on public.metas as PERMISSIVE for all to public
using ((mi_rol() = 'Gerente'::rol_usuario))
with check ((mi_rol() = 'Gerente'::rol_usuario));

create policy metas_read on public.metas as PERMISSIVE for select to public
using ((auth.role() = 'authenticated'::text));

create policy modulos_sistema_admin on public.modulos_sistema as PERMISSIVE for all to authenticated
using ((mi_rol() = 'Gerente'::rol_usuario))
with check ((mi_rol() = 'Gerente'::rol_usuario));

create policy modulos_sistema_read on public.modulos_sistema as PERMISSIVE for select to authenticated
using (true);

create policy modulos_sistema_select on public.modulos_sistema as PERMISSIVE for select to authenticated
using (true);

create policy v551_modulos_select on public.modulos_sistema as PERMISSIVE for select to authenticated
using (true);

create policy v9383_orden_archivos_admin_select on public.orden_archivos_v9383 as PERMISSIVE for select to authenticated
using (es_admin_operativo());

create policy orden_auditoria_read on public.orden_auditoria as PERMISSIVE for select to authenticated
using (true);

create policy orden_casos_historial_insert on public.orden_casos_historial as PERMISSIVE for insert to public
with check ((auth.uid() IS NOT NULL));

create policy orden_casos_historial_select on public.orden_casos_historial as PERMISSIVE for select to public
using ((auth.uid() IS NOT NULL));

create policy v9377_orden_detalle_delete_operativo on public.orden_detalle as PERMISSIVE for delete to authenticated
using (tiene_algun_modulo(ARRAY['ordenes'::text, 'control'::text, 'carniceria'::text, 'facturacion'::text], 'editar'::text));

create policy v9397_orden_detalle_insert_operativo on public.orden_detalle as PERMISSIVE for insert to authenticated
with check ((es_admin_operativo() OR tiene_algun_modulo(ARRAY['ordenes'::text, 'control'::text], 'editar'::text)));

create policy v9397_orden_detalle_select_operativo on public.orden_detalle as PERMISSIVE for select to authenticated
using ((es_admin_operativo() OR tiene_algun_modulo(ARRAY['ordenes'::text, 'control'::text, 'carniceria'::text, 'facturacion'::text, 'validacion'::text, 'delivery'::text, 'liquidacion'::text], 'ver'::text)));

create policy v9397_orden_detalle_update_responsable on public.orden_detalle as PERMISSIVE for update to authenticated
using ((es_admin_operativo() OR tiene_algun_modulo(ARRAY['ordenes'::text, 'control'::text, 'facturacion'::text], 'editar'::text) OR (tiene_algun_modulo(ARRAY['carniceria'::text], 'editar'::text) AND (EXISTS ( SELECT 1
   FROM ordenes o
  WHERE ((o.id = orden_detalle.orden_id) AND (o.estado = 'En preparación'::text) AND (o.tomado_por_user = auth.uid())))))))
with check ((es_admin_operativo() OR tiene_algun_modulo(ARRAY['ordenes'::text, 'control'::text, 'facturacion'::text], 'editar'::text) OR (tiene_algun_modulo(ARRAY['carniceria'::text], 'editar'::text) AND (EXISTS ( SELECT 1
   FROM ordenes o
  WHERE ((o.id = orden_detalle.orden_id) AND (o.estado = 'En preparación'::text) AND (o.tomado_por_user = auth.uid())))))));

create policy devolucion_detalle_select_v9392 on public.orden_devolucion_detalle as PERMISSIVE for select to authenticated
using ((EXISTS ( SELECT 1
   FROM orden_devoluciones d
  WHERE ((d.id = orden_devolucion_detalle.devolucion_id) AND (tiene_algun_modulo(ARRAY['liquidacion'::text, 'ordenes'::text, 'auditoria'::text], 'ver'::text) OR es_admin_operativo())))));

create policy devoluciones_select_v9392 on public.orden_devoluciones as PERMISSIVE for select to authenticated
using ((tiene_algun_modulo(ARRAY['liquidacion'::text, 'ordenes'::text, 'auditoria'::text], 'ver'::text) OR es_admin_operativo()));

create policy v551_orden_entregas_select_operativo on public.orden_entregas as PERMISSIVE for select to authenticated
using (tiene_algun_modulo(ARRAY['validacion'::text, 'delivery'::text, 'liquidacion'::text, 'ordenes'::text], 'ver'::text));

create policy v552_orden_entregas_delete_admin on public.orden_entregas as PERMISSIVE for delete to authenticated
using (es_admin_operativo());

create policy v552_orden_entregas_insert_operativo on public.orden_entregas as PERMISSIVE for insert to authenticated
with check (tiene_algun_modulo(ARRAY['validacion'::text, 'delivery'::text, 'liquidacion'::text], 'editar'::text));

create policy v552_orden_entregas_update_operativo on public.orden_entregas as PERMISSIVE for update to authenticated
using (tiene_algun_modulo(ARRAY['validacion'::text, 'delivery'::text, 'liquidacion'::text], 'editar'::text))
with check (tiene_algun_modulo(ARRAY['validacion'::text, 'delivery'::text, 'liquidacion'::text], 'editar'::text));

create policy orden_estados_historial_all on public.orden_estados_historial as PERMISSIVE for all to authenticated
using (true)
with check (true);

create policy v551_historial_select_operativo on public.orden_estados_historial as PERMISSIVE for select to authenticated
using (tiene_algun_modulo(ARRAY['ordenes'::text, 'control'::text, 'carniceria'::text, 'facturacion'::text, 'validacion'::text, 'delivery'::text, 'liquidacion'::text], 'ver'::text));

create policy v552_historial_delete_admin on public.orden_estados_historial as PERMISSIVE for delete to authenticated
using (es_admin_operativo());

create policy v552_historial_insert_operativo on public.orden_estados_historial as PERMISSIVE for insert to authenticated
with check (tiene_algun_modulo(ARRAY['ordenes'::text, 'control'::text, 'carniceria'::text, 'facturacion'::text, 'validacion'::text, 'delivery'::text, 'liquidacion'::text], 'editar'::text));

create policy v552_historial_update_admin on public.orden_estados_historial as PERMISSIVE for update to authenticated
using (es_admin_operativo())
with check (es_admin_operativo());

create policy v9397_orden_facturas_select on public.orden_facturas as PERMISSIVE for select to authenticated
using ((es_admin_operativo() OR tiene_algun_modulo(ARRAY['facturacion'::text, 'validacion'::text, 'ordenes'::text], 'ver'::text)));

create policy v551_orden_pagos_select_operativo on public.orden_pagos as PERMISSIVE for select to authenticated
using (tiene_algun_modulo(ARRAY['liquidacion'::text, 'ordenes'::text], 'ver'::text));

create policy v552_orden_pagos_delete_admin on public.orden_pagos as PERMISSIVE for delete to authenticated
using (es_admin_operativo());

create policy v552_orden_pagos_insert_operativo on public.orden_pagos as PERMISSIVE for insert to authenticated
with check (tiene_modulo('liquidacion'::text, 'editar'::text));

create policy v552_orden_pagos_update_operativo on public.orden_pagos as PERMISSIVE for update to authenticated
using (tiene_modulo('liquidacion'::text, 'editar'::text))
with check (tiene_modulo('liquidacion'::text, 'editar'::text));

create policy v551_orden_pesos_select_operativo on public.orden_pesos as PERMISSIVE for select to authenticated
using (tiene_algun_modulo(ARRAY['ordenes'::text, 'carniceria'::text, 'facturacion'::text, 'validacion'::text, 'liquidacion'::text], 'ver'::text));

create policy v552_orden_pesos_delete_admin on public.orden_pesos as PERMISSIVE for delete to authenticated
using (es_admin_operativo());

create policy v552_orden_pesos_insert_operativo on public.orden_pesos as PERMISSIVE for insert to authenticated
with check (tiene_algun_modulo(ARRAY['carniceria'::text, 'facturacion'::text, 'validacion'::text], 'editar'::text));

create policy v552_orden_pesos_update_operativo on public.orden_pesos as PERMISSIVE for update to authenticated
using (tiene_algun_modulo(ARRAY['carniceria'::text, 'facturacion'::text, 'validacion'::text], 'editar'::text))
with check (tiene_algun_modulo(ARRAY['carniceria'::text, 'facturacion'::text, 'validacion'::text], 'editar'::text));

create policy orden_transiciones_v9382_select on public.orden_transiciones_v9382 as PERMISSIVE for select to authenticated
using (true);

create policy orden_delete_v31 on public.ordenes as PERMISSIVE for delete to public
using (((mi_rol() = ANY (ARRAY['Gerente'::rol_usuario, 'Supervisor'::rol_usuario])) OR ((mi_rol() = 'Vendedor'::rol_usuario) AND (vendedor = mi_vendedor()))));

create policy orden_delete_v32 on public.ordenes as PERMISSIVE for delete to public
using (((mi_rol() = ANY (ARRAY['Gerente'::rol_usuario, 'Supervisor'::rol_usuario])) OR ((mi_rol() = 'Vendedor'::rol_usuario) AND (vendedor = mi_vendedor()))));

create policy ordenes_select_programadas on public.ordenes as PERMISSIVE for select to authenticated
using (true);

create policy ordenes_update_programadas on public.ordenes as PERMISSIVE for update to authenticated
using (true)
with check (true);

create policy v9397_ordenes_insert_seguro on public.ordenes as PERMISSIVE for insert to authenticated
with check (((creado_por = auth.uid()) AND (actualizado_por = auth.uid()) AND (((estado = ANY (ARRAY['Programada'::text, 'Pedido recibido'::text])) AND (es_admin_operativo() OR tiene_algun_modulo(ARRAY['ordenes'::text, 'control'::text], 'editar'::text))) OR ((estado = 'Pendiente por existencia'::text) AND COALESCE(es_pendiente_existencia, false) AND (orden_origen_id IS NOT NULL) AND (es_admin_operativo() OR tiene_algun_modulo(ARRAY['carniceria'::text], 'editar'::text))))));

create policy v9397_ordenes_select_operativo on public.ordenes as PERMISSIVE for select to authenticated
using ((es_admin_operativo() OR tiene_algun_modulo(ARRAY['ordenes'::text, 'control'::text, 'carniceria'::text, 'facturacion'::text, 'validacion'::text, 'delivery'::text, 'liquidacion'::text], 'ver'::text)));

create policy v9397_ordenes_update_operativo on public.ordenes as PERMISSIVE for update to authenticated
using ((es_admin_operativo() OR tiene_algun_modulo(ARRAY['ordenes'::text, 'control'::text, 'carniceria'::text, 'facturacion'::text, 'validacion'::text, 'delivery'::text, 'liquidacion'::text], 'editar'::text)))
with check ((es_admin_operativo() OR tiene_algun_modulo(ARRAY['ordenes'::text, 'control'::text, 'carniceria'::text, 'facturacion'::text, 'validacion'::text, 'delivery'::text, 'liquidacion'::text], 'editar'::text)));

create policy ped_delete_v31 on public.pedidos as PERMISSIVE for delete to public
using (((mi_rol() = ANY (ARRAY['Gerente'::rol_usuario, 'Supervisor'::rol_usuario])) OR ((mi_rol() = 'Vendedor'::rol_usuario) AND (vendedor = mi_vendedor()))));

create policy ped_delete_v32 on public.pedidos as PERMISSIVE for delete to public
using (((mi_rol() = ANY (ARRAY['Gerente'::rol_usuario, 'Supervisor'::rol_usuario])) OR ((mi_rol() = 'Vendedor'::rol_usuario) AND (vendedor = mi_vendedor()))));

create policy ped_select on public.pedidos as PERMISSIVE for select to public
using (((mi_rol() = ANY (ARRAY['Gerente'::rol_usuario, 'Supervisor'::rol_usuario, 'Cobrador'::rol_usuario])) OR ((mi_rol() = 'Vendedor'::rol_usuario) AND (vendedor = mi_vendedor()))));

create policy ped_update on public.pedidos as PERMISSIVE for update to public
using ((mi_rol() = ANY (ARRAY['Gerente'::rol_usuario, 'Cobrador'::rol_usuario])));

create policy perf_admin_all on public.perfiles as PERMISSIVE for all to public
using ((mi_rol() = 'Gerente'::rol_usuario))
with check ((mi_rol() = 'Gerente'::rol_usuario));

create policy perf_self_read on public.perfiles as PERMISSIVE for select to public
using (((id = auth.uid()) OR (mi_rol() = 'Gerente'::rol_usuario)));

create policy perfiles_select_auth on public.perfiles as PERMISSIVE for select to authenticated
using (true);

create policy perfiles_update_admin on public.perfiles as PERMISSIVE for update to authenticated
using ((EXISTS ( SELECT 1
   FROM perfiles p
  WHERE ((p.id = auth.uid()) AND (p.rol = ANY (ARRAY['Gerente'::text, 'Supervisor'::text])) AND (COALESCE(p.activo, true) = true)))))
with check ((EXISTS ( SELECT 1
   FROM perfiles p
  WHERE ((p.id = auth.uid()) AND (p.rol = ANY (ARRAY['Gerente'::text, 'Supervisor'::text])) AND (COALESCE(p.activo, true) = true)))));

create policy v551_perfiles_select on public.perfiles as PERMISSIVE for select to authenticated
using (true);

create policy v551_perfiles_update_config on public.perfiles as PERMISSIVE for update to authenticated
using (tiene_modulo('config'::text, 'editar'::text))
with check (tiene_modulo('config'::text, 'editar'::text));

create policy pl_admin on public.plantillas as PERMISSIVE for all to public
using ((mi_rol() = 'Gerente'::rol_usuario))
with check ((mi_rol() = 'Gerente'::rol_usuario));

create policy pl_read on public.plantillas as PERMISSIVE for select to public
using ((auth.role() = 'authenticated'::text));

create policy plantillas_whatsapp_admin on public.plantillas_whatsapp as PERMISSIVE for all to authenticated
using ((mi_rol() = 'Gerente'::rol_usuario))
with check ((mi_rol() = 'Gerente'::rol_usuario));

create policy plantillas_whatsapp_read on public.plantillas_whatsapp as PERMISSIVE for select to authenticated
using (((activo = true) OR (mi_rol() = 'Gerente'::rol_usuario)));

create policy v551_plantillas_select_operativo on public.plantillas_whatsapp as PERMISSIVE for select to authenticated
using (tiene_algun_modulo(ARRAY['control'::text, 'clientes'::text, 'config'::text], 'ver'::text));

create policy v551_plantillas_write_config on public.plantillas_whatsapp as PERMISSIVE for all to authenticated
using (tiene_modulo('config'::text, 'editar'::text))
with check (tiene_modulo('config'::text, 'editar'::text));

create policy v551_productos_select_operativo on public.productos_despacho as PERMISSIVE for select to authenticated
using (tiene_algun_modulo(ARRAY['productos'::text, 'control'::text, 'ordenes'::text, 'carniceria'::text, 'facturacion'::text, 'validacion'::text], 'ver'::text));

create policy v551_productos_write_operativo on public.productos_despacho as PERMISSIVE for all to authenticated
using (tiene_modulo('productos'::text, 'editar'::text))
with check (tiene_modulo('productos'::text, 'editar'::text));

create policy perm_admin on public.roles_permisos as PERMISSIVE for all to public
using ((mi_rol() = 'Gerente'::rol_usuario))
with check ((mi_rol() = 'Gerente'::rol_usuario));

create policy perm_read on public.roles_permisos as PERMISSIVE for select to public
using ((auth.role() = 'authenticated'::text));

create policy roles_permisos_select on public.roles_permisos as PERMISSIVE for select to authenticated
using (true);

create policy v551_roles_select on public.roles_permisos as PERMISSIVE for select to authenticated
using (true);

create policy sistema_configuracion_delete on public.sistema_configuracion as PERMISSIVE for delete to authenticated
using (((mi_rol())::text = ANY (ARRAY['Gerente'::text, 'Administrador'::text])));

create policy sistema_configuracion_insert on public.sistema_configuracion as PERMISSIVE for insert to authenticated
with check (((mi_rol())::text = ANY (ARRAY['Gerente'::text, 'Administrador'::text, 'Supervisor'::text])));

create policy sistema_configuracion_select on public.sistema_configuracion as PERMISSIVE for select to authenticated
using (true);

create policy sistema_configuracion_update on public.sistema_configuracion as PERMISSIVE for update to authenticated
using (((mi_rol())::text = ANY (ARRAY['Gerente'::text, 'Administrador'::text, 'Supervisor'::text])))
with check (((mi_rol())::text = ANY (ARRAY['Gerente'::text, 'Administrador'::text, 'Supervisor'::text])));

create policy config_historial_v9390_admin_select on public.sistema_configuracion_historial_v9390 as PERMISSIVE for select to authenticated
using (es_admin_operativo());

create policy usuario_modulos_admin on public.usuario_modulos as PERMISSIVE for all to authenticated
using ((mi_rol() = 'Gerente'::rol_usuario))
with check ((mi_rol() = 'Gerente'::rol_usuario));

create policy usuario_modulos_admin_all on public.usuario_modulos as PERMISSIVE for all to authenticated
using ((EXISTS ( SELECT 1
   FROM perfiles p
  WHERE ((p.id = auth.uid()) AND (p.rol = ANY (ARRAY['Gerente'::text, 'Supervisor'::text])) AND (COALESCE(p.activo, true) = true)))))
with check ((EXISTS ( SELECT 1
   FROM perfiles p
  WHERE ((p.id = auth.uid()) AND (p.rol = ANY (ARRAY['Gerente'::text, 'Supervisor'::text])) AND (COALESCE(p.activo, true) = true)))));

create policy usuario_modulos_read on public.usuario_modulos as PERMISSIVE for select to authenticated
using (true);

create policy usuario_modulos_select on public.usuario_modulos as PERMISSIVE for select to authenticated
using (true);

create policy v551_usuario_modulos_admin on public.usuario_modulos as PERMISSIVE for all to authenticated
using (tiene_modulo('config'::text, 'editar'::text))
with check (tiene_modulo('config'::text, 'editar'::text));

create policy v551_usuario_modulos_select on public.usuario_modulos as PERMISSIVE for select to authenticated
using (true);

create policy v930r9_historial_usuarios_select on public.usuarios_permisos_historial as PERMISSIVE for select to authenticated
using (puede_configurar_usuarios_v9214());

create policy vend_admin on public.vendedores as PERMISSIVE for all to public
using ((mi_rol() = 'Gerente'::rol_usuario))
with check ((mi_rol() = 'Gerente'::rol_usuario));

create policy vend_read on public.vendedores as PERMISSIVE for select to public
using ((auth.role() = 'authenticated'::text));

create policy v9397_viaje_ordenes_select on public.viaje_ordenes as PERMISSIVE for select to authenticated
using ((es_admin_operativo() OR tiene_algun_modulo(ARRAY['delivery'::text, 'validacion'::text, 'liquidacion'::text], 'ver'::text)));

create policy v9397_viajes_delivery_select on public.viajes_delivery as PERMISSIVE for select to authenticated
using ((es_admin_operativo() OR tiene_algun_modulo(ARRAY['delivery'::text, 'validacion'::text, 'liquidacion'::text], 'ver'::text)));

-- -----------------------------------------------------------------------------
-- Permisos explícitos para Data API
-- -----------------------------------------------------------------------------

grant usage on schema public to anon, authenticated, service_role;

grant usage on schema extensions to anon, authenticated, service_role;

grant usage on type public.estado_cli to anon, authenticated, service_role;

grant usage on type public.estado_ped to anon, authenticated, service_role;

grant usage on type public.resultado_llam to anon, authenticated, service_role;

grant usage on type public.rol_usuario to anon, authenticated, service_role;

revoke all privileges on all tables in schema public from anon, authenticated, service_role;

revoke all privileges on all sequences in schema public from anon, authenticated, service_role;

grant SELECT, USAGE on sequence public.abonos_id_seq to authenticated;

grant SELECT, USAGE on sequence public.auditoria_excepciones_id_seq to authenticated;

grant SELECT, USAGE on sequence public.auditoria_id_seq to authenticated;

grant SELECT, USAGE on sequence public.catalogo_items_id_seq to authenticated;

grant SELECT, USAGE on sequence public.clientes_id_seq to authenticated;

grant SELECT, USAGE on sequence public.cobranza_id_seq to authenticated;

grant SELECT, USAGE on sequence public.cxc_cobro_aplicaciones_id_seq to authenticated;

grant SELECT, USAGE on sequence public.cxc_cobros_id_seq to authenticated;

grant SELECT, USAGE on sequence public.cxc_eventos_id_seq to authenticated;

grant SELECT, USAGE on sequence public.cxc_recibo_seq_v940 to authenticated;

grant SELECT, USAGE on sequence public.deliverys_config_id_seq to authenticated;

grant SELECT, USAGE on sequence public.empleados_operativos_id_seq to authenticated;

grant SELECT, USAGE on sequence public.entrega_documentos_historial_id_seq to authenticated;

grant SELECT, USAGE on sequence public.entrega_lote_correcciones_id_seq to authenticated;

grant SELECT, USAGE on sequence public.entrega_lote_detalle_id_seq to authenticated;

grant SELECT, USAGE on sequence public.entrega_lotes_id_seq to authenticated;

grant SELECT, USAGE on sequence public.entrega_pedido_transferencias_id_seq to authenticated;

grant SELECT, USAGE on sequence public.importaciones_log_id_seq to authenticated;

grant SELECT, USAGE on sequence public.liquidacion_lote_detalle_id_seq to authenticated;

grant SELECT, USAGE on sequence public.liquidacion_lote_eventos_id_seq to authenticated;

grant SELECT, USAGE on sequence public.liquidaciones_lotes_id_seq to authenticated;

grant SELECT, USAGE on sequence public.llamadas_id_seq to authenticated;

grant SELECT, USAGE on sequence public.metas_id_seq to authenticated;

grant SELECT, USAGE on sequence public.orden_archivos_v9383_id_seq to authenticated;

grant SELECT, USAGE on sequence public.orden_auditoria_id_seq to authenticated;

grant SELECT, USAGE on sequence public.orden_casos_historial_id_seq to authenticated;

grant SELECT, USAGE on sequence public.orden_detalle_id_seq to authenticated;

grant SELECT, USAGE on sequence public.orden_devolucion_detalle_id_seq to authenticated;

grant SELECT, USAGE on sequence public.orden_devoluciones_id_seq to authenticated;

grant SELECT, USAGE on sequence public.orden_entregas_id_seq to authenticated;

grant SELECT, USAGE on sequence public.orden_estados_historial_id_seq to authenticated;

grant SELECT, USAGE on sequence public.orden_facturas_id_seq to authenticated;

grant SELECT, USAGE on sequence public.orden_pagos_id_seq to authenticated;

grant SELECT, USAGE on sequence public.orden_pesos_id_seq to authenticated;

grant SELECT, USAGE on sequence public.ordenes_id_seq to authenticated;

grant SELECT, USAGE on sequence public.ordenes_seq to authenticated;

grant SELECT, USAGE on sequence public.pedidos_id_seq to authenticated;

grant SELECT, USAGE on sequence public.plantillas_id_seq to authenticated;

grant SELECT, USAGE on sequence public.plantillas_whatsapp_id_seq to authenticated;

grant SELECT, USAGE on sequence public.productos_despacho_id_seq to authenticated;

grant SELECT, USAGE on sequence public.sistema_configuracion_historial_v9390_id_seq to authenticated;

grant SELECT, USAGE on sequence public.usuarios_permisos_historial_id_seq to authenticated;

grant SELECT, USAGE on sequence public.vendedores_id_seq to authenticated;

grant SELECT, USAGE on sequence public.viaje_ordenes_id_seq to authenticated;

grant SELECT, USAGE on sequence public.viajes_delivery_id_seq to authenticated;

grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.abonos to anon;

grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.abonos to authenticated;

grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.abonos to service_role;

grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.auditoria to anon;

grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.auditoria to authenticated;

grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.auditoria to service_role;

grant SELECT on table public.auditoria_excepciones to authenticated;

grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.auditoria_excepciones to service_role;

grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.catalogo_items to anon;

grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.catalogo_items to authenticated;

grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.catalogo_items to service_role;

grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.catalogos to anon;

grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.catalogos to authenticated;

grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.catalogos to service_role;

grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.cierres_dia to anon;

grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.cierres_dia to authenticated;

grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.cierres_dia to service_role;

grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.clientes to anon;

grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.clientes to authenticated;

grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.clientes to service_role;

grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.cobranza to anon;

grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.cobranza to authenticated;

grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.cobranza to service_role;

grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.config to anon;

grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.config to authenticated;

grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.config to service_role;

grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.cxc_cobro_aplicaciones to anon;

grant MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE on table public.cxc_cobro_aplicaciones to authenticated;

grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.cxc_cobro_aplicaciones to service_role;

grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.cxc_cobros to anon;

grant MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE on table public.cxc_cobros to authenticated;

grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.cxc_cobros to service_role;

grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.cxc_eventos to anon;

grant MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE on table public.cxc_eventos to authenticated;

grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.cxc_eventos to service_role;

grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.deliverys_config to anon;

grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.deliverys_config to authenticated;

grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.deliverys_config to service_role;

grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.empleados_operativos to anon;

grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.empleados_operativos to authenticated;

grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.empleados_operativos to service_role;

grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.entrega_documentos_historial to anon;

grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.entrega_documentos_historial to authenticated;

grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.entrega_documentos_historial to service_role;

grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.entrega_lote_correcciones to anon;

grant MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE on table public.entrega_lote_correcciones to authenticated;

grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.entrega_lote_correcciones to service_role;

grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.entrega_lote_detalle to anon;

grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.entrega_lote_detalle to authenticated;

grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.entrega_lote_detalle to service_role;

grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.entrega_lotes to anon;

grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.entrega_lotes to authenticated;

grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.entrega_lotes to service_role;

grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.entrega_pedido_transferencias to anon;

grant MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE on table public.entrega_pedido_transferencias to authenticated;

grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.entrega_pedido_transferencias to service_role;

grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.importaciones_log to anon;

grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.importaciones_log to authenticated;

grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.importaciones_log to service_role;

grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.liquidacion_lote_detalle to anon;

grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.liquidacion_lote_detalle to authenticated;

grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.liquidacion_lote_detalle to service_role;

grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.liquidacion_lote_eventos to anon;

grant MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE on table public.liquidacion_lote_eventos to authenticated;

grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.liquidacion_lote_eventos to service_role;

grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.liquidaciones_lotes to anon;

grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.liquidaciones_lotes to authenticated;

grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.liquidaciones_lotes to service_role;

grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.llamadas to anon;

grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.llamadas to authenticated;

grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.llamadas to service_role;

grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.metas to anon;

grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.metas to authenticated;

grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.metas to service_role;

grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.modulos_sistema to anon;

grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.modulos_sistema to authenticated;

grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.modulos_sistema to service_role;

grant SELECT on table public.orden_archivos_v9383 to authenticated;

grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.orden_archivos_v9383 to service_role;

grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.orden_auditoria to anon;

grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.orden_auditoria to authenticated;

grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.orden_auditoria to service_role;

grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.orden_casos_historial to anon;

grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.orden_casos_historial to authenticated;

grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.orden_casos_historial to service_role;

grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.orden_detalle to anon;

grant INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.orden_detalle to authenticated;

grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.orden_detalle to service_role;

grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.orden_devolucion_detalle to anon;

grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.orden_devolucion_detalle to authenticated;

grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.orden_devolucion_detalle to service_role;

grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.orden_devoluciones to anon;

grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.orden_devoluciones to authenticated;

grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.orden_devoluciones to service_role;

grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.orden_entregas to anon;

grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.orden_entregas to authenticated;

grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.orden_entregas to service_role;

grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.orden_estados_historial to anon;

grant INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.orden_estados_historial to authenticated;

grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.orden_estados_historial to service_role;

grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.orden_facturas to anon;

grant MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE on table public.orden_facturas to authenticated;

grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.orden_facturas to service_role;

grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.orden_pagos to anon;

grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.orden_pagos to authenticated;

grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.orden_pagos to service_role;

grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.orden_pesos to anon;

grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.orden_pesos to authenticated;

grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.orden_pesos to service_role;

grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.orden_transiciones_v9382 to anon;

grant MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE on table public.orden_transiciones_v9382 to authenticated;

grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.orden_transiciones_v9382 to service_role;

grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.ordenes to anon;

grant INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.ordenes to authenticated;

grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.ordenes to service_role;

grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.pedidos to anon;

grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.pedidos to authenticated;

grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.pedidos to service_role;

grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.perfiles to anon;

grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.perfiles to authenticated;

grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.perfiles to service_role;

grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.plantillas to anon;

grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.plantillas to authenticated;

grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.plantillas to service_role;

grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.plantillas_whatsapp to anon;

grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.plantillas_whatsapp to authenticated;

grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.plantillas_whatsapp to service_role;

grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.productos_despacho to anon;

grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.productos_despacho to authenticated;

grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.productos_despacho to service_role;

grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.roles_permisos to anon;

grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.roles_permisos to authenticated;

grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.roles_permisos to service_role;

grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.sistema_configuracion to anon;

grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.sistema_configuracion to authenticated;

grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.sistema_configuracion to service_role;

grant SELECT on table public.sistema_configuracion_historial_v9390 to authenticated;

grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.sistema_configuracion_historial_v9390 to service_role;

grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.usuario_modulos to anon;

grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.usuario_modulos to authenticated;

grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.usuario_modulos to service_role;

grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.usuarios_permisos_historial to anon;

grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.usuarios_permisos_historial to authenticated;

grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.usuarios_permisos_historial to service_role;

grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.vendedores to anon;

grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.vendedores to authenticated;

grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.vendedores to service_role;

grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.viaje_ordenes to anon;

grant MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE on table public.viaje_ordenes to authenticated;

grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.viaje_ordenes to service_role;

grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.viajes_delivery to anon;

grant MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE on table public.viajes_delivery to authenticated;

grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.viajes_delivery to service_role;

grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.cxc_saldos_v940 to anon;

grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.cxc_saldos_v940 to authenticated;

grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.cxc_saldos_v940 to service_role;

grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.v_clientes_riesgo to anon;

grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.v_clientes_riesgo to authenticated;

grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.v_clientes_riesgo to service_role;

revoke all privileges on function public.mi_rol() from public, anon, authenticated, service_role;

revoke all privileges on function public.mi_vendedor() from public, anon, authenticated, service_role;

revoke all privileges on function public.agenda_del_dia(p_fecha date) from public, anon, authenticated, service_role;

revoke all privileges on function public.fn_tras_llamada() from public, anon, authenticated, service_role;

revoke all privileges on function public.fn_auditar() from public, anon, authenticated, service_role;

revoke all privileges on function public.fn_nuevo_perfil() from public, anon, authenticated, service_role;

revoke all privileges on function public.cfg_int(p_clave text, p_def integer) from public, anon, authenticated, service_role;

revoke all privileges on function public.fn_llamada_upd() from public, anon, authenticated, service_role;

revoke all privileges on function public.fn_codigo_orden() from public, anon, authenticated, service_role;

revoke all privileges on function public.fn_orden_set_actualizado() from public, anon, authenticated, service_role;

revoke all privileges on function public.fn_auditar_orden() from public, anon, authenticated, service_role;

revoke all privileges on function public.fn_orden_desde_llamada() from public, anon, authenticated, service_role;

revoke all privileges on function public.fn_orden_programacion_flags() from public, anon, authenticated, service_role;

revoke all privileges on function public.mi_rol_text() from public, anon, authenticated, service_role;

revoke all privileges on function public.modulo_nivel_actual(p_modulo text) from public, anon, authenticated, service_role;

revoke all privileges on function public.tiene_modulo(p_modulo text, p_requerido text) from public, anon, authenticated, service_role;

revoke all privileges on function public.tiene_algun_modulo(p_modulos text[], p_requerido text) from public, anon, authenticated, service_role;

revoke all privileges on function public.es_admin_operativo() from public, anon, authenticated, service_role;

revoke all privileges on function public.puede_modulo_v930r5(p_modulo text, p_nivel text) from public, anon, authenticated, service_role;

revoke all privileges on function public.sincronizar_perfil_empleado_v930r9() from public, anon, authenticated, service_role;

revoke all privileges on function public.puede_configurar_usuarios_v9214() from public, anon, authenticated, service_role;

revoke all privileges on function public.actualizar_usuario_permisos_v930r9(p_usuario_id uuid, p_nombre text, p_rol text, p_activo boolean, p_vendedor text, p_empleado_id bigint, p_tipo_cuenta text, p_modulos jsonb) from public, anon, authenticated, service_role;

revoke all privileges on function public.pc_normalizar_flujo_orden_v933() from public, anon, authenticated, service_role;

revoke all privileges on function public.corregir_lote_entrega_v936(p_lote_id bigint, p_accion text, p_nuevo_delivery text, p_motivo text, p_usuario_nombre text) from public, anon, authenticated, service_role;

revoke all privileges on function public.pc_finalizar_lote_cxc_v937(p_lote_id bigint, p_recibido_por text, p_observacion text) from public, anon, authenticated, service_role;

revoke all privileges on function public.recibir_orden_cxc_v937(p_orden_id bigint, p_resultado text, p_monto_recibido numeric, p_metodo text, p_recibido_por text, p_observacion text) from public, anon, authenticated, service_role;

revoke all privileges on function public.recibir_lote_cxc_v937(p_lote_id bigint, p_items jsonb, p_recibido_por text, p_observacion text) from public, anon, authenticated, service_role;

revoke all privileges on function public.consolidar_liquidaciones_duplicadas_v937(p_codigo_lote text, p_motivo text, p_usuario_nombre text) from public, anon, authenticated, service_role;

revoke all privileges on function public.crear_lote_entrega_v9371(p_codigo_lote text, p_responsable_nombre text, p_responsable_tipo text, p_items jsonb, p_validado_por text, p_snapshot jsonb) from public, anon, authenticated, service_role;

revoke all privileges on function public.transferir_orden_lote_v9371(p_lote_origen_id bigint, p_orden_id bigint, p_responsable_nuevo text, p_responsable_tipo_nuevo text, p_motivo text, p_usuario_nombre text) from public, anon, authenticated, service_role;

revoke all privileges on function public.agregar_sector_si_no_existe(p_sector text) from public, anon, authenticated, service_role;

revoke all privileges on function public.registrar_excepcion_v9378(p_evento jsonb) from public, anon, authenticated, service_role;

revoke all privileges on function public.revisar_excepcion_v9378(p_id bigint, p_estado text, p_nota text) from public, anon, authenticated, service_role;

revoke all privileges on function public.editar_composicion_lote_v9379(p_lote_id bigint, p_agregar_ordenes bigint[], p_retirar_ordenes bigint[], p_motivo text, p_usuario_nombre text, p_snapshot jsonb) from public, anon, authenticated, service_role;

revoke all privileges on function public.guardar_orden_v9381(p_orden_id bigint, p_llamada_id bigint, p_orden jsonb, p_items jsonb, p_composicion_cambio boolean, p_comentario text, p_llamada_observacion text) from public, anon, authenticated, service_role;

revoke all privileges on function public.guardar_preparacion_v9381(p_orden_id bigint, p_lineas jsonb, p_cabecera jsonb, p_final boolean) from public, anon, authenticated, service_role;

revoke all privileges on function public.pc_validar_transicion_orden_v9382() from public, anon, authenticated, service_role;

revoke all privileges on function public.cambiar_estado_orden_v9382(p_orden_id bigint, p_estado_esperado text, p_estado_nuevo text, p_cambios jsonb, p_comentario text, p_modulo text) from public, anon, authenticated, service_role;

revoke all privileges on function public.liberar_orden_v9382(p_orden_id bigint, p_estado_esperado text, p_motivo text) from public, anon, authenticated, service_role;

revoke all privileges on function public.pc_bloquear_borrado_trazabilidad_v9383() from public, anon, authenticated, service_role;

revoke all privileges on function public.cancelar_orden_v9383(p_orden_id bigint, p_estado_esperado text, p_motivo text, p_archivar boolean) from public, anon, authenticated, service_role;

revoke all privileges on function public.revertir_gestion_segura(p_llamada_id bigint, p_motivo text) from public, anon, authenticated, service_role;

revoke all privileges on function public.guardar_configuracion_v9390(p_clave text, p_valor jsonb) from public, anon, authenticated, service_role;

revoke all privileges on function public.pc_snapshot_pago_cliente_v9391() from public, anon, authenticated, service_role;

revoke all privileges on function public.guardar_preparacion_faltantes_v9391(p_orden_id bigint, p_lineas jsonb, p_cabecera jsonb, p_generar_pendiente boolean, p_fecha_estimada date, p_observacion text) from public, anon, authenticated, service_role;

revoke all privileges on function public.liberar_pendiente_existencia_v9391(p_orden_id bigint, p_observacion text) from public, anon, authenticated, service_role;

revoke all privileges on function public.registrar_devolucion_parcial_v9392(p_orden_id bigint, p_lineas jsonb, p_monto_recibido numeric, p_metodo text, p_recibido_por text, p_observacion text) from public, anon, authenticated, service_role;

revoke all privileges on function public.recibir_lote_cxc_v9392_r2(p_lote_id bigint, p_items jsonb, p_recibido_por text, p_observacion text) from public, anon, authenticated, service_role;

revoke all privileges on function public.pc_retornar_no_entregado_validacion_v9393(p_orden_id bigint, p_lote_id bigint, p_recibido_por text, p_observacion text) from public, anon, authenticated, service_role;

revoke all privileges on function public.pc_finalizar_lote_cxc_v9393(p_lote_id bigint, p_recibido_por text, p_observacion text) from public, anon, authenticated, service_role;

revoke all privileges on function public.recibir_orden_cxc_v9393(p_orden_id bigint, p_resultado text, p_monto_recibido numeric, p_metodo text, p_recibido_por text, p_observacion text) from public, anon, authenticated, service_role;

revoke all privileges on function public.recibir_lote_cxc_v9393(p_lote_id bigint, p_items jsonb, p_recibido_por text, p_observacion text) from public, anon, authenticated, service_role;

revoke all privileges on function public.pc_validar_insert_orden_v9397() from public, anon, authenticated, service_role;

revoke all privileges on function public.pc_validar_identidad_preparacion_v9397() from public, anon, authenticated, service_role;

revoke all privileges on function public.tomar_orden_v9397(p_orden_id bigint, p_estado_esperado text, p_empleado_id bigint, p_nombre text, p_comentario text) from public, anon, authenticated, service_role;

revoke all privileges on function public.crear_caso_especial_v9397(p_caso jsonb) from public, anon, authenticated, service_role;

revoke all privileges on function public.pc_sincronizar_cxc_orden_v940() from public, anon, authenticated, service_role;

revoke all privileges on function public.registrar_cobro_cxc_v940(p_cliente_clave text, p_monto numeric, p_metodo text, p_referencia text, p_recibido_por text, p_observacion text, p_aplicaciones jsonb) from public, anon, authenticated, service_role;

revoke all privileges on function public.reversar_cobro_cxc_v940(p_cobro_id bigint, p_motivo text) from public, anon, authenticated, service_role;

revoke all privileges on function public.actualizar_vencimiento_cxc_v940(p_orden_id bigint, p_vencimiento date, p_motivo text) from public, anon, authenticated, service_role;

revoke all privileges on function public.empleado_habilitado_area_v940r2(p_empleado_id bigint, p_area text) from public, anon, authenticated, service_role;

revoke all privileges on function public.fn_registrar_reprogramacion_v940r3() from public, anon, authenticated, service_role;

revoke all privileges on function public.pc_validar_orden_con_detalle_v940r3() from public, anon, authenticated, service_role;

revoke all privileges on function public.guardar_orden_desde_llamada_v940r3(p_llamada jsonb, p_orden jsonb, p_items jsonb, p_llamada_observacion text) from public, anon, authenticated, service_role;

grant EXECUTE on function public.mi_rol() to authenticated;

grant EXECUTE on function public.mi_vendedor() to authenticated;

grant EXECUTE on function public.agenda_del_dia(p_fecha date) to public;

grant EXECUTE on function public.agenda_del_dia(p_fecha date) to authenticated;

grant EXECUTE on function public.cfg_int(p_clave text, p_def integer) to authenticated;

grant EXECUTE on function public.fn_codigo_orden() to public;

grant EXECUTE on function public.fn_codigo_orden() to authenticated;

grant EXECUTE on function public.fn_orden_set_actualizado() to public;

grant EXECUTE on function public.fn_orden_set_actualizado() to authenticated;

grant EXECUTE on function public.fn_orden_programacion_flags() to public;

grant EXECUTE on function public.fn_orden_programacion_flags() to authenticated;

grant EXECUTE on function public.mi_rol_text() to authenticated;

grant EXECUTE on function public.modulo_nivel_actual(p_modulo text) to authenticated;

grant EXECUTE on function public.tiene_modulo(p_modulo text, p_requerido text) to authenticated;

grant EXECUTE on function public.tiene_algun_modulo(p_modulos text[], p_requerido text) to authenticated;

grant EXECUTE on function public.es_admin_operativo() to authenticated;

grant EXECUTE on function public.puede_modulo_v930r5(p_modulo text, p_nivel text) to authenticated;

grant EXECUTE on function public.puede_configurar_usuarios_v9214() to authenticated;

grant EXECUTE on function public.actualizar_usuario_permisos_v930r9(p_usuario_id uuid, p_nombre text, p_rol text, p_activo boolean, p_vendedor text, p_empleado_id bigint, p_tipo_cuenta text, p_modulos jsonb) to authenticated;

grant EXECUTE on function public.pc_normalizar_flujo_orden_v933() to public;

grant EXECUTE on function public.pc_normalizar_flujo_orden_v933() to authenticated;

grant EXECUTE on function public.corregir_lote_entrega_v936(p_lote_id bigint, p_accion text, p_nuevo_delivery text, p_motivo text, p_usuario_nombre text) to authenticated;

grant EXECUTE on function public.consolidar_liquidaciones_duplicadas_v937(p_codigo_lote text, p_motivo text, p_usuario_nombre text) to authenticated;

grant EXECUTE on function public.crear_lote_entrega_v9371(p_codigo_lote text, p_responsable_nombre text, p_responsable_tipo text, p_items jsonb, p_validado_por text, p_snapshot jsonb) to authenticated;

grant EXECUTE on function public.transferir_orden_lote_v9371(p_lote_origen_id bigint, p_orden_id bigint, p_responsable_nuevo text, p_responsable_tipo_nuevo text, p_motivo text, p_usuario_nombre text) to authenticated;

grant EXECUTE on function public.agregar_sector_si_no_existe(p_sector text) to authenticated;

grant EXECUTE on function public.registrar_excepcion_v9378(p_evento jsonb) to authenticated;

grant EXECUTE on function public.revisar_excepcion_v9378(p_id bigint, p_estado text, p_nota text) to authenticated;

grant EXECUTE on function public.editar_composicion_lote_v9379(p_lote_id bigint, p_agregar_ordenes bigint[], p_retirar_ordenes bigint[], p_motivo text, p_usuario_nombre text, p_snapshot jsonb) to authenticated;

grant EXECUTE on function public.guardar_orden_v9381(p_orden_id bigint, p_llamada_id bigint, p_orden jsonb, p_items jsonb, p_composicion_cambio boolean, p_comentario text, p_llamada_observacion text) to authenticated;

grant EXECUTE on function public.guardar_preparacion_v9381(p_orden_id bigint, p_lineas jsonb, p_cabecera jsonb, p_final boolean) to authenticated;

grant EXECUTE on function public.cambiar_estado_orden_v9382(p_orden_id bigint, p_estado_esperado text, p_estado_nuevo text, p_cambios jsonb, p_comentario text, p_modulo text) to authenticated;

grant EXECUTE on function public.liberar_orden_v9382(p_orden_id bigint, p_estado_esperado text, p_motivo text) to authenticated;

grant EXECUTE on function public.cancelar_orden_v9383(p_orden_id bigint, p_estado_esperado text, p_motivo text, p_archivar boolean) to authenticated;

grant EXECUTE on function public.revertir_gestion_segura(p_llamada_id bigint, p_motivo text) to authenticated;

grant EXECUTE on function public.guardar_configuracion_v9390(p_clave text, p_valor jsonb) to authenticated;

grant EXECUTE on function public.pc_snapshot_pago_cliente_v9391() to public;

grant EXECUTE on function public.pc_snapshot_pago_cliente_v9391() to authenticated;

grant EXECUTE on function public.guardar_preparacion_faltantes_v9391(p_orden_id bigint, p_lineas jsonb, p_cabecera jsonb, p_generar_pendiente boolean, p_fecha_estimada date, p_observacion text) to authenticated;

grant EXECUTE on function public.liberar_pendiente_existencia_v9391(p_orden_id bigint, p_observacion text) to authenticated;

grant EXECUTE on function public.registrar_devolucion_parcial_v9392(p_orden_id bigint, p_lineas jsonb, p_monto_recibido numeric, p_metodo text, p_recibido_por text, p_observacion text) to authenticated;

grant EXECUTE on function public.recibir_orden_cxc_v9393(p_orden_id bigint, p_resultado text, p_monto_recibido numeric, p_metodo text, p_recibido_por text, p_observacion text) to authenticated;

grant EXECUTE on function public.recibir_lote_cxc_v9393(p_lote_id bigint, p_items jsonb, p_recibido_por text, p_observacion text) to authenticated;

grant EXECUTE on function public.tomar_orden_v9397(p_orden_id bigint, p_estado_esperado text, p_empleado_id bigint, p_nombre text, p_comentario text) to authenticated;

grant EXECUTE on function public.crear_caso_especial_v9397(p_caso jsonb) to authenticated;

grant EXECUTE on function public.pc_sincronizar_cxc_orden_v940() to public;

grant EXECUTE on function public.pc_sincronizar_cxc_orden_v940() to authenticated;

grant EXECUTE on function public.registrar_cobro_cxc_v940(p_cliente_clave text, p_monto numeric, p_metodo text, p_referencia text, p_recibido_por text, p_observacion text, p_aplicaciones jsonb) to authenticated;

grant EXECUTE on function public.reversar_cobro_cxc_v940(p_cobro_id bigint, p_motivo text) to authenticated;

grant EXECUTE on function public.actualizar_vencimiento_cxc_v940(p_orden_id bigint, p_vencimiento date, p_motivo text) to authenticated;

grant EXECUTE on function public.empleado_habilitado_area_v940r2(p_empleado_id bigint, p_area text) to authenticated;

grant EXECUTE on function public.guardar_orden_desde_llamada_v940r3(p_llamada jsonb, p_orden jsonb, p_items jsonb, p_llamada_observacion text) to authenticated;

-- -----------------------------------------------------------------------------
-- Publicación Realtime
-- -----------------------------------------------------------------------------

do $bootstrap$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'cxc_cobro_aplicaciones'
  ) then
    execute 'alter publication supabase_realtime add table public.cxc_cobro_aplicaciones';
  end if;
end
$bootstrap$;

do $bootstrap$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'cxc_cobros'
  ) then
    execute 'alter publication supabase_realtime add table public.cxc_cobros';
  end if;
end
$bootstrap$;

do $bootstrap$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'orden_detalle'
  ) then
    execute 'alter publication supabase_realtime add table public.orden_detalle';
  end if;
end
$bootstrap$;

do $bootstrap$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'orden_entregas'
  ) then
    execute 'alter publication supabase_realtime add table public.orden_entregas';
  end if;
end
$bootstrap$;

do $bootstrap$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'orden_estados_historial'
  ) then
    execute 'alter publication supabase_realtime add table public.orden_estados_historial';
  end if;
end
$bootstrap$;

do $bootstrap$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'orden_pagos'
  ) then
    execute 'alter publication supabase_realtime add table public.orden_pagos';
  end if;
end
$bootstrap$;

do $bootstrap$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'orden_pesos'
  ) then
    execute 'alter publication supabase_realtime add table public.orden_pesos';
  end if;
end
$bootstrap$;

do $bootstrap$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'ordenes'
  ) then
    execute 'alter publication supabase_realtime add table public.ordenes';
  end if;
end
$bootstrap$;

do $bootstrap$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'sistema_configuracion'
  ) then
    execute 'alter publication supabase_realtime add table public.sistema_configuracion';
  end if;
end
$bootstrap$;

commit;

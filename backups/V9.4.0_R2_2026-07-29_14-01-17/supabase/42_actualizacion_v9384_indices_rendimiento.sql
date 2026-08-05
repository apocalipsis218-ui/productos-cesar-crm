begin;

-- =========================================================
-- V9.3.8.4 - ÍNDICES PARA CARGA OPERATIVA EN TABLETAS
-- Ejecutar una sola vez después del SQL 41.
-- Solo agrega índices; no modifica ni elimina datos.
-- =========================================================

create index if not exists idx_ordenes_operativas_v9384
  on public.ordenes(estado,id desc)
  where archivada=false and estado not in('Cobrado','Entregada en negocio','Anulado');

create index if not exists idx_ordenes_recientes_v9384
  on public.ordenes(id desc)
  where archivada=false;

create index if not exists idx_ordenes_despacho_v9384
  on public.ordenes(fecha_despacho,estado,id desc)
  where archivada=false;

create index if not exists idx_ordenes_cliente_v9384
  on public.ordenes(cliente_id,id desc)
  where archivada=false;

create index if not exists idx_orden_detalle_orden_v9384
  on public.orden_detalle(orden_id,id);

create index if not exists idx_orden_pesos_orden_fecha_v9384
  on public.orden_pesos(orden_id,creado_en desc);

create index if not exists idx_orden_entregas_orden_fecha_v9384
  on public.orden_entregas(orden_id,creado_en desc);

create index if not exists idx_orden_pagos_orden_fecha_v9384
  on public.orden_pagos(orden_id,creado_en desc);

create index if not exists idx_orden_historial_orden_fecha_v9384
  on public.orden_estados_historial(orden_id,creado_en desc);

create index if not exists idx_lote_detalle_orden_v9384
  on public.entrega_lote_detalle(orden_id,lote_id);

create index if not exists idx_lote_detalle_lote_v9384
  on public.entrega_lote_detalle(lote_id,orden_id);

analyze public.ordenes;
analyze public.orden_detalle;
analyze public.orden_pesos;
analyze public.orden_entregas;
analyze public.orden_pagos;
analyze public.orden_estados_historial;
analyze public.entrega_lote_detalle;

notify pgrst,'reload schema';
commit;

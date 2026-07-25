-- Diagnóstico previo V9.3.7. No modifica información.

select
  upper(trim(codigo_lote)) as codigo_lote,
  count(*) as liquidaciones_encontradas,
  array_agg(id order by id) as ids,
  min(fecha_liquidacion) as primera_liquidacion,
  max(fecha_liquidacion) as ultima_liquidacion,
  max(total_facturado) as total_referencia,
  max(efectivo_recibido) as efectivo_referencia,
  max(credito_pendiente) as credito_referencia
from public.liquidaciones_lotes
where nullif(trim(codigo_lote),'') is not null
  and upper(trim(codigo_lote)) <> 'SIN-LOTE'
group by upper(trim(codigo_lote))
having count(*) > 1
order by count(*) desc, codigo_lote;

select
  lote_id,
  orden_id,
  count(*) as detalles_repetidos
from public.entrega_lote_detalle
where lote_id is not null and orden_id is not null
group by lote_id, orden_id
having count(*) > 1
order by count(*) desc;

select
  liquidacion_id,
  orden_id,
  count(*) as detalles_repetidos
from public.liquidacion_lote_detalle
where orden_id is not null
group by liquidacion_id, orden_id
having count(*) > 1
order by count(*) desc;

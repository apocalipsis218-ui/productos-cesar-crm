const QUICK_INVOICE_ALLOWED_STATES = Object.freeze([
  'Lista para facturar',
  'Impresa para facturar',
]);

function substituteQtyFromNote(note = '') {
  const text = String(note || '');
  const patterns = [
    /Cantidad(?:\s+sustituta)?\s*:\s*([0-9]+(?:[.,][0-9]+)?)/i,
    /Cant(?:idad)?\.?\s*:\s*([0-9]+(?:[.,][0-9]+)?)/i,
    /\b([0-9]+(?:[.,][0-9]+)?)\s*(?:lb|lbs|unidad(?:es)?|ud(?:s)?\.?|caja(?:s)?|paquete(?:s)?)\b/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return Number(String(match[1]).replace(',', '.')) || 0;
  }
  return 0;
}

function substituteNameFromNote(note = '') {
  const match = String(note || '').match(/Sustituido por:\s*([^·|\n]+)/i);
  return String(match?.[1] || '').trim();
}

export function calculatePreparedInvoiceAmount(order, options = {}) {
  const items = Array.isArray(order?.items) ? order.items : [];
  const substitutePriceByName = typeof options.substitutePriceByName === 'function'
    ? options.substitutePriceByName
    : () => 0;

  if (!items.length) {
    return Number(order?.total_factura || order?.total_estimado || 0);
  }

  const hasPrepared = items.some((item) =>
    item?.cantidad_preparada !== null && item?.cantidad_preparada !== undefined
  );

  if (!hasPrepared) {
    return Number(order?.total_estimado || order?.total_factura || 0);
  }

  let total = 0;
  for (const item of items) {
    const status = String(item?.estado_preparacion || '');
    if (status === 'Sin existencia') continue;

    if (status === 'Sustituido' && item?.nota_preparacion) {
      const substituteName = substituteNameFromNote(item.nota_preparacion);
      const substituteQty = substituteQtyFromNote(item.nota_preparacion);
      const substitutePrice = Number(substitutePriceByName(substituteName, item)) || Number(item?.precio || 0);
      total += substituteQty * substitutePrice;
      continue;
    }

    const quantity = item?.cantidad_preparada !== null && item?.cantidad_preparada !== undefined
      ? Number(item.cantidad_preparada || 0)
      : Number(item?.cantidad_pedida || 0);
    total += quantity * Number(item?.precio || 0);
  }

  return Number(total.toFixed(2));
}

export function buildQuickInvoiceTransition(order, options = {}) {
  if (!order?.id) throw new Error('La orden no tiene un identificador válido.');
  if (!QUICK_INVOICE_ALLOWED_STATES.includes(String(order.estado || ''))) {
    throw new Error('La orden ya no está disponible para facturar. Actualiza la pantalla.');
  }

  const workerName = String(options.workerName || '').trim();
  if (!workerName) throw new Error('No se pudo identificar quién está facturando.');

  const amount = Number(options.amount || 0);
  if (!(amount > 0)) throw new Error('El total calculado de la orden es cero. Revisa la preparación antes de facturar.');

  const nowIso = String(options.nowIso || new Date().toISOString());
  const storePickup = options.storePickup === true;
  const internalSale = options.internalSale === true;
  const preparedWeight = Number(options.preparedWeight || 0);
  const nextState = storePickup ? 'Lista para retiro' : 'Facturada';
  const condition = internalSale ? 'Contado' : String(order.condicion_pago || 'Crédito');

  const payload = {
    estado: nextState,
    facturado_por: workerName,
    facturado_en: nowIso,
    total_factura: amount,
    peso_facturado: preparedWeight > 0 ? preparedWeight : null,
    condicion_pago: condition,
    delivery_nombre: storePickup ? null : (order.delivery_nombre || null),
  };

  const comment = storePickup
    ? `Facturación rápida completada por ${workerName}. Orden lista para retiro en negocio.`
    : `Facturación rápida completada por ${workerName}. Orden enviada a Validación.`;

  return {
    allowedStates: [...QUICK_INVOICE_ALLOWED_STATES],
    oldState: String(order.estado || ''),
    nextState,
    payload,
    comment,
  };
}

export { QUICK_INVOICE_ALLOWED_STATES };

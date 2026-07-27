export function deliveredQuantity(item = {}){
  const prepared = item.cantidad_preparada;
  const requested = item.cantidad_pedida;
  const value = prepared !== null && prepared !== undefined && prepared !== ''
    ? Number(prepared)
    : Number(requested || 0);
  return Number.isFinite(value) ? Math.max(value,0) : 0;
}

export function partialReturnMeasure(item = {}){
  const unit = String(item.unidad || 'unidad').trim();
  const normalized = unit.toLowerCase();
  const type = String(item.tipo_despacho_peso || '').toLowerCase();
  const byWeight = type === 'por libra' || ['lb','lbs','libra','libras'].includes(normalized);
  return {
    kind:byWeight ? 'weight' : 'quantity',
    unit:byWeight ? 'lb' : unit,
    label:byWeight ? 'Peso devuelto' : 'Cantidad devuelta',
    step:byWeight || item.permite_fraccion !== false ? '0.001' : '1'
  };
}

export function returnedWeightForMeasure(item = {}, measureValue = 0){
  const measure = Number(measureValue || 0);
  const config = partialReturnMeasure(item);
  if(config.kind === 'weight') return Number(measure.toFixed(3));
  if(item.suma_peso_final === false || String(item.tipo_despacho_peso || '').toLowerCase() === 'no pesa') return 0;
  const fixed = Number(item.peso_estandar_lb || 0);
  if(fixed > 0) return Number((measure * fixed).toFixed(3));
  const delivered = deliveredQuantity(item);
  const preparedWeight = Number(item.peso_equivalente_preparado || 0);
  if(delivered > 0 && preparedWeight > 0) return Number((measure * preparedWeight / delivered).toFixed(3));
  return 0;
}

export function calculatePartialReturn(originalTotal, rows = []){
  const invoiceTotal = Number(originalTotal || 0);
  if(!Number.isFinite(invoiceTotal) || invoiceTotal <= 0) throw new Error('La factura original debe ser mayor que cero.');
  if(!Array.isArray(rows) || !rows.length) throw new Error('Selecciona al menos un artículo devuelto.');

  let returnedAmount = 0;
  let returnedWeight = 0;
  const normalized = rows.map(row=>{
    const maxQty = Number(row.maxQty || 0);
    const qty = Number(row.qty || 0);
    const price = Number(row.price || 0);
    const weight = Number(row.weight || 0);
    if(!Number.isFinite(qty) || qty <= 0) throw new Error(`Indica la cantidad devuelta de ${row.name || 'cada artículo'}.`);
    if(qty > maxQty + 0.000001) throw new Error(`La devolución de ${row.name || 'un artículo'} supera lo entregado.`);
    if(!Number.isFinite(price) || price < 0) throw new Error(`El precio de ${row.name || 'un artículo'} no es válido.`);
    if(!Number.isFinite(weight) || weight < 0) throw new Error(`El peso devuelto de ${row.name || 'un artículo'} no es válido.`);
    const amount = Number((qty * price).toFixed(2));
    returnedAmount += amount;
    returnedWeight += weight;
    return {...row,qty,price,weight,amount};
  });

  returnedAmount = Number(returnedAmount.toFixed(2));
  returnedWeight = Number(returnedWeight.toFixed(3));
  if(returnedAmount <= 0) throw new Error('El valor devuelto debe ser mayor que cero.');
  if(returnedAmount >= invoiceTotal - 0.01) throw new Error('La devolución parcial no puede abarcar el total de la factura. Usa “No entregado”.');

  return {
    invoiceTotal,
    returnedAmount,
    netTotal:Number((invoiceTotal-returnedAmount).toFixed(2)),
    returnedWeight,
    rows:normalized
  };
}

export function netDeliveredWeight(originalWeight,returnedWeight){
  const original = Number(originalWeight || 0);
  const returned = Number(returnedWeight || 0);
  if(!Number.isFinite(original) || original < 0) return 0;
  if(!Number.isFinite(returned) || returned < 0) return original;
  return Number(Math.max(original-returned,0).toFixed(3));
}

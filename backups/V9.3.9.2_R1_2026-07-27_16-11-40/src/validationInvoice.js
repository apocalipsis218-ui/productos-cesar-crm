export function normalizeValidationInvoiceAmount(value){
  const amount=Number(value);
  if(!Number.isFinite(amount)) return 0;
  return Number(amount.toFixed(2));
}

export function requireValidationInvoiceAmount(value){
  const amount=normalizeValidationInvoiceAmount(value);
  if(!(amount>0)) throw new Error('Debes registrar un monto final de factura mayor que cero.');
  return amount;
}

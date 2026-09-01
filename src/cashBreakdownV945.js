export const CASH_DENOMINATIONS_V945 = Object.freeze([2000,1000,500,200,100,50,25,10,5,1]);

const roundMoney = value => Math.round((Number(value)||0)*100)/100;

export function normalizeCashBreakdownV945(rows=[]){
  const source=Array.isArray(rows)?rows:[];
  const byDenomination=new Map();
  source.forEach(row=>{
    const denomination=Number(row?.denominacion);
    const quantity=Number(row?.cantidad);
    if(!CASH_DENOMINATIONS_V945.includes(denomination)) throw new Error(`Denominación no permitida: ${row?.denominacion ?? ''}.`);
    if(!Number.isInteger(quantity)||quantity<0) throw new Error(`La cantidad de RD$${denomination} debe ser un entero igual o mayor que cero.`);
    if(byDenomination.has(denomination)) throw new Error(`La denominación RD$${denomination} está repetida.`);
    byDenomination.set(denomination,quantity);
  });
  return CASH_DENOMINATIONS_V945.map(denominacion=>{
    const cantidad=byDenomination.get(denominacion)||0;
    return {denominacion,cantidad,subtotal:roundMoney(denominacion*cantidad)};
  });
}

export function reconcileCashBreakdownV945(rows=[],expectedValue=0){
  const breakdown=normalizeCashBreakdownV945(rows);
  const expected=roundMoney(expectedValue);
  if(expected<0) throw new Error('El efectivo esperado no puede ser negativo.');
  const counted=roundMoney(breakdown.reduce((sum,row)=>sum+row.subtotal,0));
  const targetCounted=Math.round(expected);
  const rawDifference=roundMoney(counted-expected);
  const adjustment=counted===targetCounted ? roundMoney(expected-counted) : 0;
  const reconciled=roundMoney(counted+adjustment);
  const difference=roundMoney(reconciled-expected);
  const exact=Math.abs(difference)<0.01;
  const hasSurplus=difference>0.009;
  const hasShortage=difference< -0.009;
  return {
    breakdown,
    expected,
    counted,
    targetCounted,
    adjustment,
    reconciled,
    difference,
    rawDifference,
    exact,
    hasSurplus,
    hasShortage,
    requiresAuthorization:hasSurplus,
    canApply:exact||hasSurplus,
    canClose:exact
  };
}

export function cashBreakdownFromCountsV945(counts={}){
  return CASH_DENOMINATIONS_V945.map(denominacion=>({
    denominacion,
    cantidad:Number(counts?.[denominacion]||0)
  }));
}

export function cashBreakdownNonZeroV945(rows=[]){
  return normalizeCashBreakdownV945(rows).filter(row=>row.cantidad>0);
}

export function batchCashBreakdownReadinessV945({totalClients=0,checkedClients=0,errorCount=0,expectedCash=0}={}){
  const total=Math.max(0,Math.trunc(Number(totalClients)||0));
  const checked=Math.min(total,Math.max(0,Math.trunc(Number(checkedClients)||0)));
  const errors=Math.max(0,Math.trunc(Number(errorCount)||0));
  const expected=roundMoney(expectedCash);
  if(expected<0) throw new Error('El efectivo esperado del lote no puede ser negativo.');
  const pending=Math.max(total-checked,0);
  const allReviewed=total>0&&pending===0;
  const valid=allReviewed&&errors===0;
  const requiresBreakdown=valid&&expected>0.009;
  return {
    totalClients:total,
    checkedClients:checked,
    pendingClients:pending,
    errorCount:errors,
    expectedCash:expected,
    allReviewed,
    valid,
    requiresBreakdown,
    canOpen:requiresBreakdown,
    canCloseWithoutBreakdown:valid&&!requiresBreakdown
  };
}

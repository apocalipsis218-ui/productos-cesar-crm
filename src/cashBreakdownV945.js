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
  return {
    breakdown,
    expected,
    counted,
    targetCounted,
    adjustment,
    reconciled,
    difference,
    rawDifference,
    exact:Math.abs(difference)<0.01,
    canClose:Math.abs(difference)<0.01
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

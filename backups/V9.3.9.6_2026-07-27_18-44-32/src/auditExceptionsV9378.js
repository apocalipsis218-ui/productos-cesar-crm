export const AUDIT_REVIEW_STATES=['Pendiente','Revisado','Requiere seguimiento'];
export const AUDIT_SEVERITIES=['Informativa','Advertencia','Crítica'];

export function isAuditAdministrator(role){
  return ['Gerente','Administrador'].includes(String(role||'').trim());
}

export function normalizeExceptionPayload(input={}){
  const numberOrNull=value=>{
    if(value===null||value===undefined||value==='') return null;
    const n=Number(value);
    return Number.isFinite(n)?n:null;
  };
  return {
    modulo:String(input.modulo||'Sistema').trim(),
    tipo_evento:String(input.tipo_evento||'Excepción operativa').trim(),
    gravedad:AUDIT_SEVERITIES.includes(input.gravedad)?input.gravedad:'Advertencia',
    accion:String(input.accion||'Continuó bajo responsabilidad').trim(),
    motivo:String(input.motivo||'').trim(),
    orden_id:input.orden_id??null,
    orden_codigo:String(input.orden_codigo||'').trim()||null,
    cliente_nombre:String(input.cliente_nombre||'').trim()||null,
    lote_codigo:String(input.lote_codigo||'').trim()||null,
    valor_esperado:numberOrNull(input.valor_esperado),
    valor_registrado:numberOrNull(input.valor_registrado),
    diferencia:numberOrNull(input.diferencia),
    tolerancia_aviso:numberOrNull(input.tolerancia_aviso),
    tolerancia_maxima:numberOrNull(input.tolerancia_maxima),
    unidad:String(input.unidad||'').trim()||null,
    detalle:input.detalle&&typeof input.detalle==='object'?input.detalle:{}
  };
}

export function exceptionNeedsAttention(row){
  return row?.estado_revision!=='Revisado';
}

export function exceptionSummary(rows=[]){
  const today=new Date().toISOString().slice(0,10);
  return {
    total:rows.length,
    today:rows.filter(r=>String(r.creado_en||'').slice(0,10)===today).length,
    pending:rows.filter(r=>r.estado_revision==='Pendiente').length,
    critical:rows.filter(r=>r.gravedad==='Crítica'&&exceptionNeedsAttention(r)).length,
    followup:rows.filter(r=>r.estado_revision==='Requiere seguimiento').length
  };
}

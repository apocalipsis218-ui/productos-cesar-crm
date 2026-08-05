# V9.3.9.3 — No entregados regresan a Validación

Cuando CXC confirma **No entregado**, la liquidación conserva el intento fallido y la
orden regresa a **Validación** como `Facturada`, pendiente de crear un nuevo lote.

Se conservan factura, pesos, artículos, lote anterior, responsable, recibo, entrega e
historial. Se reinician únicamente la asignación activa, el resultado activo, el cobro,
el crédito y la fecha de recepción. El motivo es obligatorio y el flujo es transaccional
e idempotente.

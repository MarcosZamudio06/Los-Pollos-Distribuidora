## Reglas no negociables

- Inventario siempre por `OperationalLocation`.
- No existe stock global como fuente de verdad.
- Toda venta, compra, ajuste, movimiento y traspaso debe conservar ubicacion operativa.
- Toda venta a credito genera `AccountReceivable`.
- Todo pago de cobranza del MVP requiere `Payment.accountReceivableId` y aplica a una sola cuenta por cobrar.
- Un pago inmediato de venta de contado no debe crear una cuenta por cobrar artificial; debe quedar trazable contra la venta y seguir usando `Payment` como única fuente monetaria.
- `PaymentAllocation` esta fuera del MVP.
- Traspasos son entidad/dominio propio.
- Equivalencias kilo-pieza deben persistirse y auditarse.
- Ticket, nota y comprobante interno no son CFDI.
- SAT, CFDI, timbrado, PAC, UUID fiscal y cancelacion fiscal estan fuera del MVP.
- Integraciones automaticas con basculas, lectores o hardware especializado estan fuera del MVP.
- La captura manual de folios/tickets de bascula si puede estar dentro del MVP.
- Operaciones criticas deben ejecutarse transaccionalmente cuando se implemente codigo.
- No hardcodear secretos ni subir `.env`.

---
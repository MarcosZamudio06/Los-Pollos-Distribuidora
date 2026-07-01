### Sale

Debe soportar, segun specs vigentes o futuros:

- canal: mostrador, punto externo, ruta, institucional/mayoreo;
- documento: ticket de bascula, nota sencilla, nota grande, recibo interno;
- `collectionStatus`: no pagado, parcialmente pagado, pagado, cancelado;
- ubicacion operativa obligatoria;
- folio fisico cuando aplique;
- cliente opcional para publico general y obligatorio para credito/facturable;
- usuario que vendio, entrego y/o cobro cuando aplique.
- `BillingRequest` se modela aparte como relacion administrativa; no agrega un valor nuevo al documento de `Sale`.

### AccountReceivable

Debe soportar:

- venta origen;
- cliente;
- folio fisico/documento administrativo;
- fecha de emision;
- fecha de vencimiento;
- monto original;
- monto pagado;
- saldo;
- `status` de cobranza: no pagado, parcialmente pagado, pagado, cancelado;
- `agingStatus`: vigente, por vencer o vencido;
- pagos asociados uno a uno por MVP.

### Payment

Debe soportar:

- `accountReceivableId` obligatorio solo para pagos de cobranza o liquidación de saldo pendiente;
- `saleId` cuando el pago representa contado inmediato o abono inicial sin cuenta por cobrar artificial;
- monto;
- fecha;
- metodo: efectivo, transferencia, deposito, tarjeta, boucher, otro;
- banco opcional;
- referencia opcional;
- usuario que registra;
- ubicacion o ruta cuando aplique.

Regla canonica:

- `Payment` es la unica fuente monetaria del sistema.
- `paymentType` clasifica solo el tipo de venta (`CASH_SALE` o `CREDIT_SALE`).
- `collectionStatus` clasifica el estado de cobranza o saldo.
- `agingStatus` clasifica antigüedad o mora.
- `Customer.creditStatus` clasifica bloqueo o habilitación administrativa del cliente.
- `CashMovement` no sustituye pagos; solo clasifica entradas/salidas operativas de caja para conciliación.

### Corte diario

Debe soportar:

- ubicacion;
- fecha;
- entradas;
- salidas;
- ventas por ticket/nota;
- efectivo;
- boucher/tarjeta;
- transferencias;
- gastos;
- sobrantes/faltantes;
- compra/costo;
- venta;
- utilidad bruta/neta;
- estado borrador, revisado, cerrado, cancelado.

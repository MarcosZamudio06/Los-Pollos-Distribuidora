# ADR-013 — Implementación de REP 2.0 por pago

## Estado

Aceptado — CFDI-17. Implementación inicial de emisión CFDI tipo `P`; no
habilita agrupación mensual ni sustitución automática.

## Contexto

CFDI-16 definió que `Payment` es la fuente económica y que una venta puede
estar relacionada con varias facturas por medio de `InvoiceSaleDocument`.
Derivar un UUID desde `Payment.saleId` produciría una parcialidad incorrecta.
La emisión también debe conservar la garantía de no duplicar timbrados del
flujo de Ingreso.

## Decisión

La entrada canónica es:

```text
POST /api/billing/payments/:paymentId/issue-cfdi
```

Solo `ADMIN` y `BILLING` pueden ejecutarla. El request exige
`Idempotency-Key` y `expectedVersion`; no acepta UUID, TFD, sellos,
certificados, total, conceptos, impuestos, parcialidades ni saldos.

La preparación en `Serializable`:

1. bloquea `Payment` y valida `APPLIED`, versión, FormaPago SAT y moneda;
2. descubre facturas únicamente mediante `SaleDocument` e
   `InvoiceSaleDocument` explícitos;
3. exige `Invoice` nativa `INCOME`, `STAMPED`, `ACTIVE`, con UUID y `PPD`;
4. ordena candidatos por `issuedAt`, UUID e id y calcula con `Prisma.Decimal`;
5. crea `Invoice(PAYMENT_RECEIPT)`, `PaymentReceipt`,
   `PaymentReceiptDetail`, aplicaciones `RESERVED` y un intento `STAMP`;
6. incrementa la versión del pago y confirma la reserva antes de la red.

El PAC se llama fuera de la transacción. Una respuesta completa finaliza la
raíz como `STAMPED` y las aplicaciones como `EFFECTIVE`; Facturama recibe el
payload oficial de Pagos 2.0 (`CfdiType=P`, `NameId=14`, `CP01`, total raíz
cero y `DoctoRelacionado` por aplicación). Para `ObjetoImpDR=02`, los
snapshots inmutables de `InvoiceConcept` se prorratean con `Prisma.Decimal` al
importe pagado y se envían como `Taxes` en el documento relacionado y en el
nodo de pago; si ese snapshot falta, la emisión se bloquea en vez de inventar
un desglose. Un timeout, 5xx o respuesta ambigua deja `Invoice.UNKNOWN`,
aplicaciones `UNKNOWN` y la reserva intacta.
`StampReconciliationJob` consulta el proveedor por la referencia persistida;
si no puede determinar el resultado, mantiene `UNKNOWN` y abre remediación.
Nunca reenvía `stamp` automáticamente.

La fecha de emisión CFDI (`Invoice.issuedAt`) se captura al reservar; la fecha
económica de cobro (`PaymentReceiptDetail.paymentDate` y el nodo `Pago`) usa
`Payment.paidAt`. XML/PDF se guardan mediante `FiscalArtifactService` en
ObjectStorage privado, no en PostgreSQL.

## Reglas de cálculo

Para cada factura relacionada:

```text
NumParcialidad   = max(EFFECTIVE.partialityNumber) + 1
ImpSaldoAnt      = Invoice.total - sum(EFFECTIVE.amountPaid)
ImpPagado        = monto asignado al UUID
ImpSaldoInsoluto = ImpSaldoAnt - ImpPagado
```

El monto se limita por el saldo de la factura y la capacidad no aplicada de
los documentos de la venta. Si el pago no puede distribuirse por completo,
la operación se rechaza sin crear snapshots. Las monedas mezcladas, PUE,
duplicados y exceso de pago se bloquean con códigos estables.

## Cancelación y dependencias

La cancelación reutiliza `InvoiceCancellationService`. Enviar la solicitud no
revierte aplicaciones REP. Solo una confirmación fiscal `CANCELLED` cambia
`PaymentInvoiceApplication` a `REVERSED` y permite liberar el saldo fiscal.
Los estados `PENDING`, `REJECTED`, `ERROR` y `UNKNOWN` conservan la reserva.

## Consecuencias

- No se modifica `Sale`, `SaleDocument`, `Payment` económico, cartera ni
  inventario más allá de la versión/idempotencia de la reserva fiscal.
- Los replays devuelven el resultado persistido y no vuelven a llamar al PAC.
- Se requiere remediación para pagos legacy sin FormaPago SAT, moneda inequívoca
  o facturas externas no timbradas por el bounded context nativo.
- Preview e historial específicos por `paymentId` quedan para una tarea
  posterior; el endpoint de emisión recalcula siempre en backend.
- La concurrencia PostgreSQL desechable debe ejecutarse en un ambiente con
  `E2E_DATABASE_DISPOSABLE=true`; mocks no sustituyen esa evidencia.

## Referencias

- `specs/modules/cfdi/spec.md`
- `specs/.specs/03-api/cfdi-api.md`
- `backend/src/modules/cfdi/domain/rep-document-builder.ts`
- `backend/src/modules/cfdi/rep-issuance.repository.ts`
- Facturama, [Complemento de pago 2.0](https://apisandbox.facturama.mx/guias/cfdi40/complementos/complemento-pago-20)
- Facturama, [PaymentBinding20Model](https://apisandbox.facturama.mx/docs/ResourceModel?modelName=PaymentBinding20Model)
- Facturama, [RelatedDocument20](https://apisandbox.facturama.mx/docs/ResourceModel?modelName=RelatedDocument20)
- Facturama, [TaxBindingPagov4Model](https://apisandbox.facturama.mx/docs/ResourceModel?modelName=TaxBindingPagov4Model)

# ADR-012 — REP 2.0 mediante aplicaciones fiscales Payment–Invoice

## Estado

Aceptado — CFDI-16, arquitectura únicamente.

## Decisión

El REP se persistirá como `Invoice(origin=NATIVE_CFDI,
cfdiType=PAYMENT_RECEIPT)`. `Invoice` seguirá siendo la única raíz fiscal y
reutilizará estados, idempotencia, cancelación, intentos, XML/PDF y
reconciliación existentes.

El complemento será una extensión propiedad de esa raíz:

| Entidad                     | Responsabilidad                                                            |
| --------------------------- | -------------------------------------------------------------------------- |
| `PaymentReceipt`            | Snapshot del complemento Pagos 2.0 y Totales                               |
| `PaymentReceiptDetail`      | Snapshot de un nodo Pago y referencia al `Payment` económico               |
| `PaymentInvoiceApplication` | Snapshot de cada `DoctoRelacionado` y relación con la `Invoice` de Ingreso |

`Payment` permanece como única fuente económica. Las entidades REP no afectan
caja, cartera, cierre, ruta, venta ni inventario. `PaymentAllocation` continúa
fuera del modelo porque cada pago de cobranza sigue aplicando a una sola
`AccountReceivable`; la nueva relación distribuye solo su representación
fiscal entre facturas.

## Contexto comprobado

El modelo actual tiene una `AccountReceivable` por `Sale` y los pagos de
cobranza `APPLIED` reducen su saldo transaccionalmente. Cobranza directa y
`DeliveryService.registerCollection` crean el mismo `Payment`; segunda vuelta
solo agrega `collectionPass`/responsable.

La facturación no tiene cardinalidad uno-a-uno con venta. Una
`InvoiceSaleDocument` aplica importes de una factura a un `SaleDocument`, por lo
que una venta puede quedar facturada por varias `Invoice` y una factura puede
agrupar varias ventas compatibles. En consecuencia, derivar un solo UUID desde
`Payment.saleId` sería incorrecto.

El SAT exige REP cuando la contraprestación de un CFDI PPD se recibe total o
parcialmente. Cada `DoctoRelacionado` expresa UUID, parcialidad, saldo anterior,
importe pagado y saldo insoluto; el CFDI tipo Pago usa total cero y el
complemento 2.0 agrega pagos, impuestos y Totales.

El comprobante conserva los valores oficiales de tipo Pago (`P`, `XXX`, total
cero, UsoCFDI `CP01` y concepto `84111506`/`ACT`/`Pago`). La relación de
sustitución usa `c_TipoRelacion=04`; el catálogo versionado deberá incorporar
`c_TipoRelacion` antes de habilitar esta operación.

## Asignación determinista

La factura candidata se descubre únicamente mediante la relación existente:

```text
Payment -> AccountReceivable/Sale -> SaleDocument
        -> InvoiceSaleDocument -> Invoice INCOME/STAMPED/PPD
```

Las facturas se ordenan por `issuedAt`, `uuid`, `id`. El monto de un pago se
distribuye usando el menor de:

1. remanente del `Payment`;
2. saldo fiscal vigente de la factura;
3. capacidad todavía no pagada de la venta dentro de esa factura.

El tercer límite evita que el pago de una venta consuma el tramo de otra venta
en una factura agrupada. La suma de aplicaciones debe coincidir exactamente
con `Payment.amount`; si no, el REP se bloquea en lugar de omitir una parte del
pago.

Por factura:

```text
NumParcialidad   = max(parcialidad EFFECTIVE) + 1
ImpSaldoAnt      = Invoice.total - sum(ImpPagado EFFECTIVE)
ImpPagado        = importe asignado
ImpSaldoInsoluto = ImpSaldoAnt - ImpPagado
```

Pagos que afectan la misma factura se procesan por `paidAt,id`. Sustituir un
REP copia parcialidad y saldos del original; no crea una parcialidad nueva.

## PUE y PPD

- Una operación totalmente pagada antes o al emitir usa PUE y no genera REP.
- Una operación con primer abono y saldo pendiente usa PPD/99 y genera REP por
  el abono.
- Un pago diferido total o parcial sobre PPD genera REP.
- Un CFDI PUE cobrado después es una inconsistencia que no se corrige emitiendo
  REP.

Cada `Payment(APPLIED)` de PPD genera una obligación con fecha límite al quinto
día natural del mes inmediato siguiente, calculada en la zona horaria
operativa. El atraso se audita/remedia; no cambia `paidAt` ni permite duplicar
timbrado.

Solo `Payment.status=APPLIED` es elegible. `PaymentMethod` es operacional; se
agregarán moneda y FormaPago SAT independientes, sin inferir equivalencias
ambiguas para pagos legacy.

## Consistencia, red y cancelación

La preparación usa una transacción PostgreSQL `Serializable` y locks ordenados
sobre pago, cuenta, facturas y aplicaciones. Persiste snapshots, reserva e
intento antes de llamar al PAC. HTTP y ObjectStorage permanecen fuera de la
transacción.

Timeout conserva `UNKNOWN` y la reserva; no se repite timbrado. Cancelación
pendiente conserva aplicaciones efectivas. Solo confirmación fiscal cambia las
aplicaciones a `REVERSED`. Un REP con aplicaciones posteriores se resuelve en
orden inverso. Un pago o CFDI de Ingreso con REP vigente no se cancela antes de
resolver la dependencia fiscal.

Para motivo `01`, el sustituto es otro REP ya `STAMPED`, del mismo
emisor/receptor/pago, relacionado con tipo `04`. Internamente queda una sola
cadena efectiva mientras se confirma la cancelación del original.

## API y alcance inicial

La entrada será `POST /api/billing/payments/:paymentId/issue-cfdi`, no un
endpoint anclado a una factura. La primera implementación emitirá un REP por
`Payment` y podrá relacionarlo con varias facturas. La cardinalidad prepara una
agrupación mensual futura, pero no la habilita.

CFDI-16 no definió la implementación; CFDI-17 la ejecuta mediante una
migración aditiva, `FiscalProviderPort`, Facturama y reconciliación. No se
crean REP históricos ni asociaciones payment–UUID por heurística. El detalle
de ejecución vive en `docs/adr/ADR-013-rep-2-implementation.md`.

## Alternativas descartadas

1. **`Payment -> Sale -> primer UUID`.** Pierde facturación parcial/múltiple y
   produce saldos REP incorrectos.
2. **Usar `AccountReceivable.outstandingAmount` como saldo del REP.** La cuenta
   representa el saldo de la venta, no el saldo individual de cada CFDI.
3. **Crear un segundo registro monetario para REP.** Duplicaría ingresos y
   rompería caja/cartera.
4. **Reactivar `PaymentAllocation`.** Resolvería un problema distinto: dividir
   dinero entre cuentas por cobrar; el MVP mantiene una cuenta por pago.
5. **Persistir solo JSON en `Invoice`.** Ocultaría unicidad, locking,
   dependencias y consultas de parcialidad que PostgreSQL debe gobernar.
6. **FIFO solo por factura sin límite de venta.** Permitiría que un pago de una
   venta consumiera el tramo de otra dentro de una factura agrupada.

## Consecuencias

- El modelo distingue autoridad económica y reflejo fiscal sin doble fuente de
  verdad.
- Multi-factura, pagos parciales y liquidación quedan deterministas y
  auditables.
- Se requieren campos fiscales adicionales en `Payment` y remediación legacy;
  la operación económica existente no se bloquea.
- Cancelar pagos o facturas PPD necesitará guardas de dependencia REP.
- La implementación debe agregar pruebas PostgreSQL reales de concurrencia,
  timeout, parcialidad, sustitución y cero escrituras económicas.

## Referencias oficiales

- SAT, Complemento de pagos:
  https://wwwmat.sat.gob.mx/consultas/92764/comprobante-de-recepcion-de-pagos
- SAT, regla 2.7.1.32, expedición de CFDI por pagos realizados:
  https://wwwmat.sat.gob.mx/articulo/22029/regla-2.7.1.35
- SAT, estándar técnico Pagos 2.0:
  https://www.sat.gob.mx/cs/Satellite?blobcol=urldata&blobkey=id&blobtable=MungoBlobs&blobwhere=1461175070885&ssbinary=true
- SAT, cancelación de facturas:
  https://wwwmat.sat.gob.mx/consultas/91447/nuevo-esquema-de-cancelacion

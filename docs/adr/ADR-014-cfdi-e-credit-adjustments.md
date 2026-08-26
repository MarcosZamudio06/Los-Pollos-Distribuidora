# ADR-014 — CFDI E mediante ajustes de crédito autorizados

## Estado

Aceptado — CFDI-18. Implementación inicial para notas de crédito relacionadas
con facturas nativas de Ingreso; no automatiza devoluciones físicas ni
movimientos de inventario.

## Contexto

Una devolución física, una incidencia de entrega y un movimiento de inventario
describen hechos operativos distintos del efecto fiscal. Emitir un CFDI E desde
cualquiera de esos eventos sin una decisión comercial autorizada mezclaría dos
fuentes de verdad y permitiría acreditar importes sin control fiscal.

Una factura puede recibir créditos parciales o múltiples, por lo que la
validación no puede limitarse al total de la factura ni reconstruirse desde
`Product` o `Customer` actuales. También debe conservarse la frontera de red
del timbrado nativo: PostgreSQL reserva y controla el estado, pero no mantiene
bloqueos durante la llamada al PAC.

## Decisión

Se introduce `CreditAdjustment` como raíz comercial explícita, separada de
`Invoice`, devoluciones, incidencias e inventario. Sus fuentes permitidas son
devolución aprobada, bonificación, descuento posterior y ajuste comercial.
Una devolución aprobada requiere una referencia operativa; esa referencia no
crea por sí misma el crédito.

`CreditAdjustmentInvoice` relaciona el ajuste con una o más facturas
`INCOME/STAMPED/ACTIVE`, conserva el UUID original y deriva el tipo de relación
SAT: `03` para devolución aprobada y `01` para las demás fuentes.
`CreditAdjustmentLine` selecciona conceptos originales y guarda el prorrateo
fiscal inmutable de subtotal, descuento, base, impuestos y total.

El flujo es:

```text
DRAFT -> APPROVED -> ISSUING -> ISSUED
                              -> UNKNOWN
                              -> ISSUE_ERROR
```

La autorización, ejecutable solo por `ADMIN` o `BILLING`, bloquea las facturas
y conceptos en orden estable dentro de una transacción `Serializable`. El saldo
acreditable es el total original menos las líneas de otros ajustes en estados
que reservan (`APPROVED`, `ISSUING`, `UNKNOWN`, `ISSUED` o `ISSUE_ERROR`). Esto
impide que dos notas concurrentes acrediten más que el concepto original.

La emisión requiere `Idempotency-Key` y `expectedVersion`. La preparación crea
un `Invoice` nativo `EXPENSE`, sus `InvoiceConcept`, un intento `STAMP` y cambia
el ajuste a `ISSUING`; después confirma la transacción y llama
`FiscalProviderPort` sin locks PostgreSQL. Facturama recibe `CfdiType=E`,
`NameId=2`, UsoCFDI `G02`, MétodoPago `PUE` y las relaciones derivadas. UUID,
TFD, sellos, certificado, totales e identidad PAC nunca se aceptan desde el
frontend.

Un timeout o resultado ambiguo conserva `UNKNOWN` y el saldo reservado. No se
reintenta `stamp` automáticamente; la reconciliación fiscal existente debe
resolver la identidad. XML/PDF se persisten mediante `FiscalArtifactService` y
ObjectStorage privado.

## Invariantes

- Ninguna operación de crédito crea o modifica `InventoryMovement`.
- Solo una confirmación fiscal produce `Invoice(EXPENSE, STAMPED)` con UUID.
- El total acreditado y reservado por concepto nunca supera el total del
  concepto original.
- Facturas canceladas, legacy, P, E o no timbradas no son acreditables.
- Los snapshots no dependen de cambios posteriores en cliente, producto o
  catálogos.
- Cancelar un CFDI E solo libera su reserva después de confirmación fiscal.

## Consecuencias

- La devolución física y la nota fiscal pueden existir de forma independiente
  y auditable.
- El primer alcance permite una UI mínima sobre la factura original; consultas
  masivas y workflows comerciales especializados pueden extender la misma raíz
  sin crear otro módulo fiscal.
- Los registros legacy no se convierten ni reciben UUID o relaciones inferidas.
- La prueba de concurrencia requiere PostgreSQL desechable con
  `DATABASE_URL=E2E_DATABASE_URL` y `E2E_DATABASE_DISPOSABLE=true`.

## Referencias

- `specs/modules/cfdi/spec.md`
- `specs/.specs/03-api/cfdi-api.md`
- `backend/src/modules/cfdi/credit-adjustment.repository.ts`
- `backend/src/modules/cfdi/domain/credit-note-document-builder.ts`
- Facturama, [Nota de crédito CFDI 4.0](https://apisandbox.facturama.mx/guias/cfdi40/nota-credito)
- SAT, [Guía de llenado del CFDI](https://wwwmatnp.sat.gob.mx/cs/Satellite?blobcol=urldata&blobkey=id&blobtable=MungoBlobs&blobwhere=1705376468921&ssbinary=true)

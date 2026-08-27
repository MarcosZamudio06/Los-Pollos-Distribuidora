# ADR-004 — Emisión CFDI con preparación, red y finalización separadas

- Estado: Aceptado
- Fecha: 2026-08-23
- Alcance: CFDI de Ingreso desde `BillingRequest.APPROVED`

## Decisión

`POST /api/billing/requests/:id/issue-cfdi` ejecuta tres etapas. Una transacción
`Serializable` corta bloquea la solicitud y documentos en orden estable,
valida versión/saldos, asigna serie-folio, persiste snapshot, conceptos,
aplicaciones de reserva y un intento `PROCESSING`. Después del commit se llama
a `FiscalProviderPort`. Una segunda transacción corta finaliza el resultado.

La red NUNCA ocurre con locks PostgreSQL abiertos. Una raíz única por
`sourceBillingRequestId`, una idempotencia fiscal global y la identidad
`LegalEntity + tipo + serie + folio` impiden doble emisión concurrente.

## Resultado por clase de fallo

| Evidencia | Estado persistido | Saldo |
| --- | --- | --- |
| Respuesta timbrada completa | `STAMPED` / `SUCCEEDED` | Aplicado |
| Rechazo definitivo 4xx | `FAILED` / `TERMINAL_FAILURE` | Reserva revertida |
| Timeout, 5xx o respuesta incompleta | `UNKNOWN` / `UNKNOWN` | Reservado |
| Éxito PAC con rollback de finalización | `UNKNOWN` recuperable | Reservado |

`UNKNOWN` nunca reenvía `STAMP`; solo una reconciliación posterior puede
resolverlo. XML/PDF quedan como artefactos `PENDING` con referencia PAC y se
publicarán mediante ObjectStorage sin repetir emisión.

## Consecuencias

- Un crash después de preparar deja evidencia durable y no dispara otro POST.
- Las aplicaciones existentes siguen siendo la única autoridad de saldo.
- `Sale`, `Payment`, `AccountReceivable` e inventario no reciben mutaciones.
- Un futuro worker puede reclamar reconciliaciones en PostgreSQL sin Redis,
  Kafka ni microservicio fiscal.

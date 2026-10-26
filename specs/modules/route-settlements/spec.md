# Module Spec — Liquidación de ruta

## Objetivo

Conciliar entregas, incidencias, devoluciones, efectivo, transferencias/depositos y cobranza posterior por ruta.

## Funcionalidades

- Abrir liquidación.
- Calcular totales esperados y cobrados.
- Registrar diferencias.
- Cerrar liquidación.
- Reabrir con autorización.

## Entidades

- RouteSettlement.
- DeliveryRoute.
- DeliveryOrder.
- Payment.
- InventoryMovement.

## Reglas

- No cerrar con pedidos sin estado final.
- La liquidación distingue primera y segunda vuelta de cobranza.
- La liquidación no sustituye el corte diario de punto fijo.
- La liquidación no sustituye la carga ni devolución física de inventario; toda diferencia de producto debe resolverse sobre `ROUTE_STOCK` con trazabilidad.
- Todo total cobrado en liquidación debe derivarse de `Payment`.
- La cartera pendiente no es efectivo ni faltante de liquidación: una venta de
  100 con 40 cobrados y 60 pendientes conserva los 60 en cartera, sin incluirlos
  en el dinero esperado ni impedir por ese saldo el cierre de ruta. La mora se
  informa por separado; el cierre no paga ni cancela la cuenta por cobrar.
- Los importes esperados por método representan los `Payment(APPLIED)` bajo
  custodia de la ruta o liquidación, no el total bruto ni el saldo de la venta.
  `paidAtDeliveryAmount` suma primera vuelta (incluidos pagos sin vuelta
  explícita); `secondPassCollectionsAmount` suma segunda vuelta. Ambas
  dimensiones incluyen todos los métodos y no deben sumarse otra vez a los
  totales por método. Un abono registrado fuera de la ruta reduce cartera pero
  no se atribuye como efectivo recibido por el conductor.
- El recálculo persiste un snapshot completo y aumenta la versión. El cierre
  recalcula sus fuentes dentro de la misma transacción y conserva ese snapshot;
  la lectura de CLOSED no reemplaza sus totales con datos posteriores.
- Un nuevo cobro atribuido a la ruta y la reversa de sus pagos requieren
  reapertura auditable si su liquidación está CLOSED. La cobranza posterior
  independiente, no atribuida a esa ruta/liquidación, conserva su propio
  contexto y no modifica el snapshot cerrado ni queda bloqueada por él.
- Un comando ordinario no cambia pedidos de rutas COMPLETED o CANCELLED.
  Cierre, recálculo y mutaciones dependientes comparten exclusión transaccional
  por ruta para no aceptar fuentes obsoletas bajo concurrencia.
- REP 2.0 no crea un cobro de ruta adicional. Primera/segunda vuelta y
  liquidación conservan el mismo `Payment(APPLIED)`; la relación fiscal futura
  no cambia totales, diferencias ni estado de la ruta.
- No cerrar ni cancelar operativamente una venta ya liquidada sin reapertura auditable.
- La apertura/cálculo, el cierre y la reapertura deben respetar control de versión e idempotencia.
- `Idempotency-Key` es obligatorio para apertura/cálculo, cierre y reapertura;
  su ausencia responde `400 Bad Request` antes de ejecutar el comando.

## Permisos

- ADMIN y COLLECTIONS.

## API

Las rutas exactas deben definirse en `specs/.specs/03-api/route-settlements-api.md`.

## UI

- Resumen de liquidación.
- Diferencias.
- Cierre y reapertura.

## Pruebas mínimas

- Abrir liquidación.
- Cerrar liquidación.
- Detectar diferencia.
- Reabrir con motivo.
- Resolver diferencia física con movimiento trazable antes del cierre final o marcar revisión requerida.
- Requerir idempotencia en apertura/cálculo, cierre y reapertura.
- Requerir control de versión para cierre y reapertura.

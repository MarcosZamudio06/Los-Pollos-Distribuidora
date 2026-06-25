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
- No cerrar ni cancelar operativamente una venta ya liquidada sin reapertura auditable.
- La apertura/cálculo, el cierre y la reapertura deben respetar control de versión e idempotencia.

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

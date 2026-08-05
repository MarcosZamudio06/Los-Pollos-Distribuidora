# Fórmulas de conciliación: CEDIS-sucursal

## Notación

Sea `C` un ciclo, `p` un producto y `u` una dimensión física (`KG` o `PIECE`). Toda suma se ejecuta con aritmética decimal exacta; no se convierten kg a piezas ni piezas a kg.

`Q(t,p,KG) = t.item.quantityKg ?? 0`

`Q(t,p,PIECE) = t.item.quantityPieces ?? 0`

Solo se incluyen `InventoryTransfer` con `status = CONFIRMED` y vínculo al ciclo `C`.

## Suministro y devolución

`supplied(C,p,u) = Σ Q(t,p,u)` para `t.kind = SUPPLY`.

`returned(C,p,u) = Σ Q(t,p,u)` para `t.kind = RETURN`.

`netSupplied(C,p,u) = supplied(C,p,u) - returned(C,p,u)`.

Los valores son informativos del ciclo; no sustituyen `InventoryBalance`.

## Pendientes e integridad

`pending(C) = count(t.status ∈ {DRAFT, REQUESTED, IN_TRANSIT})`.

Un traspaso confirmado es íntegro si, por cada partida, existe exactamente un movimiento de salida en el origen, exactamente un movimiento de entrada en el destino y ambos coinciden en producto, kg y piezas.

`integrityErrors(C) = count(traspasos vinculados confirmados no íntegros)`.

## Conciliación del cierre diario

El cierre conserva sus fórmulas actuales:

`theoretical(p,u) = opening(p,u) + entries(p,u) - sold(p,u) - otherOutputs(p,u)`

`difference(p,u) = physical(p,u) - theoretical(p,u)`

`surplus(p,u) = max(difference(p,u), 0)`

`shortage(p,u) = max(-difference(p,u), 0)`

Una devolución CEDIS contribuye a `otherOutputs` mediante su único `TRANSFER_OUT` en la sucursal. `returned(C,p,u)` no se resta nuevamente.

## Elegibilidad y finalización

`completionEligible(C) = confirmedSupplyCount(C) > 0 AND pending(C) = 0 AND integrityErrors(C) = 0 AND dailyClose.status = REVIEWED AND dailyClose.validatedSourceVersion = dailyClose.version`

Solo si `completionEligible(C)` es verdadero se permite la transición atómica del cierre a `CLOSED` y del ciclo a `CLOSED`.

## Límites

- El ciclo no calcula efectivo, ventas, costo, utilidad, conteo físico ni diferencias monetarias.
- Las cantidades de `InventoryTransferItem` son la fuente para el resumen del ciclo.
- Los movimientos y el balance de inventario son la fuente para la existencia y conciliación del cierre.

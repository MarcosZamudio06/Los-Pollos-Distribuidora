# Fórmulas de conciliación: CEDIS-sucursal

Sea `C` un ciclo, `p` un producto y `u` `KG` o `PIECE`. No se convierten dimensiones.

```text
Q(t,p,KG)    = suma quantityKg de partidas de t para p
Q(t,p,PIECE) = suma quantityPieces de partidas de t para p

supplied(C,p,u) = Σ Q(t,p,u), t.role=SUPPLY y t.status=CONFIRMED
returned(C,p,u) = Σ Q(t,p,u), t.role=RETURN y t.status=CONFIRMED
netSupplied(C,p,u) = supplied(C,p,u) - returned(C,p,u)

pending(C) = count(status en DRAFT, REQUESTED, IN_TRANSIT)
```

`CANCELLED` permanece visible y aporta cero. Los totales son informativos y no sustituyen balances.

## Integridad

Para cada transferencia confirmada y producto, la suma de sus partidas debe coincidir en KG y PIECE con:

- `TRANSFER_OUT` en origen.
- `TRANSFER_IN` en destino.
- Igualdad entre salida y entrada.

La comparación se agrega por transferencia/producto porque `InventoryMovement` no referencia `InventoryTransferItem`. Cualquier ausencia, duplicidad efectiva o diferencia incrementa `integrityErrors(C)`.

## Elegibilidad

```text
reviewEligible(C) =
  confirmedSupplyCount(C) > 0
  AND pending(C) = 0
  AND integrityErrors(C) = 0

completionEligible(C) =
  reviewEligible(C)
  AND C.status = READY_FOR_REVIEW
  AND dailyClose.status = REVIEWED
  AND ambas versiones validadas siguen vigentes
```

Una devolución confirmada ya participa como `TRANSFER_OUT` de sucursal en `otherOutputs`; `returned(C,p,u)` no se resta otra vez.

## Límites

- Refresh físico calcula suministros/devoluciones y snapshots relacionados.
- Caja, ventas, conteos, diferencias y utilidad pertenecen al cierre diario.
- Campos monetarios del snapshot solo se completan desde fuentes y fórmulas aprobadas; cero no significa “calculado” si la fuente aún no fue integrada.

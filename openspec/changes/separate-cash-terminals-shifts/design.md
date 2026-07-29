# Cash terminal and shift architecture

## Domain Model

```text
OperationalLocation
└── CashTerminal (managed device identity)
    └── CashShift (cashier session)
        ├── Sale
        ├── Payment
        └── CashMovement

PointOfSaleDailyClose (location + business date)
└── CashShift[]
```

## Decisions

| Concern | Decision |
| --- | --- |
| Terminal identity | `CashTerminal.deviceId` is globally unique and administratively registered. Labels are not security identities. |
| Concurrent operation | One open shift per terminal; multiple terminals may have open shifts concurrently. |
| Cashier ownership | The authenticated user must equal `CashShift.cashierUserId` when registering a sale. |
| Sale attribution | Backend derives terminal, cashier, business date, registration time, daily close, and device from the validated shift. |
| Daily closing | One branch aggregate per location/date; it cannot close while any child shift is open. |
| Inventory | Inventory remains reconciled at branch daily-close level, while money and sales retain shift attribution. |
| Existing data | Migrations create legacy terminal/shift records and backfill references; historical audit records are never deleted. |

## Request Boundary

Fixed-POS sale creation accepts only `cashShiftId` and `deviceId` as shift proof. It rejects location-only lookup. Snapshot fields such as `cashierUserId` and `businessDate` are server-owned.

## UX Contract

The POS operational bar displays branch, registered terminal, open shift, and cashier separately. Opening cash selects an administered terminal available to the current device. The daily close presents terminal rows with nested shifts and branch totals rather than a single synthetic session.

## Migration Strategy

1. Introduce terminals, shifts, and nullable sale/payment/movement references.
2. Backfill one legacy terminal and shift for each existing combined close.
3. Switch write paths to validated shifts and server-derived sale snapshots.
4. Switch read models and UI to branch consolidation.
5. Remove deprecated combined-session fields only after production data has migrated and consumers no longer read them.

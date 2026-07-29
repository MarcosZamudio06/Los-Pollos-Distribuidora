# Implementation tasks

1. Add failing schema and service tests for managed terminals, concurrent terminal shifts, cashier ownership, and device ownership.
2. Add `CashTerminal` and `CashShift` models, relations, indexes, and a historical backfill migration.
3. Add terminal administration and shift lifecycle API contracts.
4. Change fixed-POS sale creation to require `cashShiftId` and `deviceId`, validate ownership, and persist server-derived audit fields.
5. Associate fixed-location payments and cash movements with `cashShiftId`.
6. Recalculate the branch daily close from all child shifts and block closure while a shift is open.
7. Update terminal provisioning, shift opening, POS operational bar, and daily-close consolidation UI.
8. Run targeted backend/frontend tests, schema contracts, TypeScript builds, and migration validation.

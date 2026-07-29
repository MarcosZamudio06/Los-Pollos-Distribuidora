# Separate cash terminals, shifts, and daily closing

## Outcome

Replace the current combined cash-session/daily-close model with persistent terminals, independent cashier shifts, and one branch daily close that consolidates every shift for the business date.

## Problem

`PointOfSaleDailyClose` currently identifies a location, terminal label, cashier session, and branch close at the same time. A partial unique index allows only one non-cancelled record per location and business date. Sales can resolve the latest open session by location without proving ownership by the authenticated cashier or registered device.

## Scope

- Add managed `CashTerminal` records with unique registered `deviceId` values.
- Add `CashShift` records linked to terminal, cashier, branch daily close, and business date.
- Keep one `PointOfSaleDailyClose` aggregate per location and business date.
- Attribute fixed-POS sales to terminal, shift, cashier, business date, registration timestamp, and device.
- Attribute fixed-location payments and cash movements to a shift.
- Update POS and closing UI to expose branch, terminal, shift, and daily close as distinct concepts.
- Migrate existing daily-close/session data without deleting audit history.

## Out of Scope

- Hardware printer or scale integration.
- Route settlement changes.
- Unattended device enrollment.
- Fiscal document behavior.

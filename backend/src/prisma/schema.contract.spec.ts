import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const schemaPath = resolve(__dirname, '../../prisma/schema.prisma');
const migrationSqlPath = resolve(
  __dirname,
  '../../prisma/migrations/20260623120000_task010_constraints/migration.sql',
);
const userAccessMigrationSqlPath = resolve(
  __dirname,
  '../../prisma/migrations/20260626120000_add_user_access_fields/migration.sql',
);
const geospatialRoutesMigrationSqlPath = resolve(
  __dirname,
  '../../prisma/migrations/20260714120000_add_geospatial_route_planning/migration.sql',
);
const productBarcodeMigrationSqlPath = resolve(
  __dirname,
  '../../prisma/migrations/20260724190000_add_product_barcode/migration.sql',
);
const dailyCloseDifferenceMigrationSqlPath = resolve(
  __dirname,
  '../../prisma/migrations/20260724200000_add_daily_close_differences/migration.sql',
);
const cashSessionMigrationSqlPath = resolve(
  __dirname,
  '../../prisma/migrations/20260725100000_add_cash_session_fields/migration.sql',
);
const cashTerminalShiftMigrationSqlPath = resolve(
  __dirname,
  '../../prisma/migrations/20260727120000_separate_cash_terminals_shifts/migration.sql',
);

const schema = readFileSync(schemaPath, 'utf8');

function getModelBlock(modelName: string): string {
  const match = schema.match(
    new RegExp(`model\\s+${modelName}\\s+\\{([\\s\\S]*?)\\n\\}`, 'm'),
  );

  expect(match).not.toBeNull();
  return match?.[1] ?? '';
}

function getModelNames(): string[] {
  return [...schema.matchAll(/^model\s+(\w+)\s+\{/gm)].map((match) => match[1]);
}

describe('Prisma schema contract', () => {
  it('keeps the required canonical models and excludes prohibited ones', () => {
    const modelNames = getModelNames();
    const requiredModels = [
      'Role',
      'User',
      'AuthSession',
      'OperationalLocation',
      'Product',
      'Category',
      'ProductUnitEquivalent',
      'InventoryBalance',
      'Customer',
      'Supplier',
      'Sale',
      'SaleItem',
      'SaleDocument',
      'Purchase',
      'PurchaseItem',
      'InventoryMovement',
      'InventoryTransfer',
      'InventoryTransferItem',
      'AccountReceivable',
      'Payment',
      'CommercialPolicy',
      'DiscountAuthorization',
      'BillingPolicy',
      'OperationalConfig',
      'DeliveryRoute',
      'DeliveryRoutePlanDraft',
      'DeliveryOrder',
      'DeliveryEvidence',
      'RouteSettlement',
      'CashTerminal',
      'CashShift',
      'PointOfSaleDailyClose',
      'PointOfSaleDailyCloseLine',
      'DailyCloseInventoryCount',
      'DailyCloseDifference',
      'DailyCloseEvent',
      'DailyCloseSnapshot',
      'CashMovement',
      'ScaleTicketReference',
      'BillingRequest',
      'BillingRequestHistory',
      'LegalEntity',
      'LegalEntityOperationalLocation',
      'Invoice',
      'BillingRequestSaleDocument',
      'BillingRequestSaleItem',
      'InvoiceSaleDocument',
      'InvoiceSaleItemApplication',
      'BillingDataRemediation',
      'BillingAuditLog',
    ];

    expect(modelNames).toEqual(expect.arrayContaining(requiredModels));
    expect(modelNames).toHaveLength(50);
    expect(modelNames).not.toContain('PaymentAllocation');
    expect(modelNames).not.toContain('CFDI');
    expect(modelNames).not.toContain('SAT');
    expect(getModelBlock('Product')).not.toMatch(/\bstock\b/);
  });

  it('persists route planning coordinates and PostGIS search geometries', () => {
    const operationalLocation = getModelBlock('OperationalLocation');
    const route = getModelBlock('DeliveryRoute');
    const order = getModelBlock('DeliveryOrder');
    const plan = getModelBlock('DeliveryRoutePlanDraft');
    const migrationSql = readFileSync(geospatialRoutesMigrationSqlPath, 'utf8');

    expect(operationalLocation).toMatch(/latitude\s+Decimal\?/);
    expect(operationalLocation).toMatch(/longitude\s+Decimal\?/);
    expect(route).toMatch(/optimizationStatus\s+RouteOptimizationStatus/);
    expect(route).toMatch(/geometry\s+Json\?/);
    expect(route).toMatch(/distanceMeters\s+Int\?/);
    expect(route).toMatch(/durationSeconds\s+Int\?/);
    expect(order).toMatch(/stopSequence\s+Int\?/);
    expect(order).toMatch(/latitude\s+Decimal\?/);
    expect(order).toMatch(/longitude\s+Decimal\?/);
    expect(order).toMatch(/legDistanceMeters\s+Int\?/);
    expect(order).toMatch(/legDurationSeconds\s+Int\?/);
    expect(plan).toMatch(/expiresAt\s+DateTime/);
    expect(plan).toMatch(/consumedAt\s+DateTime\?/);
    expect(plan).toMatch(/consumedByRouteId\s+String\?/);
    expect(plan).not.toMatch(/consumedByRouteId\s+String\?\s+@unique/);
    expect(route).toMatch(/consumedPlans\s+DeliveryRoutePlanDraft\[\]/);
    expect(plan).toMatch(/orderedStops\s+Json/);
    expect(plan).toMatch(/geometry\s+Json/);

    expect(migrationSql).toContain('CREATE EXTENSION IF NOT EXISTS postgis');
    expect(migrationSql).toContain('geometry(Point, 4326)');
    expect(migrationSql).toContain('geometry(LineString, 4326)');
    expect(migrationSql).toMatch(/USING GIST \("locationPoint"\)/);
    expect(migrationSql).toMatch(/USING GIST \("routeGeometry"\)/);
    expect(migrationSql).toContain('DeliveryRoutePlanDraft_active_lookup_idx');
  });

  it('enforces one non-cancelled daily close per location and business date', () => {
    const dailyClose = getModelBlock('PointOfSaleDailyClose');
    const migrationSql = readFileSync(migrationSqlPath, 'utf8');

    expect(dailyClose).toMatch(/businessDate\s+DateTime\s+@db\.Date/);
    expect(migrationSql).toMatch(
      /CREATE UNIQUE INDEX[\s\S]*WHERE\s+"status"\s*<>\s*'CANCELLED'/i,
    );
  });

  it('persists an explicit cash session on the daily close', () => {
    const dailyClose = getModelBlock('PointOfSaleDailyClose');
    const cashMovement = getModelBlock('CashMovement');
    const migrationSql = readFileSync(cashSessionMigrationSqlPath, 'utf8');

    expect(schema).toContain('enum CashSessionStatus');
    expect(dailyClose).toMatch(/cashSessionStatus\s+CashSessionStatus/);
    expect(dailyClose).toMatch(/terminalIdentifier\s+String/);
    expect(dailyClose).toMatch(/openedAt\s+DateTime/);
    expect(dailyClose).toMatch(/initialCashFund\s+Decimal/);
    expect(dailyClose).toMatch(/initialCashIn\s+Decimal/);
    expect(dailyClose).toMatch(/initialCashOut\s+Decimal/);
    expect(cashMovement).toMatch(/isOpening\s+Boolean/);
    expect(migrationSql).toContain('CREATE TYPE "CashSessionStatus" AS ENUM');
    expect(migrationSql).toContain('ADD COLUMN "terminalIdentifier" TEXT');
    expect(migrationSql).toContain('ADD COLUMN "isOpening" BOOLEAN');
  });

  it('separates managed cash terminals, cashier shifts, and branch daily closing', () => {
    const terminal = getModelBlock('CashTerminal');
    const shift = getModelBlock('CashShift');
    const sale = getModelBlock('Sale');
    const payment = getModelBlock('Payment');
    const cashMovement = getModelBlock('CashMovement');
    const dailyClose = getModelBlock('PointOfSaleDailyClose');
    const migrationSql = readFileSync(cashTerminalShiftMigrationSqlPath, 'utf8');

    expect(terminal).toMatch(/deviceId\s+String\s+@unique/);
    expect(terminal).toContain('@@unique([operationalLocationId, code])');
    expect(shift).toMatch(/cashierUserId\s+String/);
    expect(shift).toMatch(/businessDate\s+DateTime\s+@db\.Date/);
    expect(shift).toMatch(/pointOfSaleDailyCloseId\s+String/);
    expect(sale).toMatch(/terminalId\s+String\?/);
    expect(sale).toMatch(/cashShiftId\s+String\?/);
    expect(sale).toMatch(/cashierUserId\s+String\?/);
    expect(sale).toMatch(/businessDate\s+DateTime\?\s+@db\.Date/);
    expect(sale).toMatch(/registeredAt\s+DateTime\?/);
    expect(sale).toMatch(/deviceId\s+String\?/);
    expect(payment).toMatch(/cashShiftId\s+String\?/);
    expect(cashMovement).toMatch(/cashShiftId\s+String\?/);
    expect(dailyClose).toMatch(/cashShifts\s+CashShift\[\]/);
    expect(migrationSql).toContain('CREATE TABLE "CashTerminal"');
    expect(migrationSql).toContain('CREATE TABLE "CashShift"');
    expect(migrationSql).toContain('cash_shift_one_open_per_terminal_uq');
    expect(migrationSql).toContain('legacy-terminal-');
    expect(migrationSql).toContain('legacy-shift-');
  });

  it('keeps scale ticket folio unique per location and date', () => {
    const scaleTicket = getModelBlock('ScaleTicketReference');

    expect(scaleTicket).toContain('capturedDate');
    expect(scaleTicket).toContain('@db.Date');
    expect(scaleTicket).toContain(
      '@@unique([operationalLocationId, capturedDate, physicalFolio])',
    );
  });

  it('persists structured daily-close differences with justification and authorization actors', () => {
    const difference = getModelBlock('DailyCloseDifference');
    const migrationSql = readFileSync(dailyCloseDifferenceMigrationSqlPath, 'utf8');

    expect(difference).toMatch(/expectedValue\s+Decimal/);
    expect(difference).toMatch(/recordedValue\s+Decimal\?/);
    expect(difference).toMatch(/differenceValue\s+Decimal/);
    expect(difference).toMatch(/differenceType\s+DailyCloseDifferenceType/);
    expect(difference).toMatch(/reason\s+String\?/);
    expect(difference).toMatch(/evidence\s+String\?/);
    expect(difference).toMatch(/justifiedByUserId\s+String\?/);
    expect(difference).toMatch(/authorizedByUserId\s+String\?/);
    expect(difference).toContain('@@unique([pointOfSaleDailyCloseId, scope, referenceKey])');
    expect(migrationSql).toContain('CREATE TABLE "DailyCloseDifference"');
    expect(migrationSql).toContain('DailyCloseDifference_pointOfSaleDailyCloseId_scope_referenceKey_key');
  });

  it('keeps the product barcode field synchronized with its database migration', () => {
    const product = getModelBlock('Product');
    const migrationSql = readFileSync(productBarcodeMigrationSqlPath, 'utf8');

    expect(product).toMatch(/barcode\s+String\?\s+@unique/);
    expect(migrationSql).toContain(
      'ALTER TABLE "Product" ADD COLUMN "barcode" TEXT',
    );
    expect(migrationSql).toContain(
      'CREATE UNIQUE INDEX "Product_barcode_key" ON "Product"("barcode")',
    );
  });

  it('keeps scale ticket provenance and sale-document reconciliation fields', () => {
    const scaleTicket = getModelBlock('ScaleTicketReference');

    expect(scaleTicket).toMatch(/saleDocumentId\s+String\?/);
    expect(scaleTicket).toMatch(/grossWeightKg\s+Decimal\?/);
    expect(scaleTicket).toMatch(/tareWeightKg\s+Decimal\?/);
    expect(scaleTicket).toMatch(/netWeightKg\s+Decimal\?/);
    expect(scaleTicket).toMatch(/scaleDeviceId\s+String\?/);
    expect(scaleTicket).toMatch(/captureSource\s+ScaleTicketCaptureSource\s+@default\(MANUAL\)/);
  });

  it('persists user access status fields with safe defaults and nullable deactivation audit', () => {
    const user = getModelBlock('User');
    const migrationSql = readFileSync(userAccessMigrationSqlPath, 'utf8');

    expect(user).toMatch(/mustChangePassword\s+Boolean\s+@default\(false\)/);
    expect(user).toMatch(/deactivatedAt\s+DateTime\?/);
    expect(user).toMatch(/deactivatedByUserId\s+String\?/);
    expect(user).toMatch(/deactivationReason\s+String\?/);
    expect(user).toMatch(
      /deactivatedBy\s+User\?\s+@relation\("UserDeactivatedBy", fields: \[deactivatedByUserId\], references: \[id\]\)/,
    );
    expect(user).toMatch(
      /deactivatedUsers\s+User\[\]\s+@relation\("UserDeactivatedBy"\)/,
    );
    expect(user).toContain('@@index([deactivatedByUserId])');
    expect(migrationSql).toContain(
      'ADD COLUMN     "mustChangePassword" BOOLEAN NOT NULL DEFAULT false',
    );
    expect(migrationSql).toContain(
      'ADD COLUMN     "deactivatedAt" TIMESTAMP(3)',
    );
    expect(migrationSql).toContain('ADD COLUMN     "deactivatedByUserId" TEXT');
    expect(migrationSql).toContain('ADD COLUMN     "deactivationReason" TEXT');
  });

  it('binds closing associations to the same location', () => {
    const migrationSql = readFileSync(migrationSqlPath, 'utf8');
    const guardedTables = [
      'Sale',
      'Payment',
      'InventoryMovement',
      'SaleDocument',
      'CashMovement',
      'ScaleTicketReference',
      'PointOfSaleDailyCloseLine',
    ];

    expect(migrationSql).toContain('validate_sale_daily_close_location_match');
    expect(migrationSql).toContain(
      'validate_payment_daily_close_location_match',
    );
    expect(migrationSql).toContain(
      'validate_inventory_movement_daily_close_location_match',
    );
    expect(migrationSql).toContain(
      'validate_sale_document_daily_close_location_match',
    );
    expect(migrationSql).toContain(
      'validate_cash_movement_daily_close_location_match',
    );
    expect(migrationSql).toContain(
      'validate_scale_ticket_reference_daily_close_location_match',
    );
    expect(migrationSql).toContain(
      'validate_point_of_sale_daily_close_line_location_match',
    );

    guardedTables.forEach((tableName) => {
      expect(migrationSql).toMatch(
        new RegExp(`CREATE TRIGGER[\\s\\S]*${tableName}`, 'i'),
      );
    });
  });
});

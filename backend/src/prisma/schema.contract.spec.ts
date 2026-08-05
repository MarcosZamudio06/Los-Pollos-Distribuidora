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
const cashTerminalCutoverMigrationSqlPath = resolve(
  __dirname,
  '../../prisma/migrations/20260729220000_add_cash_terminal_cutover/migration.sql',
);
const branchSupplyCycleMigrationSqlPath = resolve(
  __dirname,
  '../../prisma/migrations/20260804120000_add_branch_supply_cycle/migration.sql',
);
const cedisHierarchyMigrationSqlPath = resolve(
  __dirname,
  '../../prisma/migrations/20260804130000_enforce_cedis_hierarchy/migration.sql',
);
const cedisCycleHierarchyMigrationSqlPath = resolve(
  __dirname,
  '../../prisma/migrations/20260804140000_enforce_cedis_cycle_branch_type/migration.sql',
);
const cedisCycleAlignmentMigrationSqlPath = resolve(
  __dirname,
  '../../prisma/migrations/20260804150000_align_branch_supply_cycle_commands/migration.sql',
);
const inventoryTransferEquivalenceMigrationSqlPath = resolve(
  __dirname,
  '../../prisma/migrations/20260804151000_add_inventory_transfer_equivalence/migration.sql',
);
const inventoryBalanceIntegrityMigrationSqlPath = resolve(
  __dirname,
  '../../prisma/migrations/20260805110000_harden_inventory_balance_integrity/migration.sql',
);
const cedisPermissionSyncMigrationSqlPath = resolve(
  __dirname,
  '../../prisma/migrations/20260805120000_sync_cedis_permissions/migration.sql',
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

function getEnumBlock(enumName: string): string {
  const match = schema.match(
    new RegExp(`enum\\s+${enumName}\\s+\\{([\\s\\S]*?)\\n\\}`, 'm'),
  );

  expect(match).not.toBeNull();
  return match?.[1] ?? '';
}

describe('Prisma schema contract', () => {
  it('keeps the required canonical models and excludes prohibited ones', () => {
    const modelNames = getModelNames();
    const requiredModels = [
      'Role',
      'Permission',
      'RolePermission',
      'User',
      'AuthSession',
      'AccessControlAuditLog',
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
      'CashTerminalActivation',
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
      'BranchSupplyCycle',
      'BranchSupplyCycleTransfer',
      'BranchSupplyCycleItem',
      'BranchSupplyCycleProductSnapshot',
      'BranchSupplyCycleSnapshot',
      'BranchSupplyCycleEvent',
    ];

    expect(modelNames).toEqual(expect.arrayContaining(requiredModels));
    expect(modelNames).toHaveLength(60);
    expect(modelNames).not.toContain('PaymentAllocation');
    expect(modelNames).not.toContain('CFDI');
    expect(modelNames).not.toContain('SAT');
    expect(getModelBlock('Product')).not.toMatch(/\bstock\b/);
    expect(getModelBlock('Role')).toMatch(/version\s+Int\s+@default\(1\)/);
    expect(getModelBlock('AccessControlAuditLog')).toMatch(/reason\s+String/);
  });

  it('defines the branch supply cycle enums and snapshot models', () => {
    const cycle = getModelBlock('BranchSupplyCycle');
    const transfer = getModelBlock('BranchSupplyCycleTransfer');
    const item = getModelBlock('BranchSupplyCycleItem');
    const productSnapshot = getModelBlock('BranchSupplyCycleProductSnapshot');
    const cycleSnapshot = getModelBlock('BranchSupplyCycleSnapshot');
    const event = getModelBlock('BranchSupplyCycleEvent');
    const operationalLocationType = getEnumBlock('OperationalLocationType');
    const cycleStatus = getEnumBlock('BranchSupplyCycleStatus');
    const transferRole = getEnumBlock('BranchSupplyTransferRole');
    const eventType = getEnumBlock('BranchSupplyCycleEventType');
    const migrationSql = readFileSync(
      branchSupplyCycleMigrationSqlPath,
      'utf8',
    );

    expect(operationalLocationType).toMatch(/DISTRIBUTION_CENTER/);
    expect(cycleStatus).toMatch(/OPEN/);
    expect(cycleStatus).toMatch(/READY_FOR_REVIEW/);
    expect(cycleStatus).toMatch(/CLOSED/);
    expect(cycleStatus).toMatch(/CANCELLED/);
    expect(transferRole).toMatch(/SUPPLY/);
    expect(transferRole).toMatch(/RETURN/);
    expect(eventType).toMatch(/REOPENED/);

    expect(cycle).toMatch(
      /distributionCenterLocationId\s+String[\s\S]*branchLocationId\s+String[\s\S]*businessDate\s+DateTime\s+@db\.Date/,
    );
    expect(cycle).toMatch(/pointOfSaleDailyCloseId\s+String\?/);
    expect(cycle).toMatch(
      /status\s+BranchSupplyCycleStatus\s+@default\(OPEN\)/,
    );
    expect(cycle).toMatch(/version\s+Int\s+@default\(1\)/);
    expect(cycle).toMatch(
      /totalDeliveredKg\s+Decimal\s+@default\(0\)\s+@db\.Decimal\(14, 3\)/,
    );
    expect(cycle).toMatch(
      /expectedSalesTotal\s+Decimal\s+@default\(0\)\s+@db\.Decimal\(14, 2\)/,
    );
    expect(cycle).toMatch(
      /actualProfitTotal\s+Decimal\s+@default\(0\)\s+@db\.Decimal\(14, 2\)/,
    );

    expect(transfer).toMatch(/inventoryTransferId\s+String\s+@unique/);
    expect(transfer).toMatch(/role\s+BranchSupplyTransferRole/);
    expect(item).toMatch(/productNameSnapshot\s+String/);
    expect(item).toMatch(/productSkuSnapshot\s+String\?/);
    expect(item).toMatch(/productUnitSnapshot\s+ProductUnit/);
    expect(item).toMatch(/appliedEquivalentFactorSnapshot\s+Decimal\?/);
    expect(item).toMatch(
      /deliveredPieces\s+Decimal\s+@default\(0\)\s+@db\.Decimal\(14, 3\)/,
    );
    expect(item).toMatch(
      /actualSalesAmount\s+Decimal\s+@default\(0\)\s+@db\.Decimal\(14, 2\)/,
    );
    expect(item).toMatch(
      /actualProfitAmount\s+Decimal\s+@default\(0\)\s+@db\.Decimal\(14, 2\)/,
    );
    expect(productSnapshot).toMatch(/unitPriceSnapshot\s+Decimal/);
    expect(productSnapshot).toMatch(/unitCostSnapshot\s+Decimal/);
    expect(cycleSnapshot).toMatch(/payloadHash\s+String/);
    expect(cycleSnapshot).toMatch(
      /snapshotType\s+BranchSupplyCycleSnapshotType/,
    );
    expect(event).toMatch(/cycleVersion\s+Int/);
    expect(event).toMatch(/payload\s+Json/);
    expect(event).toMatch(/idempotencyKey\s+String\?/);

    expect(migrationSql).toContain(
      'ALTER TYPE "OperationalLocationType" ADD VALUE \'DISTRIBUTION_CENTER\'',
    );
    expect(migrationSql).toContain(
      'CREATE TYPE "BranchSupplyCycleStatus" AS ENUM',
    );
    expect(migrationSql).toContain(
      'CREATE TYPE "BranchSupplyTransferRole" AS ENUM',
    );
    expect(migrationSql).toContain(
      'CREATE TYPE "BranchSupplyCycleEventType" AS ENUM',
    );
    expect(migrationSql).toContain('CREATE TABLE "BranchSupplyCycle"');
    expect(migrationSql).toContain('CREATE TABLE "BranchSupplyCycleTransfer"');
    expect(migrationSql).toContain('CREATE TABLE "BranchSupplyCycleItem"');
    expect(migrationSql).toContain('CREATE TABLE "BranchSupplyCycleEvent"');
  });

  it('enforces branch supply cycle identity, linkage, and append-only contracts', () => {
    const user = getModelBlock('User');
    const location = getModelBlock('OperationalLocation');
    const product = getModelBlock('Product');
    const transfer = getModelBlock('InventoryTransfer');
    const dailyClose = getModelBlock('PointOfSaleDailyClose');
    const migrationSql = readFileSync(
      branchSupplyCycleMigrationSqlPath,
      'utf8',
    );

    expect(user).toMatch(
      /branchSupplyCyclesOpened\s+BranchSupplyCycle\[\]\s+@relation\("BranchSupplyCycleOpenedBy"\)/,
    );
    expect(user).toMatch(
      /branchSupplyCycleEvents\s+BranchSupplyCycleEvent\[\]\s+@relation\("BranchSupplyCycleEventActor"\)/,
    );
    expect(location).toMatch(
      /distributionCenterSupplyCycles\s+BranchSupplyCycle\[\]\s+@relation\("BranchSupplyCycleDistributionCenter"\)/,
    );
    expect(location).toMatch(
      /branchSupplyCycles\s+BranchSupplyCycle\[\]\s+@relation\("BranchSupplyCycleBranch"\)/,
    );
    expect(product).toMatch(
      /branchSupplyCycleItems\s+BranchSupplyCycleItem\[\]/,
    );
    expect(transfer).toMatch(
      /branchSupplyCycleTransfer\s+BranchSupplyCycleTransfer\?/,
    );
    expect(dailyClose).toMatch(
      /branchSupplyCycle\s+BranchSupplyCycle\?\s+@relation\("BranchSupplyCycleDailyClose"\)/,
    );

    expect(migrationSql).toMatch(
      /CREATE UNIQUE INDEX[\s\S]*\("distributionCenterLocationId", "branchLocationId", "businessDate"\)[\s\S]*WHERE "status" <> 'CANCELLED'/i,
    );
    expect(migrationSql).toContain(
      'BranchSupplyCycleTransfer_inventoryTransferId_key',
    );
    expect(migrationSql).toContain('distribution_center_branch_must_differ');
    expect(migrationSql).toContain('validate_branch_supply_cycle_locations');
    expect(migrationSql).toContain(
      'validate_branch_supply_cycle_daily_close_match',
    );
    expect(migrationSql).toContain(
      'validate_branch_supply_cycle_transfer_direction',
    );
    expect(migrationSql).toContain('BranchSupplyCycleItem_append_only');
    expect(migrationSql).toContain('BranchSupplyCycleEvent_append_only');
    expect(migrationSql).toContain(
      'BranchSupplyCycle_branchLocationId_businessDate_status_idx',
    );
  });

  it('enforces cycle uniqueness by branch date and records linked transfer state changes', () => {
    const cycleStatus = getEnumBlock('BranchSupplyCycleEventType');
    const cycle = getModelBlock('BranchSupplyCycle');
    const migrationSql = readFileSync(
      cedisCycleAlignmentMigrationSqlPath,
      'utf8',
    );

    expect(cycleStatus).toMatch(/TRANSFER_STATE_CHANGED/);
    expect(cycle).toMatch(
      /@@index\(\[branchLocationId, businessDate, status\]\)/,
    );
    expect(migrationSql).toContain('BranchSupplyCycle_active_branch_date_uq');
    expect(migrationSql).toContain('TRANSFER_STATE_CHANGED');
  });

  it('persists transfer equivalence metadata without making it required', () => {
    const item = getModelBlock('InventoryTransferItem');
    const migrationSql = readFileSync(
      inventoryTransferEquivalenceMigrationSqlPath,
      'utf8',
    );

    expect(item).toMatch(/unitEquivalentId\s+String\?/);
    expect(item).toMatch(/appliedEquivalentFactor\s+Decimal\?/);
    expect(item).toMatch(/roundingMode\s+String\?/);
    expect(migrationSql).toContain('ADD COLUMN "unitEquivalentId" TEXT');
    expect(migrationSql).toContain(
      'InventoryTransferItem_unitEquivalentId_fkey',
    );
  });

  it('protects inventory balances from negative physical quantities', () => {
    const inventoryBalance = getModelBlock('InventoryBalance');
    const migrationSql = readFileSync(
      inventoryBalanceIntegrityMigrationSqlPath,
      'utf8',
    );

    expect(inventoryBalance).toMatch(/quantityKg\s+Decimal/);
    expect(inventoryBalance).toMatch(/quantityPieces\s+Int/);
    expect(migrationSql).toContain(
      'InventoryBalance_quantityKg_non_negative_check',
    );
    expect(migrationSql).toContain(
      'InventoryBalance_quantityPieces_non_negative_check',
    );
    expect(migrationSql).toContain('"quantityKg" >= 0');
    expect(migrationSql).toContain('"quantityPieces" >= 0');
  });

  it('grants the canonical CEDIS permissions to existing access profiles', () => {
    const migrationSql = readFileSync(
      cedisPermissionSyncMigrationSqlPath,
      'utf8',
    );

    expect(migrationSql).toContain("'cedis.view'");
    expect(migrationSql).toContain("'cedis.manage'");
    expect(migrationSql).toContain("'cedis.dispatch'");
    expect(migrationSql).toContain("'cedis.receive_returns'");
    expect(migrationSql).toContain("'cedis.reconcile'");
    expect(migrationSql).toContain("'cedis.close'");
    expect(migrationSql).toContain("'cedis.view_costs'");
    expect(migrationSql).toMatch(/role\."name" = 'ADMIN'/);
    expect(migrationSql).toMatch(/role\."name" = 'WAREHOUSE'/);
    expect(migrationSql).toMatch(/role\."name" = 'SELLER'/);
    expect(migrationSql).toContain('ON CONFLICT DO NOTHING');
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

  it('enforces CEDIS hierarchy and parent-cycle prevention in the database', () => {
    const location = getModelBlock('OperationalLocation');
    const migrationSql = readFileSync(cedisHierarchyMigrationSqlPath, 'utf8');

    expect(location).toMatch(/parent\s+OperationalLocation\?/);
    expect(location).toMatch(/children\s+OperationalLocation\[\]/);
    expect(location).toMatch(/@@index\(\[parentId, type, isActive\]\)/);
    expect(migrationSql).toContain('validate_operational_location_hierarchy');
    expect(migrationSql).toContain(
      'DISTRIBUTION_CENTER locations cannot have a parent',
    );
    expect(migrationSql).toContain(
      'BRANCH locations must have a DISTRIBUTION_CENTER parent',
    );
    expect(migrationSql).toContain(
      'Cannot deactivate or change the type of a location with child locations',
    );
    expect(migrationSql).toContain(
      'BEFORE INSERT OR UPDATE OF "type", "parentId", "isActive"',
    );
    expect(migrationSql).toContain(
      'Cannot change a branch hierarchy with an open CEDIS supply cycle',
    );
    expect(migrationSql).toContain(
      'OperationalLocation hierarchy preflight found % parent cycles',
    );
    expect(migrationSql).toContain(
      'OperationalLocation_parentId_type_isActive_idx',
    );
    expect(readFileSync(geospatialRoutesMigrationSqlPath, 'utf8')).toContain(
      'OperationalLocation_coordinates_pair_check',
    );
  });

  it('keeps branch supply cycles tied to direct active CEDIS branches', () => {
    const migrationSql = readFileSync(
      cedisCycleHierarchyMigrationSqlPath,
      'utf8',
    );

    expect(migrationSql).toContain('BranchSupplyCycle preflight');
    expect(migrationSql).toContain(
      'branch."parentId" IS DISTINCT FROM cycle."distributionCenterLocationId"',
    );
    expect(migrationSql).toContain('branch_parent_id IS DISTINCT FROM');
    expect(migrationSql).toContain(
      'must be an active BRANCH directly assigned to CEDIS',
    );
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
    const migrationSql = readFileSync(
      cashTerminalShiftMigrationSqlPath,
      'utf8',
    );

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

  it('persists hashed, expiring terminal activation codes for supervised cutover', () => {
    const activation = getModelBlock('CashTerminalActivation');
    const migrationSql = readFileSync(
      cashTerminalCutoverMigrationSqlPath,
      'utf8',
    );

    expect(activation).toMatch(/codeHash\s+String\s+@unique/);
    expect(activation).toMatch(/expiresAt\s+DateTime/);
    expect(activation).toMatch(/consumedAt\s+DateTime\?/);
    expect(activation).toMatch(/cashTerminalId\s+String\?/);
    expect(migrationSql).toContain('CREATE TABLE "CashTerminalActivation"');
    expect(migrationSql).not.toContain('activationCode');
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
    const migrationSql = readFileSync(
      dailyCloseDifferenceMigrationSqlPath,
      'utf8',
    );

    expect(difference).toMatch(/expectedValue\s+Decimal/);
    expect(difference).toMatch(/recordedValue\s+Decimal\?/);
    expect(difference).toMatch(/differenceValue\s+Decimal/);
    expect(difference).toMatch(/differenceType\s+DailyCloseDifferenceType/);
    expect(difference).toMatch(/reason\s+String\?/);
    expect(difference).toMatch(/evidence\s+String\?/);
    expect(difference).toMatch(/justifiedByUserId\s+String\?/);
    expect(difference).toMatch(/authorizedByUserId\s+String\?/);
    expect(difference).toContain(
      '@@unique([pointOfSaleDailyCloseId, scope, referenceKey])',
    );
    expect(migrationSql).toContain('CREATE TABLE "DailyCloseDifference"');
    expect(migrationSql).toContain(
      'DailyCloseDifference_pointOfSaleDailyCloseId_scope_referenceKey_key',
    );
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
    expect(scaleTicket).toMatch(
      /captureSource\s+ScaleTicketCaptureSource\s+@default\(MANUAL\)/,
    );
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

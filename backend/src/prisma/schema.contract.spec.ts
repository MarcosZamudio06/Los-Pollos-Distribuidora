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
const productFiscalProfileMigrationSqlPath = resolve(
  __dirname,
  '../../prisma/migrations/20260822100000_add_product_fiscal_profile/migration.sql',
);
const legalEntityFiscalConfigurationMigrationSqlPath = resolve(
  __dirname,
  '../../prisma/migrations/20260822110000_add_legal_entity_fiscal_configuration/migration.sql',
);
const cfdiProviderManagePermissionMigrationSqlPath = resolve(
  __dirname,
  '../../prisma/migrations/20260822111000_add_cfdi_provider_manage_permission/migration.sql',
);
const cfdiFiscalDataModelMigrationSqlPath = resolve(
  __dirname,
  '../../prisma/migrations/20260822120000_add_cfdi_fiscal_data_model/migration.sql',
);
const invoiceFiscalUseCodeWideningMigrationSqlPath = resolve(
  __dirname,
  '../../prisma/migrations/20260901210000_widen_invoice_fiscal_use_code/migration.sql',
);
const invoiceNativeSnapshotPaymentFieldsMigrationSqlPath = resolve(
  __dirname,
  '../../prisma/migrations/20260901220000_scope_invoice_native_payment_fields/migration.sql',
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
const branchSupplyReceiptMigrationSqlPath = resolve(
  __dirname,
  '../../prisma/migrations/20260805165000_add_branch_supply_receipts/migration.sql',
);
const cedisReceiptPermissionMigrationSqlPath = resolve(
  __dirname,
  '../../prisma/migrations/20260805170000_add_cedis_receive_supplies_permission/migration.sql',
);
const cedisRequestReturnsPermissionMigrationSqlPath = resolve(
  __dirname,
  '../../prisma/migrations/20260812130000_add_cedis_request_returns_permission/migration.sql',
);
const userCedisAssignmentMigrationSqlPath = resolve(
  __dirname,
  '../../prisma/migrations/20260810100000_add_user_cedis_assignment/migration.sql',
);
const vehicleMigrationSqlPath = resolve(
  __dirname,
  '../../prisma/migrations/20260812120000_add_vehicle_to_delivery_routes/migration.sql',
);
const vehiclePositionsMigrationSqlPath = resolve(
  __dirname,
  '../../prisma/migrations/20260812130000_add_vehicle_positions/migration.sql',
);
const vehiclePositionRetentionMigrationSqlPath = resolve(
  __dirname,
  '../../prisma/migrations/20260815140000_add_vehicle_position_retention_index/migration.sql',
);
const deliveryZonesMigrationSqlPath = resolve(
  __dirname,
  '../../prisma/migrations/20260812140000_add_delivery_zones_geofences/migration.sql',
);
const deliveryIncidentsMigrationSqlPath = resolve(
  __dirname,
  '../../prisma/migrations/20260812150000_add_delivery_incidents/migration.sql',
);
const fleetHeatmapIndexesMigrationSqlPath = resolve(
  __dirname,
  '../../prisma/migrations/20260812160000_add_fleet_heatmap_indexes/migration.sql',
);
const deliveryEvidenceIntegrityMigrationSqlPath = resolve(
  __dirname,
  '../../prisma/migrations/20260815100000_harden_delivery_evidence/migration.sql',
);
const deliveryEvidenceObjectStorageMigrationSqlPath = resolve(
  __dirname,
  '../../prisma/migrations/20260815110000_move_delivery_evidence_to_object_storage/migration.sql',
);
const deliveryRouteLogisticsMigrationSqlPath = resolve(
  __dirname,
  '../../prisma/migrations/20260815120000_add_delivery_route_logistics_identity/migration.sql',
);
const logisticsRouteStopMigrationSqlPath = resolve(
  __dirname,
  '../../prisma/migrations/20260815130000_add_logistics_route_stop_confirmation/migration.sql',
);
const routeSettlementOpeningCommandMigrationSqlPath = resolve(
  __dirname,
  '../../prisma/migrations/20260820210000_add_route_settlement_opening_commands/migration.sql',
);
const satCatalogVersioningMigrationSqlPath = resolve(
  __dirname,
  '../../prisma/migrations/20260823140000_add_sat_catalog_versioning/migration.sql',
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
      'PaymentReceipt',
      'PaymentReceiptDetail',
      'PaymentInvoiceApplication',
      'CommercialPolicy',
      'DiscountAuthorization',
      'BillingPolicy',
      'OperationalConfig',
      'Vehicle',
      'VehiclePosition',
      'DeliveryZone',
      'GeofenceEvent',
      'VehicleGeofenceState',
      'DeliveryIncident',
      'DeliveryRoute',
      'DeliveryRoutePlanDraft',
      'DeliveryOrder',
      'DeliveryEvidence',
      'RouteSettlement',
      'RouteSettlementOpeningCommand',
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
      'InvoiceConcept',
      'CreditAdjustment',
      'CreditAdjustmentInvoice',
      'CreditAdjustmentLine',
      'FiscalArtifact',
      'FiscalOperationAttempt',
      'FiscalFolioSequence',
      'FiscalCertificate',
      'SatCatalog',
      'SatCatalogVersion',
      'SatCatalogEntry',
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
      'BranchSupplyReceipt',
      'BranchSupplyReceiptItem',
    ];

    expect(modelNames).toEqual(expect.arrayContaining(requiredModels));
    expect(modelNames).toHaveLength(83);
    expect(modelNames).not.toContain('PaymentAllocation');
    expect(modelNames).not.toContain('CFDI');
    expect(getModelBlock('Product')).not.toMatch(/\bstock\b/);
    expect(getModelBlock('Role')).toMatch(/version\s+Int\s+@default\(1\)/);
    expect(getModelBlock('AccessControlAuditLog')).toMatch(/reason\s+String/);
  });

  it('persists route settlement opening idempotency commands with immutable replay context', () => {
    const command = getModelBlock('RouteSettlementOpeningCommand');
    const migrationSql = readFileSync(
      routeSettlementOpeningCommandMigrationSqlPath,
      'utf8',
    );

    expect(command).toMatch(/idempotencyKey\s+String\s+@unique/);
    expect(command).toMatch(/payloadHash\s+String/);
    expect(command).toMatch(/routeId\s+String/);
    expect(command).toMatch(/settlementId\s+String/);
    expect(command).toMatch(/createdByUserId\s+String/);
    expect(command).toMatch(/responseSnapshot\s+Json/);
    expect(migrationSql).toContain(
      'CREATE UNIQUE INDEX "RouteSettlementOpeningCommand_idempotencyKey_key"',
    );
    expect(migrationSql).toContain(
      'FOREIGN KEY ("settlementId") REFERENCES "RouteSettlement"("id")',
    );
  });

  it('associates fleet units without requiring a vehicle on historical routes', () => {
    const vehicle = getModelBlock('Vehicle');
    const route = getModelBlock('DeliveryRoute');
    const plan = getModelBlock('DeliveryRoutePlanDraft');
    const migrationSql = readFileSync(vehicleMigrationSqlPath, 'utf8');

    expect(vehicle).toMatch(/code\s+String\s+@unique/);
    expect(vehicle).toMatch(/plateNumber\s+String\?\s+@unique/);
    expect(vehicle).toMatch(/homeLocationId\s+String\?/);
    expect(vehicle).toMatch(/isActive\s+Boolean\s+@default\(true\)/);
    expect(route).toMatch(/vehicleId\s+String\?/);
    expect(plan).toMatch(/vehicleId\s+String/);
    expect(migrationSql).toMatch(/CREATE TABLE "Vehicle"/);
    expect(migrationSql).toMatch(
      /CREATE UNIQUE INDEX "DeliveryRoute_vehicleId_in_progress_key"/,
    );
    expect(migrationSql).toMatch(
      /ALTER TABLE "DeliveryRoute"\s+\n?\s*ADD COLUMN "vehicleId" TEXT/,
    );
  });

  it('distinguishes commercial and logistics routes with an explicit transfer link', () => {
    const route = getModelBlock('DeliveryRoute');
    const transfer = getModelBlock('InventoryTransfer');
    const routeType = getEnumBlock('DeliveryRouteType');
    const migrationSql = readFileSync(
      deliveryRouteLogisticsMigrationSqlPath,
      'utf8',
    );
    const stopMigrationSql = readFileSync(
      logisticsRouteStopMigrationSqlPath,
      'utf8',
    );

    expect(routeType).toMatch(/SALE_DELIVERY/);
    expect(routeType).toMatch(/BRANCH_RETURN/);
    expect(routeType).toMatch(/CEDIS_SUPPLY/);
    expect(route).toMatch(
      /type\s+DeliveryRouteType\s+@default\(SALE_DELIVERY\)/,
    );
    expect(route).toMatch(/driverId\s+String/);
    expect(route).toMatch(/vehicleId\s+String\?/);
    expect(route).toMatch(/inventoryTransferId\s+String\?\s+@unique/);
    expect(route).toMatch(/inventoryTransfer\s+InventoryTransfer\?/);
    expect(route).toMatch(/logisticsStopCompletedAt\s+DateTime\?/);
    expect(route).toMatch(/logisticsStopCompletedByUserId\s+String\?/);
    expect(route).toMatch(/logisticsStopNotes\s+String\?/);
    expect(transfer).toMatch(/deliveryRoute\s+DeliveryRoute\?/);
    expect(migrationSql).toContain('CREATE TYPE "DeliveryRouteType" AS ENUM');
    expect(migrationSql).toContain(
      'ADD COLUMN "type" "DeliveryRouteType" NOT NULL DEFAULT \'SALE_DELIVERY\'',
    );
    expect(migrationSql).toContain('ADD COLUMN "inventoryTransferId" TEXT');
    expect(migrationSql).toContain('DeliveryRoute_inventoryTransferId_key');
    expect(migrationSql).toContain(
      'DeliveryRoute_logistics_vehicle_required_check',
    );
    expect(migrationSql).toContain(
      'DeliveryRoute_logistics_transfer_required_check',
    );
    expect(stopMigrationSql).toContain(
      'ADD COLUMN "logisticsStopCompletedAt" TIMESTAMP(3)',
    );
    expect(stopMigrationSql).toContain(
      'DeliveryRoute_logisticsStopCompletedByUserId_fkey',
    );
    expect(migrationSql).not.toContain('ALTER COLUMN "vehicleId" SET NOT NULL');
  });

  it('keeps persisted heatmap sources indexed for bounded analytics queries', () => {
    const deliveryOrder = getModelBlock('DeliveryOrder');
    const deliveryIncident = getModelBlock('DeliveryIncident');
    const migrationSql = readFileSync(
      fleetHeatmapIndexesMigrationSqlPath,
      'utf8',
    );

    expect(deliveryOrder).toMatch(
      /@@index\(\[status, deliveredAt, routeId\]\)/,
    );
    expect(deliveryIncident).toMatch(
      /@@index\(\[occurredAt, routeId, vehicleId\]\)/,
    );
    expect(migrationSql).toMatch(
      /CREATE INDEX "DeliveryOrder_status_deliveredAt_routeId_idx"/,
    );
    expect(migrationSql).toMatch(
      /CREATE INDEX "DeliveryIncident_occurredAt_routeId_vehicleId_idx"/,
    );
  });

  it('persists vehicle positions in PostGIS with route, vehicle, and driver indexes', () => {
    const position = getModelBlock('VehiclePosition');
    const migrationSql = readFileSync(vehiclePositionsMigrationSqlPath, 'utf8');

    expect(position).toMatch(/clientEventId\s+String\s+@unique/);
    expect(position).toMatch(/latitude\s+Decimal\s+@db\.Decimal\(9, 6\)/);
    expect(position).toMatch(/longitude\s+Decimal\s+@db\.Decimal\(9, 6\)/);
    expect(position).toMatch(
      /positionPoint\s+Unsupported\("geometry\(Point, 4326\)"\)/,
    );
    expect(position).toMatch(
      /@@index\(\[vehicleId, recordedAt\(sort: Desc\)\]\)/,
    );
    expect(position).toMatch(/@@index\(\[routeId, recordedAt\]\)/);
    expect(position).toMatch(/@@index\(\[driverId, recordedAt\]\)/);
    expect(position).toMatch(/@@index\(\[recordedAt, id\]\)/);
    expect(migrationSql).toContain('CREATE TABLE "VehiclePosition"');
    expect(migrationSql).toMatch(
      /GENERATED ALWAYS AS[\s\S]*ST_MakePoint\([\s\S]*"longitude"[\s\S]*"latitude"/,
    );
    expect(migrationSql).toContain('USING GIST ("positionPoint")');
    expect(migrationSql).toContain('VehiclePosition_vehicleId_recordedAt_idx');
    expect(migrationSql).toContain('VehiclePosition_routeId_recordedAt_idx');
    expect(migrationSql).toContain('VehiclePosition_driverId_recordedAt_idx');
    expect(migrationSql).not.toMatch(/"positionPoint"\s+JSON/i);

    const retentionMigrationSql = readFileSync(
      vehiclePositionRetentionMigrationSqlPath,
      'utf8',
    );
    expect(retentionMigrationSql).toContain(
      'VehiclePosition_recordedAt_id_idx',
    );
    expect(getModelBlock('DeliveryIncident')).toMatch(
      /@@index\(\[positionId\]\)/,
    );
    expect(retentionMigrationSql).toContain('DeliveryIncident_positionId_idx');
  });

  it('persists delivery zones and geofence transitions with spatial constraints', () => {
    const zone = getModelBlock('DeliveryZone');
    const event = getModelBlock('GeofenceEvent');
    const state = getModelBlock('VehicleGeofenceState');
    const eventType = getEnumBlock('GeofenceEventType');
    const migrationSql = readFileSync(deliveryZonesMigrationSqlPath, 'utf8');

    expect(eventType).toMatch(/ENTER/);
    expect(eventType).toMatch(/EXIT/);
    expect(zone).toMatch(/geometry\s+Json/);
    expect(zone).toMatch(
      /zoneGeometry\s+Unsupported\("geometry\(Polygon, 4326\)"\)/,
    );
    expect(zone).toMatch(/originLocationId\s+String/);
    expect(event).toMatch(/positionId\s+String/);
    expect(event).toMatch(/type\s+GeofenceEventType/);
    expect(event).toMatch(/@@unique\(\[zoneId, positionId, type\]\)/);
    expect(state).toMatch(/@@id\(\[vehicleId, zoneId\]\)/);
    expect(migrationSql).toContain('CREATE TYPE "GeofenceEventType"');
    expect(migrationSql).toContain('geometry(Polygon, 4326) NOT NULL');
    expect(migrationSql).toContain('USING GIST ("zoneGeometry")');
    expect(migrationSql).toContain('GeofenceEvent_zoneId_positionId_type_key');
    expect(migrationSql).toContain('VehicleGeofenceState_pkey');
  });

  it('persists delivery incidents with route/order traceability and optional GPS', () => {
    const incident = getModelBlock('DeliveryIncident');
    const incidentType = getEnumBlock('DeliveryIncidentType');
    const incidentStatus = getEnumBlock('DeliveryIncidentStatus');
    const migrationSql = readFileSync(
      deliveryIncidentsMigrationSqlPath,
      'utf8',
    );

    expect(incidentType).toMatch(/DELIVERY_FAILURE/);
    expect(incidentStatus).toMatch(/OPEN/);
    expect(incident).toMatch(/routeId\s+String\?/);
    expect(incident).toMatch(/deliveryOrderId\s+String\?/);
    expect(incident).toMatch(/reportedByUserId\s+String/);
    expect(incident).toMatch(/statusSnapshot\s+DeliveryOrderStatus/);
    expect(incident).toMatch(/latitude\s+Decimal\?/);
    expect(incident).toMatch(/longitude\s+Decimal\?/);
    expect(incident).toMatch(/returnedItems\s+Json/);
    expect(migrationSql).toContain('CREATE TABLE "DeliveryIncident"');
    expect(migrationSql).toContain('DeliveryIncident_context_check');
    expect(migrationSql).toContain('DeliveryIncident_coordinates_check');
    expect(migrationSql).toContain('DeliveryIncident_routeId_occurredAt_idx');
  });

  it('defines the branch supply cycle enums and snapshot models', () => {
    const cycle = getModelBlock('BranchSupplyCycle');
    const transfer = getModelBlock('BranchSupplyCycleTransfer');
    const item = getModelBlock('BranchSupplyCycleItem');
    const productSnapshot = getModelBlock('BranchSupplyCycleProductSnapshot');
    const cycleSnapshot = getModelBlock('BranchSupplyCycleSnapshot');
    const event = getModelBlock('BranchSupplyCycleEvent');
    const receipt = getModelBlock('BranchSupplyReceipt');
    const receiptItem = getModelBlock('BranchSupplyReceiptItem');
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
    expect(receipt).toMatch(/inventoryTransferId\s+String\s+@unique/);
    expect(receipt).toMatch(/idempotencyKey\s+String\s+@unique/);
    expect(receiptItem).toMatch(/transferItemId\s+String/);
    expect(receiptItem).toMatch(/receivedKg\s+Decimal\s+@default\(0\)/);
    expect(receiptItem).toMatch(/differencePieces\s+Int\s+@default\(0\)/);

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

  it('persists idempotency metadata for inventory adjustments', () => {
    const movement = getModelBlock('InventoryMovement');

    expect(movement).toMatch(/idempotencyKey\s+String\?\s+@unique/);
    expect(movement).toMatch(/idempotencyPayloadHash\s+String\?/);
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
    expect(transfer).toMatch(/branchSupplyReceipt\s+BranchSupplyReceipt\?/);
    expect(user).toMatch(
      /branchSupplyReceiptsReceived\s+BranchSupplyReceipt\[\]\s+@relation\("BranchSupplyReceiptReceivedBy"\)/,
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
    const receiptMigrationSql = readFileSync(
      branchSupplyReceiptMigrationSqlPath,
      'utf8',
    );
    expect(receiptMigrationSql).toContain('CREATE TABLE "BranchSupplyReceipt"');
    expect(receiptMigrationSql).toContain(
      'CREATE TABLE "BranchSupplyReceiptItem"',
    );
    expect(receiptMigrationSql).toContain('BranchSupplyReceipt_append_only');
    expect(receiptMigrationSql).toContain(
      'BranchSupplyReceiptItem_append_only',
    );
    expect(receiptMigrationSql).toContain(
      'BranchSupplyReceiptItem_difference_check',
    );
    expect(receiptMigrationSql).toContain(
      'validate_branch_supply_receipt_link',
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
    const requestReturnsPermissionMigration = readFileSync(
      cedisRequestReturnsPermissionMigrationSqlPath,
      'utf8',
    );
    expect(requestReturnsPermissionMigration).toContain(
      "'cedis.request_returns'",
    );
    expect(requestReturnsPermissionMigration).toMatch(
      /role\."name" IN \('ADMIN', 'WAREHOUSE', 'SELLER'\)/,
    );
    expect(requestReturnsPermissionMigration).toContain(
      'ON CONFLICT DO NOTHING',
    );
    expect(migrationSql).toContain("'cedis.reconcile'");
    expect(migrationSql).toContain("'cedis.close'");
    expect(migrationSql).toContain("'cedis.view_costs'");
    const receiptPermissionMigration = readFileSync(
      cedisReceiptPermissionMigrationSqlPath,
      'utf8',
    );
    expect(receiptPermissionMigration).toContain("'cedis.receive_supplies'");
    expect(receiptPermissionMigration).toMatch(
      /role\."name" IN \('ADMIN', 'WAREHOUSE', 'SELLER'\)/,
    );
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
    expect(migrationSql).toContain("'CEDIS-VER'");
    expect(migrationSql).toContain("'VER'");
    expect(migrationSql).toContain("'BDR'");
    expect(migrationSql).toContain("'ALV'");
    expect(migrationSql).toContain('ON CONFLICT ("code") DO NOTHING');
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

  it('keeps the nullable Product fiscal profile synchronized with an additive migration', () => {
    const product = getModelBlock('Product');
    const migrationSql = readFileSync(
      productFiscalProfileMigrationSqlPath,
      'utf8',
    );

    expect(product).toMatch(/satProductServiceCode\s+String\?/);
    expect(product).toMatch(/satUnitCode\s+String\?/);
    expect(product).toMatch(/taxObjectCode\s+String\?/);
    expect(product).toMatch(/defaultTaxCode\s+String\?/);
    expect(product).toMatch(/defaultFactorType\s+String\?/);
    expect(product).toMatch(/defaultRateOrQuota\s+Decimal\?/);
    expect(migrationSql).toContain(
      'ADD COLUMN "satProductServiceCode" VARCHAR(8)',
    );
    expect(migrationSql).toContain('ADD COLUMN "satUnitCode" VARCHAR(3)');
    expect(migrationSql).toContain(
      'Product_defaultRateOrQuota_non_negative_check',
    );
    expect(migrationSql).toContain(
      'Product_satProductServiceCode_format_check',
    );
    expect(migrationSql).toContain('Product_satUnitCode_format_check');
    expect(migrationSql).toContain('Product_taxObjectCode_catalog_check');
    expect(migrationSql).toContain('Product_defaultTaxCode_catalog_check');
    expect(migrationSql).toContain('Product_defaultFactorType_catalog_check');
    expect(migrationSql).not.toMatch(/\bUPDATE\s+"Product"/i);
  });

  it('keeps LegalEntity as the fiscal issuer with additive, secret-free configuration', () => {
    const legalEntity = getModelBlock('LegalEntity');
    const migrationSql = readFileSync(
      legalEntityFiscalConfigurationMigrationSqlPath,
      'utf8',
    );

    expect(legalEntity).toMatch(/fiscalPostalCode\s+String\?/);
    expect(legalEntity).toMatch(/fiscalRegime\s+String\?/);
    expect(legalEntity).toMatch(/cfdiEnabled\s+Boolean\s+@default\(false\)/);
    expect(legalEntity).toMatch(/defaultSeries\s+String\?/);
    expect(legalEntity).toMatch(/certificateSerialNumber\s+String\?/);
    expect(legalEntity).toMatch(/certificateFingerprint\s+String\?/);
    expect(legalEntity).toMatch(/certificateValidFrom\s+DateTime\?/);
    expect(legalEntity).toMatch(/certificateValidTo\s+DateTime\?/);
    expect(legalEntity).not.toMatch(/\b(key|password|pacToken|token)\b/i);
    expect(migrationSql).toContain(
      'ADD COLUMN "cfdiEnabled" BOOLEAN NOT NULL DEFAULT false',
    );
    expect(migrationSql).toContain('LegalEntity_cfdi_configuration_check');
    expect(migrationSql).not.toMatch(/\bUPDATE\s+"LegalEntity"/i);
  });

  it('synchronizes the CFDI issuer-management permission for existing roles', () => {
    const migrationSql = readFileSync(
      cfdiProviderManagePermissionMigrationSqlPath,
      'utf8',
    );

    expect(migrationSql).toContain("'cfdi.provider.manage'");
    expect(migrationSql).toContain("role.\"name\" IN ('ADMIN', 'BILLING')");
    expect(migrationSql).toContain('ON CONFLICT DO NOTHING');
  });

  it('keeps the additive CFDI fiscal persistence model synchronized with its migration', () => {
    const invoice = getModelBlock('Invoice');
    const migrationSql = readFileSync(
      cfdiFiscalDataModelMigrationSqlPath,
      'utf8',
    );

    expect(invoice).toMatch(
      /origin\s+InvoiceOrigin\s+@default\(LEGACY_EXTERNAL\)/,
    );
    expect(invoice).toMatch(/concepts\s+InvoiceConcept\[\]/);
    expect(invoice).toMatch(/fiscalArtifacts\s+FiscalArtifact\[\]/);
    expect(invoice).toMatch(
      /fiscalOperationAttempts\s+FiscalOperationAttempt\[\]/,
    );
    expect(migrationSql).toContain('CREATE TABLE "InvoiceConcept"');
    expect(migrationSql).toContain('CREATE TABLE "FiscalArtifact"');
    expect(migrationSql).toContain('CREATE TABLE "FiscalOperationAttempt"');
    expect(migrationSql).toContain('CREATE TABLE "FiscalCertificate"');
    expect(migrationSql).not.toMatch(
      /(?:ALTER|DROP)\s+TABLE\s+"InvoiceSaleDocument"/i,
    );
    expect(migrationSql).not.toMatch(
      /(?:ALTER|DROP)\s+TABLE\s+"InvoiceSaleItemApplication"/i,
    );
  });

  it('widens only Invoice fiscalUseCode to persist REP and ordinary SAT use codes', () => {
    const invoice = getModelBlock('Invoice');
    const migrationSql = readFileSync(
      invoiceFiscalUseCodeWideningMigrationSqlPath,
      'utf8',
    );

    expect(invoice).toMatch(/fiscalUseCode\s+String\?\s+@db\.VarChar\(4\)/);
    expect(migrationSql.trim()).toBe(
      'ALTER TABLE "Invoice" ALTER COLUMN "fiscalUseCode" TYPE VARCHAR(4);',
    );
    expect(['G03', 'G02', 'S01', 'CP01']).toEqual(
      expect.arrayOf(expect.stringMatching(/^[A-Z0-9]{3,4}$/)),
    );
  });

  it('scopes native root payment fields by CFDI type without weakening provenance', () => {
    const migrationSql = readFileSync(
      invoiceNativeSnapshotPaymentFieldsMigrationSqlPath,
      'utf8',
    );
    const normalizedSql = migrationSql.replace(/\s+/g, ' ');

    expect(normalizedSql).toContain(
      `"origin" = 'NATIVE_CFDI' AND "cfdiType" = 'PAYMENT_RECEIPT' AND ("paymentFormCode" IS NOT NULL OR "paymentMethodCode" IS NOT NULL)`,
    );
    expect(normalizedSql).toContain(
      `"cfdiType" = 'INCOME' AND "sourceBillingRequestId" IS NOT NULL AND "sourceCreditAdjustmentId" IS NULL AND "paymentFormCode" IS NOT NULL AND "paymentMethodCode" IS NOT NULL`,
    );
    expect(normalizedSql).toContain(
      `"cfdiType" = 'EXPENSE' AND "sourceBillingRequestId" IS NULL AND "sourceCreditAdjustmentId" IS NOT NULL AND "paymentFormCode" IS NOT NULL AND "paymentMethodCode" IS NOT NULL`,
    );
    expect(normalizedSql).toContain(
      `"cfdiType" = 'PAYMENT_RECEIPT' AND "sourceBillingRequestId" IS NULL AND "sourceCreditAdjustmentId" IS NULL AND "paymentFormCode" IS NULL AND "paymentMethodCode" IS NULL`,
    );
    for (const commonInvariant of [
      '"fiscalIdempotencyKey" IS NOT NULL',
      `"fiscalRequestHash" ~ '^[0-9a-f]{64}$'`,
      `"cfdiVersion" = '4.0'`,
      '"issuedAt" IS NOT NULL',
      '"issuerSnapshot" IS NOT NULL',
      '"receiverSnapshot" IS NOT NULL',
      `"fiscalSnapshotHash" ~ '^[0-9a-f]{64}$'`,
      '"fiscalUseCode" IS NOT NULL',
      '"exportCode" IS NOT NULL',
      '"fiscalCertificateId" IS NOT NULL',
      `"fiscalStatus" <> 'LEGACY'`,
      `"cancellationStatus" <> 'NOT_APPLICABLE'`,
    ]) {
      expect(normalizedSql).toContain(commonInvariant);
    }
    expect(normalizedSql).toContain(
      'ADD CONSTRAINT "Invoice_native_fiscal_snapshot_check" CHECK',
    );
    expect(normalizedSql).toContain(') NOT VALID;');
    expect(normalizedSql).toContain(
      'VALIDATE CONSTRAINT "Invoice_native_fiscal_snapshot_check";',
    );
    const preflightPosition = normalizedSql.indexOf('DO $$');
    const dropPosition = normalizedSql.indexOf(
      'DROP CONSTRAINT "Invoice_native_fiscal_snapshot_check";',
    );
    const addPosition = normalizedSql.indexOf(
      'ADD CONSTRAINT "Invoice_native_fiscal_snapshot_check" CHECK',
    );
    const validatePosition = normalizedSql.indexOf(
      'VALIDATE CONSTRAINT "Invoice_native_fiscal_snapshot_check";',
    );
    expect(preflightPosition).toBeGreaterThanOrEqual(0);
    expect(dropPosition).toBeGreaterThan(preflightPosition);
    expect(addPosition).toBeGreaterThan(dropPosition);
    expect(validatePosition).toBeGreaterThan(addPosition);
    expect(migrationSql).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|TRUNCATE)\b/i);
  });

  it('persists SAT catalogs as versioned, checksum-validated data without seeding fiscal facts', () => {
    const catalog = getModelBlock('SatCatalog');
    const version = getModelBlock('SatCatalogVersion');
    const entry = getModelBlock('SatCatalogEntry');
    const migrationSql = readFileSync(
      satCatalogVersioningMigrationSqlPath,
      'utf8',
    );

    expect(getEnumBlock('SatCatalogVersionStatus')).toMatch(
      /STAGING[\s\S]*VALIDATED[\s\S]*ACTIVE[\s\S]*RETIRED[\s\S]*FAILED/,
    );
    expect(catalog).toMatch(
      /key\s+String\s+String\s+@unique|key\s+String\s+@unique/,
    );
    expect(catalog).toMatch(/activeVersionId\s+String\?/);
    expect(version).toMatch(/checksumSha256\s+String/);
    expect(version).toMatch(/sourceVersion\s+String/);
    expect(version).toMatch(/status\s+SatCatalogVersionStatus/);
    expect(entry).toMatch(/code\s+String/);
    expect(entry).toMatch(/description\s+String/);
    expect(entry).toMatch(/validFrom\s+DateTime\?/);
    expect(entry).toMatch(/validTo\s+DateTime\?/);
    expect(entry).toMatch(/metadata\s+Json\?/);
    expect(migrationSql).toContain('CREATE TABLE "SatCatalog"');
    expect(migrationSql).toContain('CREATE TABLE "SatCatalogVersion"');
    expect(migrationSql).toContain('CREATE TABLE "SatCatalogEntry"');
    expect(migrationSql).toContain('SatCatalogVersion_integrity_check');
    expect(migrationSql).toContain('SatCatalog_activeVersionId_fkey');
    expect(migrationSql).not.toMatch(/INSERT\s+INTO\s+"SatCatalogEntry"/i);
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

  it('keeps an optional CEDIS assignment separate from the primary user location', () => {
    const user = getModelBlock('User');
    const location = getModelBlock('OperationalLocation');
    const migrationSql = readFileSync(
      userCedisAssignmentMigrationSqlPath,
      'utf8',
    );

    expect(user).toMatch(/cedisLocationId\s+String\?/);
    expect(user).toMatch(
      /cedisLocation\s+OperationalLocation\?\s+@relation\("UserCedisAssignment", fields: \[cedisLocationId\], references: \[id\], onDelete: Restrict\)/,
    );
    expect(user).toContain('@@index([cedisLocationId])');
    expect(location).toMatch(
      /cedisUsers\s+User\[\]\s+@relation\("UserCedisAssignment"\)/,
    );
    expect(migrationSql).toContain('ADD COLUMN "cedisLocationId" TEXT');
    expect(migrationSql).toContain('User_cedisLocationId_idx');
    expect(migrationSql).toContain('User_cedisLocationId_fkey');
  });

  it('persists delivery evidence integrity metadata and capture provenance', () => {
    const evidence = getModelBlock('DeliveryEvidence');
    const user = getModelBlock('User');
    const migrationSql = readFileSync(
      deliveryEvidenceIntegrityMigrationSqlPath,
      'utf8',
    );

    expect(evidence).toMatch(/storageKey\s+String\?/);
    expect(evidence).toMatch(/mimeType\s+String\?/);
    expect(evidence).toMatch(/sha256\s+String\?/);
    expect(evidence).toMatch(/sizeBytes\s+Int\?/);
    expect(evidence).toMatch(/receivedAt\s+DateTime/);
    expect(evidence).toMatch(/capturedByUserId\s+String\?/);
    expect(evidence).toMatch(/metadata\s+Json\?/);
    expect(evidence).toMatch(
      /capturedBy\s+User\?\s+@relation\("DeliveryEvidenceCapturedBy"/,
    );
    expect(user).toMatch(
      /capturedDeliveryEvidence\s+DeliveryEvidence\[\]\s+@relation\("DeliveryEvidenceCapturedBy"\)/,
    );
    expect(evidence).toContain('@@index([capturedByUserId, receivedAt])');
    expect(evidence).toContain('@@index([sha256])');
    expect(migrationSql).toContain('ADD COLUMN "storageKey" TEXT');
    expect(migrationSql).toContain('ADD COLUMN "mimeType" TEXT');
    expect(migrationSql).toContain('ADD COLUMN "sha256" TEXT');
    expect(migrationSql).toContain('ADD COLUMN "sizeBytes" INTEGER');
    expect(migrationSql).toContain('ADD COLUMN "receivedAt" TIMESTAMP(3)');
    expect(migrationSql).toContain('ADD COLUMN "capturedByUserId" TEXT');
    expect(migrationSql).toContain('ADD COLUMN "metadata" JSONB');
    expect(migrationSql).toContain(
      'DeliveryEvidence_capturedByUserId_receivedAt_idx',
    );
    expect(migrationSql).toContain('DeliveryEvidence_sha256_idx');
    expect(migrationSql).toContain('DeliveryEvidence_capturedByUserId_fkey');
  });

  it('keeps new photo rows out of PostgreSQL while retaining a legacy migration path', () => {
    const evidence = getModelBlock('DeliveryEvidence');
    const migrationSql = readFileSync(
      deliveryEvidenceObjectStorageMigrationSqlPath,
      'utf8',
    );

    expect(evidence).toMatch(/value\s+String\?/);
    expect(evidence).toMatch(/storageKey\s+String\?\s+@unique/);
    expect(migrationSql).toContain('ALTER COLUMN "value" DROP NOT NULL');
    expect(migrationSql).toContain('DeliveryEvidence_storageKey_key');
    expect(migrationSql).toContain(
      'DeliveryEvidence_value_or_storageKey_check',
    );
    expect(migrationSql).toContain(
      '"value" IS NOT NULL OR "storageKey" IS NOT NULL',
    );
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

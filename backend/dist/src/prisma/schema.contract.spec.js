"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const schemaPath = (0, node_path_1.resolve)(__dirname, '../../prisma/schema.prisma');
const migrationSqlPath = (0, node_path_1.resolve)(__dirname, '../../prisma/migrations/20260623120000_task010_constraints/migration.sql');
const userAccessMigrationSqlPath = (0, node_path_1.resolve)(__dirname, '../../prisma/migrations/20260626120000_add_user_access_fields/migration.sql');
const schema = (0, node_fs_1.readFileSync)(schemaPath, 'utf8');
function getModelBlock(modelName) {
    const match = schema.match(new RegExp(`model\\s+${modelName}\\s+\\{([\\s\\S]*?)\\n\\}`, 'm'));
    expect(match).not.toBeNull();
    return match?.[1] ?? '';
}
function getModelNames() {
    return [...schema.matchAll(/^model\s+(\w+)\s+\{/gm)].map((match) => match[1]);
}
describe('Prisma schema contract', () => {
    it('keeps the required canonical models and excludes prohibited ones', () => {
        const modelNames = getModelNames();
        const requiredModels = [
            'Role',
            'User',
            'OperationalLocation',
            'Product',
            'Category',
            'ProductUnitEquivalent',
            'InventoryBalance',
            'Customer',
            'Supplier',
            'Sale',
            'SaleItem',
            'Purchase',
            'PurchaseItem',
            'InventoryMovement',
            'InventoryTransfer',
            'InventoryTransferItem',
            'AccountReceivable',
            'Payment',
            'CommercialPolicy',
            'OperationalConfig',
            'DeliveryRoute',
            'DeliveryOrder',
            'DeliveryEvidence',
            'RouteSettlement',
            'PointOfSaleDailyClose',
            'PointOfSaleDailyCloseLine',
            'CashMovement',
            'ScaleTicketReference',
            'BillingRequest',
        ];
        expect(modelNames).toEqual(expect.arrayContaining(requiredModels));
        expect(modelNames).toHaveLength(30);
        expect(modelNames).not.toContain('PaymentAllocation');
        expect(modelNames).not.toContain('CFDI');
        expect(modelNames).not.toContain('SAT');
        expect(getModelBlock('Product')).not.toMatch(/\bstock\b/);
    });
    it('enforces one non-cancelled daily close per location and business date', () => {
        const dailyClose = getModelBlock('PointOfSaleDailyClose');
        const migrationSql = (0, node_fs_1.readFileSync)(migrationSqlPath, 'utf8');
        expect(dailyClose).toMatch(/businessDate\s+DateTime\s+@db\.Date/);
        expect(migrationSql).toMatch(/CREATE UNIQUE INDEX[\s\S]*WHERE\s+"status"\s*<>\s*'CANCELLED'/i);
    });
    it('keeps scale ticket folio unique per location and date', () => {
        const scaleTicket = getModelBlock('ScaleTicketReference');
        expect(scaleTicket).toContain('capturedDate');
        expect(scaleTicket).toContain('@db.Date');
        expect(scaleTicket).toContain('@@unique([operationalLocationId, capturedDate, physicalFolio])');
    });
    it('persists user access status fields with safe defaults and nullable deactivation audit', () => {
        const user = getModelBlock('User');
        const migrationSql = (0, node_fs_1.readFileSync)(userAccessMigrationSqlPath, 'utf8');
        expect(user).toMatch(/mustChangePassword\s+Boolean\s+@default\(false\)/);
        expect(user).toMatch(/deactivatedAt\s+DateTime\?/);
        expect(user).toMatch(/deactivatedByUserId\s+String\?/);
        expect(user).toMatch(/deactivationReason\s+String\?/);
        expect(user).toContain('deactivatedBy                User?                   @relation("UserDeactivatedBy", fields: [deactivatedByUserId], references: [id])');
        expect(user).toContain('deactivatedUsers             User[]                  @relation("UserDeactivatedBy")');
        expect(user).toContain('@@index([deactivatedByUserId])');
        expect(migrationSql).toContain('ADD COLUMN     "mustChangePassword" BOOLEAN NOT NULL DEFAULT false');
        expect(migrationSql).toContain('ADD COLUMN     "deactivatedAt" TIMESTAMP(3)');
        expect(migrationSql).toContain('ADD COLUMN     "deactivatedByUserId" TEXT');
        expect(migrationSql).toContain('ADD COLUMN     "deactivationReason" TEXT');
    });
    it('binds closing associations to the same location', () => {
        const migrationSql = (0, node_fs_1.readFileSync)(migrationSqlPath, 'utf8');
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
        expect(migrationSql).toContain('validate_payment_daily_close_location_match');
        expect(migrationSql).toContain('validate_inventory_movement_daily_close_location_match');
        expect(migrationSql).toContain('validate_sale_document_daily_close_location_match');
        expect(migrationSql).toContain('validate_cash_movement_daily_close_location_match');
        expect(migrationSql).toContain('validate_scale_ticket_reference_daily_close_location_match');
        expect(migrationSql).toContain('validate_point_of_sale_daily_close_line_location_match');
        guardedTables.forEach((tableName) => {
            expect(migrationSql).toMatch(new RegExp(`CREATE TRIGGER[\\s\\S]*${tableName}`, 'i'));
        });
    });
});
//# sourceMappingURL=schema.contract.spec.js.map
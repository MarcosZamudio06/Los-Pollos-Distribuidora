import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const schemaPath = resolve(__dirname, '../../prisma/schema.prisma');
const migrationSqlPath = resolve(
  __dirname,
  '../../prisma/migrations/20260623120000_task010_constraints/migration.sql',
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
    const migrationSql = readFileSync(migrationSqlPath, 'utf8');

    expect(dailyClose).toMatch(/businessDate\s+DateTime\s+@db\.Date/);
    expect(migrationSql).toMatch(
      /CREATE UNIQUE INDEX[\s\S]*WHERE\s+"status"\s*<>\s*'CANCELLED'/i,
    );
  });

  it('keeps scale ticket folio unique per location and date', () => {
    const scaleTicket = getModelBlock('ScaleTicketReference');

    expect(scaleTicket).toContain('capturedDate');
    expect(scaleTicket).toContain('@db.Date');
    expect(scaleTicket).toContain(
      '@@unique([operationalLocationId, capturedDate, physicalFolio])',
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

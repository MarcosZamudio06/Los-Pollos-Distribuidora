import { Test } from '@nestjs/testing';
import { PrismaService } from '../../database/prisma.service';
import { InventoryTransfersService } from '../inventory/inventory-transfers.service';
import { DeliveryService } from '../delivery/delivery.service';
import { PointOfSaleDailyCloseService } from '../point-of-sale-daily-close/point-of-sale-daily-close.service';
import { BranchSupplyCycleReconciliationService } from './branch-supply-cycle-reconciliation.service';
import { BranchSupplyCyclesService } from './branch-supply-cycles.service';
import { BranchSupplyReceiptsService } from './branch-supply-receipts.service';

describe('Mandatory runtime CEDIS composition', () => {
  it.each([BranchSupplyCyclesService, BranchSupplyReceiptsService])(
    '%s fails Nest initialization without the real gateway provider',
    async (service) => {
      const providers = [
        PrismaService,
        InventoryTransfersService,
        DeliveryService,
        PointOfSaleDailyCloseService,
        BranchSupplyCycleReconciliationService,
      ].map((provide) => ({ provide, useValue: {} }));
      // An offline seed may construct a service directly; Nest may never silently omit its emitter.
      await expect(
        Test.createTestingModule({
          providers: [service, ...providers],
        }).compile(),
      ).rejects.toThrow('CedisGateway');
    },
  );
});

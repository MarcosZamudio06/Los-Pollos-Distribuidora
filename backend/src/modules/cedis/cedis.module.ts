import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { InventoryModule } from '../inventory/inventory.module';
import { PointOfSaleDailyCloseModule } from '../point-of-sale-daily-close/point-of-sale-daily-close.module';
import { BranchSupplyCyclesController } from './branch-supply-cycles.controller';
import { BranchSupplyCycleReconciliationService } from './branch-supply-cycle-reconciliation.service';
import { BranchSupplyCyclesService } from './branch-supply-cycles.service';
import { BranchSupplyReceiptsController } from './branch-supply-receipts.controller';
import { BranchSupplyReceiptsService } from './branch-supply-receipts.service';
import { CedisDashboardController } from './cedis-dashboard.controller';
import { CedisDashboardQueryService } from './cedis-dashboard.query.service';
import { CedisInventorySummaryQueryService } from './cedis-inventory-summary.query.service';

@Module({
  imports: [AuthModule, InventoryModule, PointOfSaleDailyCloseModule],
  controllers: [
    BranchSupplyCyclesController,
    BranchSupplyReceiptsController,
    CedisDashboardController,
  ],
  providers: [
    BranchSupplyCycleReconciliationService,
    BranchSupplyCyclesService,
    BranchSupplyReceiptsService,
    CedisDashboardQueryService,
    CedisInventorySummaryQueryService,
  ],
  exports: [BranchSupplyCyclesService],
})
export class CedisModule {}

import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { InventoryModule } from '../inventory/inventory.module';
import { PointOfSaleDailyCloseModule } from '../point-of-sale-daily-close/point-of-sale-daily-close.module';
import { BranchSupplyCyclesController } from './branch-supply-cycles.controller';
import { BranchSupplyCycleReconciliationService } from './branch-supply-cycle-reconciliation.service';
import { BranchSupplyCyclesService } from './branch-supply-cycles.service';
import { CedisDashboardController } from './cedis-dashboard.controller';
import { CedisDashboardQueryService } from './cedis-dashboard.query.service';
import { CedisInventorySummaryQueryService } from './cedis-inventory-summary.query.service';

@Module({
  imports: [AuthModule, InventoryModule, PointOfSaleDailyCloseModule],
  controllers: [BranchSupplyCyclesController, CedisDashboardController],
  providers: [
    BranchSupplyCycleReconciliationService,
    BranchSupplyCyclesService,
    CedisDashboardQueryService,
    CedisInventorySummaryQueryService,
  ],
  exports: [BranchSupplyCyclesService],
})
export class CedisModule {}

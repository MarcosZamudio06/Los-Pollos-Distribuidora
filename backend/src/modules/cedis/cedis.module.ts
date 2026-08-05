import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { InventoryModule } from '../inventory/inventory.module';
import { BranchSupplyCyclesController } from './branch-supply-cycles.controller';
import { BranchSupplyCycleReconciliationService } from './branch-supply-cycle-reconciliation.service';
import { BranchSupplyCyclesService } from './branch-supply-cycles.service';
import { CedisDashboardController } from './cedis-dashboard.controller';
import { CedisDashboardQueryService } from './cedis-dashboard.query.service';

@Module({
  imports: [AuthModule, InventoryModule],
  controllers: [BranchSupplyCyclesController, CedisDashboardController],
  providers: [
    BranchSupplyCycleReconciliationService,
    BranchSupplyCyclesService,
    CedisDashboardQueryService,
  ],
  exports: [BranchSupplyCyclesService],
})
export class CedisModule {}

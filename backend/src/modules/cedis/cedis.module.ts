import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { InventoryModule } from '../inventory/inventory.module';
import { BranchSupplyCyclesController } from './branch-supply-cycles.controller';
import { BranchSupplyCyclesService } from './branch-supply-cycles.service';

@Module({
  imports: [AuthModule, InventoryModule],
  controllers: [BranchSupplyCyclesController],
  providers: [BranchSupplyCyclesService],
  exports: [BranchSupplyCyclesService],
})
export class CedisModule {}

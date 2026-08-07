import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { InventoryController } from './inventory.controller';
import { InventoryBalanceService } from './inventory-balance.service';
import { InventoryTransfersController } from './inventory-transfers.controller';
import { InventoryService } from './inventory.service';
import { InventoryTransfersService } from './inventory-transfers.service';

@Module({
  imports: [AuthModule],
  controllers: [InventoryController, InventoryTransfersController],
  providers: [
    InventoryBalanceService,
    InventoryService,
    InventoryTransfersService,
  ],
  exports: [
    InventoryBalanceService,
    InventoryService,
    InventoryTransfersService,
  ],
})
export class InventoryModule {}

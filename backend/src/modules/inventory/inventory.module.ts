import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { InventoryController } from './inventory.controller';
import { InventoryTransfersController } from './inventory-transfers.controller';
import { InventoryService } from './inventory.service';
import { InventoryTransfersService } from './inventory-transfers.service';

@Module({
  imports: [AuthModule],
  controllers: [InventoryController, InventoryTransfersController],
  providers: [InventoryService, InventoryTransfersService],
  exports: [InventoryService, InventoryTransfersService],
})
export class InventoryModule {}

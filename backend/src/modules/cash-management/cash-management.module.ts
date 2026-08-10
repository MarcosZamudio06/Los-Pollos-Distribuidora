import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { CashManagementController } from './cash-management.controller';
import { CashManagementService } from './cash-management.service';
import { PointOfSaleDailyCloseModule } from '../point-of-sale-daily-close/point-of-sale-daily-close.module';

@Module({
  imports: [PrismaModule, AuthModule, PointOfSaleDailyCloseModule],
  controllers: [CashManagementController],
  providers: [CashManagementService],
  exports: [CashManagementService],
})
export class CashManagementModule {}

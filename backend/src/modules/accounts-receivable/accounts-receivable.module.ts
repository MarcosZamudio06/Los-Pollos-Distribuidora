import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../../database/prisma.module';
import { PointOfSaleDailyCloseModule } from '../point-of-sale-daily-close/point-of-sale-daily-close.module';
import { AccountsReceivableController } from './accounts-receivable.controller';
import { AccountsReceivableService } from './accounts-receivable.service';
import { AccountsReceivableAgingJob } from './accounts-receivable-aging.job';

@Module({
  imports: [PrismaModule, AuthModule, PointOfSaleDailyCloseModule],
  controllers: [AccountsReceivableController],
  providers: [AccountsReceivableService, AccountsReceivableAgingJob],
  exports: [AccountsReceivableService],
})
export class AccountsReceivableModule {}

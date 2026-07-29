import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { CashManagementController } from './cash-management.controller';
import { CashManagementService } from './cash-management.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [CashManagementController],
  providers: [CashManagementService],
  exports: [CashManagementService],
})
export class CashManagementModule {}

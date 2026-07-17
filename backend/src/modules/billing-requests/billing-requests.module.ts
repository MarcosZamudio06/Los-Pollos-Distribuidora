import { Module } from '@nestjs/common';
import { BillingRequestsController } from './billing-requests.controller';
import { BillingRequestsService } from './billing-requests.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [BillingRequestsController],
  providers: [BillingRequestsService],
  exports: [BillingRequestsService],
})
export class BillingRequestsModule {}

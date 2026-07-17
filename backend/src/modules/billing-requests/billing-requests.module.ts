import { Module } from '@nestjs/common';
import { BillingRequestsController } from './billing-requests.controller';
import { BillingRequestsService } from './billing-requests.service';

@Module({
  controllers: [BillingRequestsController],
  providers: [BillingRequestsService],
  exports: [BillingRequestsService],
})
export class BillingRequestsModule {}

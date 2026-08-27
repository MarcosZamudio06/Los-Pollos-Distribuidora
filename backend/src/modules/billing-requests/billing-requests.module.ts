import { Module } from '@nestjs/common';
import { BillingRequestsController } from './billing-requests.controller';
import { BillingRequestsService } from './billing-requests.service';
import { AuthModule } from '../auth/auth.module';
import { CfdiModule } from '../cfdi/cfdi.module';

@Module({
  imports: [AuthModule, CfdiModule],
  controllers: [BillingRequestsController],
  providers: [BillingRequestsService],
  exports: [BillingRequestsService],
})
export class BillingRequestsModule {}

import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { BillingReportController } from './billing-report.controller';
import { BillingReportService } from './billing-report.service';
import { BillingReportExporter } from './billing-report-exporter';
import { InvoiceCancellationController } from './invoice-cancellation.controller';
import { InvoiceCancellationService } from './invoice-cancellation.service';
import { BillingRemediationController } from './billing-remediation.controller';
import { BillingRemediationService } from './billing-remediation.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [BillingReportController, InvoiceCancellationController, BillingRemediationController],
  providers: [BillingReportService, BillingReportExporter, InvoiceCancellationService, BillingRemediationService],
})
export class BillingModule {}

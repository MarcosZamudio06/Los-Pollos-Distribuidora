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
import { RemediationImpactAnalyzer } from './remediation-impact-analyzer';
import { SaleConsistencyValidator } from './sale-consistency-validator';
import { CfdiModule } from '../cfdi/cfdi.module';
import { CancellationStatusJob } from './cancellation-status.job';

@Module({
  imports: [PrismaModule, AuthModule, CfdiModule],
  controllers: [
    BillingReportController,
    InvoiceCancellationController,
    BillingRemediationController,
  ],
  providers: [
    BillingReportService,
    BillingReportExporter,
    InvoiceCancellationService,
    BillingRemediationService,
    RemediationImpactAnalyzer,
    SaleConsistencyValidator,
    CancellationStatusJob,
  ],
})
export class BillingModule {}

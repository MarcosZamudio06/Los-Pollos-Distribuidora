import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { BillingReportController } from './billing-report.controller';
import { BillingReportService } from './billing-report.service';
import { BillingReportExporter } from './billing-report-exporter';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [BillingReportController],
  providers: [BillingReportService, BillingReportExporter],
})
export class BillingModule {}

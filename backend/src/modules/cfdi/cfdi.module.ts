import { Module } from '@nestjs/common';
import { CfdiValidationService } from './cfdi-validation.service';
import { CfdiDocumentBuilder } from './domain/cfdi-document-builder';
import { FacturamaAdapter } from './adapters/facturama/facturama.adapter';
import { CfdiIssuanceService } from './cfdi-issuance.service';
import { CfdiIssuanceRepository } from './cfdi-issuance.repository';
import { FISCAL_PROVIDER_PORT } from './domain/fiscal-provider.port';
import { FiscalArtifactController } from './fiscal-artifact.controller';
import { FiscalArtifactService } from './fiscal-artifact.service';
import { FiscalInvoiceReadController } from './fiscal-invoice-read.controller';
import { FiscalInvoiceReadService } from './fiscal-invoice-read.service';
import { ObjectStorageModule } from '../object-storage/object-storage.module';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../../database/prisma.module';
import { ConfigModule } from '@nestjs/config';
import { StampReconciliationJob } from './stamp-reconciliation.job';
import { SatCatalogController } from './sat-catalog.controller';
import { RepIssuanceController } from './rep-issuance.controller';
import { RepIssuanceRepository } from './rep-issuance.repository';
import { RepIssuanceService } from './rep-issuance.service';
import { CreditAdjustmentController } from './credit-adjustment.controller';
import { CreditAdjustmentRepository } from './credit-adjustment.repository';
import { CreditAdjustmentService } from './credit-adjustment.service';
import {
  SatCatalogImportService,
  SatCatalogService,
} from './sat-catalog.service';
import { FiscalEventLogger } from './fiscal-event.logger';
import { CertificateExpiryJob } from './certificate-expiry.job';

@Module({
  imports: [PrismaModule, AuthModule, ConfigModule, ObjectStorageModule],
  controllers: [
    FiscalArtifactController,
    FiscalInvoiceReadController,
    SatCatalogController,
    RepIssuanceController,
    CreditAdjustmentController,
  ],
  providers: [
    CfdiDocumentBuilder,
    CfdiValidationService,
    CfdiIssuanceService,
    CfdiIssuanceRepository,
    FiscalArtifactService,
    FiscalInvoiceReadService,
    StampReconciliationJob,
    SatCatalogService,
    SatCatalogImportService,
    RepIssuanceRepository,
    RepIssuanceService,
    CreditAdjustmentRepository,
    CreditAdjustmentService,
    FiscalEventLogger,
    CertificateExpiryJob,
    FacturamaAdapter,
    { provide: FISCAL_PROVIDER_PORT, useExisting: FacturamaAdapter },
  ],
  exports: [
    CfdiDocumentBuilder,
    CfdiValidationService,
    CfdiIssuanceService,
    FiscalArtifactService,
    FiscalInvoiceReadService,
    SatCatalogService,
    SatCatalogImportService,
    RepIssuanceService,
    CreditAdjustmentService,
    FiscalEventLogger,
    FISCAL_PROVIDER_PORT,
  ],
})
export class CfdiModule {}

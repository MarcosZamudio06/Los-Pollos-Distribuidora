import {
  BillingRequestStatus,
  CfdiDocumentType,
  CostSnapshotSource,
  CreditStatus,
  CustomerType,
  FiscalCancellationStatus,
  FiscalOperationStatus,
  FiscalOperationType,
  InvoiceFiscalStatus,
  InvoiceOrigin,
  OperationalLocationType,
  PaymentInvoiceApplicationStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  PrismaClient,
  ProductPresentationType,
  ProductUnit,
  SaleChannel,
  SaleDocumentStatus,
  SaleDocumentType,
  SalePaymentType,
  SaleStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { PreparedCfdiIssuance } from '../../src/modules/cfdi/cfdi-issuance.types';
import type { CfdiDocumentSnapshot } from '../../src/modules/cfdi/domain/cfdi-document.types';

const CERTIFICATE_SERIAL = '30001000000500003416';
const CERTIFICATE_FINGERPRINT = 'a'.repeat(64);
const CERTIFICATE_VALID_FROM = new Date('2025-01-01T00:00:00.000Z');
const CERTIFICATE_VALID_TO = new Date('2030-01-01T00:00:00.000Z');
const RFC_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const RFC_PREFIX_SPACE = 26n ** 3n;
const RFC_SUFFIX_SPACE = 36n ** 3n;

export type Fixture = {
  marker: string;
  billingRequestId: string;
  invoiceId: string;
  stampAttemptId: string;
  providerReference: string;
  recoveryUuid: string;
  applicationId?: string;
  prepared?: PreparedCfdiIssuance;
};

function fixtureLegalEntityTaxId(seed: string, attempt: number): string {
  const normalizedSeed = seed.replace(/[^0-9A-F]/gi, '').toUpperCase();
  const seedValue = BigInt(`0x${normalizedSeed}`);
  const value =
    (seedValue + BigInt(attempt)) % (RFC_PREFIX_SPACE * RFC_SUFFIX_SPACE);
  const prefixValue = Number(value / RFC_SUFFIX_SPACE);
  const suffixValue = value % RFC_SUFFIX_SPACE;

  let prefix = '';
  let remainingPrefixValue = prefixValue;
  for (let index = 0; index < 3; index += 1) {
    prefix = `${RFC_LETTERS[remainingPrefixValue % 26]}${prefix}`;
    remainingPrefixValue = Math.floor(remainingPrefixValue / 26);
  }

  return `${prefix}010101${suffixValue.toString(36).toUpperCase().padStart(3, '0')}`;
}

function isTaxIdUniqueViolation(error: unknown): boolean {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== 'P2002'
  ) {
    return false;
  }

  const target = error.meta?.target;
  return Array.isArray(target)
    ? target.includes('taxId')
    : typeof target === 'string' && target.includes('taxId');
}

async function createFixtureLegalEntity(
  prisma: PrismaClient,
  fixtureRunId: string,
  marker: string,
) {
  for (let attempt = 0; attempt < 128; attempt += 1) {
    try {
      return await prisma.legalEntity.create({
        data: {
          legalName: `${marker} legal entity`,
          taxId: fixtureLegalEntityTaxId(fixtureRunId, attempt),
          fiscalPostalCode: '64000',
          fiscalRegime: '601',
          cfdiEnabled: true,
          defaultSeries: 'A',
          certificateSerialNumber: CERTIFICATE_SERIAL,
          certificateFingerprint: CERTIFICATE_FINGERPRINT,
          certificateSubject: `CN=${marker}`,
          certificateValidFrom: CERTIFICATE_VALID_FROM,
          certificateValidTo: CERTIFICATE_VALID_TO,
        },
      });
    } catch (error) {
      if (!isTaxIdUniqueViolation(error)) throw error;
    }
  }

  throw new Error(
    'Unable to allocate a unique RFC-shaped LegalEntity fixture after 128 attempts',
  );
}

export async function seedFixture(
  prisma: PrismaClient,
  options: {
    includePaymentApplication?: boolean;
    priorRecoveryAttempts?: number;
    sandbox?: {
      issuer: {
        taxId: string;
        legalName: string;
        fiscalPostalCode: string;
        fiscalRegime: string;
      };
      receiver: {
        taxId: string;
        fiscalName: string;
        fiscalPostalCode: string;
        fiscalRegime: string;
        fiscalUseCode: string;
      };
      certificateSerial: string;
    };
  } = {},
): Promise<Fixture> {
  const runId = randomUUID().replaceAll('-', '').toUpperCase();
  const marker = `cfdi-reconciliation-${runId}`;
  const issuedAt = options.sandbox
    ? new Date()
    : new Date('2026-08-30T18:00:00.000Z');
  const certificateSerial =
    options.sandbox?.certificateSerial ?? CERTIFICATE_SERIAL;
  const certificateSubject = `CN=${marker}`;
  const providerReference = `${marker}:provider-document`;
  const recoveryUuid = randomUUID().toUpperCase();
  const quantity = new Prisma.Decimal(2);
  const unitValue = new Prisma.Decimal(50);
  const subtotal = quantity.mul(unitValue);
  const discount = new Prisma.Decimal(0);
  const taxableBase = subtotal.minus(discount);
  const taxRate = new Prisma.Decimal('0.16');
  const tax = taxableBase.mul(taxRate);
  const total = taxableBase.plus(tax);

  const location = await prisma.operationalLocation.create({
    data: {
      name: `${marker} location`,
      code: marker,
      type: OperationalLocationType.DISTRIBUTION_CENTER,
    },
  });
  const role = await prisma.role.create({
    data: { name: `${marker}:admin` },
  });
  const actor = await prisma.user.create({
    data: {
      name: `${marker} actor`,
      email: `${marker}@example.test`,
      controlNumber: marker,
      phone: marker,
      passwordHash: 'not-used-in-reconciliation-test',
      roleId: role.id,
      operationalLocationId: location.id,
    },
  });
  const legalEntity = options.sandbox
    ? await prisma.legalEntity.upsert({
        where: { taxId: options.sandbox.issuer.taxId },
        update: {},
        create: {
          ...options.sandbox.issuer,
          cfdiEnabled: true,
          defaultSeries: 'A',
          certificateSerialNumber: certificateSerial,
          certificateFingerprint: CERTIFICATE_FINGERPRINT,
          certificateSubject,
          certificateValidFrom: CERTIFICATE_VALID_FROM,
          certificateValidTo: CERTIFICATE_VALID_TO,
        },
      })
    : await createFixtureLegalEntity(prisma, runId, marker);
  const certificate = await prisma.fiscalCertificate.upsert({
    where: {
      legalEntityId_serialNumber: {
        legalEntityId: legalEntity.id,
        serialNumber: certificateSerial,
      },
    },
    update: {},
    create: {
      legalEntityId: legalEntity.id,
      serialNumber: certificateSerial,
      fingerprintSha256: CERTIFICATE_FINGERPRINT,
      subject: certificateSubject,
      validFrom: CERTIFICATE_VALID_FROM,
      validTo: CERTIFICATE_VALID_TO,
    },
  });
  const customer = await prisma.customer.create({
    data: {
      customerNumber: marker,
      name: `${marker} customer`,
      customerType: CustomerType.RETAIL,
      creditStatus: CreditStatus.ACTIVE,
      requiresBilling: true,
      fiscalName:
        options.sandbox?.receiver.fiscalName ?? 'RECEPTOR DE RECONCILIACION',
      taxId: options.sandbox?.receiver.taxId ?? `C2E${runId.slice(0, 10)}`,
      fiscalPostalCode: options.sandbox?.receiver.fiscalPostalCode ?? '64000',
      fiscalRegime: options.sandbox?.receiver.fiscalRegime ?? '601',
      fiscalUseCode: options.sandbox?.receiver.fiscalUseCode ?? 'G03',
      billingEmail: `${marker}-billing@example.test`,
    },
  });
  const product = await prisma.product.create({
    data: {
      name: `${marker} product`,
      sku: marker,
      presentationType: ProductPresentationType.KG,
      salePrice: unitValue,
      purchaseCost: new Prisma.Decimal(35),
      unit: ProductUnit.KG,
      satProductServiceCode: '10101504',
      satUnitCode: 'H87',
      taxObjectCode: '02',
      defaultTaxCode: '002',
      defaultFactorType: 'Tasa',
      defaultRateOrQuota: taxRate,
    },
  });
  const sale = await prisma.sale.create({
    data: {
      saleNumber: `${marker}:sale`,
      customerId: customer.id,
      userId: actor.id,
      locationId: location.id,
      legalEntityId: legalEntity.id,
      saleChannel: SaleChannel.COUNTER,
      documentType: SaleDocumentType.SIMPLE_NOTE,
      currencyCode: 'MXN',
      subtotal,
      discount,
      tax,
      total,
      paymentType: SalePaymentType.CASH_SALE,
      status: SaleStatus.CONFIRMED,
    },
  });
  const saleItem = await prisma.saleItem.create({
    data: {
      saleId: sale.id,
      productId: product.id,
      quantity,
      quantityKg: quantity,
      unit: ProductUnit.KG,
      unitPrice: unitValue,
      productNameSnapshot: product.name,
      productSkuSnapshot: product.sku,
      unitPriceSnapshot: unitValue,
      quantitySnapshot: quantity,
      subtotal,
      discount,
      taxableBase,
      tax,
      total,
      unitCostSnapshot: product.purchaseCost,
      costSubtotalSnapshot: quantity.mul(product.purchaseCost),
      costSnapshotSource: CostSnapshotSource.SALE_CONFIRMATION,
    },
  });
  const saleDocument = await prisma.saleDocument.create({
    data: {
      saleId: sale.id,
      documentType: SaleDocumentType.SIMPLE_NOTE,
      operationalLocationId: location.id,
      status: SaleDocumentStatus.ISSUED,
    },
  });
  const billingRequest = await prisma.billingRequest.create({
    data: {
      saleId: sale.id,
      customerId: customer.id,
      requestedByUserId: actor.id,
      reviewedByUserId: actor.id,
      reviewedAt: issuedAt,
      status: BillingRequestStatus.APPROVED,
      reason: `${marker} reconciliation fixture`,
    },
  });
  const requestDocument = await prisma.billingRequestSaleDocument.create({
    data: {
      billingRequestId: billingRequest.id,
      saleDocumentId: saleDocument.id,
      requestedSubtotal: taxableBase,
      requestedTax: tax,
      requestedTotal: total,
      createdByUserId: actor.id,
    },
  });
  await prisma.billingRequestSaleItem.create({
    data: {
      billingRequestSaleDocumentId: requestDocument.id,
      saleItemId: saleItem.id,
      requestedSubtotal: taxableBase,
      requestedTax: tax,
      requestedTotal: total,
    },
  });

  const priorRecoveryAttempts = options.priorRecoveryAttempts ?? 0;
  const { invoice, stampAttempt } = await prisma.$transaction(async (tx) => {
    const createdInvoice = await tx.invoice.create({
      data: {
        legalEntityId: legalEntity.id,
        sourceBillingRequestId: billingRequest.id,
        fiscalCertificateId: certificate.id,
        fiscalIdempotencyKey: `${marker}:stamp`,
        fiscalRequestHash: 'b'.repeat(64),
        currencyCode: 'MXN',
        exchangeRate: new Prisma.Decimal(1),
        series: 'A',
        folio: options.sandbox ? runId : marker,
        origin: InvoiceOrigin.NATIVE_CFDI,
        cfdiVersion: '4.0',
        cfdiType: CfdiDocumentType.INCOME,
        issuedAt,
        issuerSnapshot: {
          legalEntityId: legalEntity.id,
          legalName: legalEntity.legalName,
          taxId: legalEntity.taxId,
          fiscalPostalCode: options.sandbox?.issuer.fiscalPostalCode ?? '64000',
          fiscalRegime: options.sandbox?.issuer.fiscalRegime ?? '601',
          series: 'A',
          certificateSerialNumber: certificateSerial,
          certificateFingerprint: CERTIFICATE_FINGERPRINT,
        },
        receiverSnapshot: {
          customerId: customer.id,
          fiscalName: customer.fiscalName,
          taxId: customer.taxId,
          fiscalPostalCode: customer.fiscalPostalCode,
          fiscalRegime: customer.fiscalRegime,
          fiscalUseCode: customer.fiscalUseCode,
          billingEmail: customer.billingEmail,
        },
        fiscalSnapshotHash: 'c'.repeat(64),
        fiscalUseCode: customer.fiscalUseCode,
        exportCode: '01',
        paymentFormCode: '01',
        paymentMethodCode: 'PUE',
        fiscalStatus: InvoiceFiscalStatus.READY,
        cancellationStatus: FiscalCancellationStatus.NOT_REQUESTED,
        fiscalAttemptCount: 1,
        lastFiscalAttemptAt: issuedAt,
        subtotal,
        discount,
        tax,
        total,
        createdByUserId: actor.id,
        concepts: {
          create: {
            lineNumber: 1,
            sourceSaleItemId: saleItem.id,
            productServiceCode: '10101504',
            identificationNumber: marker,
            description: product.name,
            quantity,
            unitCode: 'H87',
            unitName: 'Kilogramo',
            unitValue,
            amount: subtotal,
            discount,
            taxObjectCode: '02',
            taxCode: '002',
            factorType: 'Tasa',
            rateOrQuota: taxRate,
            taxBase: taxableBase,
            taxAmount: tax,
            total,
            taxesSnapshot: {
              taxCode: '002',
              factorType: 'Tasa',
              rateOrQuota: taxRate.toFixed(6),
              base: taxableBase.toFixed(2),
              amount: tax.toFixed(2),
            },
            snapshotHash: 'f'.repeat(64),
          },
        },
      },
    });
    const invoiceDocument = await tx.invoiceSaleDocument.create({
      data: {
        invoiceId: createdInvoice.id,
        saleDocumentId: saleDocument.id,
        billingRequestSaleDocumentId: requestDocument.id,
        subtotalApplied: taxableBase,
        taxApplied: tax,
        totalApplied: total,
        createdByUserId: actor.id,
      },
    });
    await tx.invoiceSaleItemApplication.create({
      data: {
        invoiceSaleDocumentId: invoiceDocument.id,
        saleItemId: saleItem.id,
        subtotalApplied: taxableBase,
        taxApplied: tax,
        totalApplied: total,
        createdByUserId: actor.id,
      },
    });
    const createdStampAttempt = await tx.fiscalOperationAttempt.create({
      data: {
        invoiceId: createdInvoice.id,
        operation: FiscalOperationType.STAMP,
        status: options.sandbox
          ? FiscalOperationStatus.PROCESSING
          : FiscalOperationStatus.UNKNOWN,
        attemptNumber: 1,
        correlationId: `${marker}:stamp-correlation`,
        idempotencyKey: `${marker}:stamp`,
        requestHash: 'b'.repeat(64),
        providerKey: 'FACTURAMA',
        providerReference: options.sandbox ? null : providerReference,
        nextRetryAt: priorRecoveryAttempts > 0 ? issuedAt : null,
        startedAt: issuedAt,
        completedAt: options.sandbox ? null : issuedAt,
        errorCode: options.sandbox ? null : 'FISCAL_PROVIDER_TIMEOUT',
        errorMessage: options.sandbox ? null : 'FISCAL_PROVIDER_TIMEOUT',
      },
    });
    if (!options.sandbox)
      await tx.invoice.update({
        where: { id: createdInvoice.id },
        data: { fiscalStatus: InvoiceFiscalStatus.UNKNOWN },
      });

    for (
      let attemptNumber = 1;
      attemptNumber <= priorRecoveryAttempts;
      attemptNumber += 1
    ) {
      await tx.fiscalOperationAttempt.create({
        data: {
          invoiceId: createdInvoice.id,
          operation: FiscalOperationType.RECOVERY,
          status: FiscalOperationStatus.TERMINAL_FAILURE,
          attemptNumber,
          correlationId: `${marker}:recovery:${attemptNumber}`,
          idempotencyKey: `${marker}:recovery-key:${attemptNumber}`,
          requestHash: 'b'.repeat(64),
          providerKey: 'FACTURAMA',
          providerReference,
          startedAt: issuedAt,
          completedAt: issuedAt,
          errorCode: 'FISCAL_PROVIDER_TIMEOUT',
          errorMessage: 'FISCAL_PROVIDER_TIMEOUT',
        },
      });
    }

    return { invoice: createdInvoice, stampAttempt: createdStampAttempt };
  });

  let applicationId: string | undefined;
  if (options.includePaymentApplication) {
    const payment = await prisma.payment.create({
      data: {
        customerId: customer.id,
        userId: actor.id,
        amount: new Prisma.Decimal(116),
        currencyCode: 'MXN',
        fiscalPaymentFormCode: '01',
        paymentMethod: PaymentMethod.CASH,
        status: PaymentStatus.REGISTERED,
        paidAt: issuedAt,
      },
    });
    const receipt = await prisma.paymentReceipt.create({
      data: {
        invoiceId: invoice.id,
        totalPaymentsMxn: new Prisma.Decimal(116),
        snapshotHash: 'd'.repeat(64),
        createdByUserId: actor.id,
      },
    });
    const detail = await prisma.paymentReceiptDetail.create({
      data: {
        paymentReceiptId: receipt.id,
        paymentId: payment.id,
        paymentDate: issuedAt,
        paymentFormCode: '01',
        currencyCode: 'MXN',
        exchangeRateToMxn: new Prisma.Decimal(1),
        amount: new Prisma.Decimal(116),
        snapshotHash: 'e'.repeat(64),
      },
    });
    const application = await prisma.paymentInvoiceApplication.create({
      data: {
        paymentReceiptDetailId: detail.id,
        paymentId: payment.id,
        relatedInvoiceId: invoice.id,
        relatedUuid: recoveryUuid,
        relatedSeries: 'A',
        relatedFolio: marker,
        documentCurrencyCode: 'MXN',
        paymentMethodDr: '01',
        partialityNumber: 1,
        previousBalanceAmount: new Prisma.Decimal(116),
        amountPaid: new Prisma.Decimal(116),
        remainingBalance: new Prisma.Decimal(0),
        taxObjectCode: '02',
        snapshotHash: 'f'.repeat(64),
        status: PaymentInvoiceApplicationStatus.UNKNOWN,
      },
    });
    applicationId = application.id;
  }

  return {
    marker,
    billingRequestId: billingRequest.id,
    invoiceId: invoice.id,
    stampAttemptId: stampAttempt.id,
    providerReference,
    recoveryUuid,
    applicationId,
    ...(options.sandbox
      ? {
          prepared: {
            replayed: false,
            billingRequestId: billingRequest.id,
            invoiceId: invoice.id,
            attemptId: stampAttempt.id,
            correlationId: stampAttempt.correlationId,
            idempotencyKey: stampAttempt.idempotencyKey,
            actorUserId: actor.id,
            series: invoice.series,
            folio: invoice.folio,
            version: invoice.version,
            fiscalStatus: 'READY',
            operationStatus: 'PROCESSING',
            snapshot: {
              cfdiVersion: '4.0',
              cfdiType: 'INCOME',
              billingRequestId: billingRequest.id,
              billingRequestVersion: billingRequest.version,
              issuedAt: issuedAt.toISOString(),
              currencyCode: 'MXN',
              exchangeRate: '1.000000',
              exportCode: '01',
              paymentFormCode: '01',
              paymentMethodCode: 'PUE',
              sourceDocumentIds: [saleDocument.id],
              issuer:
                invoice.issuerSnapshot as unknown as CfdiDocumentSnapshot['issuer'],
              receiver:
                invoice.receiverSnapshot as unknown as CfdiDocumentSnapshot['receiver'],
              concepts: [
                {
                  lineNumber: 1,
                  sourceBillingRequestItemId: requestDocument.id,
                  sourceSaleItemId: saleItem.id,
                  sourceProductId: product.id,
                  productServiceCode: '10101504',
                  identificationNumber: marker,
                  description: product.name,
                  quantity: quantity.toFixed(6),
                  unitCode: 'H87',
                  unitValue: unitValue.toFixed(2),
                  amount: subtotal.toFixed(2),
                  discount: discount.toFixed(2),
                  taxableBase: taxableBase.toFixed(2),
                  taxObjectCode: '02',
                  taxCode: '002',
                  factorType: 'Tasa',
                  rateOrQuota: taxRate.toFixed(6),
                  taxAmount: tax.toFixed(2),
                  total: total.toFixed(2),
                  snapshotHash: 'f'.repeat(64),
                },
              ],
              totals: {
                subtotal: subtotal.toFixed(2),
                discount: discount.toFixed(2),
                taxableBase: taxableBase.toFixed(2),
                tax: tax.toFixed(2),
                total: total.toFixed(2),
              },
              snapshotHash: 'c'.repeat(64),
            },
          } satisfies PreparedCfdiIssuance,
        }
      : {}),
  };
}

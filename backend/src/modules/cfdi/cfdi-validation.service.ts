import { Injectable, Optional } from '@nestjs/common';
import { InvoiceStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CfdiDocumentBuilder } from './domain/cfdi-document-builder';
import { CfdiDomainError } from './domain/cfdi-domain.error';
import type {
  BuildApprovedRequestOptions,
  CfdiDocumentBuildInput,
  CfdiDocumentSnapshot,
} from './domain/cfdi-document.types';
import { SatCatalogService } from './sat-catalog.service';

const ZERO = new Prisma.Decimal(0);

const approvedRequestInclude = {
  customer: true,
  nativeInvoice: { select: { id: true } },
  documents: {
    where: { reversedAt: null },
    orderBy: { id: 'asc' as const },
    include: {
      saleDocument: {
        include: {
          sale: { include: { legalEntity: true } },
          invoiceDocuments: {
            include: { invoice: { select: { status: true } } },
          },
        },
      },
      requestedItems: {
        where: { reversedAt: null },
        orderBy: { id: 'asc' as const },
        include: {
          saleItem: {
            include: {
              product: true,
              invoiceApplications: {
                include: {
                  invoiceSaleDocument: {
                    include: { invoice: { select: { status: true } } },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.BillingRequestInclude;

type ApprovedRequestRecord = Prisma.BillingRequestGetPayload<{
  include: typeof approvedRequestInclude;
}>;

@Injectable()
export class CfdiValidationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly builder: CfdiDocumentBuilder,
    @Optional() private readonly satCatalogs?: SatCatalogService,
  ) {}

  async buildApprovedRequest(
    billingRequestId: string,
    options: BuildApprovedRequestOptions,
  ): Promise<CfdiDocumentSnapshot> {
    return this.buildApprovedRequestWithClient(
      this.prisma,
      billingRequestId,
      options,
    );
  }

  async buildApprovedRequestWithClient(
    client: Pick<Prisma.TransactionClient, 'billingRequest'>,
    billingRequestId: string,
    options: BuildApprovedRequestOptions,
  ): Promise<CfdiDocumentSnapshot> {
    const request = await client.billingRequest.findUnique({
      where: { id: billingRequestId },
      include: approvedRequestInclude,
    });
    if (!request)
      throw new CfdiDomainError('BILLING_REQUEST_NOT_FOUND', {
        billingRequestId,
      });
    if (request.status !== 'APPROVED')
      throw new CfdiDomainError('BILLING_REQUEST_NOT_APPROVED', {
        billingRequestId,
        status: request.status,
      });
    if (request.nativeInvoice)
      throw new CfdiDomainError('CFDI_ALREADY_EXISTS', {
        billingRequestId,
        invoiceId: request.nativeInvoice.id,
      });

    const snapshot = this.builder.build(this.toBuildInput(request, options));
    if (this.satCatalogs) await this.validateActiveCatalogs(snapshot);
    return snapshot;
  }

  private async validateActiveCatalogs(
    snapshot: CfdiDocumentSnapshot,
  ): Promise<void> {
    const required = new Map<string, Set<string>>();
    const add = (catalog: string, code: string) => {
      const codes = required.get(catalog) ?? new Set<string>();
      codes.add(code);
      required.set(catalog, codes);
    };

    add('c_TipoDeComprobante', 'I');
    add('c_UsoCFDI', snapshot.receiver.fiscalUseCode);
    add('c_FormaPago', snapshot.paymentFormCode);
    add('c_MetodoPago', snapshot.paymentMethodCode);
    add('c_Moneda', snapshot.currencyCode);
    add('c_RegimenFiscal', snapshot.issuer.fiscalRegime);
    add('c_RegimenFiscal', snapshot.receiver.fiscalRegime);
    add('c_CodigoPostal', snapshot.issuer.fiscalPostalCode);
    add('c_CodigoPostal', snapshot.receiver.fiscalPostalCode);
    for (const concept of snapshot.concepts) {
      add('c_ClaveProdServ', concept.productServiceCode);
      add('c_ClaveUnidad', concept.unitCode);
      add('c_ObjetoImp', concept.taxObjectCode);
      add('c_Impuesto', concept.taxCode);
      add('c_TasaOCuota', concept.rateOrQuota);
      add(
        'c_TipoDeComprobante',
        snapshot.cfdiType === 'INCOME' ? 'I' : snapshot.cfdiType,
      );
    }

    for (const [catalogKey, codes] of required) {
      for (const code of codes) {
        const catalog = await this.satCatalogs!.get(catalogKey, { code });
        if (!catalog.configured) {
          throw new CfdiDomainError('SAT_CATALOG_NOT_CONFIGURED', {
            catalogKey,
          });
        }
        if (!catalog.entries.some((entry) => entry.code === code)) {
          throw new CfdiDomainError('SAT_CATALOG_CODE_NOT_FOUND', {
            catalogKey,
            code,
          });
        }
      }
    }
  }

  private toBuildInput(
    request: ApprovedRequestRecord,
    options: BuildApprovedRequestOptions,
  ): CfdiDocumentBuildInput {
    if (!request.documents.length)
      throw new CfdiDomainError('EMPTY_BILLING_REQUEST', {
        billingRequestId: request.id,
      });

    const firstSale = request.documents[0]?.saleDocument.sale;
    const issuer = firstSale?.legalEntity;
    if (!issuer)
      throw new CfdiDomainError('MISSING_FISCAL_PROFILE', {
        scope: 'issuer',
      });

    return {
      request: {
        id: request.id,
        status: request.status,
        version: request.version,
        customerId: request.customerId,
      },
      issuedAt: options.issuedAt,
      customer: {
        id: request.customer.id,
        fiscalName: request.customer.fiscalName,
        taxId: request.customer.taxId,
        fiscalPostalCode: request.customer.fiscalPostalCode,
        fiscalRegime: request.customer.fiscalRegime,
        fiscalUseCode: options.cfdiUse ?? request.customer.fiscalUseCode,
        billingEmail: request.customer.billingEmail,
      },
      issuer: {
        id: issuer.id,
        isActive: issuer.isActive,
        cfdiEnabled: issuer.cfdiEnabled,
        legalName: issuer.legalName,
        taxId: issuer.taxId,
        fiscalPostalCode: issuer.fiscalPostalCode,
        fiscalRegime: issuer.fiscalRegime,
        defaultSeries: issuer.defaultSeries,
        certificateSerialNumber: issuer.certificateSerialNumber,
        certificateFingerprint: issuer.certificateFingerprint,
        certificateValidFrom: issuer.certificateValidFrom,
        certificateValidTo: issuer.certificateValidTo,
      },
      payment: options.payment,
      documents: request.documents.map((document) => {
        const sale = document.saleDocument.sale;
        const activeDocumentApplications =
          document.saleDocument.invoiceDocuments.filter(
            (application) =>
              !application.reversedAt &&
              application.invoice.status === InvoiceStatus.ACTIVE,
          );
        return {
          id: document.id,
          saleDocumentId: document.saleDocumentId,
          requestedSubtotal: document.requestedSubtotal,
          requestedTax: document.requestedTax,
          requestedTotal: document.requestedTotal,
          activeInvoicedSubtotal: sumDecimal(
            activeDocumentApplications.map(
              (application) => application.subtotalApplied,
            ),
          ),
          activeInvoicedTax: sumDecimal(
            activeDocumentApplications.map(
              (application) => application.taxApplied,
            ),
          ),
          activeInvoicedTotal: sumDecimal(
            activeDocumentApplications.map(
              (application) => application.totalApplied,
            ),
          ),
          sale: {
            id: sale.id,
            customerId: sale.customerId,
            currencyCode: sale.currencyCode,
            legalEntityId: sale.legalEntityId,
            subtotal: sale.subtotal,
            discount: sale.discount,
            tax: sale.tax,
            total: sale.total,
          },
          items: document.requestedItems.map((requestedItem) => {
            const saleItem = requestedItem.saleItem;
            const activeItemApplications = saleItem.invoiceApplications.filter(
              (application) =>
                !application.reversedAt &&
                !application.invoiceSaleDocument.reversedAt &&
                application.invoiceSaleDocument.invoice.status ===
                  InvoiceStatus.ACTIVE,
            );
            return {
              id: requestedItem.id,
              saleItemId: requestedItem.saleItemId,
              requestedSubtotal: requestedItem.requestedSubtotal,
              requestedTax: requestedItem.requestedTax,
              requestedTotal: requestedItem.requestedTotal,
              activeAppliedSubtotal: sumDecimal(
                activeItemApplications.map(
                  (application) => application.subtotalApplied,
                ),
              ),
              activeAppliedTax: sumDecimal(
                activeItemApplications.map(
                  (application) => application.taxApplied,
                ),
              ),
              activeAppliedTotal: sumDecimal(
                activeItemApplications.map(
                  (application) => application.totalApplied,
                ),
              ),
              source: {
                saleId: saleItem.saleId,
                productId: saleItem.productId,
                productNameSnapshot: saleItem.productNameSnapshot,
                productSkuSnapshot: saleItem.productSkuSnapshot,
                quantitySnapshot: saleItem.quantitySnapshot,
                unitPriceSnapshot: saleItem.unitPriceSnapshot,
                subtotal: saleItem.subtotal,
                discount: saleItem.discount,
                taxableBase: saleItem.taxableBase,
                tax: saleItem.tax,
                total: saleItem.total,
                productFiscalProfile: {
                  satProductServiceCode: saleItem.product.satProductServiceCode,
                  satUnitCode: saleItem.product.satUnitCode,
                  taxObjectCode: saleItem.product.taxObjectCode,
                  defaultTaxCode: saleItem.product.defaultTaxCode,
                  defaultFactorType: saleItem.product.defaultFactorType,
                  defaultRateOrQuota: saleItem.product.defaultRateOrQuota,
                },
              },
            };
          }),
        };
      }),
    };
  }
}

function sumDecimal(values: readonly Prisma.Decimal[]): Prisma.Decimal {
  return values.reduce((total, value) => total.plus(value), ZERO);
}

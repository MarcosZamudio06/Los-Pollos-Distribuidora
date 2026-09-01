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
import {
  isSatCfdiUseCompatibilityMetadata,
  isSatFiscalRegimeCompatibilityMetadata,
  type SatCfdiUseCatalogEntry,
  type SatFiscalRegimeCatalogEntry,
} from '../../../../shared/fiscal-catalog';
import { SatCatalogService } from './sat-catalog.service';
import { DEFAULT_APP_TIMEZONE } from '../../common/utils/civil-date-range';

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
            include: { invoice: { select: { id: true, status: true } } },
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
                    include: {
                      invoice: { select: { id: true, status: true } },
                    },
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

    const buildInput = this.toBuildInput(request, options);
    const compatibilityCatalog = this.satCatalogs
      ? await this.resolveReceiverCompatibilityCatalog(
          buildInput,
          options.issuedAt,
        )
      : undefined;
    const snapshot = this.builder.build({
      ...buildInput,
      ...(compatibilityCatalog
        ? { satFiscalCompatibilityCatalog: compatibilityCatalog }
        : {}),
    });
    if (this.satCatalogs) await this.validateActiveCatalogs(snapshot);
    return snapshot;
  }

  private async resolveReceiverCompatibilityCatalog(
    input: CfdiDocumentBuildInput,
    effectiveDate: Date,
  ) {
    const fiscalUseCode = input.customer.fiscalUseCode;
    const fiscalRegime = input.customer.fiscalRegime;
    if (!fiscalUseCode || !fiscalRegime) return undefined;

    const useCatalog = await this.satCatalogs!.get('c_UsoCFDI', {
      code: fiscalUseCode,
      asOf: effectiveDate,
    });
    if (!useCatalog.configured) {
      throw new CfdiDomainError('SAT_CATALOG_NOT_CONFIGURED', {
        catalogKey: 'c_UsoCFDI',
      });
    }
    const regimeCatalog = await this.satCatalogs!.get('c_RegimenFiscal', {
      code: fiscalRegime,
      asOf: effectiveDate,
    });
    if (!regimeCatalog.configured) {
      throw new CfdiDomainError('SAT_CATALOG_NOT_CONFIGURED', {
        catalogKey: 'c_RegimenFiscal',
      });
    }

    const useEntry = useCatalog.entries.find(
      (entry) => entry.code === fiscalUseCode.trim().toUpperCase(),
    );
    if (!useEntry) {
      throw new CfdiDomainError('SAT_CATALOG_CODE_NOT_FOUND', {
        catalogKey: 'c_UsoCFDI',
        code: fiscalUseCode,
      });
    }
    const regimeEntry = regimeCatalog.entries.find(
      (entry) => entry.code === fiscalRegime.trim(),
    );
    if (!regimeEntry) {
      throw new CfdiDomainError('SAT_CATALOG_CODE_NOT_FOUND', {
        catalogKey: 'c_RegimenFiscal',
        code: fiscalRegime,
      });
    }

    if (!isSatCfdiUseCompatibilityMetadata(useEntry.metadata)) {
      throw new CfdiDomainError('SAT_CATALOG_COMPATIBILITY_METADATA_INVALID', {
        catalogKey: 'c_UsoCFDI',
        code: useEntry.code,
      });
    }
    if (!isSatFiscalRegimeCompatibilityMetadata(regimeEntry.metadata)) {
      throw new CfdiDomainError('SAT_CATALOG_COMPATIBILITY_METADATA_INVALID', {
        catalogKey: 'c_RegimenFiscal',
        code: regimeEntry.code,
      });
    }

    const use: SatCfdiUseCatalogEntry = {
      code: useEntry.code,
      label: useEntry.description,
      appliesTo: useEntry.metadata.appliesTo,
      validFrom: useEntry.validFrom?.toISOString() ?? null,
      validTo: useEntry.validTo?.toISOString() ?? null,
      fiscalRegimes: useEntry.metadata.fiscalRegimes,
    };
    const regime: SatFiscalRegimeCatalogEntry = {
      code: regimeEntry.code,
      label: regimeEntry.description,
      appliesTo: regimeEntry.metadata.appliesTo,
      validFrom: regimeEntry.validFrom?.toISOString() ?? null,
      validTo: regimeEntry.validTo?.toISOString() ?? null,
    };
    return { cfdiUses: [use], fiscalRegimes: [regime] } as const;
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
    if (snapshot.globalInformation) {
      add('c_Periodicidad', snapshot.globalInformation.periodicity);
      add('c_Meses', snapshot.globalInformation.months);
    }
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
      ...(options.globalInformation
        ? { globalInformation: options.globalInformation }
        : {}),
      ...(options.substitution ? { substitution: options.substitution } : {}),
      documents: request.documents.map((document) => {
        const sale = document.saleDocument.sale;
        const activeDocumentApplications =
          document.saleDocument.invoiceDocuments.filter(
            (application) =>
              !application.reversedAt &&
              application.invoice.id !==
                (options.substitution?.originalInvoiceId ?? null) &&
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
          operationDate: this.operationDate(
            sale.businessDate,
            sale.registeredAt,
            sale.createdAt,
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
                application.invoiceSaleDocument.invoice.id !==
                  (options.substitution?.originalInvoiceId ?? null) &&
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

  private operationDate(
    businessDate: Date | null,
    registeredAt: Date | null,
    createdAt: Date,
  ): string {
    if (businessDate) return businessDate.toISOString().slice(0, 10);

    const value = registeredAt ?? createdAt;
    const timeZone = process.env.APP_TIMEZONE?.trim() || DEFAULT_APP_TIMEZONE;
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(value);
    const part = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((item) => item.type === type)?.value ?? '';
    return `${part('year')}-${part('month')}-${part('day')}`;
  }
}

function sumDecimal(values: readonly Prisma.Decimal[]): Prisma.Decimal {
  return values.reduce((total, value) => total.plus(value), ZERO);
}

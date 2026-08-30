import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import {
  isStructurallyValidFiscalRfc,
  isValidMexicanFiscalPostalCode,
  isValidSatCfdiUseCode,
  isValidSatFiscalRegime,
  missingCustomerFiscalProfileFields,
  normalizeFiscalTaxId,
} from '../../../../../shared/fiscal-catalog';
import {
  getLegalEntityCertificateValidationCode,
  missingLegalEntityFiscalProfileFields,
} from '../../../../../shared/legal-entity-fiscal-profile';
import {
  isValidSatProductFactorType,
  isValidSatProductServiceCode,
  isValidSatProductTaxCode,
  isValidSatProductTaxObjectCode,
  isValidSatUnitCode,
  missingProductFiscalProfileFields,
} from '../../../../../shared/product-fiscal-catalog';
import { CfdiDomainError } from './cfdi-domain.error';
import type {
  CfdiConceptSnapshot,
  CfdiDocumentBuildInput,
  CfdiDocumentSnapshot,
  CfdiSourceDocument,
  CfdiSourceItem,
} from './cfdi-document.types';

const ZERO = new Prisma.Decimal(0);
const ONE = new Prisma.Decimal(1);
const SAT_EXPORT_CODES = ['01', '02', '03', '04'] as const;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const money = (value: Prisma.Decimal) =>
  value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
const quantity = (value: Prisma.Decimal) =>
  value.toDecimalPlaces(6, Prisma.Decimal.ROUND_HALF_UP);
const moneyString = (value: Prisma.Decimal) => money(value).toFixed(2);
const decimalString = (value: Prisma.Decimal) => quantity(value).toFixed(6);

function sum(values: readonly Prisma.Decimal[]): Prisma.Decimal {
  return values.reduce((total, value) => total.plus(value), ZERO);
}

function sha256(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value))
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;

  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(object[key])}`)
    .join(',')}}`;
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) {
      deepFreeze(nested);
    }
  }
  return value;
}

function requireEquation(
  left: Prisma.Decimal,
  right: Prisma.Decimal,
  details: Readonly<Record<string, unknown>>,
): void {
  if (!money(left).equals(money(right))) {
    throw new CfdiDomainError('TOTAL_MISMATCH', details);
  }
}

@Injectable()
export class CfdiDocumentBuilder {
  build(input: CfdiDocumentBuildInput): CfdiDocumentSnapshot {
    this.validateHeader(input);
    if (!input.documents.length)
      throw new CfdiDomainError('EMPTY_BILLING_REQUEST');

    const currencyCode = input.documents[0].sale.currencyCode;
    this.validateComposition(input, currencyCode);
    this.validatePayment(input, currencyCode);
    this.validateSubstitution(input);

    const concepts: CfdiConceptSnapshot[] = [];
    for (const document of input.documents) {
      this.validateDocument(document);
      for (const item of document.items) {
        concepts.push(this.buildConcept(item, document, concepts.length + 1));
      }
      this.validateDocumentItemSums(document);
    }

    const subtotal = sum(
      concepts.map((concept) => new Prisma.Decimal(concept.amount)),
    );
    const discount = sum(
      concepts.map((concept) => new Prisma.Decimal(concept.discount)),
    );
    const taxableBase = sum(
      concepts.map((concept) => new Prisma.Decimal(concept.taxableBase)),
    );
    const tax = sum(
      concepts.map((concept) => new Prisma.Decimal(concept.taxAmount)),
    );
    const total = sum(
      concepts.map((concept) => new Prisma.Decimal(concept.total)),
    );

    requireEquation(subtotal.minus(discount), taxableBase, {
      scope: 'invoice-base',
    });
    requireEquation(taxableBase.plus(tax), total, {
      scope: 'invoice-total',
    });

    const snapshotWithoutHash = {
      cfdiVersion: '4.0' as const,
      cfdiType: 'INCOME' as const,
      billingRequestId: input.request.id,
      billingRequestVersion: input.request.version,
      issuedAt: input.issuedAt.toISOString(),
      currencyCode,
      exchangeRate: decimalString(input.payment.exchangeRate),
      exportCode: input.payment.exportCode,
      paymentFormCode: input.payment.paymentFormCode,
      paymentMethodCode: input.payment.paymentMethodCode,
      sourceDocumentIds: input.documents
        .map((document) => document.saleDocumentId)
        .sort(),
      ...(input.substitution
        ? {
            relationships: [
              {
                typeCode: '04' as const,
                relatedInvoiceId: input.substitution.originalInvoiceId.trim(),
                relatedUuid: input.substitution.originalUuid
                  .trim()
                  .toUpperCase(),
              },
            ],
          }
        : {}),
      issuer: {
        legalEntityId: input.issuer.id,
        legalName: input.issuer.legalName.trim(),
        taxId: normalizeFiscalTaxId(input.issuer.taxId),
        fiscalPostalCode: input.issuer.fiscalPostalCode!.trim(),
        fiscalRegime: input.issuer.fiscalRegime!.trim(),
        series: input.issuer.defaultSeries!.trim().toUpperCase(),
        certificateSerialNumber: input.issuer.certificateSerialNumber!.trim(),
        certificateFingerprint: input.issuer
          .certificateFingerprint!.trim()
          .toLowerCase(),
      },
      receiver: {
        customerId: input.customer.id,
        fiscalName: input.customer.fiscalName!.trim(),
        taxId: normalizeFiscalTaxId(input.customer.taxId!),
        fiscalPostalCode: input.customer.fiscalPostalCode!.trim(),
        fiscalRegime: input.customer.fiscalRegime!.trim(),
        fiscalUseCode: input.customer.fiscalUseCode!.trim().toUpperCase(),
        billingEmail: input.customer.billingEmail!.trim().toLowerCase(),
      },
      concepts,
      totals: {
        subtotal: moneyString(subtotal),
        discount: moneyString(discount),
        taxableBase: moneyString(taxableBase),
        tax: moneyString(tax),
        total: moneyString(total),
      },
    };

    return deepFreeze({
      ...snapshotWithoutHash,
      snapshotHash: sha256(snapshotWithoutHash),
    });
  }

  private validateHeader(input: CfdiDocumentBuildInput): void {
    if (input.request.status !== 'APPROVED')
      throw new CfdiDomainError('BILLING_REQUEST_NOT_APPROVED', {
        billingRequestId: input.request.id,
        status: input.request.status,
      });

    const customerMissing = missingCustomerFiscalProfileFields(input.customer);
    if (
      customerMissing.length ||
      !input.customer.taxId ||
      !isStructurallyValidFiscalRfc(input.customer.taxId) ||
      !input.customer.fiscalPostalCode ||
      !isValidMexicanFiscalPostalCode(input.customer.fiscalPostalCode) ||
      !input.customer.fiscalRegime ||
      !isValidSatFiscalRegime(input.customer.fiscalRegime)
    ) {
      throw new CfdiDomainError('MISSING_FISCAL_PROFILE', {
        scope: 'receiver',
        missingFields: customerMissing,
      });
    }

    if (
      !input.customer.fiscalUseCode ||
      !isValidSatCfdiUseCode(input.customer.fiscalUseCode)
    ) {
      throw new CfdiDomainError('INVALID_CFDI_USE', {
        fiscalUseCode: input.customer.fiscalUseCode,
      });
    }

    const issuerMissing = missingLegalEntityFiscalProfileFields(input.issuer);
    const certificateError = getLegalEntityCertificateValidationCode(
      input.issuer,
      input.issuedAt,
    );
    if (
      !input.issuer.isActive ||
      !input.issuer.cfdiEnabled ||
      issuerMissing.length ||
      !input.issuer.certificateFingerprint ||
      !/^[0-9a-f]{64}$/i.test(input.issuer.certificateFingerprint.trim()) ||
      certificateError
    ) {
      throw new CfdiDomainError('MISSING_FISCAL_PROFILE', {
        scope: 'issuer',
        missingFields: issuerMissing,
        certificateError,
      });
    }
  }

  private validateComposition(
    input: CfdiDocumentBuildInput,
    currencyCode: string,
  ): void {
    if (
      input.documents.some(
        (document) =>
          document.sale.customerId !== input.request.customerId ||
          document.sale.customerId !== input.customer.id,
      )
    ) {
      throw new CfdiDomainError('MIXED_CUSTOMERS');
    }
    if (
      input.documents.some(
        (document) => document.sale.currencyCode !== currencyCode,
      )
    ) {
      throw new CfdiDomainError('MIXED_CURRENCIES');
    }
    if (
      input.documents.some(
        (document) => document.sale.legalEntityId !== input.issuer.id,
      )
    ) {
      throw new CfdiDomainError('MIXED_LEGAL_ENTITIES');
    }
  }

  private validatePayment(
    input: CfdiDocumentBuildInput,
    currencyCode: string,
  ): void {
    const { payment } = input;
    const validMethod = ['PUE', 'PPD'].includes(payment.paymentMethodCode);
    const validForm = /^\d{2}$/.test(payment.paymentFormCode);
    const validExport = SAT_EXPORT_CODES.includes(
      payment.exportCode as (typeof SAT_EXPORT_CODES)[number],
    );
    const coherentMethod =
      (payment.paymentMethodCode === 'PUE' &&
        payment.paymentFormCode !== '99') ||
      (payment.paymentMethodCode === 'PPD' && payment.paymentFormCode === '99');
    const coherentExchangeRate =
      payment.exchangeRate.greaterThan(ZERO) &&
      (currencyCode !== 'MXN' || payment.exchangeRate.equals(ONE));

    if (
      !validMethod ||
      !validForm ||
      !validExport ||
      !coherentMethod ||
      !coherentExchangeRate
    ) {
      throw new CfdiDomainError('INVALID_PAYMENT_CONFIGURATION', {
        currencyCode,
        paymentMethodCode: payment.paymentMethodCode,
        paymentFormCode: payment.paymentFormCode,
      });
    }
  }

  private validateSubstitution(input: CfdiDocumentBuildInput): void {
    const substitution = input.substitution;
    if (!substitution) return;

    if (
      !substitution.originalInvoiceId.trim() ||
      !UUID.test(substitution.originalUuid.trim())
    ) {
      throw new CfdiDomainError('CFDI_SUBSTITUTION_INVALID', {
        originalInvoiceId: substitution.originalInvoiceId,
      });
    }
  }

  private validateDocument(document: CfdiSourceDocument): void {
    requireEquation(
      document.sale.subtotal.minus(document.sale.discount),
      document.sale.total.minus(document.sale.tax),
      { scope: 'sale-base', saleId: document.sale.id },
    );
    requireEquation(
      document.sale.subtotal
        .minus(document.sale.discount)
        .plus(document.sale.tax),
      document.sale.total,
      { scope: 'sale-total', saleId: document.sale.id },
    );
    requireEquation(
      document.requestedSubtotal.plus(document.requestedTax),
      document.requestedTotal,
      { scope: 'request-document', documentId: document.id },
    );
    if (
      document.requestedSubtotal.lessThan(ZERO) ||
      document.requestedTax.lessThan(ZERO) ||
      document.requestedTotal.lessThanOrEqualTo(ZERO) ||
      document.requestedSubtotal.greaterThan(
        document.sale.subtotal
          .minus(document.sale.discount)
          .minus(document.activeInvoicedSubtotal),
      ) ||
      document.requestedTax.greaterThan(
        document.sale.tax.minus(document.activeInvoicedTax),
      ) ||
      document.requestedTotal.greaterThan(
        document.sale.total.minus(document.activeInvoicedTotal),
      )
    ) {
      throw new CfdiDomainError('OVER_INVOICED', {
        scope: 'document',
        documentId: document.id,
      });
    }
    if (!document.items.length)
      throw new CfdiDomainError('EMPTY_BILLING_REQUEST', {
        documentId: document.id,
      });
  }

  private buildConcept(
    item: CfdiSourceItem,
    document: CfdiSourceDocument,
    lineNumber: number,
  ): CfdiConceptSnapshot {
    if (item.source.saleId !== document.sale.id)
      throw new CfdiDomainError('TOTAL_MISMATCH', {
        scope: 'sale-item-ownership',
        saleItemId: item.saleItemId,
      });

    requireEquation(
      item.source.quantitySnapshot.times(item.source.unitPriceSnapshot),
      item.source.subtotal,
      { scope: 'source-item-subtotal', saleItemId: item.saleItemId },
    );
    requireEquation(
      item.source.subtotal.minus(item.source.discount),
      item.source.taxableBase,
      { scope: 'source-item-base', saleItemId: item.saleItemId },
    );
    requireEquation(
      item.source.taxableBase.plus(item.source.tax),
      item.source.total,
      { scope: 'source-item-total', saleItemId: item.saleItemId },
    );
    requireEquation(
      item.requestedSubtotal.plus(item.requestedTax),
      item.requestedTotal,
      { scope: 'request-item', saleItemId: item.saleItemId },
    );

    if (
      item.requestedSubtotal.lessThanOrEqualTo(ZERO) ||
      item.requestedTax.lessThan(ZERO) ||
      item.requestedTotal.lessThanOrEqualTo(ZERO) ||
      item.requestedSubtotal.greaterThan(
        item.source.taxableBase.minus(item.activeAppliedSubtotal),
      ) ||
      item.requestedTax.greaterThan(
        item.source.tax.minus(item.activeAppliedTax),
      ) ||
      item.requestedTotal.greaterThan(
        item.source.total.minus(item.activeAppliedTotal),
      )
    ) {
      throw new CfdiDomainError('OVER_INVOICED', {
        scope: 'item',
        saleItemId: item.saleItemId,
      });
    }

    const profile = item.source.productFiscalProfile;
    const missingFields = missingProductFiscalProfileFields({
      ...profile,
      defaultRateOrQuota: profile.defaultRateOrQuota?.toString(),
    });
    if (
      missingFields.length ||
      !profile.satProductServiceCode ||
      !isValidSatProductServiceCode(profile.satProductServiceCode) ||
      !profile.satUnitCode ||
      !isValidSatUnitCode(profile.satUnitCode) ||
      !profile.taxObjectCode ||
      !isValidSatProductTaxObjectCode(profile.taxObjectCode) ||
      !profile.defaultTaxCode ||
      !isValidSatProductTaxCode(profile.defaultTaxCode) ||
      !profile.defaultFactorType ||
      !isValidSatProductFactorType(profile.defaultFactorType) ||
      !profile.defaultRateOrQuota ||
      profile.defaultRateOrQuota.lessThan(ZERO)
    ) {
      throw new CfdiDomainError('MISSING_PRODUCT_FISCAL_PROFILE', {
        productId: item.source.productId,
        missingFields,
      });
    }

    const ratio = item.requestedSubtotal.dividedBy(item.source.taxableBase);
    const allocatedQuantity = quantity(
      item.source.quantitySnapshot.times(ratio),
    );
    const allocatedDiscount = money(item.source.discount.times(ratio));
    const amount = money(item.requestedSubtotal.plus(allocatedDiscount));
    requireEquation(
      allocatedQuantity.times(item.source.unitPriceSnapshot),
      amount,
      { scope: 'allocated-item-subtotal', saleItemId: item.saleItemId },
    );

    const expectedTax =
      profile.defaultFactorType === 'Exento'
        ? ZERO
        : profile.defaultFactorType === 'Cuota'
          ? allocatedQuantity.times(profile.defaultRateOrQuota)
          : item.requestedSubtotal.times(profile.defaultRateOrQuota);
    requireEquation(expectedTax, item.requestedTax, {
      scope: 'item-tax',
      saleItemId: item.saleItemId,
    });

    const conceptWithoutHash = {
      lineNumber,
      sourceBillingRequestItemId: item.id,
      sourceSaleItemId: item.saleItemId,
      sourceProductId: item.source.productId,
      productServiceCode: profile.satProductServiceCode,
      identificationNumber: item.source.productSkuSnapshot,
      description: item.source.productNameSnapshot,
      quantity: decimalString(allocatedQuantity),
      unitCode: profile.satUnitCode,
      unitValue: decimalString(item.source.unitPriceSnapshot),
      amount: moneyString(amount),
      discount: moneyString(allocatedDiscount),
      taxableBase: moneyString(item.requestedSubtotal),
      taxObjectCode: profile.taxObjectCode,
      taxCode: profile.defaultTaxCode,
      factorType: profile.defaultFactorType,
      rateOrQuota: decimalString(profile.defaultRateOrQuota),
      taxAmount: moneyString(item.requestedTax),
      total: moneyString(item.requestedTotal),
    };
    return {
      ...conceptWithoutHash,
      snapshotHash: sha256(conceptWithoutHash),
    };
  }

  private validateDocumentItemSums(document: CfdiSourceDocument): void {
    requireEquation(
      sum(document.items.map((item) => item.requestedSubtotal)),
      document.requestedSubtotal,
      { scope: 'document-item-base', documentId: document.id },
    );
    requireEquation(
      sum(document.items.map((item) => item.requestedTax)),
      document.requestedTax,
      { scope: 'document-item-tax', documentId: document.id },
    );
    requireEquation(
      sum(document.items.map((item) => item.requestedTotal)),
      document.requestedTotal,
      { scope: 'document-item-total', documentId: document.id },
    );
  }
}

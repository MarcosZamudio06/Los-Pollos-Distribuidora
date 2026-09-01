import type { Prisma } from '@prisma/client';
import type { CfdiGlobalInformation } from '../../../../../shared/cfdi-global-information';
import type { SatFiscalCompatibilityCatalog } from '../../../../../shared/fiscal-catalog';

export interface CfdiPaymentConfiguration {
  exportCode: string;
  paymentFormCode: string;
  paymentMethodCode: string;
  exchangeRate: Prisma.Decimal;
}

export interface CfdiDocumentBuildInput {
  request: {
    id: string;
    status: string;
    version: number;
    customerId: string;
  };
  issuedAt: Date;
  customer: {
    id: string;
    fiscalName: string | null;
    taxId: string | null;
    fiscalPostalCode: string | null;
    fiscalRegime: string | null;
    fiscalUseCode: string | null;
    billingEmail: string | null;
  };
  issuer: {
    id: string;
    isActive: boolean;
    cfdiEnabled: boolean;
    legalName: string;
    taxId: string;
    fiscalPostalCode: string | null;
    fiscalRegime: string | null;
    defaultSeries: string | null;
    certificateSerialNumber: string | null;
    certificateFingerprint: string | null;
    certificateValidFrom: Date | null;
    certificateValidTo: Date | null;
  };
  payment: CfdiPaymentConfiguration;
  documents: CfdiSourceDocument[];
  /**
   * A versioned SAT projection resolved by CfdiValidationService. When it is
   * absent, the shared reviewed fallback is used by the pure builder.
   */
  satFiscalCompatibilityCatalog?: SatFiscalCompatibilityCatalog;
  globalInformation?: CfdiGlobalInformation;
  substitution?: CfdiSubstitutionBuildInput;
}

export interface CfdiSubstitutionBuildInput {
  readonly originalInvoiceId: string;
  readonly originalUuid: string;
}

export interface CfdiSourceDocument {
  id: string;
  saleDocumentId: string;
  requestedSubtotal: Prisma.Decimal;
  requestedTax: Prisma.Decimal;
  requestedTotal: Prisma.Decimal;
  activeInvoicedSubtotal: Prisma.Decimal;
  activeInvoicedTax: Prisma.Decimal;
  activeInvoicedTotal: Prisma.Decimal;
  operationDate?: string;
  sale: {
    id: string;
    customerId: string | null;
    currencyCode: string;
    legalEntityId: string | null;
    subtotal: Prisma.Decimal;
    discount: Prisma.Decimal;
    tax: Prisma.Decimal;
    total: Prisma.Decimal;
  };
  items: CfdiSourceItem[];
}

export interface CfdiSourceItem {
  id: string;
  saleItemId: string;
  requestedSubtotal: Prisma.Decimal;
  requestedTax: Prisma.Decimal;
  requestedTotal: Prisma.Decimal;
  activeAppliedSubtotal: Prisma.Decimal;
  activeAppliedTax: Prisma.Decimal;
  activeAppliedTotal: Prisma.Decimal;
  source: {
    saleId: string;
    productId: string;
    productNameSnapshot: string;
    productSkuSnapshot: string | null;
    quantitySnapshot: Prisma.Decimal;
    unitPriceSnapshot: Prisma.Decimal;
    subtotal: Prisma.Decimal;
    discount: Prisma.Decimal;
    taxableBase: Prisma.Decimal;
    tax: Prisma.Decimal;
    total: Prisma.Decimal;
    productFiscalProfile: {
      satProductServiceCode: string | null;
      satUnitCode: string | null;
      taxObjectCode: string | null;
      defaultTaxCode: string | null;
      defaultFactorType: string | null;
      defaultRateOrQuota: Prisma.Decimal | null;
    };
  };
}

export interface CfdiConceptSnapshot {
  readonly lineNumber: number;
  readonly sourceBillingRequestItemId: string;
  readonly sourceSaleItemId: string;
  readonly sourceProductId: string;
  readonly productServiceCode: string;
  readonly identificationNumber: string | null;
  readonly description: string;
  readonly quantity: string;
  readonly unitCode: string;
  readonly unitValue: string;
  readonly amount: string;
  readonly discount: string;
  readonly taxableBase: string;
  readonly taxObjectCode: string;
  readonly taxCode: string;
  readonly factorType: string;
  readonly rateOrQuota: string;
  readonly taxAmount: string;
  readonly total: string;
  readonly snapshotHash: string;
}

export interface CfdiDocumentSnapshot {
  readonly cfdiVersion: '4.0';
  readonly cfdiType: 'INCOME';
  readonly billingRequestId: string;
  readonly billingRequestVersion: number;
  readonly issuedAt: string;
  readonly currencyCode: string;
  readonly exchangeRate: string;
  readonly exportCode: string;
  readonly paymentFormCode: string;
  readonly paymentMethodCode: string;
  readonly sourceDocumentIds: readonly string[];
  readonly issuer: {
    readonly legalEntityId: string;
    readonly legalName: string;
    readonly taxId: string;
    readonly fiscalPostalCode: string;
    readonly fiscalRegime: string;
    readonly series: string;
    readonly certificateSerialNumber: string;
    readonly certificateFingerprint: string;
  };
  readonly receiver: {
    readonly customerId: string;
    readonly fiscalName: string;
    readonly taxId: string;
    readonly fiscalPostalCode: string;
    readonly fiscalRegime: string;
    readonly fiscalUseCode: string;
    readonly billingEmail: string;
  };
  readonly globalInformation?: Readonly<CfdiGlobalInformation>;
  readonly relationships?: readonly CfdiIncomeRelationshipSnapshot[];
  readonly concepts: readonly CfdiConceptSnapshot[];
  readonly totals: {
    readonly subtotal: string;
    readonly discount: string;
    readonly taxableBase: string;
    readonly tax: string;
    readonly total: string;
  };
  readonly snapshotHash: string;
}

export interface CfdiIncomeRelationshipSnapshot {
  readonly typeCode: '04';
  readonly relatedInvoiceId: string;
  readonly relatedUuid: string;
}

export interface CfdiPaymentReceiptApplicationSnapshot {
  readonly relatedInvoiceId: string;
  readonly relatedUuid: string;
  readonly relatedSeries: string | null;
  readonly relatedFolio: string | null;
  readonly documentCurrencyCode: string;
  readonly equivalenceDr: string;
  readonly paymentMethodDr: 'PPD';
  readonly partialityNumber: number;
  readonly previousBalanceAmount: string;
  readonly amountPaid: string;
  readonly remainingBalance: string;
  readonly taxObjectCode: string;
  readonly taxesSnapshot: readonly CfdiPaymentTaxSnapshot[] | null;
}

/**
 * Tax detail retained for Pagos 2.0. Values are strings so the snapshot and
 * provider boundary never reintroduce binary floating-point arithmetic.
 */
export interface CfdiPaymentTaxSnapshot {
  readonly taxCode: string;
  readonly factorType: string;
  readonly rateOrQuota: string;
  readonly base: string;
  readonly amount: string;
  readonly isRetention?: boolean;
}

export interface CfdiPaymentReceiptSnapshot {
  readonly cfdiVersion: '4.0';
  readonly cfdiType: 'PAYMENT_RECEIPT';
  readonly paymentId: string;
  readonly paymentReceiptId: string;
  readonly issuedAt: string;
  readonly currencyCode: 'XXX';
  readonly exchangeRate: '1.000000';
  readonly exportCode: '01';
  readonly paymentFormCode: null;
  readonly paymentMethodCode: null;
  readonly sourceDocumentIds: readonly string[];
  readonly issuer: {
    readonly legalEntityId: string;
    readonly legalName: string;
    readonly taxId: string;
    readonly fiscalPostalCode: string;
    readonly fiscalRegime: string;
    readonly series: string;
    readonly certificateSerialNumber: string;
    readonly certificateFingerprint: string;
  };
  readonly receiver: {
    readonly customerId: string;
    readonly fiscalName: string;
    readonly taxId: string;
    readonly fiscalPostalCode: string;
    readonly fiscalRegime: string;
    readonly fiscalUseCode: 'CP01';
    readonly billingEmail: string;
  };
  readonly payment: {
    readonly paidAt: string;
    readonly paymentFormCode: string;
    readonly currencyCode: string;
    readonly exchangeRateToMxn: string;
    readonly amount: string;
    readonly taxes?: readonly CfdiPaymentTaxSnapshot[];
    readonly relatedDocuments: readonly CfdiPaymentReceiptApplicationSnapshot[];
  };
  readonly concepts: readonly [];
  readonly totals: {
    readonly subtotal: '0.00';
    readonly discount: '0.00';
    readonly taxableBase: '0.00';
    readonly tax: '0.00';
    readonly total: '0.00';
  };
  readonly snapshotHash: string;
}

export interface CfdiCreditNoteRelationshipSnapshot {
  readonly typeCode: '01' | '03';
  readonly relatedInvoiceId: string;
  readonly relatedUuid: string;
}

export interface CfdiCreditNoteSnapshot {
  readonly cfdiVersion: '4.0';
  readonly cfdiType: 'CREDIT_NOTE';
  readonly creditAdjustmentId: string;
  readonly creditAdjustmentVersion: number;
  readonly issuedAt: string;
  readonly currencyCode: string;
  readonly exchangeRate: string;
  readonly exportCode: '01';
  readonly fiscalUseCode: 'G02';
  readonly paymentFormCode: string;
  readonly paymentMethodCode: 'PUE';
  readonly sourceDocumentIds: readonly string[];
  readonly issuer: CfdiDocumentSnapshot['issuer'];
  readonly receiver: Omit<CfdiDocumentSnapshot['receiver'], 'fiscalUseCode'> & {
    readonly fiscalUseCode: 'G02';
  };
  readonly relationships: readonly CfdiCreditNoteRelationshipSnapshot[];
  readonly concepts: readonly CfdiConceptSnapshot[];
  readonly totals: CfdiDocumentSnapshot['totals'];
  readonly snapshotHash: string;
}

export interface BuildApprovedRequestOptions {
  issuedAt: Date;
  payment: CfdiPaymentConfiguration;
  cfdiUse?: string;
  globalInformation?: CfdiGlobalInformation;
  substitution?: CfdiSubstitutionBuildInput;
}

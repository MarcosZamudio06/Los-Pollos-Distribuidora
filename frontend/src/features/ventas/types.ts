import type {
  Customer,
  CustomerCreditSummary,
  CustomerType,
} from "../clientes/types";
import type { OperationalUnit, ProductPresentation } from "../inventario/types";
import type { Money } from "../../../../shared/money";

export type MoneyValue = string | number;

export type PaymentType = "CASH_SALE" | "CREDIT_SALE";
export type PosTransactionState =
  | "EMPTY"
  | "CART_ACTIVE"
  | "WEIGHT_PENDING"
  | "CUSTOMER_REQUIRED"
  | "CREDIT_BLOCKED"
  | "PAYMENT_PENDING"
  | "READY_TO_CHARGE"
  | "PROCESSING"
  | "SUCCESS"
  | "BLOCKED";
export type PaymentMethod =
  "" | "CASH" | "CARD" | "TRANSFER" | "DEPOSIT" | "CHECK" | "VOUCHER" | "OTHER";
export type InitialPaymentReference = {
  bankName: string;
  referenceNumber: string;
  cardLastFour: string;
};
export type SalePaymentInput = {
  amount: MoneyValue;
  paymentMethod: PaymentMethod;
  cashTendered?: MoneyValue;
  bankName?: string;
  referenceNumber?: string;
  cardLastFour?: string;
};
export type SaleChannel =
  | "COUNTER"
  | "EXTERNAL_POINT_OF_SALE"
  | "ROUTE"
  | "INSTITUTIONAL"
  | "WHOLESALE";
export type SaleDocumentType =
  "SCALE_TICKET" | "SIMPLE_NOTE" | "LARGE_NOTE" | "INTERNAL_RECEIPT";
export type SaleStatus = "DRAFT" | "CONFIRMED" | "CANCELLED";
export type CollectionStatus =
  "UNPAID" | "PARTIALLY_PAID" | "PAID" | "CANCELLED";

export type CustomerOption = Pick<
  Customer,
  | "id"
  | "name"
  | "commercialName"
  | "customerNumber"
  | "customerType"
  | "creditStatus"
  | "creditLimit"
  | "isActive"
  | "active"
  | "isBlockedForCredit"
  | "effectiveCreditStatus"
  | "commercialPolicyId"
> & {
  creditSummary?: CustomerCreditSummary | null;
  customerType: CustomerType;
};

export type ProductOption = {
  id: string;
  name: string;
  categoryName?: string | null;
  sku?: string | null;
  barcode?: string | null;
  presentationType: ProductPresentation;
  unit: OperationalUnit;
  salePrice: MoneyValue;
  unitPrice: MoneyValue;
  locationId: string;
  locationName?: string | null;
  availableKg: number;
  availablePieces: number;
  isLowStock?: boolean;
  equivalentPolicyStatus?: string | null;
  unitEquivalentId?: string | null;
  equivalentFactor?: number | null;
  equivalentUnitFrom?: OperationalUnit | null;
  equivalentUnitTo?: OperationalUnit | null;
};

export type CartItem = ProductOption & {
  productId: string;
  quantityKg: number;
  quantityPieces: number;
};

export type CreateSaleItemPayload = {
  productId: string;
  presentationType: ProductPresentation;
  unit: OperationalUnit;
  quantityKg: number;
  quantityPieces: number;
  unitEquivalentId?: string;
};

export type CreateSalePayload = {
  customerId?: string;
  locationId: string;
  cashShiftId?: string;
  deviceId?: string;
  saleChannel: SaleChannel;
  documentType: SaleDocumentType;
  physicalFolio?: string;
  requiresAdministrativeInvoice: boolean;
  billingRequest?: {
    reason: string;
    notes?: string;
  };
  paymentType: PaymentType;
  payments?: Array<{
    amount: string;
    paymentMethod: Exclude<PaymentMethod, "">;
    cashTendered?: string;
    bankName?: string;
    referenceNumber?: string;
    cardLastFour?: string;
  }>;
  discountAuthorizationId?: string;
  commercialPolicyId?: string;
  administrativeOverrideReason?: string;
  items: CreateSaleItemPayload[];
};

export type BuildCreateSalePayloadInput = {
  administrativeOverrideReason?: string;
  billingRequestReason?: string;
  billingRequestNotes?: string;
  cart: CartItem[];
  customer: CustomerOption | null;
  documentType: SaleDocumentType;
  locationId: string;
  cashShiftId?: string;
  deviceId?: string;
  payments: SalePaymentInput[];
  paymentType: PaymentType;
  physicalFolio: string;
  requiresAdministrativeInvoice: boolean;
  saleChannel: SaleChannel;
  /** Legacy input retained while callers transition to the exact Money value. */
  total: Money | MoneyValue;
};

export type CreateSaleResponse = {
  creditWarnings?: string[];
  sale?: {
    id: string;
    saleNumber?: string;
    createdAt?: string;
    customerName?: string | null;
    documentType?: SaleDocumentType | string;
    subtotal?: number | string;
    discount?: number | string;
    tax?: number | string;
    total?: number | string;
    paymentType?: PaymentType | string;
    collectionStatus?: string;
    status?: string;
    locationId?: string;
    items?: Array<{
      productName?: string;
      productNameSnapshot?: string;
      sku?: string | null;
      unit?: string;
      quantityKg?: number | string | null;
      quantityPieces?: number | string | null;
      unitPrice?: number | string | null;
      subtotal?: number | string | null;
    }>;
    creditWarnings?: string[];
  };
  payment?: {
    id?: string;
    amount?: number | string;
    paymentMethod?: string;
    cashTendered?: number | string | null;
    changeGiven?: number | string | null;
    paidAt?: string | null;
  } | null;
  payments?: Array<{
    id?: string;
    amount?: number | string;
    paymentMethod?: string;
    cashTendered?: number | string | null;
    changeGiven?: number | string | null;
    paidAt?: string | null;
  }>;
  accountReceivable?: {
    id?: string;
    balance?: number | string;
    outstandingAmount?: number | string;
    dueDate?: string;
  } | null;
  billingRequest?: { id?: string; status?: string } | null;
  ticketId?: string | null;
  documents?: Array<{
    id?: string;
    documentType?: SaleDocumentType | string;
    status?: string;
  }> | null;
};

export type TicketData = {
  ticketId?: string;
  ticketNumber?: string;
  saleNumber?: string;
  createdAt?: string;
  documentType?: SaleDocumentType | string;
  physicalFolio?: string | null;
  requiresAdministrativeInvoice?: boolean;
  billingRequest?: { id?: string; status?: string } | null;
  sellerName?: string;
  customerName?: string | null;
  customerCommercialName?: string | null;
  customerNumber?: string | null;
  customerAddress?: string | null;
  customerPhone?: string | null;
  customerTaxId?: string | null;
  customerCreditDays?: number | null;
  locationId?: string;
  locationName?: string;
  items?: Array<{
    product?: string;
    productName?: string;
    sku?: string | null;
    unit?: string;
    kilos?: number | string | null;
    pieces?: number | string | null;
    quantityKg?: number | string | null;
    quantityPieces?: number | string | null;
    unitPrice?: number | string | null;
    subtotal?: number | string | null;
  }>;
  subtotal?: number | string | null;
  discount?: number | string | null;
  tax?: number | string | null;
  total?: number | string | null;
  paid?: number | string | null;
  outstanding?: number | string | null;
  dueDate?: string | null;
  paymentMethod?: string | null;
  templateVersion?: number;
  paymentType?: PaymentType | string;
  collectionStatus?: string;
  status?: string;
  payments?: Array<{
    amount?: number | string;
    paymentMethod?: string;
    cashTendered?: number | string | null;
    changeGiven?: number | string | null;
    paidAt?: string;
  }>;
  scaleTicket?: {
    physicalFolio?: string | null;
    capturedAt?: string | null;
    productName?: string | null;
    productUnit?: OperationalUnit | null;
    grossWeightKg?: number | string | null;
    tareWeightKg?: number | string | null;
    netWeightKg?: number | string | null;
    pieceCount?: number | null;
    unitPrice?: number | string | null;
    amount?: number | string | null;
    operatorName?: string | null;
  } | null;
  legend?: string;
};

export type PaymentsSummary = {
  totalPaid?: number | string | null;
  lastPaidAt?: string | null;
  methods?: PaymentMethod[] | string[];
};

export type SaleListItem = {
  id: string;
  saleNumber?: string;
  customerId?: string | null;
  customerName?: string | null;
  userId?: string;
  locationId?: string;
  saleChannel?: SaleChannel | string;
  documentType?: SaleDocumentType | string;
  physicalFolio?: string | null;
  requiresAdministrativeInvoice?: boolean;
  subtotal?: number | string | null;
  discount?: number | string | null;
  tax?: number | string | null;
  total?: number | string | null;
  paymentType?: PaymentType | string;
  collectionStatus?: CollectionStatus | string;
  status?: SaleStatus | string;
  createdAt?: string;
  accountReceivableId?: string | null;
  billingRequestId?: string | null;
  billingRequestStatus?: string | null;
  paymentsSummary?: PaymentsSummary;
  deliveredByUserId?: string | null;
  collectedByUserId?: string | null;
  printTemplateVersion?: number;
  customerSnapshot?: Record<string, unknown> | null;
  productSnapshot?: Record<string, unknown> | null;
  priceSnapshot?: Record<string, unknown> | null;
  routeId?: string | null;
  pointOfSaleDailyCloseId?: string | null;
};

export type SaleDocument = {
  id?: string;
  saleId?: string;
  documentType?: SaleDocumentType | string;
  physicalFolio?: string | null;
  status?: string;
  requiresAdministrativeInvoice?: boolean;
  operationalLocationId?: string;
  routeId?: string | null;
  deliveredByUserId?: string | null;
  collectedByUserId?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type SaleDetail = SaleListItem & {
  routePreview?: {
    id: string;
    name: string;
    geometry: { type: "LineString"; coordinates: [number, number][] } | null;
    mapAvailable: boolean;
    distanceMeters: number | null;
    durationSeconds: number | null;
    order: {
      latitude: number;
      longitude: number;
      stopSequence: number | null;
    } | null;
  } | null;
  items?: Array<{
    id?: string;
    productId?: string;
    productName?: string | null;
    unit?: string;
    quantityKg?: number | string | null;
    quantityPieces?: number | string | null;
    unitPrice?: number | string | null;
    unitEquivalentId?: string | null;
    appliedEquivalentFactor?: number | string | null;
    roundingMode?: string | null;
    subtotal?: number | string | null;
  }>;
  customer?: Record<string, unknown> | null;
  commercialPolicy?: Record<string, unknown> | null;
  accountReceivable?: Record<string, unknown> | null;
  billingRequest?: Record<string, unknown> | null;
  ticket?: SaleDocument | null;
  documents?: SaleDocument[];
  inventoryMovements?: Array<Record<string, unknown>>;
  version?: number;
};

export type ListSalesFilters = {
  page?: number;
  limit?: number;
  dateFrom?: string;
  dateTo?: string;
  userId?: string;
  customerId?: string;
  locationId?: string;
  status?: SaleStatus | "";
  paymentType?: PaymentType | "";
  collectionStatus?: CollectionStatus | "";
  saleChannel?: SaleChannel | "";
  documentType?: SaleDocumentType | "";
  physicalFolio?: string;
};

export type CancelSalePayload = {
  reason: string;
  expectedVersion: number;
};

export type SaleVoidPreview = {
  canExecute: boolean;
  blockers: Array<{ code: string; message: string }>;
  authorization: {
    requiredRole: string;
    authorizedBy: { id: string; name?: string | null; role: string };
  };
  sale: {
    id: string;
    saleNumber?: string;
    status?: string;
    version: number;
    total?: number | string | null;
    collectionStatus?: string;
  };
  payments: Array<{
    id: string;
    amount?: number | string | null;
    paymentMethod?: string;
    status?: string;
    paidAt?: string | null;
    version?: number;
  }>;
  inventory: Array<{
    productId: string;
    productName?: string | null;
    unit?: string | null;
    quantityKg?: number | string | null;
    quantityPieces?: number | null;
    locationId: string;
  }>;
  accountReceivable: {
    id: string;
    originalAmount?: number | string | null;
    outstandingAmount?: number | string | null;
    status?: string;
  } | null;
  documents: Array<{
    id: string;
    documentType?: string;
    physicalFolio?: string | null;
    status?: string;
    willCancel: boolean;
  }>;
  billingRequest: {
    id: string;
    status?: string;
    willCancel: boolean;
  } | null;
};

export type VoidSaleResponse = {
  sale?: SaleDetail;
  payments?: Array<Record<string, unknown>>;
  inventoryMovements?: Array<Record<string, unknown>>;
  accountReceivable?: Record<string, unknown> | null;
  documents?: SaleDocument[];
  billingRequest?: Record<string, unknown> | null;
  authorization?: {
    authorizedBy: { id: string; name?: string | null; role: string };
    reason: string;
    authorizedAt: string;
  };
};

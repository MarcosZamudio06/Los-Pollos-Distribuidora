import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {
  AgingStatus,
  BillingRequestStatus,
  CollectionStatus,
  CreditStatus,
  EquivalentStatus,
  InventoryMovementType,
  InvoiceStatus,
  OperationalLocationType,
  PaymentMethod,
  PaymentStatus,
  PointOfSaleDailyCloseStatus,
  Prisma,
  ProductUnit,
  RouteSettlementStatus,
  SaleChannel,
  SaleDocumentStatus,
  SaleDocumentType,
  SalePaymentType,
  SaleStatus,
  type AccountReceivable,
  type Payment,
} from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { InventoryBalanceService } from '../inventory/inventory-balance.service';
import { PointOfSaleDailyCloseService } from '../point-of-sale-daily-close/point-of-sale-daily-close.service';
import { acquireDraftDailyCloseLifecycleLock } from '../point-of-sale-daily-close/daily-close-lifecycle-lock';
import {
  CancelSaleDto,
  CreateSaleDto,
  CreateSaleItemDto,
  CreateSalePaymentDto,
  ListBranchOrdersQueryDto,
  ListSalesQueryDto,
  VoidSaleDto,
} from './dto';
import { evaluateCreditDecision } from './credit-decision';
import { SalesRealtimeService } from './sales-realtime.service';

function stringifyValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object' && value !== null) {
    return Object.prototype.toString.call(value) as string;
  }
  if (typeof value === 'string') return value;
  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint' ||
    typeof value === 'symbol'
  ) {
    return value.toString();
  }
  return '';
}
import { Money, toMoneyString } from '../../../../shared/money';

type Actor = Pick<AuthenticatedUser, 'id' | 'role' | 'operationalLocationId'> &
  Partial<Pick<AuthenticatedUser, 'name'>>;
type DecimalLike = Prisma.Decimal | number | string | null | undefined;

type SaleProductUnitEquivalent = {
  id: string;
  unitFrom: ProductUnit;
  unitTo: ProductUnit;
  factor: DecimalLike;
  roundingMode?: string | null;
  effectiveFrom?: Date | null;
  effectiveTo?: Date | null;
  status: EquivalentStatus;
};

type SaleProduct = {
  id: string;
  name: string;
  sku?: string | null;
  unit: ProductUnit;
  salePrice: DecimalLike;
  purchaseCost: DecimalLike;
  isActive: boolean;
  unitEquivalents?: SaleProductUnitEquivalent[];
};

type CustomerCredit = {
  id: string;
  name?: string | null;
  commercialName?: string | null;
  customerNumber?: string | null;
  customerType?: string | null;
  address?: string | null;
  phone?: string | null;
  taxId?: string | null;
  isActive: boolean;
  creditStatus: CreditStatus;
  creditLimit?: DecimalLike;
  creditDays?: number | null;
  commercialPolicyId?: string | null;
};

type PreparedItem = {
  product: SaleProduct;
  unitEquivalentId: string | null;
  quantityKg: number;
  quantityPieces: number;
  billableQuantityKg: number;
  unitPrice: Money;
  subtotal: Money;
  equivalentFactor: number | null;
  roundingMode: string | null;
};

type DiscountAuthorization = {
  id: string;
  commercialPolicyId: string;
  authorizedForUserId?: string | null;
  maximumPercentage: DecimalLike;
  reason: string;
  evidence: string;
  expiresAt?: Date | null;
  usedAt?: Date | null;
  commercialPolicy: {
    id: string;
    isActive: boolean;
    effectiveFrom?: Date | null;
    effectiveTo?: Date | null;
    maximumDiscountPercentage: DecimalLike;
  };
};

type CreatedPayment = Awaited<
  ReturnType<Prisma.TransactionClient['payment']['create']>
>;
type CreatedReceivable = Awaited<
  ReturnType<Prisma.TransactionClient['accountReceivable']['create']>
>;
type CreatedMovement = Awaited<
  ReturnType<Prisma.TransactionClient['inventoryMovement']['create']>
>;
type MovementResponseInput = Record<string, unknown> & {
  quantity?: DecimalLike;
  quantityKg?: DecimalLike;
  previousStock?: DecimalLike;
  newStock?: DecimalLike;
  previousQuantityKg?: DecimalLike;
  newQuantityKg?: DecimalLike;
};

type SalePaymentSummaryInput = {
  amount: DecimalLike;
  cashTendered?: DecimalLike;
  changeGiven?: DecimalLike;
  paymentMethod: string;
  paidAt?: Date | string | null;
  status?: PaymentStatus;
  saleId?: string | null;
  accountReceivableId?: string | null;
};

type SaleListRecord = Record<string, unknown> & {
  customer?: {
    id: string;
    name: string;
    address?: string | null;
    phone?: string | null;
    taxId?: string | null;
    creditDays?: number | null;
  } | null;
  accountReceivable?: { id: string } | null;
  billingRequest?: { id: string; status?: BillingRequestStatus } | null;
  billingRequests?: Array<{ id: string; status?: BillingRequestStatus }>;
  payments?: SalePaymentSummaryInput[];
};

type SaleDetailRecord = SaleListRecord & {
  items?: Array<
    Record<string, unknown> & { productNameSnapshot?: string | null }
  >;
  commercialPolicy?: Record<string, unknown> | null;
  documents?: Record<string, unknown>[];
  inventoryMovements?: Record<string, unknown>[];
  route?: {
    id: string;
    name: string;
    optimizationStatus?: string | null;
    geometry?: Prisma.JsonValue | null;
    distanceMeters?: number | null;
    durationSeconds?: number | null;
  } | null;
  deliveryOrder?: {
    latitude?: DecimalLike;
    longitude?: DecimalLike;
    stopSequence?: number | null;
  } | null;
};

type BranchOrderRecord = {
  id: string;
  saleNumber: string;
  createdAt: Date;
  total: DecimalLike;
  status: SaleStatus;
  customer: { id: string; name: string } | null;
  location: { id: string; name: string };
  items: Array<{
    id: string;
    productId: string;
    productNameSnapshot: string;
    unit: ProductUnit;
    quantityKg: DecimalLike;
    quantityPieces: number | null;
  }>;
};

type SaleDocumentListRecord = Record<string, unknown> & {
  id: string;
  saleId: string;
  documentType: SaleDocumentType;
  operationalLocationId?: string | null;
  pointOfSaleDailyCloseId?: string | null;
  physicalFolio?: string | null;
  status: SaleDocumentStatus;
  requiresAdministrativeInvoice: boolean;
  deliveredByUserId?: string | null;
  collectedByUserId?: string | null;
  routeId?: string | null;
  printTemplateVersion?: number;
  customerSnapshot?: Record<string, unknown> | null;
  productSnapshot?: Record<string, unknown> | null;
  priceSnapshot?: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
};

type SaleDocumentPrintRecord = SaleDocumentListRecord & {
  printTemplateVersion: number;
  sale?: {
    payments: SalePaymentSummaryInput[];
  } | null;
  scaleTicketReferences?: Array<{
    physicalFolio: string;
    capturedAt: Date;
    grossWeightKg?: DecimalLike;
    tareWeightKg?: DecimalLike;
    netWeightKg?: DecimalLike;
    weightKg?: DecimalLike;
    pieceCount?: number | null;
    unitPrice?: DecimalLike;
    amount?: DecimalLike;
    capturedBy?: { name: string } | null;
  }>;
};

type SaleTicketRecord = SaleListRecord & {
  user?: { id: string; name: string } | null;
  location?: { id: string; name: string } | null;
  documents?: Record<string, unknown>[];
  items?: Array<
    Record<string, unknown> & { productNameSnapshot?: string | null }
  >;
  scaleTicketReferences?: Array<{
    saleDocumentId?: string | null;
    physicalFolio: string;
    capturedAt: Date;
    grossWeightKg?: DecimalLike;
    tareWeightKg?: DecimalLike;
    netWeightKg?: DecimalLike;
    weightKg?: DecimalLike;
    pieceCount?: number | null;
    unitPrice?: DecimalLike;
    amount?: DecimalLike;
    product?: { name: string; unit: string } | null;
    capturedBy?: { name: string } | null;
  }>;
};

type SaleCancellationRecord = Record<string, unknown> & {
  id: string;
  userId: string;
  locationId: string;
  status: SaleStatus;
  version: number;
  cancellationIdempotencyKey?: string | null;
  cancellationPayloadHash?: string | null;
  collectionStatus?: CollectionStatus;
  paymentType: SalePaymentType;
  pointOfSaleDailyClose?: {
    id?: string;
    status: PointOfSaleDailyCloseStatus;
    version?: number;
    businessDate?: Date;
  } | null;
  payments?: Array<Payment & { version: number }>;
  route?: {
    id?: string;
    name?: string;
    settlement?: {
      id?: string;
      status: RouteSettlementStatus;
      version?: number;
    } | null;
  } | null;
  inventoryMovements?: Array<Record<string, unknown>>;
  documents?: Array<
    SaleDocumentListRecord & {
      invoiceDocuments?: Array<{
        id: string;
        reversedAt?: Date | null;
        invoice?: { id: string; status: InvoiceStatus } | null;
      }>;
    }
  >;
  billingRequests?: Array<{
    id: string;
    status: BillingRequestStatus;
    version: number;
    reason?: string | null;
    notes?: string | null;
  }>;
  accountReceivable?:
    | (Record<string, unknown> & {
        id: string;
        originalAmount: DecimalLike;
        outstandingAmount: DecimalLike;
        status: CollectionStatus;
        payments?: Array<Payment & { version: number }>;
      })
    | null;
  items?: Array<{
    id: string;
    productId: string;
    quantity?: DecimalLike;
    quantityKg?: DecimalLike;
    quantityPieces?: number | null;
    productNameSnapshot?: string | null;
    unit?: ProductUnit;
  }>;
};

type SaleVoidBlocker = {
  code: string;
  message: string;
};

type SaleVoidPreviewRecord = SaleCancellationRecord & {
  saleNumber: string;
  total: DecimalLike;
};

const saleVoidInclude = {
  items: true,
  payments: { orderBy: { paidAt: 'asc' as const } },
  accountReceivable: {
    include: {
      payments: { orderBy: { paidAt: 'asc' as const } },
    },
  },
  pointOfSaleDailyClose: {
    select: { id: true, status: true, version: true, businessDate: true },
  },
  route: {
    select: {
      id: true,
      name: true,
      settlement: { select: { id: true, status: true, version: true } },
    },
  },
  documents: {
    orderBy: { createdAt: 'asc' as const },
    include: {
      invoiceDocuments: {
        where: { reversedAt: null },
        include: { invoice: { select: { id: true, status: true } } },
      },
    },
  },
  billingRequests: {
    orderBy: { requestedAt: 'desc' as const },
    take: 1,
    select: {
      id: true,
      status: true,
      version: true,
      reason: true,
      notes: true,
    },
  },
  inventoryMovements: {
    where: { type: InventoryMovementType.CANCEL_SALE },
    orderBy: { createdAt: 'asc' as const },
  },
} satisfies Prisma.SaleInclude;

const saleChannelLocationTypes: Record<
  SaleChannel,
  ReadonlySet<OperationalLocationType>
> = {
  [SaleChannel.COUNTER]: new Set([
    OperationalLocationType.BRANCH,
    OperationalLocationType.MIXED,
    OperationalLocationType.EXTERNAL_POINT_OF_SALE,
  ]),
  [SaleChannel.EXTERNAL_POINT_OF_SALE]: new Set([
    OperationalLocationType.EXTERNAL_POINT_OF_SALE,
  ]),
  [SaleChannel.ROUTE]: new Set([OperationalLocationType.ROUTE_STOCK]),
  [SaleChannel.INSTITUTIONAL]: new Set([
    OperationalLocationType.BRANCH,
    OperationalLocationType.MIXED,
  ]),
  [SaleChannel.WHOLESALE]: new Set([
    OperationalLocationType.BRANCH,
    OperationalLocationType.MIXED,
  ]),
};

@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly balanceService: InventoryBalanceService,
    private readonly dailyCloseService: PointOfSaleDailyCloseService,
    @Optional() private readonly salesRealtime?: SalesRealtimeService,
  ) {}

  async findAll(query: ListSalesQueryDto = {}, currentUser: Actor) {
    const sales = (await this.prisma.sale.findMany({
      where: this.buildVisibleSalesWhere(query, currentUser),
      include: {
        customer: { select: { id: true, name: true } },
        accountReceivable: { select: { id: true } },
        billingRequests: {
          select: { id: true, status: true },
          orderBy: { requestedAt: 'desc' },
          take: 1,
        },
        payments: {
          where: { status: PaymentStatus.APPLIED },
          orderBy: { paidAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
      ...this.buildPagination(query),
    })) as SaleListRecord[];

    return { items: sales.map((sale) => this.toSaleListItem(sale)) };
  }

  async findBranchOrders(query: ListBranchOrdersQueryDto, currentUser: Actor) {
    await this.assertBranchOrderLocationAccess(query.locationId, currentUser);
    const orders = await this.prisma.sale.findMany({
      where: {
        locationId: query.locationId,
        status: SaleStatus.CONFIRMED,
        ...(query.dateFrom || query.dateTo
          ? {
              createdAt: {
                ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
                ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
              },
            }
          : {}),
        ...(query.saleChannel ? { saleChannel: query.saleChannel } : {}),
        ...(query.paymentType ? { paymentType: query.paymentType } : {}),
      },
      include: {
        customer: { select: { id: true, name: true } },
        location: { select: { id: true, name: true } },
        items: {
          select: {
            id: true,
            productId: true,
            productNameSnapshot: true,
            unit: true,
            quantityKg: true,
            quantityPieces: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: query.limit ?? 50,
    });

    return {
      items: (orders as BranchOrderRecord[]).map((order) =>
        this.toBranchOrder(order),
      ),
    };
  }

  async findOne(id: string, currentUser: Actor) {
    const sale = (await this.prisma.sale.findFirst({
      where: this.buildVisibleSaleDetailWhere(id, currentUser),
      include: {
        customer: true,
        commercialPolicy: true,
        accountReceivable: true,
        billingRequests: { orderBy: { requestedAt: 'desc' }, take: 1 },
        documents: { orderBy: { createdAt: 'desc' } },
        inventoryMovements: { orderBy: { createdAt: 'asc' } },
        payments: {
          where: { status: PaymentStatus.APPLIED },
          orderBy: { paidAt: 'desc' },
        },
        items: true,
        route: {
          select: {
            id: true,
            name: true,
            optimizationStatus: true,
            geometry: true,
            distanceMeters: true,
            durationSeconds: true,
          },
        },
        deliveryOrder: {
          select: { latitude: true, longitude: true, stopSequence: true },
        },
      },
    })) as SaleDetailRecord | null;

    if (!sale) {
      throw new NotFoundException('Sale not found');
    }

    return this.toSaleDetail(sale);
  }

  async getTicket(id: string, currentUser: Actor) {
    const sale = (await this.prisma.sale.findFirst({
      where: this.buildVisibleSaleDetailWhere(id, currentUser),
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            address: true,
            phone: true,
            taxId: true,
            creditDays: true,
          },
        },
        user: { select: { id: true, name: true } },
        location: { select: { id: true, name: true } },
        documents: { orderBy: { createdAt: 'desc' } },
        payments: {
          where: { status: PaymentStatus.APPLIED },
          orderBy: { paidAt: 'desc' },
        },
        items: true,
        scaleTicketReferences: {
          include: {
            product: { select: { name: true, unit: true } },
            capturedBy: { select: { name: true } },
          },
          orderBy: { capturedAt: 'desc' },
        },
      },
    })) as SaleTicketRecord | null;

    if (!sale) {
      throw new NotFoundException('Sale not found');
    }

    return this.toSaleTicket(sale);
  }

  async getDocumentPrint(
    saleId: string,
    documentId: string,
    currentUser: Actor,
  ) {
    const document = (await this.prisma.saleDocument.findFirst({
      where: {
        id: documentId,
        saleId,
        sale: { is: this.buildVisibleSaleDetailWhere(saleId, currentUser) },
      },
      include: {
        sale: {
          select: {
            payments: {
              where: { status: PaymentStatus.APPLIED },
              orderBy: { paidAt: 'asc' },
            },
          },
        },
        scaleTicketReferences: {
          include: { capturedBy: { select: { name: true } } },
          orderBy: { capturedAt: 'desc' },
        },
      },
    })) as SaleDocumentPrintRecord | null;

    if (!document) {
      throw new NotFoundException('Sale document not found');
    }

    return this.toSaleDocumentPrint(document);
  }

  async create(dto: CreateSaleDto, currentUser: Actor, idempotencyKey: string) {
    if (!dto.items?.length) {
      throw new BadRequestException('Sale must contain at least one item');
    }
    this.assertOverrideIntent(dto, currentUser);
    this.assertLocationAccess(dto, currentUser);
    const payments = this.resolvePayments(dto);

    const payloadHash = this.hashPayload(dto);

    const outcome = await this.withSerializableRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          const existingSale = await tx.sale.findUnique({
            where: { idempotencyKey },
            include: {
              items: true,
              payments: true,
              accountReceivable: true,
              billingRequests: { orderBy: { requestedAt: 'desc' }, take: 1 },
              inventoryMovements: true,
              documents: true,
            },
          });

          if (existingSale) {
            this.assertIdempotentReplayAccess(existingSale, currentUser);
            if (existingSale.idempotencyPayloadHash !== payloadHash) {
              throw new ConflictException(
                'Idempotency-Key was already used for a different sale payload',
              );
            }

            const existingBillingState =
              existingSale as unknown as SaleListRecord;
            return {
              created: false,
              response: {
                sale: this.toSaleResponse(existingSale, currentUser),
                payments: existingSale.payments.map((payment) =>
                  this.toPaymentResponse(payment),
                ),
                // Deprecated compatibility field. New consumers must use payments.
                payment: existingSale.payments[0]
                  ? this.toPaymentResponse(existingSale.payments[0])
                  : null,
                accountReceivable: existingSale.accountReceivable
                  ? this.toReceivableResponse(existingSale.accountReceivable)
                  : null,
                billingRequest:
                  existingSale.billingRequests?.[0] ??
                  existingBillingState.billingRequest ??
                  null,
                inventoryMovements: existingSale.inventoryMovements.map(
                  (movement) => this.toMovementResponse(movement),
                ),
                documents: (existingSale.documents ?? []).map((document) =>
                  this.toSaleDocumentResponse(
                    document as SaleDocumentListRecord,
                  ),
                ),
              },
            };
          }
          const location = await tx.operationalLocation.findUnique({
            where: { id: dto.locationId },
          });
          if (!location?.isActive) {
            throw new NotFoundException('Operational location not found');
          }

          this.assertLocationMatchesSaleChannel(dto, location.type);
          let cashShift = await this.resolveCashShift(
            tx,
            dto,
            location.id,
            currentUser,
            { allowNonDraftClose: true },
          );
          if (cashShift?.pointOfSaleDailyCloseId) {
            await acquireDraftDailyCloseLifecycleLock(
              tx,
              cashShift.pointOfSaleDailyCloseId,
            );
            cashShift = await this.resolveCashShift(
              tx,
              dto,
              location.id,
              currentUser,
            );
          }
          const dailyCloseId = cashShift?.pointOfSaleDailyCloseId ?? null;

          const customer = dto.customerId
            ? ((await tx.customer.findUnique({
                where: { id: dto.customerId },
              })) as CustomerCredit | null)
            : null;

          if (dto.customerId && !customer?.isActive) {
            throw new NotFoundException('Customer not found');
          }

          this.assertBillingRequestInput(dto, customer);

          const preparedItems = await this.prepareItems(tx, dto.items);
          const subtotal = Money.sum(
            preparedItems.map((item) => item.subtotal),
          );
          const discountAuthorization = await this.resolveDiscountAuthorization(
            tx,
            dto,
            customer,
            currentUser,
          );
          const discountPercentage = discountAuthorization
            ? toMoneyString(discountAuthorization.maximumPercentage)
            : '0.00';
          const discount = subtotal.percentage(discountPercentage);
          const total = subtotal.subtract(discount);
          const totalPaid = Money.sum(
            payments.map((payment) => payment.amount),
          );

          this.assertPaymentRules(dto, customer, total, payments, totalPaid);

          const outstandingAmount = total.subtract(totalPaid);
          if (outstandingAmount.isPositive() && !customer) {
            throw new BadRequestException(
              'customerId is required when sale leaves an outstanding balance',
            );
          }
          if (
            dto.administrativeOverrideReason !== undefined &&
            (dto.paymentType !== SalePaymentType.CREDIT_SALE ||
              !outstandingAmount.isPositive() ||
              !customer)
          ) {
            throw new BadRequestException({
              code: 'CREDIT_OVERRIDE_NOT_APPLICABLE',
              message: 'Administrative override is not applicable to this sale',
            });
          }

          let creditDecision: Awaited<
            ReturnType<typeof evaluateCreditDecision>
          > | null = null;
          if (
            outstandingAmount.isPositive() &&
            customer &&
            dto.paymentType === SalePaymentType.CREDIT_SALE
          ) {
            creditDecision = await evaluateCreditDecision(tx, {
              customer,
              newOutstandingAmount: outstandingAmount.toString(),
              actor: currentUser,
              policyId: this.normalizeOptionalText(
                dto.commercialPolicyId ?? customer.commercialPolicyId,
              ),
              overrideReason: dto.administrativeOverrideReason,
            });
          }

          if (discountAuthorization) {
            const consumption = await tx.discountAuthorization.updateMany({
              where: { id: discountAuthorization.id, usedAt: null },
              data: { usedAt: new Date() },
            });
            if (consumption.count !== 1)
              throw new ConflictException(
                'DISCOUNT_AUTHORIZATION_ALREADY_USED',
              );
          }

          const inventoryChanges = await this.reserveInventory(
            tx,
            preparedItems,
            dto.locationId,
          );

          const legalEntityMapping =
            await tx.legalEntityOperationalLocation.findFirst({
              where: {
                operationalLocationId: dto.locationId,
                effectiveFrom: { lte: new Date() },
                OR: [
                  { effectiveTo: null },
                  { effectiveTo: { gt: new Date() } },
                ],
                legalEntity: { isActive: true },
              },
              orderBy: { effectiveFrom: 'desc' },
              select: { legalEntityId: true },
            });

          const saleNumber = await this.nextSaleNumber(tx);
          const registeredAt = new Date();
          const sale = await tx.sale.create({
            data: {
              saleNumber,
              customerId: dto.customerId ?? null,
              userId: currentUser.id,
              locationId: dto.locationId,
              pointOfSaleDailyCloseId: dailyCloseId,
              terminalId: cashShift?.terminalId ?? null,
              cashShiftId: cashShift?.id ?? null,
              cashierUserId: cashShift?.cashierUserId ?? null,
              businessDate: cashShift?.businessDate ?? null,
              registeredAt: cashShift ? registeredAt : null,
              deviceId: cashShift?.terminal.deviceId ?? null,
              saleChannel: dto.saleChannel,
              documentType: dto.documentType,
              currencyCode: 'MXN',
              legalEntityId: legalEntityMapping?.legalEntityId ?? null,
              physicalFolio: this.normalizeOptionalText(dto.physicalFolio),
              requiresAdministrativeInvoice:
                dto.requiresAdministrativeInvoice ?? false,
              commercialPolicyId: this.normalizeOptionalText(
                dto.commercialPolicyId ?? customer?.commercialPolicyId,
              ),
              discountAuthorizationId: discountAuthorization?.id ?? null,
              discountPercentage,
              discountEvidence: discountAuthorization?.evidence ?? null,
              idempotencyKey,
              idempotencyPayloadHash: payloadHash,
              administrativeOverrideReason:
                creditDecision?.overrideReason ?? null,
              administrativeOverrideApprovedByUserId:
                creditDecision?.overrideActorId ?? null,
              creditDecisionSnapshot: creditDecision ?? undefined,
              creditDecisionEvaluatedAt: creditDecision ? new Date() : null,
              collectionStatus: outstandingAmount.isPositive()
                ? CollectionStatus.UNPAID
                : CollectionStatus.PAID,
              subtotal: subtotal.toString(),
              discount: discount.toString(),
              tax: '0.00',
              total: total.toString(),
              paymentType: dto.paymentType,
              status: SaleStatus.CONFIRMED,
              items: {
                create: preparedItems.map((item) => ({
                  productId: item.product.id,
                  quantity: item.billableQuantityKg,
                  quantityKg: item.quantityKg,
                  quantityPieces: item.quantityPieces,
                  unit: item.product.unit,
                  unitPrice: item.unitPrice.toString(),
                  unitEquivalentId: item.unitEquivalentId,
                  appliedEquivalentFactor: item.equivalentFactor,
                  roundingMode: item.roundingMode,
                  productNameSnapshot: item.product.name,
                  productSkuSnapshot: item.product.sku ?? null,
                  unitPriceSnapshot: item.unitPrice.toString(),
                  quantitySnapshot: item.billableQuantityKg,
                  subtotal: item.subtotal.toString(),
                  discount: '0.00',
                  taxableBase: item.subtotal.toString(),
                  tax: '0.00',
                  total: item.subtotal.toString(),
                  unitCostSnapshot: toMoneyString(item.product.purchaseCost),
                  costSubtotalSnapshot: Money.from(item.product.purchaseCost)
                    .multiply(String(item.billableQuantityKg))
                    .toString(),
                  costSnapshotSource: 'SALE_CONFIRMATION',
                })),
              },
            },
            include: { items: true },
          });
          if (!legalEntityMapping) {
            await tx.billingDataRemediation.upsert({
              where: {
                code_entityType_entityId: {
                  code: 'MISSING_LEGAL_ENTITY_MAPPING',
                  entityType: 'Sale',
                  entityId: sale.id,
                },
              },
              create: {
                code: 'MISSING_LEGAL_ENTITY_MAPPING',
                entityType: 'Sale',
                entityId: sale.id,
                details: {
                  operationalLocationId: dto.locationId,
                  currencyCode: 'MXN',
                },
              },
              update: {
                details: {
                  operationalLocationId: dto.locationId,
                  currencyCode: 'MXN',
                },
                resolvedAt: null,
                resolvedByUserId: null,
                resolutionNotes: null,
              },
            });
          }
          const issuedAt = new Date();
          const dueDate =
            dto.paymentType === SalePaymentType.CREDIT_SALE &&
            outstandingAmount.isPositive() &&
            customer
              ? this.addDays(issuedAt, customer.creditDays ?? 0)
              : null;
          const documentData = {
            saleId: sale.id,
            operationalLocationId: dto.locationId,
            pointOfSaleDailyCloseId: dailyCloseId,
            physicalFolio: this.normalizeOptionalText(
              dto.physicalFolio ?? sale.saleNumber,
            ),
            status: SaleDocumentStatus.ISSUED,
            requiresAdministrativeInvoice:
              dto.requiresAdministrativeInvoice ?? false,
            deliveredByUserId: sale.deliveredByUserId ?? null,
            collectedByUserId: sale.collectedByUserId ?? null,
            routeId: sale.routeId ?? null,
            printTemplateVersion: 1,
            ...(customer
              ? {
                  customerSnapshot: this.buildCustomerSnapshot(
                    customer,
                  ) as Prisma.InputJsonValue,
                }
              : {}),
            productSnapshot: this.buildProductSnapshot(preparedItems),
            priceSnapshot: this.buildPriceSnapshot({
              subtotal,
              discount,
              tax: Money.zero(),
              total,
              paid: totalPaid,
              outstanding: outstandingAmount,
              paymentType: dto.paymentType,
              paymentMethod:
                payments.length === 1 ? payments[0].paymentMethod : null,
              dueDate,
            }),
          };
          const requestedDocument = await tx.saleDocument.create({
            data: { ...documentData, documentType: dto.documentType },
          });
          const internalReceiptDocument =
            dto.documentType === SaleDocumentType.INTERNAL_RECEIPT
              ? null
              : await tx.saleDocument.create({
                  data: {
                    ...documentData,
                    documentType: SaleDocumentType.INTERNAL_RECEIPT,
                  },
                });
          const saleDocuments = [
            requestedDocument,
            internalReceiptDocument,
          ].filter(
            (document): document is NonNullable<typeof document> =>
              document !== null,
          );

          const inventoryMovements = await this.recordInventoryMovements(
            tx,
            inventoryChanges,
            dto.locationId,
            sale.id,
            currentUser.id,
          );
          const createdPayments = await Promise.all(
            payments.map((payment, index) =>
              tx.payment.create({
                data: {
                  accountReceivableId: null,
                  saleId: sale.id,
                  customerId: dto.customerId ?? null,
                  userId: currentUser.id,
                  amount: payment.amount,
                  cashTendered: payment.cashTendered ?? null,
                  changeGiven:
                    payment.cashTendered === undefined
                      ? null
                      : Money.from(payment.cashTendered)
                          .subtract(payment.amount)
                          .toString(),
                  paymentMethod: payment.paymentMethod,
                  bankName: this.normalizeOptionalText(payment.bankName),
                  referenceNumber: this.normalizeOptionalText(
                    payment.referenceNumber,
                  ),
                  cardLastFour: this.normalizeOptionalText(
                    payment.cardLastFour,
                  ),
                  operationalLocationId: dto.locationId,
                  pointOfSaleDailyCloseId: dailyCloseId,
                  cashShiftId: cashShift?.id ?? null,
                  status: PaymentStatus.APPLIED,
                  paidAt: new Date(),
                  idempotencyKey: `${idempotencyKey}:${index}`,
                  idempotencyPayloadHash: this.hashPayload({
                    payloadHash,
                    paymentIndex: index,
                    payment,
                  }),
                },
              }),
            ),
          );

          const accountReceivable =
            dto.paymentType === SalePaymentType.CREDIT_SALE &&
            outstandingAmount.isPositive() &&
            customer
              ? await tx.accountReceivable.create({
                  data: {
                    customerId: customer.id,
                    saleId: sale.id,
                    originalSaleId: sale.id,
                    originalAmount: outstandingAmount.toString(),
                    outstandingAmount: outstandingAmount.toString(),
                    saleDate: new Date(),
                    dueDate: dueDate as Date,
                    paymentTermsDays: customer.creditDays ?? 0,
                    commercialPolicyId: this.normalizeOptionalText(
                      dto.commercialPolicyId ?? customer.commercialPolicyId,
                    ),
                    status: CollectionStatus.UNPAID,
                  },
                })
              : null;

          const billingRequest =
            dto.requiresAdministrativeInvoice && customer && dto.billingRequest
              ? await tx.billingRequest.create({
                  data: {
                    saleId: sale.id,
                    customerId: customer.id,
                    requestedByUserId: currentUser.id,
                    status: BillingRequestStatus.REQUESTED,
                    reason: dto.billingRequest.reason.trim(),
                    notes: this.normalizeOptionalText(dto.billingRequest.notes),
                    history: {
                      create: {
                        toStatus: BillingRequestStatus.REQUESTED,
                        changedByUserId: currentUser.id,
                        reason: dto.billingRequest.reason.trim(),
                        notes: this.normalizeOptionalText(
                          dto.billingRequest.notes,
                        ),
                      },
                    },
                  },
                })
              : null;

          if (billingRequest) {
            await tx.billingRequestSaleDocument.create({
              data: {
                billingRequestId: billingRequest.id,
                saleDocumentId: requestedDocument.id,
                requestedSubtotal: total.toString(),
                requestedTax: '0.00',
                requestedTotal: total.toString(),
                createdByUserId: currentUser.id,
                requestedItems: {
                  create: sale.items.map((item) => ({
                    saleItemId: item.id,
                    requestedSubtotal: item.taxableBase,
                    requestedTax: item.tax,
                    requestedTotal: item.total,
                  })),
                },
              },
            });
          }

          if (accountReceivable && billingRequest) {
            await tx.accountReceivable.update({
              where: { id: accountReceivable.id },
              data: { billingRequestId: billingRequest.id },
            });
          }

          if (dailyCloseId)
            await this.dailyCloseService.recalculateAfterDraftMutation(
              dailyCloseId,
              tx,
            );

          return {
            created: true,
            saleId: sale.id,
            response: {
              sale: this.toSaleResponse(sale, currentUser),
              payments: createdPayments.map((payment) =>
                this.toPaymentResponse(payment),
              ),
              // Deprecated compatibility field. New consumers must use payments.
              payment: createdPayments[0]
                ? this.toPaymentResponse(createdPayments[0])
                : null,
              accountReceivable: accountReceivable
                ? this.toReceivableResponse(accountReceivable)
                : null,
              billingRequest,
              inventoryMovements: inventoryMovements.map((movement) =>
                this.toMovementResponse(movement),
              ),
              documents: saleDocuments.map((document) =>
                this.toSaleDocumentResponse(document as SaleDocumentListRecord),
              ),
            },
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );

    if (outcome.created && typeof outcome.saleId === 'string') {
      await this.salesRealtime?.publishCreated(outcome.saleId);
    }

    return outcome.response;
  }

  private assertOverrideIntent(dto: CreateSaleDto, currentUser: Actor): void {
    if (dto.administrativeOverrideReason === undefined) return;
    if (!dto.administrativeOverrideReason.trim()) {
      throw new BadRequestException({
        code: 'CREDIT_OVERRIDE_REASON_REQUIRED',
        message: 'Administrative override reason must not be blank',
      });
    }
    if (currentUser.role !== 'ADMIN') {
      throw new BadRequestException({
        code: 'CREDIT_OVERRIDE_FORBIDDEN',
        message: 'Administrative override requires ADMIN authorization',
      });
    }
    if (dto.paymentType !== SalePaymentType.CREDIT_SALE) {
      throw new BadRequestException({
        code: 'CREDIT_OVERRIDE_NOT_APPLICABLE',
        message: 'Administrative override is not applicable to this sale',
      });
    }
  }

  private async resolveDiscountAuthorization(
    tx: Prisma.TransactionClient,
    dto: CreateSaleDto,
    customer: CustomerCredit | null,
    currentUser: Actor,
  ): Promise<DiscountAuthorization | null> {
    if (dto.discount !== undefined) {
      throw new BadRequestException({
        code: 'DISCOUNT_AMOUNT_FORBIDDEN',
        message: 'discount is not accepted; use a discount authorization',
      });
    }
    if (!dto.discountAuthorizationId) return null;

    const authorization = (await tx.discountAuthorization.findFirst({
      where: { id: dto.discountAuthorizationId, usedAt: null },
      include: { commercialPolicy: true },
    })) as DiscountAuthorization | null;
    if (!authorization) {
      throw new BadRequestException({
        code: 'DISCOUNT_AUTHORIZATION_INVALID',
        message: 'Discount authorization is invalid or already used',
      });
    }
    if (authorization.expiresAt && authorization.expiresAt <= new Date()) {
      throw new BadRequestException({
        code: 'DISCOUNT_AUTHORIZATION_EXPIRED',
        message: 'Discount authorization has expired',
      });
    }
    if (
      currentUser.role === 'SELLER' &&
      authorization.authorizedForUserId !== currentUser.id
    ) {
      throw new ForbiddenException('DISCOUNT_AUTHORIZATION_FORBIDDEN');
    }

    const commercialPolicyId = this.normalizeOptionalText(
      dto.commercialPolicyId ?? customer?.commercialPolicyId,
    );
    if (
      !commercialPolicyId ||
      authorization.commercialPolicyId !== commercialPolicyId
    ) {
      throw new BadRequestException({
        code: 'DISCOUNT_POLICY_MISMATCH',
        message:
          'Discount authorization does not match the sale commercial policy',
      });
    }
    const policy = authorization.commercialPolicy;
    if (
      !policy.isActive ||
      !policy.effectiveFrom ||
      policy.effectiveFrom > new Date() ||
      (policy.effectiveTo && policy.effectiveTo <= new Date())
    ) {
      throw new BadRequestException({
        code: 'DISCOUNT_POLICY_INACTIVE',
        message: 'Discount commercial policy is not currently active',
      });
    }

    const percentage = this.toNumber(authorization.maximumPercentage);
    if (
      percentage <= 0 ||
      percentage > this.toNumber(policy.maximumDiscountPercentage)
    ) {
      throw new BadRequestException({
        code: 'DISCOUNT_PERCENTAGE_INVALID',
        message: 'Discount authorization exceeds the commercial policy maximum',
      });
    }
    return authorization;
  }

  private async withSerializableRetry<T>(
    operation: () => Promise<T>,
  ): Promise<T> {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        const serializationConflict =
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          (error as { code?: unknown }).code === 'P2034';
        const saleNumberConflict = this.isSaleNumberUniqueConflict(error);
        if (!serializationConflict && !saleNumberConflict) throw error;
        if (attempt === 3) {
          if (saleNumberConflict) {
            throw new ConflictException({
              code: 'SALE_NUMBER_RETRY_EXHAUSTED',
              message:
                'Sale number could not be allocated after concurrent updates',
            });
          }
          throw new ConflictException({
            code: 'CREDIT_CONCURRENCY_RETRY_EXHAUSTED',
            message:
              'Credit decision could not be completed after concurrent updates',
          });
        }
      }
    }
    throw new ConflictException({ code: 'CREDIT_CONCURRENCY_RETRY_EXHAUSTED' });
  }

  private assertBillingRequestInput(
    dto: CreateSaleDto,
    customer: CustomerCredit | null,
  ): void {
    if (!dto.requiresAdministrativeInvoice) {
      if (dto.billingRequest) {
        throw new BadRequestException(
          'billingRequest requires requiresAdministrativeInvoice=true',
        );
      }
      return;
    }
    if (!customer) {
      throw new BadRequestException(
        'customerId is required for an administrative billing request',
      );
    }
    if (!dto.billingRequest?.reason?.trim()) {
      throw new BadRequestException('billingRequest.reason is required');
    }
  }

  async findDocuments(id: string, currentUser: Actor) {
    const sale = await this.prisma.sale.findFirst({
      where: this.buildVisibleSaleDetailWhere(id, currentUser),
      select: { id: true },
    });

    if (!sale) {
      throw new NotFoundException('Sale not found');
    }

    const documents = (await this.prisma.saleDocument.findMany({
      where: { saleId: id },
      orderBy: { createdAt: 'desc' },
    })) as SaleDocumentListRecord[];

    return {
      items: documents.map((document) => this.toSaleDocumentResponse(document)),
    };
  }

  async getVoidPreview(id: string, currentUser: Actor) {
    this.assertVoidAdmin(currentUser);

    const sale = (await this.prisma.sale.findFirst({
      where: { id },
      include: saleVoidInclude,
    })) as SaleVoidPreviewRecord | null;

    if (!sale) {
      throw new NotFoundException('Sale not found');
    }

    return this.toVoidPreview(sale, currentUser);
  }

  async voidSale(
    id: string,
    dto: VoidSaleDto,
    currentUser: Actor,
    idempotencyKey: string,
  ) {
    const reason = dto.reason?.trim();
    if (!reason) {
      throw new BadRequestException('reason is required');
    }

    if (!idempotencyKey?.trim()) {
      throw new BadRequestException('Idempotency-Key header is required');
    }

    if (dto.expectedVersion === undefined || dto.expectedVersion === null) {
      throw new BadRequestException('expectedVersion is required');
    }

    this.assertVoidAdmin(currentUser);

    const payloadHash = this.hashPayload({
      operation: 'VOID_SALE',
      saleId: id,
      reason,
      expectedVersion: dto.expectedVersion,
      authorizedByUserId: currentUser.id,
    });

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const existing = (await tx.sale.findFirst({
            where: { cancellationIdempotencyKey: idempotencyKey },
            include: saleVoidInclude,
          })) as SaleVoidPreviewRecord | null;

          if (existing) {
            this.assertSameIdempotencyPayload(
              existing.cancellationPayloadHash,
              payloadHash,
              'Idempotency-Key was already used for a different sale void payload',
            );

            return this.buildVoidResponse(
              existing,
              currentUser,
              this.getVoidPayments(existing).filter(
                (payment) => payment.status === PaymentStatus.CANCELLED,
              ),
              existing.inventoryMovements ?? [],
              existing.accountReceivable as AccountReceivable | null,
              existing.documents ?? [],
              existing.billingRequests?.[0] ?? null,
              reason,
              existing.cancelledAt instanceof Date
                ? existing.cancelledAt
                : new Date(),
            );
          }

          let sale = (await tx.sale.findFirst({
            where: { id },
            include: saleVoidInclude,
          })) as SaleVoidPreviewRecord | null;

          if (!sale) {
            throw new NotFoundException('Sale not found');
          }

          if (sale.pointOfSaleDailyClose?.id) {
            await acquireDraftDailyCloseLifecycleLock(
              tx,
              sale.pointOfSaleDailyClose.id,
            );
            sale = await this.findVoidSale(tx, id);
            if (!sale) {
              throw new NotFoundException('Sale not found');
            }
          }

          if (sale.status === SaleStatus.CANCELLED) {
            throw new BadRequestException('Sale is already cancelled');
          }

          if (sale.version !== dto.expectedVersion) {
            throw new ConflictException(
              'Sale version does not match expectedVersion',
            );
          }

          if (
            sale.pointOfSaleDailyClose &&
            sale.pointOfSaleDailyClose.status !==
              PointOfSaleDailyCloseStatus.DRAFT
          ) {
            throw new BadRequestException('DAILY_CLOSE_REOPEN_REQUIRED');
          }

          const blockers = this.getVoidBlockers(sale);
          if (blockers.length) {
            throw new BadRequestException({
              code: 'SALE_VOID_BLOCKED',
              message: blockers.map((blocker) => blocker.message).join(' '),
              blockers,
            });
          }

          const voidedAt = new Date();
          const cancelledPayments: Payment[] = [];

          for (const payment of this.getVoidPayments(sale)) {
            if (payment.status === PaymentStatus.CANCELLED) continue;

            const paymentCancellationKey = `${idempotencyKey}:payment:${payment.id}`;
            const paymentPayloadHash = this.hashPayload({
              operation: 'VOID_SALE_PAYMENT',
              saleId: id,
              paymentId: payment.id,
              reason,
              authorizedByUserId: currentUser.id,
            });
            const updatedPayment = await tx.payment.updateMany({
              where: {
                id: payment.id,
                status: payment.status,
                version: payment.version,
              },
              data: {
                status: PaymentStatus.CANCELLED,
                cancelledAt: voidedAt,
                cancelledByUserId: currentUser.id,
                cancellationReason: reason,
                cancellationIdempotencyKey: paymentCancellationKey,
                cancellationPayloadHash: paymentPayloadHash,
                version: { increment: 1 },
              },
            });

            if (updatedPayment.count !== 1) {
              throw new ConflictException(
                'A payment changed before the sale could be voided',
              );
            }

            cancelledPayments.push({
              ...payment,
              status: PaymentStatus.CANCELLED,
              cancelledAt: voidedAt,
              cancelledByUserId: currentUser.id,
              cancellationReason: reason,
              cancellationIdempotencyKey: paymentCancellationKey,
              cancellationPayloadHash: paymentPayloadHash,
              version: payment.version + 1,
            });
          }

          const accountReceivable = sale.accountReceivable
            ? await tx.accountReceivable.update({
                where: { id: sale.accountReceivable.id },
                data: {
                  outstandingAmount: 0,
                  status: CollectionStatus.CANCELLED,
                  cancelledAt: voidedAt,
                  paidAt: null,
                  lastPaymentDate: null,
                  daysOverdue: 0,
                  agingStatus: AgingStatus.CURRENT,
                },
              })
            : null;

          const inventoryMovements = await this.restoreSaleInventory(
            tx,
            sale,
            currentUser.id,
            reason,
          );

          const documentsToCancel = (sale.documents ?? []).filter(
            (document) => document.status !== SaleDocumentStatus.CANCELLED,
          );
          if (documentsToCancel.length) {
            await tx.saleDocument.updateMany({
              where: {
                saleId: sale.id,
                status: { not: SaleDocumentStatus.CANCELLED },
              },
              data: { status: SaleDocumentStatus.CANCELLED },
            });
          }
          const cancelledDocuments = (sale.documents ?? []).map((document) =>
            document.status === SaleDocumentStatus.CANCELLED
              ? document
              : {
                  ...document,
                  status: SaleDocumentStatus.CANCELLED,
                  updatedAt: voidedAt,
                },
          );

          const currentBillingRequest = sale.billingRequests?.[0] ?? null;
          let billingRequest = currentBillingRequest;
          if (
            currentBillingRequest &&
            (currentBillingRequest.status === BillingRequestStatus.REQUESTED ||
              currentBillingRequest.status === BillingRequestStatus.IN_REVIEW)
          ) {
            await tx.billingRequestHistory.create({
              data: {
                billingRequestId: currentBillingRequest.id,
                fromStatus: currentBillingRequest.status,
                toStatus: BillingRequestStatus.CANCELLED,
                changedByUserId: currentUser.id,
                reason,
              },
            });
            billingRequest = await tx.billingRequest.update({
              where: {
                id: currentBillingRequest.id,
                version: currentBillingRequest.version,
              },
              data: {
                status: BillingRequestStatus.CANCELLED,
                reviewedByUserId: currentUser.id,
                reviewedAt: voidedAt,
                reason,
                version: { increment: 1 },
              },
            });
          }

          const updated = await tx.sale.updateMany({
            where: {
              id: sale.id,
              status: SaleStatus.CONFIRMED,
              version: dto.expectedVersion,
            },
            data: {
              status: SaleStatus.CANCELLED,
              collectionStatus: CollectionStatus.CANCELLED,
              cancelledAt: voidedAt,
              cancelledByUserId: currentUser.id,
              cancellationReason: reason,
              cancellationIdempotencyKey: idempotencyKey,
              cancellationPayloadHash: payloadHash,
              version: { increment: 1 },
            },
          });
          if (updated.count !== 1) {
            throw new ConflictException(
              'Sale was modified before it could be voided',
            );
          }

          const cancelledSale = (await tx.sale.findUnique({
            where: { id: sale.id },
            include: { items: true },
          })) as SaleCancellationRecord | null;
          if (!cancelledSale) {
            throw new NotFoundException('Sale not found after void');
          }

          await tx.billingAuditLog.create({
            data: {
              actorUserId: currentUser.id,
              action: 'SALE_VOIDED',
              entityType: 'Sale',
              entityId: sale.id,
              before: {
                status: sale.status,
                collectionStatus: sale.collectionStatus,
                version: sale.version,
              },
              after: {
                status: SaleStatus.CANCELLED,
                collectionStatus: CollectionStatus.CANCELLED,
                version: sale.version + 1,
              },
              reason,
              correlationId: idempotencyKey,
              context: {
                paymentIds: cancelledPayments.map((payment) => payment.id),
                inventoryMovementIds: inventoryMovements.map(
                  (movement) => movement.id,
                ),
                saleDocumentIds: documentsToCancel.map(
                  (document) => document.id,
                ),
                accountReceivableId: accountReceivable?.id ?? null,
                billingRequestId: billingRequest?.id ?? null,
              },
            },
          });

          if (sale.pointOfSaleDailyClose?.id)
            await this.dailyCloseService.recalculateAfterDraftMutation(
              sale.pointOfSaleDailyClose.id,
              tx,
            );

          return this.buildVoidResponse(
            cancelledSale,
            currentUser,
            cancelledPayments,
            inventoryMovements,
            accountReceivable,
            cancelledDocuments,
            billingRequest,
            reason,
            voidedAt,
          );
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (this.isVoidIdempotencyRaceError(error)) {
        return this.resolveVoidReplay(
          idempotencyKey,
          payloadHash,
          currentUser,
          reason,
        );
      }
      throw error;
    }
  }

  async cancel(
    id: string,
    dto: CancelSaleDto,
    currentUser: Actor,
    idempotencyKey: string,
  ) {
    const reason = dto.reason?.trim();
    if (!reason) {
      throw new BadRequestException('reason is required');
    }

    if (!idempotencyKey?.trim()) {
      throw new BadRequestException('Idempotency-Key header is required');
    }

    if (dto.expectedVersion === undefined || dto.expectedVersion === null) {
      throw new BadRequestException('expectedVersion is required');
    }

    if (currentUser.role !== 'ADMIN') {
      throw new ForbiddenException('Only ADMIN can cancel sales');
    }

    const payloadHash = this.hashPayload({
      reason,
      expectedVersion: dto.expectedVersion,
    });

    return this.prisma.$transaction(
      async (tx) => {
        let sale = await this.findCancellationSale(tx, id, currentUser);

        if (!sale) {
          throw new NotFoundException('Sale not found');
        }

        if (
          sale.status === SaleStatus.CANCELLED &&
          sale.cancellationIdempotencyKey === idempotencyKey
        ) {
          if (sale.cancellationPayloadHash !== payloadHash) {
            throw new ConflictException(
              'Idempotency-Key was already used for a different sale cancellation payload',
            );
          }

          return {
            sale: this.toSaleResponse(sale, currentUser),
            inventoryMovements: (sale.inventoryMovements ?? []).map(
              (movement) => this.toMovementResponse(movement),
            ),
            accountReceivable: sale.accountReceivable
              ? this.toReceivableRecordResponse(sale.accountReceivable)
              : null,
          };
        }

        if (sale.pointOfSaleDailyClose?.id) {
          await acquireDraftDailyCloseLifecycleLock(
            tx,
            sale.pointOfSaleDailyClose.id,
          );
          sale = await this.findCancellationSale(tx, id, currentUser);
          if (!sale) throw new NotFoundException('Sale not found');
        }

        if (sale.status === SaleStatus.CANCELLED) {
          throw new BadRequestException('Sale is already cancelled');
        }

        if (sale.version !== dto.expectedVersion) {
          throw new ConflictException(
            'Sale version does not match expectedVersion',
          );
        }

        this.assertSaleCanBeCancelled(sale);

        const inventoryMovements = await this.restoreSaleInventory(
          tx,
          sale,
          currentUser.id,
          reason,
        );
        const accountReceivable = sale.accountReceivable
          ? await this.cancelSaleReceivable(tx, sale.accountReceivable)
          : null;
        const updated = await tx.sale.updateMany({
          where: {
            id: sale.id,
            status: SaleStatus.CONFIRMED,
            version: dto.expectedVersion,
          },
          data: {
            status: SaleStatus.CANCELLED,
            collectionStatus: CollectionStatus.CANCELLED,
            cancelledAt: new Date(),
            cancelledByUserId: currentUser.id,
            cancellationReason: reason,
            cancellationIdempotencyKey: idempotencyKey,
            cancellationPayloadHash: payloadHash,
            version: { increment: 1 },
          },
        });
        if (updated.count !== 1) {
          throw new ConflictException(
            'Sale was modified before cancellation could be persisted',
          );
        }

        const cancelledSale = await tx.sale.findUnique({
          where: { id: sale.id },
          include: { items: true },
        });
        if (!cancelledSale) {
          throw new NotFoundException('Sale not found after cancellation');
        }

        if (sale.pointOfSaleDailyClose?.id)
          await this.dailyCloseService.recalculateAfterDraftMutation(
            sale.pointOfSaleDailyClose.id,
            tx,
          );

        return {
          sale: this.toSaleResponse(cancelledSale, currentUser),
          inventoryMovements: inventoryMovements.map((movement) =>
            this.toMovementResponse(movement),
          ),
          accountReceivable: accountReceivable
            ? this.toReceivableRecordResponse(accountReceivable)
            : null,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private assertVoidAdmin(currentUser: Actor): void {
    if (currentUser.role !== 'ADMIN') {
      throw new ForbiddenException('Only ADMIN can void sales');
    }
  }

  private getVoidBlockers(sale: SaleVoidPreviewRecord): SaleVoidBlocker[] {
    const blockers: SaleVoidBlocker[] = [];

    if (sale.status === SaleStatus.CANCELLED) {
      blockers.push({
        code: 'SALE_ALREADY_CANCELLED',
        message: 'La venta ya está cancelada.',
      });
    } else if (sale.status !== SaleStatus.CONFIRMED) {
      blockers.push({
        code: 'SALE_NOT_CONFIRMED',
        message: 'Solo se pueden anular ventas confirmadas.',
      });
    }

    if (
      sale.pointOfSaleDailyClose &&
      sale.pointOfSaleDailyClose.status !== PointOfSaleDailyCloseStatus.DRAFT
    ) {
      blockers.push({
        code: 'DAILY_CLOSE_REOPEN_REQUIRED',
        message:
          'La venta pertenece a un cierre POS cerrado; reabre el cierre con control de versión antes de anularla.',
      });
    }

    if (sale.route?.settlement?.status === RouteSettlementStatus.CLOSED) {
      blockers.push({
        code: 'ROUTE_SETTLEMENT_REOPEN_REQUIRED',
        message:
          'La venta pertenece a una liquidación de ruta cerrada; reabre la liquidación con auditoría antes de anularla.',
      });
    }

    const activeInvoice = (sale.documents ?? [])
      .flatMap((document) => document.invoiceDocuments ?? [])
      .find(
        (application) => application.invoice?.status === InvoiceStatus.ACTIVE,
      );
    if (activeInvoice) {
      blockers.push({
        code: 'INVOICE_CANCELLATION_REQUIRED',
        message:
          'Existe una factura externa activa relacionada; cancélala desde facturación antes de anular la venta.',
      });
    }

    return blockers;
  }

  private toVoidPreview(sale: SaleVoidPreviewRecord, currentUser: Actor) {
    const blockers = this.getVoidBlockers(sale);
    const activePayments = this.getVoidPayments(sale).filter(
      (payment) => payment.status !== PaymentStatus.CANCELLED,
    );
    const activeDocuments = (sale.documents ?? []).filter(
      (document) => document.status !== SaleDocumentStatus.CANCELLED,
    );
    const billingRequest = sale.billingRequests?.[0] ?? null;

    return {
      canExecute: blockers.length === 0,
      blockers,
      authorization: {
        requiredRole: 'ADMIN',
        authorizedBy: {
          id: currentUser.id,
          name: currentUser.name ?? null,
          role: currentUser.role,
        },
      },
      sale: {
        id: sale.id,
        saleNumber: sale.saleNumber,
        status: sale.status,
        version: sale.version,
        total: this.decimalToString(sale.total),
        collectionStatus: sale.collectionStatus,
      },
      payments: activePayments.map((payment) => ({
        id: payment.id,
        amount: this.decimalToString(payment.amount),
        paymentMethod: payment.paymentMethod,
        status: payment.status,
        paidAt: payment.paidAt,
        version: payment.version,
      })),
      inventory: (sale.items ?? []).map((item) => ({
        productId: item.productId,
        productName: item.productNameSnapshot ?? item.productId,
        unit: item.unit ?? null,
        quantityKg: this.decimalToString(item.quantityKg),
        quantityPieces: item.quantityPieces ?? 0,
        locationId: sale.locationId,
      })),
      accountReceivable: sale.accountReceivable
        ? {
            id: sale.accountReceivable.id,
            originalAmount: this.decimalToString(
              sale.accountReceivable.originalAmount,
            ),
            outstandingAmount: this.decimalToString(
              sale.accountReceivable.outstandingAmount,
            ),
            status: sale.accountReceivable.status,
          }
        : null,
      documents: (sale.documents ?? []).map((document) => ({
        id: document.id,
        documentType: document.documentType,
        physicalFolio: document.physicalFolio ?? null,
        status: document.status,
        willCancel: activeDocuments.some(
          (activeDocument) => activeDocument.id === document.id,
        ),
      })),
      billingRequest: billingRequest
        ? {
            id: billingRequest.id,
            status: billingRequest.status,
            willCancel:
              billingRequest.status === BillingRequestStatus.REQUESTED ||
              billingRequest.status === BillingRequestStatus.IN_REVIEW,
          }
        : null,
    };
  }

  private buildVoidResponse(
    sale: SaleCancellationRecord,
    currentUser: Actor,
    payments: Payment[],
    inventoryMovements: Array<Record<string, unknown>>,
    accountReceivable: AccountReceivable | null,
    documents: Array<SaleDocumentListRecord & { status: SaleDocumentStatus }>,
    billingRequest: Record<string, unknown> | null,
    reason: string,
    voidedAt: Date,
  ) {
    return {
      sale: this.toSaleResponse(sale, currentUser),
      payments: payments.map((payment) => this.toPaymentResponse(payment)),
      inventoryMovements: inventoryMovements.map((movement) =>
        this.toMovementResponse(movement),
      ),
      accountReceivable: accountReceivable
        ? this.toReceivableRecordResponse(accountReceivable)
        : null,
      documents: documents.map((document) =>
        this.toSaleDocumentResponse(document),
      ),
      billingRequest,
      authorization: {
        authorizedBy: {
          id: currentUser.id,
          name: currentUser.name ?? null,
          role: currentUser.role,
        },
        reason,
        authorizedAt: voidedAt,
      },
    };
  }

  private async findVoidSale(
    tx: Prisma.TransactionClient,
    id: string,
  ): Promise<SaleVoidPreviewRecord | null> {
    return (await tx.sale.findFirst({
      where: { id },
      include: saleVoidInclude,
    })) as SaleVoidPreviewRecord | null;
  }

  private async findCancellationSale(
    tx: Prisma.TransactionClient,
    id: string,
    currentUser: Actor,
  ): Promise<SaleCancellationRecord | null> {
    return (await tx.sale.findFirst({
      where: this.buildCancellationScopeWhere(id, currentUser),
      include: {
        items: true,
        payments: { where: { status: PaymentStatus.APPLIED } },
        accountReceivable: {
          include: {
            payments: { where: { status: PaymentStatus.APPLIED }, take: 1 },
          },
        },
        pointOfSaleDailyClose: { select: { id: true, status: true } },
        route: { select: { settlement: { select: { status: true } } } },
        inventoryMovements: {
          where: { type: InventoryMovementType.CANCEL_SALE },
          orderBy: { createdAt: 'asc' },
        },
      },
    }));
  }

  private getVoidPayments(
    sale: SaleVoidPreviewRecord,
  ): Array<Payment & { version: number }> {
    const payments = [
      ...(sale.payments ?? []),
      ...(sale.accountReceivable?.payments ?? []),
    ];
    return Array.from(
      new Map(payments.map((payment) => [payment.id, payment])).values(),
    );
  }

  private async resolveVoidReplay(
    idempotencyKey: string,
    payloadHash: string,
    currentUser: Actor,
    reason: string,
  ) {
    const existing = (await this.prisma.sale.findFirst({
      where: { cancellationIdempotencyKey: idempotencyKey },
      include: saleVoidInclude,
    })) as SaleVoidPreviewRecord | null;

    if (!existing) {
      throw new ConflictException(
        'Concurrent sale void is still in progress; retry with the same Idempotency-Key',
      );
    }

    this.assertSameIdempotencyPayload(
      existing.cancellationPayloadHash,
      payloadHash,
      'Idempotency-Key was already used for a different sale void payload',
    );

    return this.buildVoidResponse(
      existing,
      currentUser,
      this.getVoidPayments(existing).filter(
        (payment) => payment.status === PaymentStatus.CANCELLED,
      ),
      existing.inventoryMovements ?? [],
      existing.accountReceivable as AccountReceivable | null,
      existing.documents ?? [],
      existing.billingRequests?.[0] ?? null,
      reason,
      existing.cancelledAt instanceof Date ? existing.cancelledAt : new Date(),
    );
  }

  private isVoidIdempotencyRaceError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      ((error as { code?: unknown }).code === 'P2002' ||
        (error as { code?: unknown }).code === 'P2034')
    );
  }

  private assertSameIdempotencyPayload(
    existingHash: unknown,
    expectedHash: string,
    message: string,
  ): void {
    if (existingHash !== expectedHash) {
      throw new ConflictException(message);
    }
  }

  private buildCancellationScopeWhere(
    id: string,
    currentUser: Actor,
  ): Prisma.SaleWhereInput {
    if (currentUser.role === 'ADMIN') {
      return { id };
    }

    return { id: '__no_cancellable_sale__' };
  }

  private assertSaleCanBeCancelled(sale: SaleCancellationRecord): void {
    if (sale.payments?.length) {
      throw new BadRequestException(
        'Sale has applied payments; reverse or refund payments before cancellation',
      );
    }

    if (sale.accountReceivable?.payments?.length) {
      throw new BadRequestException(
        'Sale account receivable has applied payments; reverse or refund payments before cancellation',
      );
    }

    if (
      sale.pointOfSaleDailyClose &&
      sale.pointOfSaleDailyClose.status !== PointOfSaleDailyCloseStatus.DRAFT
    ) {
      throw new BadRequestException('DAILY_CLOSE_REOPEN_REQUIRED');
    }

    if (sale.route?.settlement?.status === RouteSettlementStatus.CLOSED) {
      throw new BadRequestException(
        'Sale is associated with a closed route settlement',
      );
    }
  }

  private async restoreSaleInventory(
    tx: Prisma.TransactionClient,
    sale: SaleCancellationRecord,
    userId: string,
    reason: string,
  ): Promise<CreatedMovement[]> {
    const movements: CreatedMovement[] = [];

    for (const item of sale.items ?? []) {
      const quantityKg = this.roundQuantity(this.toNumber(item.quantityKg));
      const quantityPieces = item.quantityPieces ?? 0;

      const {
        previousQuantityKg,
        previousQuantityPieces,
        newQuantityKg,
        newQuantityPieces,
      } = await this.balanceService.increase(
        tx,
        item.productId,
        sale.locationId,
        { quantityKg, quantityPieces },
      );

      movements.push(
        await tx.inventoryMovement.create({
          data: {
            productId: item.productId,
            locationId: sale.locationId,
            userId,
            type: InventoryMovementType.CANCEL_SALE,
            quantity: quantityKg || quantityPieces,
            quantityKg,
            quantityPieces,
            previousStock: previousQuantityKg,
            newStock: newQuantityKg,
            previousQuantityKg,
            newQuantityKg,
            previousQuantityPieces,
            newQuantityPieces,
            reason,
            referenceType: 'Sale',
            referenceId: sale.id,
            saleId: sale.id,
          },
        }),
      );
    }

    return movements;
  }

  private async cancelSaleReceivable(
    tx: Prisma.TransactionClient,
    accountReceivable: NonNullable<SaleCancellationRecord['accountReceivable']>,
  ) {
    return tx.accountReceivable.update({
      where: { id: accountReceivable.id },
      data: {
        outstandingAmount: 0,
        status: CollectionStatus.CANCELLED,
        cancelledAt: new Date(),
        paidAt: null,
        lastPaymentDate: null,
      },
    });
  }

  private async prepareItems(
    tx: Prisma.TransactionClient,
    items: CreateSaleItemDto[],
  ): Promise<PreparedItem[]> {
    const prepared: PreparedItem[] = [];

    for (const item of items) {
      const quantityKg = this.roundQuantity(item.quantityKg ?? 0);
      const quantityPieces = item.quantityPieces ?? 0;
      if (quantityKg < 0 || quantityPieces < 0) {
        throw new BadRequestException(
          'Sale item quantities cannot be negative',
        );
      }
      if (quantityKg <= 0 && quantityPieces <= 0) {
        throw new BadRequestException(
          'Sale item quantity must be greater than 0',
        );
      }

      const product = (await tx.product.findUnique({
        where: { id: item.productId },
        include: { unitEquivalents: true },
      })) as SaleProduct | null;

      if (!product?.isActive) {
        throw new NotFoundException('Product not found');
      }

      this.assertItemMatchesProductUnit(
        item.unit,
        product.unit,
        quantityKg,
        quantityPieces,
      );

      const equivalent = item.unitEquivalentId
        ? product.unitEquivalents?.find(
            (candidate) =>
              candidate.id === item.unitEquivalentId &&
              candidate.status === EquivalentStatus.ACTIVE,
          )
        : undefined;

      if (item.unitEquivalentId && !equivalent) {
        throw new BadRequestException(
          'Active unit equivalent not found for product',
        );
      }

      if (
        item.unitEquivalentId &&
        (product.unit !== ProductUnit.KG_AND_PIECE || quantityPieces === 0)
      ) {
        throw new BadRequestException(
          'Unit equivalence is only valid when KG_AND_PIECE sales convert pieces',
        );
      }

      if (
        quantityPieces > 0 &&
        product.unit === ProductUnit.KG_AND_PIECE &&
        !this.isActiveKgPieceEquivalent(equivalent)
      ) {
        throw new BadRequestException(
          'KG_AND_PIECE sales with pieces require an active KG/PIECE equivalent',
        );
      }

      const billableQuantityKg = this.roundQuantity(
        quantityKg +
          (quantityPieces > 0 && equivalent
            ? this.convertPiecesToKg(quantityPieces, equivalent)
            : 0),
      );

      const unitPrice = Money.from(product.salePrice);
      prepared.push({
        product,
        unitEquivalentId: this.normalizeOptionalText(item.unitEquivalentId),
        quantityKg,
        quantityPieces,
        billableQuantityKg,
        unitPrice,
        subtotal: unitPrice.multiply(String(billableQuantityKg)),
        equivalentFactor: equivalent ? this.toNumber(equivalent.factor) : null,
        roundingMode: equivalent?.roundingMode ?? null,
      });
    }

    return prepared;
  }

  private assertItemMatchesProductUnit(
    requestedUnit: ProductUnit,
    productUnit: ProductUnit,
    quantityKg: number,
    quantityPieces: number,
  ): void {
    if (requestedUnit !== productUnit) {
      throw new BadRequestException(
        'Sale item unit must match the configured product unit',
      );
    }

    if (
      productUnit === ProductUnit.KG &&
      (quantityKg <= 0 || quantityPieces !== 0)
    ) {
      throw new BadRequestException(
        'KG products require a positive quantityKg only',
      );
    }

    if (
      productUnit === ProductUnit.PIECE &&
      (quantityPieces <= 0 || quantityKg !== 0)
    ) {
      throw new BadRequestException(
        'PIECE products require a positive quantityPieces only',
      );
    }
  }

  private isActiveKgPieceEquivalent(
    equivalent: SaleProductUnitEquivalent | undefined,
  ): boolean {
    if (
      !equivalent ||
      equivalent.status !== EquivalentStatus.ACTIVE ||
      this.toNumber(equivalent.factor) <= 0
    )
      return false;
    const isKgPiecePair =
      (equivalent.unitFrom === ProductUnit.PIECE &&
        equivalent.unitTo === ProductUnit.KG) ||
      (equivalent.unitFrom === ProductUnit.KG &&
        equivalent.unitTo === ProductUnit.PIECE);
    if (!isKgPiecePair || !equivalent.effectiveFrom) return false;

    const now = new Date();
    return (
      equivalent.effectiveFrom <= now &&
      (!equivalent.effectiveTo || equivalent.effectiveTo >= now)
    );
  }

  private convertPiecesToKg(
    quantityPieces: number,
    equivalent: SaleProductUnitEquivalent,
  ): number {
    const factor = this.toNumber(equivalent.factor);
    if (
      equivalent.unitFrom === ProductUnit.PIECE &&
      equivalent.unitTo === ProductUnit.KG
    ) {
      return quantityPieces * factor;
    }
    if (
      equivalent.unitFrom === ProductUnit.KG &&
      equivalent.unitTo === ProductUnit.PIECE
    ) {
      return quantityPieces / factor;
    }
    throw new BadRequestException(
      'Unit equivalent must convert between KG and PIECE',
    );
  }

  private async reserveInventory(
    tx: Prisma.TransactionClient,
    items: PreparedItem[],
    locationId: string,
  ): Promise<
    Array<
      PreparedItem & {
        previousQuantityKg: number;
        previousQuantityPieces: number;
        newQuantityKg: number;
        newQuantityPieces: number;
      }
    >
  > {
    const changes: Array<
      PreparedItem & {
        previousQuantityKg: number;
        previousQuantityPieces: number;
        newQuantityKg: number;
        newQuantityPieces: number;
      }
    > = [];

    for (const item of items) {
      const {
        previousQuantityKg,
        previousQuantityPieces,
        newQuantityKg,
        newQuantityPieces,
      } = await this.balanceService.decreaseAvailable(
        tx,
        item.product.id,
        locationId,
        {
          quantityKg: item.quantityKg,
          quantityPieces: item.quantityPieces,
        },
        'Insufficient stock at selected location',
      );
      changes.push({
        ...item,
        previousQuantityKg: this.roundQuantity(previousQuantityKg),
        previousQuantityPieces,
        newQuantityKg,
        newQuantityPieces,
      });
    }

    return changes;
  }

  private async recordInventoryMovements(
    tx: Prisma.TransactionClient,
    items: Array<
      PreparedItem & {
        previousQuantityKg: number;
        previousQuantityPieces: number;
        newQuantityKg: number;
        newQuantityPieces: number;
      }
    >,
    locationId: string,
    saleId: string,
    userId: string,
  ): Promise<CreatedMovement[]> {
    const movements: CreatedMovement[] = [];

    for (const item of items) {
      movements.push(
        await tx.inventoryMovement.create({
          data: {
            productId: item.product.id,
            locationId,
            userId,
            type: InventoryMovementType.SALE,
            quantity: item.billableQuantityKg,
            quantityKg: item.quantityKg,
            quantityPieces: item.quantityPieces,
            previousStock: item.previousQuantityKg,
            newStock: item.newQuantityKg,
            previousQuantityKg: item.previousQuantityKg,
            newQuantityKg: item.newQuantityKg,
            previousQuantityPieces: item.previousQuantityPieces,
            newQuantityPieces: item.newQuantityPieces,
            reason: 'Sale confirmation',
            referenceType: 'Sale',
            referenceId: saleId,
            saleId,
          },
        }),
      );
    }

    return movements;
  }

  private assertLocationMatchesSaleChannel(
    dto: CreateSaleDto,
    locationType: OperationalLocationType,
  ) {
    if (!saleChannelLocationTypes[dto.saleChannel].has(locationType)) {
      throw new BadRequestException(
        `${dto.saleChannel} sales cannot use a ${locationType} location`,
      );
    }
  }

  private async resolveCashShift(
    tx: Prisma.TransactionClient,
    dto: CreateSaleDto,
    locationId: string,
    currentUser: Actor,
    options: { allowNonDraftClose?: boolean } = {},
  ) {
    const isFixedPointOfSale = dto.saleChannel !== SaleChannel.ROUTE;
    if (!dto.cashShiftId && !isFixedPointOfSale) return null;
    if (!dto.cashShiftId) {
      throw new BadRequestException({
        code: 'CASH_SHIFT_REQUIRED',
        message: 'An open cash shift is required for fixed point-of-sale sales',
      });
    }
    if (!dto.deviceId?.trim()) {
      throw new BadRequestException({
        code: 'CASH_TERMINAL_DEVICE_REQUIRED',
        message: 'The registered terminal device is required',
      });
    }

    const shift = await tx.cashShift.findUnique({
      where: { id: dto.cashShiftId },
      select: {
        id: true,
        terminalId: true,
        pointOfSaleDailyCloseId: true,
        operationalLocationId: true,
        cashierUserId: true,
        businessDate: true,
        status: true,
        terminal: { select: { id: true, deviceId: true, isActive: true } },
        pointOfSaleDailyClose: { select: { status: true } },
      },
    });
    if (!shift) {
      throw new BadRequestException({
        code: 'CASH_SHIFT_NOT_FOUND',
        message: 'The selected cash shift does not exist',
      });
    }
    if (shift.operationalLocationId !== locationId) {
      throw new BadRequestException({
        code: 'CASH_SHIFT_LOCATION_MISMATCH',
        message: 'The cash shift does not belong to the sale location',
      });
    }
    if (shift.status !== 'OPEN') {
      throw new BadRequestException({
        code: 'CASH_SHIFT_NOT_OPEN',
        message: 'The selected cash shift is not open for sales',
      });
    }
    if (
      !options.allowNonDraftClose &&
      shift.pointOfSaleDailyClose.status !== PointOfSaleDailyCloseStatus.DRAFT
    ) {
      throw new BadRequestException('DAILY_CLOSE_REOPEN_REQUIRED');
    }
    if (shift.cashierUserId !== currentUser.id) {
      throw new BadRequestException({
        code: 'CASH_SHIFT_CASHIER_MISMATCH',
        message: 'The cash shift belongs to another cashier',
      });
    }
    if (
      !shift.terminal.isActive ||
      shift.terminal.deviceId !== dto.deviceId.trim()
    ) {
      throw new BadRequestException({
        code: 'CASH_TERMINAL_DEVICE_MISMATCH',
        message: 'The device does not belong to the registered cash terminal',
      });
    }
    return shift;
  }

  private assertLocationAccess(dto: CreateSaleDto, currentUser: Actor) {
    if (
      currentUser.role !== 'ADMIN' &&
      currentUser.operationalLocationId !== dto.locationId
    ) {
      throw new ForbiddenException('LOCATION_NOT_AUTHORIZED');
    }
  }

  private assertIdempotentReplayAccess(
    sale: { userId?: string; locationId?: string },
    currentUser: Actor,
  ) {
    if (currentUser.role === 'ADMIN') return;
    if (currentUser.role === 'SELLER' && sale.userId === currentUser.id) return;
    throw new ForbiddenException('SALE_NOT_AUTHORIZED');
  }

  private resolvePayments(dto: CreateSaleDto): CreateSalePaymentDto[] {
    if (dto.payments !== undefined && dto.initialPayment !== undefined) {
      throw new BadRequestException(
        'payments and initialPayment cannot be sent together',
      );
    }
    const sourcePayments =
      dto.payments ?? (dto.initialPayment ? [dto.initialPayment] : []);
    return sourcePayments.map((payment) => ({
      ...payment,
      amount: Money.from(payment.amount).toString(),
      ...(payment.cashTendered === undefined
        ? {}
        : { cashTendered: Money.from(payment.cashTendered).toString() }),
    }));
  }

  private assertPaymentRules(
    dto: CreateSaleDto,
    customer: CustomerCredit | null,
    total: Money,
    payments: CreateSalePaymentDto[],
    totalPaid: Money,
  ) {
    if (payments.some((payment) => !Money.from(payment.amount).isPositive())) {
      throw new BadRequestException(
        'Each payment amount must be greater than zero',
      );
    }
    if (totalPaid.compare(total) > 0) {
      throw new BadRequestException('Payment total cannot exceed sale total');
    }

    if (
      dto.paymentType === SalePaymentType.CASH_SALE &&
      totalPaid.compare(total) !== 0
    ) {
      throw new BadRequestException({
        code: 'CASH_SALE_REQUIRES_FULL_PAYMENT',
        message:
          'Cash sales must be fully paid before confirmation; change the sale type to credit to record a partial payment',
      });
    }

    if (dto.paymentType === SalePaymentType.CREDIT_SALE && !customer) {
      throw new BadRequestException('customerId is required for credit sales');
    }

    for (const payment of payments) {
      const bankName = this.normalizeOptionalText(payment.bankName);
      const referenceNumber = this.normalizeOptionalText(
        payment.referenceNumber,
      );
      const cardLastFour = this.normalizeOptionalText(payment.cardLastFour);
      const method = payment.paymentMethod;
      const cashTendered = payment.cashTendered;

      if (cashTendered !== undefined) {
        if (method !== PaymentMethod.CASH) {
          throw new BadRequestException(
            'cashTendered is only valid for cash payments',
          );
        }
        if (
          !Money.from(cashTendered).isPositive() ||
          Money.from(cashTendered).compare(payment.amount) < 0
        ) {
          throw new BadRequestException(
            'cashTendered must be positive and at least the applied payment amount',
          );
        }
      }

      if (
        (method === PaymentMethod.TRANSFER ||
          method === PaymentMethod.DEPOSIT ||
          method === PaymentMethod.CHECK) &&
        (!bankName || !referenceNumber)
      ) {
        throw new BadRequestException(
          'Bank name and reference number are required for transfer, deposit, and check payments',
        );
      }

      if (
        (method === PaymentMethod.CARD || method === PaymentMethod.VOUCHER) &&
        (!referenceNumber || !/^\d{4}$/.test(cardLastFour ?? ''))
      ) {
        throw new BadRequestException(
          'Authorization code and the last four card digits are required for card payments',
        );
      }
    }
  }

  private async nextSaleNumber(tx: Prisma.TransactionClient): Promise<string> {
    const rows = await tx.$queryRawUnsafe<Array<{ value: bigint | number }>>(
      'SELECT nextval(\'"Sale_saleNumber_seq"\') AS value',
    );
    return `SALE-${String(rows[0].value).padStart(6, '0')}`;
  }

  private isSaleNumberUniqueConflict(error: unknown): boolean {
    if (typeof error !== 'object' || error === null) return false;
    const prismaError = error as {
      code?: unknown;
      meta?: { target?: unknown };
    };
    if (prismaError.code !== 'P2002') return false;
    const target = prismaError.meta?.target;
    return Array.isArray(target)
      ? target.some((value) => String(value).includes('saleNumber'))
      : String(target).includes('saleNumber');
  }

  private toSaleResponse(
    sale: { [key: string]: unknown; items?: Array<Record<string, unknown>> },
    currentUser: Actor,
  ) {
    const creditDecision = sale.creditDecisionSnapshot as
      Record<string, unknown> | null | undefined;
    const visibleSale = { ...sale };
    if (currentUser.role !== 'ADMIN') delete visibleSale.deviceId;
    return {
      ...visibleSale,
      creditWarnings: Array.isArray(creditDecision?.warnings)
        ? creditDecision.warnings
        : [],
      subtotal: this.moneyToString(sale.subtotal),
      discount: this.moneyToString(sale.discount),
      tax: this.moneyToString(sale.tax),
      total: this.moneyToString(sale.total),
      items:
        sale.items?.map((item) => {
          const projectedItem = {
            ...item,
            quantity: this.decimalToString(item.quantity),
            quantityKg: this.decimalToString(item.quantityKg),
            unitPrice: this.moneyToString(item.unitPrice),
            unitPriceSnapshot: this.moneyToString(item.unitPriceSnapshot),
            quantitySnapshot: this.decimalToString(item.quantitySnapshot),
            appliedEquivalentFactor: this.decimalToString(
              item.appliedEquivalentFactor,
            ),
            subtotal: this.moneyToString(item.subtotal),
            unitCostSnapshot: this.moneyToString(item.unitCostSnapshot),
            costSubtotalSnapshot: this.moneyToString(item.costSubtotalSnapshot),
            costSnapshotSource: item.costSnapshotSource,
          };
          if (currentUser.role !== 'SELLER') return projectedItem;
          const visibleItem = { ...projectedItem } as Partial<
            typeof projectedItem
          >;
          delete visibleItem.unitCostSnapshot;
          delete visibleItem.costSubtotalSnapshot;
          delete visibleItem.costSnapshotSource;
          return visibleItem;
        }) ?? [],
    };
  }

  private buildVisibleSalesWhere(
    query: ListSalesQueryDto,
    currentUser: Actor,
  ): Prisma.SaleWhereInput {
    const where = this.buildSalesFilterWhere(query);
    return this.applyVisibilityScope(where, currentUser);
  }

  private async assertBranchOrderLocationAccess(
    locationId: string,
    currentUser: Actor,
  ): Promise<void> {
    if (!['ADMIN', 'SELLER'].includes(currentUser.role)) {
      throw new ForbiddenException('BRANCH_ORDERS_FORBIDDEN');
    }

    if (
      currentUser.role === 'SELLER' &&
      currentUser.operationalLocationId !== locationId
    ) {
      throw new ForbiddenException('BRANCH_ORDERS_LOCATION_FORBIDDEN');
    }

    const location = await this.prisma.operationalLocation.findUnique({
      where: { id: locationId },
      select: { id: true, isActive: true },
    });
    if (!location?.isActive)
      throw new NotFoundException('Operational location not found');
  }

  private buildVisibleSaleDetailWhere(
    id: string,
    currentUser: Actor,
  ): Prisma.SaleWhereInput {
    return this.applyVisibilityScope({ id }, currentUser);
  }

  private applyVisibilityScope(
    where: Prisma.SaleWhereInput,
    currentUser: Actor,
  ): Prisma.SaleWhereInput {
    if (currentUser.role === 'ADMIN') {
      return where;
    }

    if (currentUser.role === 'SELLER') {
      return { ...where, userId: currentUser.id };
    }

    if (currentUser.role === 'COLLECTIONS') {
      return {
        ...where,
        paymentType: SalePaymentType.CREDIT_SALE,
        accountReceivable: { isNot: null },
      };
    }

    return { ...where, id: '__no_visible_sale__' };
  }

  private buildSalesFilterWhere(
    query: ListSalesQueryDto,
  ): Prisma.SaleWhereInput {
    const where: Prisma.SaleWhereInput = {};

    if (query.dateFrom || query.dateTo) {
      where.createdAt = {
        ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
        ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
      };
    }
    if (query.userId) where.userId = query.userId;
    if (query.customerId) where.customerId = query.customerId;
    if (query.locationId) where.locationId = query.locationId;
    if (query.status) where.status = query.status;
    if (query.paymentType ?? query.saleType)
      where.paymentType = query.paymentType ?? query.saleType;
    if (query.collectionStatus) where.collectionStatus = query.collectionStatus;
    if (query.saleChannel) where.saleChannel = query.saleChannel;
    if (query.documentType) where.documentType = query.documentType;
    if (query.physicalFolio) where.physicalFolio = query.physicalFolio;
    if (query.pointOfSaleDailyCloseId)
      where.pointOfSaleDailyCloseId = query.pointOfSaleDailyCloseId;
    if (query.paymentMethod) {
      where.payments = {
        some: {
          paymentMethod: query.paymentMethod,
          status: PaymentStatus.APPLIED,
        },
      };
    }

    return where;
  }

  private buildPagination(
    query: Pick<ListSalesQueryDto, 'page' | 'limit'>,
  ): Pick<Prisma.SaleFindManyArgs, 'skip' | 'take'> {
    const take = query.limit;
    const page = query.page ?? 1;

    return {
      ...(take ? { take } : {}),
      ...(take ? { skip: (page - 1) * take } : {}),
    };
  }

  private toSaleListItem(sale: SaleListRecord) {
    const billingRequest =
      sale.billingRequests?.[0] ?? sale.billingRequest ?? null;
    return {
      id: sale.id,
      saleNumber: sale.saleNumber,
      customerId: sale.customerId,
      customerName: sale.customer?.name ?? null,
      userId: sale.userId,
      locationId: sale.locationId,
      saleChannel: sale.saleChannel,
      documentType: sale.documentType,
      physicalFolio: sale.physicalFolio,
      requiresAdministrativeInvoice: sale.requiresAdministrativeInvoice,
      subtotal: this.moneyToString(sale.subtotal),
      discount: this.moneyToString(sale.discount),
      tax: this.moneyToString(sale.tax),
      total: this.moneyToString(sale.total),
      paymentType: sale.paymentType,
      collectionStatus: sale.collectionStatus,
      status: sale.status,
      createdAt: sale.createdAt,
      accountReceivableId: sale.accountReceivable?.id ?? null,
      billingRequestId: billingRequest?.id ?? null,
      billingRequestStatus: billingRequest?.status ?? null,
      paymentsSummary: this.toPaymentsSummary(sale.payments ?? []),
      deliveredByUserId: sale.deliveredByUserId ?? null,
      collectedByUserId: sale.collectedByUserId ?? null,
      routeId: sale.routeId ?? null,
      pointOfSaleDailyCloseId: sale.pointOfSaleDailyCloseId ?? null,
    };
  }

  private toBranchOrder(sale: BranchOrderRecord) {
    return {
      id: sale.id,
      saleNumber: sale.saleNumber,
      createdAt: sale.createdAt,
      location: sale.location,
      customer: sale.customer,
      items: sale.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        productName: item.productNameSnapshot,
        unit: item.unit,
        quantityKg: this.decimalToString(item.quantityKg),
        quantityPieces: item.quantityPieces,
      })),
      total: this.moneyToString(sale.total),
      status: sale.status,
    };
  }

  private toSaleDetail(sale: SaleDetailRecord) {
    const route = sale.route;
    const billingRequest =
      sale.billingRequests?.[0] ?? sale.billingRequest ?? null;
    const routeGeometry = this.validLineStringGeometry(route?.geometry)
      ? (route?.geometry ?? null)
      : null;
    return {
      ...this.toSaleListItem(sale),
      items:
        sale.items?.map((item) => ({
          id: item.id,
          productId: item.productId,
          productName: item.productNameSnapshot ?? null,
          unit: item.unit,
          quantityKg: this.decimalToString(item.quantityKg),
          quantityPieces: item.quantityPieces ?? null,
          unitPrice: this.moneyToString(item.unitPrice),
          unitEquivalentId: item.unitEquivalentId ?? null,
          appliedEquivalentFactor: this.decimalToString(
            item.appliedEquivalentFactor,
          ),
          roundingMode: item.roundingMode ?? null,
          subtotal: this.moneyToString(item.subtotal),
        })) ?? [],
      customer: sale.customer ?? null,
      commercialPolicy: this.toCommercialPolicyResponse(
        sale.commercialPolicy ?? null,
      ),
      accountReceivable: sale.accountReceivable
        ? this.toReceivableRecordResponse(sale.accountReceivable)
        : null,
      billingRequest,
      ticket: this.findTicketDocument(sale.documents ?? []),
      documents: sale.documents ?? [],
      inventoryMovements:
        sale.inventoryMovements?.map((movement) =>
          this.toMovementRecordResponse(movement),
        ) ?? [],
      routePreview: route
        ? {
            id: route.id,
            name: route.name,
            geometry: routeGeometry,
            mapAvailable:
              route.optimizationStatus === 'OPTIMIZED' &&
              routeGeometry !== null,
            distanceMeters: route.distanceMeters ?? null,
            durationSeconds: route.durationSeconds ?? null,
            order:
              sale.deliveryOrder?.latitude != null &&
              sale.deliveryOrder.longitude != null
                ? {
                    latitude: this.toNumber(sale.deliveryOrder.latitude),
                    longitude: this.toNumber(sale.deliveryOrder.longitude),
                    stopSequence: sale.deliveryOrder.stopSequence ?? null,
                  }
                : null,
          }
        : null,
    };
  }

  private validLineStringGeometry(
    value: Prisma.JsonValue | null | undefined,
  ): boolean {
    if (!value || Array.isArray(value) || typeof value !== 'object')
      return false;
    const geometry = value;
    if (
      geometry.type !== 'LineString' ||
      !Array.isArray(geometry.coordinates) ||
      geometry.coordinates.length < 2
    )
      return false;
    return geometry.coordinates.every(
      (coordinate) =>
        Array.isArray(coordinate) &&
        coordinate.length === 2 &&
        coordinate.every(
          (axis) => typeof axis === 'number' && Number.isFinite(axis),
        ),
    );
  }

  private toSaleTicket(sale: SaleTicketRecord) {
    const ticketDocument = this.findTicketDocument(sale.documents ?? []);
    const physicalFolio = (ticketDocument?.physicalFolio ??
      sale.physicalFolio ??
      null) as string | null;
    const scaleDocument = (sale.documents ?? []).find(
      (document) => document.documentType === SaleDocumentType.SCALE_TICKET,
    );
    const scaleReference =
      sale.documentType === SaleDocumentType.SCALE_TICKET
        ? ((sale.scaleTicketReferences ?? []).find(
            (reference) => reference.saleDocumentId === scaleDocument?.id,
          ) ??
          sale.scaleTicketReferences?.[0] ??
          null)
        : null;

    return {
      ticketId: ticketDocument?.id ?? null,
      ticketNumber: physicalFolio ?? sale.saleNumber,
      saleNumber: sale.saleNumber,
      createdAt: ticketDocument?.createdAt ?? sale.createdAt,
      documentType: sale.documentType,
      physicalFolio: sale.physicalFolio,
      requiresAdministrativeInvoice: sale.requiresAdministrativeInvoice,
      sellerName: sale.user?.name ?? null,
      customerName: sale.customer?.name ?? null,
      customerAddress: sale.customer?.address ?? null,
      customerPhone: sale.customer?.phone ?? null,
      customerTaxId: sale.customer?.taxId ?? null,
      customerCreditDays: sale.customer?.creditDays ?? null,
      locationId: sale.locationId,
      locationName: sale.location?.name ?? null,
      items:
        sale.items?.map((item) => ({
          productId: item.productId,
          productName: item.productNameSnapshot ?? null,
          unit: item.unit,
          quantityKg: this.decimalToString(item.quantityKg),
          quantityPieces: item.quantityPieces ?? null,
          unitPrice: this.moneyToString(item.unitPrice),
          subtotal: this.moneyToString(item.subtotal),
        })) ?? [],
      subtotal: this.moneyToString(sale.subtotal),
      discount: this.moneyToString(sale.discount),
      tax: this.moneyToString(sale.tax),
      total: this.moneyToString(sale.total),
      paymentType: sale.paymentType,
      collectionStatus: sale.collectionStatus,
      status: sale.status,
      payments: (sale.payments ?? []).map((payment) => ({
        amount: this.moneyToString(payment.amount),
        cashTendered:
          payment.cashTendered === null || payment.cashTendered === undefined
            ? null
            : this.moneyToString(payment.cashTendered),
        changeGiven:
          payment.changeGiven === null || payment.changeGiven === undefined
            ? null
            : this.moneyToString(payment.changeGiven),
        paymentMethod: payment.paymentMethod,
        paidAt: payment.paidAt ?? null,
        saleId: payment.saleId ?? null,
        accountReceivableId: payment.accountReceivableId ?? null,
      })),
      ...(sale.documentType === SaleDocumentType.SCALE_TICKET
        ? {
            scaleTicket: scaleReference
              ? {
                  physicalFolio: scaleReference.physicalFolio,
                  capturedAt: scaleReference.capturedAt,
                  productName: scaleReference.product?.name ?? null,
                  productUnit: scaleReference.product?.unit ?? null,
                  grossWeightKg: this.decimalToString(
                    scaleReference.grossWeightKg,
                  ),
                  tareWeightKg: this.decimalToString(
                    scaleReference.tareWeightKg,
                  ),
                  netWeightKg: this.decimalToString(
                    scaleReference.netWeightKg ?? scaleReference.weightKg,
                  ),
                  pieceCount: scaleReference.pieceCount ?? null,
                  unitPrice:
                    scaleReference.unitPrice === null ||
                    scaleReference.unitPrice === undefined
                      ? null
                      : toMoneyString(scaleReference.unitPrice),
                  amount:
                    scaleReference.amount === null ||
                    scaleReference.amount === undefined
                      ? null
                      : toMoneyString(scaleReference.amount),
                  operatorName: scaleReference.capturedBy?.name ?? null,
                }
              : null,
          }
        : {}),
      legend: 'Comprobante interno sin validez fiscal',
    };
  }

  private toPaymentsSummary(payments: SalePaymentSummaryInput[]) {
    const appliedPayments = payments.filter(
      (payment) =>
        payment.status === undefined ||
        payment.status === PaymentStatus.APPLIED,
    );
    const totalPaid = Money.sum(
      appliedPayments.map((payment) => payment.amount),
    );
    const lastPaidAt =
      appliedPayments
        .map((payment) => payment.paidAt)
        .filter(
          (paidAt): paidAt is Date | string =>
            paidAt !== null && paidAt !== undefined,
        )
        .map((paidAt) => (paidAt instanceof Date ? paidAt : new Date(paidAt)))
        .sort((left, right) => right.getTime() - left.getTime())[0] ?? null;
    const methods = Array.from(
      new Set(appliedPayments.map((payment) => payment.paymentMethod)),
    );

    return {
      totalPaid: totalPaid.toString(),
      lastPaidAt,
      methods,
    };
  }

  private toCommercialPolicyResponse(policy: Record<string, unknown> | null) {
    if (!policy) return null;

    return {
      ...policy,
      defaultCreditLimit: this.decimalToString(policy.defaultCreditLimit),
    };
  }

  private toReceivableRecordResponse(receivable: Record<string, unknown>) {
    return {
      ...receivable,
      originalAmount: toMoneyString(receivable.originalAmount as DecimalLike),
      outstandingAmount: toMoneyString(
        receivable.outstandingAmount as DecimalLike,
      ),
    };
  }

  private toMovementRecordResponse(movement: Record<string, unknown>) {
    return {
      ...movement,
      quantity: this.decimalToString(movement.quantity),
      quantityKg: this.decimalToString(movement.quantityKg),
      previousStock: this.decimalToString(movement.previousStock),
      newStock: this.decimalToString(movement.newStock),
      previousQuantityKg: this.decimalToString(movement.previousQuantityKg),
      newQuantityKg: this.decimalToString(movement.newQuantityKg),
    };
  }

  private findTicketDocument(documents: Record<string, unknown>[]) {
    return (
      documents.find(
        (document) =>
          document.documentType === SaleDocumentType.INTERNAL_RECEIPT,
      ) ?? null
    );
  }

  private buildCustomerSnapshot(
    customer: CustomerCredit | null,
  ): Record<string, unknown> | undefined {
    if (!customer) {
      return undefined;
    }

    return {
      id: customer.id,
      name: customer.name ?? null,
      commercialName: customer.commercialName ?? null,
      customerNumber: customer.customerNumber ?? null,
      customerType: customer.customerType ?? null,
      address: customer.address ?? null,
      phone: customer.phone ?? null,
      taxId: customer.taxId ?? null,
      paymentTermsDays: customer.creditDays ?? null,
    };
  }

  private buildProductSnapshot(items: PreparedItem[]) {
    return {
      items: items.map((item) => ({
        productId: item.product.id,
        name: item.product.name,
        sku: item.product.sku ?? null,
        unit: item.product.unit,
        quantityKg: item.quantityKg,
        quantityPieces: item.quantityPieces,
        unitPrice: item.unitPrice.toString(),
        subtotal: item.subtotal.toString(),
        equivalentFactor: item.equivalentFactor,
        roundingMode: item.roundingMode,
      })),
    };
  }

  private buildPriceSnapshot(snapshot: {
    subtotal: Money;
    discount: Money;
    tax: Money;
    total: Money;
    paid: Money;
    outstanding: Money;
    paymentType: SalePaymentType;
    paymentMethod: PaymentMethod | null;
    dueDate: Date | null;
  }) {
    return {
      subtotal: snapshot.subtotal.toString(),
      discount: snapshot.discount.toString(),
      tax: snapshot.tax.toString(),
      total: snapshot.total.toString(),
      paid: snapshot.paid.toString(),
      outstanding: snapshot.outstanding.toString(),
      paymentType: snapshot.paymentType,
      paymentMethod: snapshot.paymentMethod,
      dueDate: snapshot.dueDate?.toISOString() ?? null,
    };
  }

  private toSaleDocumentPrint(document: SaleDocumentPrintRecord) {
    const customer = this.snapshotRecord(document.customerSnapshot);
    const product = this.snapshotRecord(document.productSnapshot);
    const price = this.snapshotRecord(document.priceSnapshot);
    const items = Array.isArray(product?.items) ? product.items : [];
    const firstItem = this.snapshotRecord(items[0]);
    const scaleReference = document.scaleTicketReferences?.[0] ?? null;

    return {
      ticketId: document.id,
      ticketNumber: document.physicalFolio ?? document.id,
      createdAt: document.createdAt,
      documentType: document.documentType,
      physicalFolio: document.physicalFolio ?? null,
      requiresAdministrativeInvoice: document.requiresAdministrativeInvoice,
      templateVersion: document.printTemplateVersion,
      customerName: this.snapshotString(customer, 'name'),
      customerCommercialName: this.snapshotString(customer, 'commercialName'),
      customerNumber: this.snapshotString(customer, 'customerNumber'),
      customerAddress: this.snapshotString(customer, 'address'),
      customerPhone: this.snapshotString(customer, 'phone'),
      customerTaxId: this.snapshotString(customer, 'taxId'),
      customerCreditDays: this.snapshotNumber(customer, 'paymentTermsDays'),
      locationId: document.operationalLocationId ?? null,
      items: items.map((item) => {
        const snapshot = this.snapshotRecord(item);
        return {
          productName:
            this.snapshotString(snapshot, 'name') ??
            this.snapshotString(snapshot, 'productName'),
          sku:
            this.snapshotString(snapshot, 'sku') ??
            this.snapshotString(snapshot, 'productSku'),
          unit: this.snapshotString(snapshot, 'unit'),
          quantityKg: this.snapshotNumber(snapshot, 'quantityKg'),
          quantityPieces: this.snapshotNumber(snapshot, 'quantityPieces'),
          unitPrice: this.snapshotNumber(snapshot, 'unitPrice'),
          subtotal: this.snapshotNumber(snapshot, 'subtotal'),
        };
      }),
      subtotal: this.decimalToString(this.snapshotNumber(price, 'subtotal')),
      discount: this.decimalToString(this.snapshotNumber(price, 'discount')),
      tax: this.decimalToString(this.snapshotNumber(price, 'tax')),
      total: this.decimalToString(this.snapshotNumber(price, 'total')),
      paid: this.decimalToString(this.snapshotNumber(price, 'paid')),
      outstanding: this.decimalToString(
        this.snapshotNumber(price, 'outstanding'),
      ),
      paymentType: this.snapshotString(price, 'paymentType'),
      paymentMethod: this.snapshotString(price, 'paymentMethod'),
      payments: (document.sale?.payments ?? []).map((payment) => ({
        amount: this.decimalToString(payment.amount),
        cashTendered: this.decimalToString(payment.cashTendered),
        changeGiven: this.decimalToString(payment.changeGiven),
        paymentMethod: payment.paymentMethod,
        paidAt: payment.paidAt ?? null,
      })),
      dueDate: this.snapshotString(price, 'dueDate'),
      scaleTicket:
        document.documentType === SaleDocumentType.SCALE_TICKET &&
        scaleReference
          ? {
              physicalFolio: scaleReference.physicalFolio,
              capturedAt: scaleReference.capturedAt,
              productName:
                this.snapshotString(firstItem, 'name') ??
                this.snapshotString(firstItem, 'productName'),
              productUnit: this.snapshotString(firstItem, 'unit'),
              grossWeightKg: this.decimalToString(scaleReference.grossWeightKg),
              tareWeightKg: this.decimalToString(scaleReference.tareWeightKg),
              netWeightKg: this.decimalToString(
                scaleReference.netWeightKg ?? scaleReference.weightKg,
              ),
              pieceCount: scaleReference.pieceCount ?? null,
              unitPrice: this.decimalToString(scaleReference.unitPrice),
              amount: this.decimalToString(scaleReference.amount),
              operatorName: scaleReference.capturedBy?.name ?? null,
            }
          : null,
      legend: 'Comprobante interno sin validez fiscal',
    };
  }

  private snapshotRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  }

  private snapshotString(
    snapshot: Record<string, unknown> | null,
    key: string,
  ): string | null {
    const value = snapshot?.[key];
    return typeof value === 'string' ? value : null;
  }

  private snapshotNumber(
    snapshot: Record<string, unknown> | null,
    key: string,
  ): number | string | null {
    const value = snapshot?.[key];
    return typeof value === 'number' || typeof value === 'string'
      ? value
      : null;
  }

  private toSaleDocumentResponse(document: SaleDocumentListRecord) {
    return {
      id: document.id,
      saleId: document.saleId,
      documentType: document.documentType,
      operationalLocationId: document.operationalLocationId ?? null,
      pointOfSaleDailyCloseId: document.pointOfSaleDailyCloseId ?? null,
      physicalFolio: document.physicalFolio ?? null,
      status: document.status,
      requiresAdministrativeInvoice: document.requiresAdministrativeInvoice,
      deliveredByUserId: document.deliveredByUserId ?? null,
      collectedByUserId: document.collectedByUserId ?? null,
      routeId: document.routeId ?? null,
      printTemplateVersion: document.printTemplateVersion ?? 1,
      customerSnapshot: document.customerSnapshot ?? null,
      productSnapshot: document.productSnapshot ?? null,
      priceSnapshot: document.priceSnapshot ?? null,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
    };
  }

  private toPaymentResponse(payment: CreatedPayment) {
    return {
      ...payment,
      amount: this.decimalToString(payment.amount),
      cashTendered: this.decimalToString(payment.cashTendered),
      changeGiven: this.decimalToString(payment.changeGiven),
    };
  }

  private toReceivableResponse(receivable: CreatedReceivable) {
    return {
      ...receivable,
      originalAmount: this.decimalToString(receivable.originalAmount),
      outstandingAmount: this.decimalToString(receivable.outstandingAmount),
    };
  }

  private toMovementResponse(movement: MovementResponseInput) {
    return {
      ...movement,
      quantity: this.decimalToString(movement.quantity),
      quantityKg: this.decimalToString(movement.quantityKg),
      previousStock: this.decimalToString(movement.previousStock),
      newStock: this.decimalToString(movement.newStock),
      previousQuantityKg: this.decimalToString(movement.previousQuantityKg),
      newQuantityKg: this.decimalToString(movement.newQuantityKg),
    };
  }

  private decimalToString(value: unknown): string | null {
    if (value === null || value === undefined) {
      return null;
    }
    return value instanceof Prisma.Decimal
      ? value.toString()
      : stringifyValue(value);
  }

  private moneyToString(value: unknown): string {
    return toMoneyString(value as DecimalLike);
  }

  private toNumber(value: DecimalLike): number {
    if (value === null || value === undefined) {
      return 0;
    }
    return Number(value instanceof Prisma.Decimal ? value.toString() : value);
  }

  private roundQuantity(value: number): number {
    return Math.round((value + Number.EPSILON) * 1000) / 1000;
  }

  private normalizeOptionalText(value?: string | null): string | null {
    const normalized = value?.trim();
    return normalized ? normalized : null;
  }

  private addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setUTCDate(result.getUTCDate() + days);
    return result;
  }

  private hashPayload(payload: unknown): string {
    return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  }
}

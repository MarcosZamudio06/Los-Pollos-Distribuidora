import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  BillingRequestStatus,
  CollectionStatus,
  CreditStatus,
  EquivalentStatus,
  InventoryMovementType,
  OperationalLocationType,
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
} from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CancelSaleDto, CreateSaleDto, CreateSaleItemDto, ListSalesQueryDto } from './dto';
import { evaluateCreditDecision } from './credit-decision';

type Actor = Pick<AuthenticatedUser, 'id' | 'role' | 'operationalLocationId'>;
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
  customerNumber?: string | null;
  customerType?: string | null;
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
  unitPrice: number;
  subtotal: number;
  equivalentFactor: number | null;
  roundingMode: string | null;
};

type CreatedPayment = Awaited<ReturnType<Prisma.TransactionClient['payment']['create']>>;
type CreatedReceivable = Awaited<ReturnType<Prisma.TransactionClient['accountReceivable']['create']>>;
type CreatedMovement = Awaited<ReturnType<Prisma.TransactionClient['inventoryMovement']['create']>>;
type UpdatedSale = Awaited<ReturnType<Prisma.TransactionClient['sale']['update']>>;
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
  paymentMethod: string;
  paidAt?: Date | string | null;
  status?: PaymentStatus | string;
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
  items?: Array<Record<string, unknown> & { productNameSnapshot?: string | null }>;
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
  customerSnapshot?: Record<string, unknown> | null;
  productSnapshot?: Record<string, unknown> | null;
  priceSnapshot?: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
};

type SaleTicketRecord = SaleListRecord & {
  user?: { id: string; name: string } | null;
  location?: { id: string; name: string } | null;
  documents?: Record<string, unknown>[];
  items?: Array<Record<string, unknown> & { productNameSnapshot?: string | null }>;
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
  pointOfSaleDailyClose?: { status: PointOfSaleDailyCloseStatus } | null;
  payments?: Array<{ id: string; status: PaymentStatus; accountReceivableId?: string | null; saleId?: string | null }>;
  route?: { settlement?: { status: RouteSettlementStatus } | null } | null;
  inventoryMovements?: Array<Record<string, unknown>>;
  accountReceivable?: (Record<string, unknown> & {
    id: string;
    originalAmount: DecimalLike;
    outstandingAmount: DecimalLike;
    status: CollectionStatus;
    payments?: Array<{ id: string; status: PaymentStatus; accountReceivableId?: string | null }>;
  }) | null;
  items?: Array<{
    id: string;
    productId: string;
    quantity?: DecimalLike;
    quantityKg?: DecimalLike;
    quantityPieces?: number | null;
  }>;
};

const saleChannelLocationTypes: Record<SaleChannel, ReadonlySet<OperationalLocationType>> = {
  [SaleChannel.COUNTER]: new Set([
    OperationalLocationType.BRANCH,
    OperationalLocationType.MIXED,
    OperationalLocationType.EXTERNAL_POINT_OF_SALE,
  ]),
  [SaleChannel.EXTERNAL_POINT_OF_SALE]: new Set([OperationalLocationType.EXTERNAL_POINT_OF_SALE]),
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
  constructor(private readonly prisma: PrismaService) {}

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
    } as Prisma.SaleFindManyArgs)) as SaleListRecord[];

    return { items: sales.map((sale) => this.toSaleListItem(sale)) };
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
        deliveryOrder: { select: { latitude: true, longitude: true, stopSequence: true } },
      },
    } as Prisma.SaleFindFirstArgs)) as SaleDetailRecord | null;

    if (!sale) {
      throw new NotFoundException('Sale not found');
    }

    return this.toSaleDetail(sale);
  }

  async getTicket(id: string, currentUser: Actor) {
    const sale = (await this.prisma.sale.findFirst({
      where: this.buildVisibleSaleDetailWhere(id, currentUser),
      include: {
        customer: { select: { id: true, name: true, address: true, phone: true, taxId: true, creditDays: true } },
        user: { select: { id: true, name: true } },
        location: { select: { id: true, name: true } },
        documents: { orderBy: { createdAt: 'desc' } },
        payments: {
          where: { status: PaymentStatus.APPLIED },
          orderBy: { paidAt: 'desc' },
        },
        items: true,
      },
    } as Prisma.SaleFindFirstArgs)) as SaleTicketRecord | null;

    if (!sale) {
      throw new NotFoundException('Sale not found');
    }

    return this.toSaleTicket(sale);
  }

  async create(dto: CreateSaleDto, currentUser: Actor, idempotencyKey: string) {
    if (!dto.items?.length) {
      throw new BadRequestException('Sale must contain at least one item');
    }
    this.assertOverrideIntent(dto, currentUser);

    const payloadHash = this.hashPayload(dto);

    return this.withSerializableRetry(() => this.prisma.$transaction(
      async (tx) => {
        const existingSale = await tx.sale.findUnique({
          where: { idempotencyKey },
          include: { items: true, payments: true, accountReceivable: true, billingRequests: { orderBy: { requestedAt: 'desc' }, take: 1 }, inventoryMovements: true, documents: true },
        });

        if (existingSale) {
          if (existingSale.idempotencyPayloadHash !== payloadHash) {
            throw new ConflictException('Idempotency-Key was already used for a different sale payload');
          }

          const existingBillingState = existingSale as unknown as SaleListRecord;
          return {
            sale: this.toSaleResponse(existingSale),
            payment: existingSale.payments[0] ? this.toPaymentResponse(existingSale.payments[0]) : null,
            accountReceivable: existingSale.accountReceivable ? this.toReceivableResponse(existingSale.accountReceivable) : null,
            billingRequest: existingSale.billingRequests?.[0] ?? existingBillingState.billingRequest ?? null,
            inventoryMovements: existingSale.inventoryMovements.map((movement) => this.toMovementResponse(movement)),
            documents: (existingSale.documents ?? []).map((document) => this.toSaleDocumentResponse(document as SaleDocumentListRecord)),
          };
        }
        this.assertLocationAccess(dto, currentUser);

        const location = await tx.operationalLocation.findUnique({ where: { id: dto.locationId } });
        if (!location?.isActive) {
          throw new NotFoundException('Operational location not found');
        }

        this.assertLocationMatchesSaleChannel(dto, location.type);

        const customer = dto.customerId
          ? ((await tx.customer.findUnique({ where: { id: dto.customerId } })) as CustomerCredit | null)
          : null;

        if (dto.customerId && !customer?.isActive) {
          throw new NotFoundException('Customer not found');
        }

        this.assertBillingRequestInput(dto, customer);

        const preparedItems = await this.prepareItems(tx, dto.items);
        const subtotal = this.roundMoney(preparedItems.reduce((sum, item) => sum + item.subtotal, 0));
        const discount = this.roundMoney(dto.discount ?? 0);
        if (discount > subtotal) {
          throw new BadRequestException('Discount cannot exceed subtotal');
        }
        const total = this.roundMoney(subtotal - discount);
        const initialPaymentAmount = this.roundMoney(dto.initialPayment?.amount ?? 0);

        this.assertPaymentRules(dto, customer, total, initialPaymentAmount);

        const outstandingAmount = this.roundMoney(total - initialPaymentAmount);
        if (outstandingAmount > 0 && !customer) {
          throw new BadRequestException('customerId is required when sale leaves an outstanding balance');
        }
        if (dto.administrativeOverrideReason !== undefined && (dto.paymentType !== SalePaymentType.CREDIT_SALE || outstandingAmount <= 0 || !customer)) {
          throw new BadRequestException({ code: 'CREDIT_OVERRIDE_NOT_APPLICABLE', message: 'Administrative override is not applicable to this sale' });
        }

        let creditDecision: Awaited<ReturnType<typeof evaluateCreditDecision>> | null = null;
        if (outstandingAmount > 0 && customer && dto.paymentType === SalePaymentType.CREDIT_SALE) {
          creditDecision = await evaluateCreditDecision(tx, {
            customer,
            newOutstandingAmount: outstandingAmount,
            actor: currentUser,
            policyId: this.normalizeOptionalText(dto.commercialPolicyId ?? customer.commercialPolicyId),
            overrideReason: dto.administrativeOverrideReason,
          });
        }

        const inventoryChanges = await this.reserveInventory(tx, preparedItems, dto.locationId);

        const legalEntityMapping = await tx.legalEntityOperationalLocation.findFirst({
          where: {
            operationalLocationId: dto.locationId,
            effectiveFrom: { lte: new Date() },
            OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }],
            legalEntity: { isActive: true },
          },
          orderBy: { effectiveFrom: 'desc' },
          select: { legalEntityId: true },
        });

        const saleNumber = await this.nextSaleNumber(tx);
        const sale = await tx.sale.create({
          data: {
            saleNumber,
            customerId: dto.customerId ?? null,
            userId: currentUser.id,
            locationId: dto.locationId,
            saleChannel: dto.saleChannel,
            documentType: dto.documentType,
            currencyCode: 'MXN',
            legalEntityId: legalEntityMapping?.legalEntityId ?? null,
            physicalFolio: this.normalizeOptionalText(dto.physicalFolio),
            requiresAdministrativeInvoice: dto.requiresAdministrativeInvoice ?? false,
            commercialPolicyId: this.normalizeOptionalText(dto.commercialPolicyId ?? customer?.commercialPolicyId),
            idempotencyKey,
            idempotencyPayloadHash: payloadHash,
            administrativeOverrideReason: creditDecision?.overrideReason ?? null,
            administrativeOverrideApprovedByUserId: creditDecision?.overrideActorId ?? null,
            creditDecisionSnapshot: creditDecision ?? undefined,
            creditDecisionEvaluatedAt: creditDecision ? new Date() : null,
            collectionStatus: outstandingAmount > 0 ? CollectionStatus.UNPAID : CollectionStatus.PAID,
            subtotal,
            discount,
            tax: 0,
            total,
            paymentType: dto.paymentType,
            status: SaleStatus.CONFIRMED,
            items: {
              create: preparedItems.map((item) => ({
                productId: item.product.id,
                quantity: item.billableQuantityKg,
                quantityKg: item.quantityKg,
                quantityPieces: item.quantityPieces,
                unit: item.product.unit,
                unitPrice: item.unitPrice,
                unitEquivalentId: item.unitEquivalentId,
                appliedEquivalentFactor: item.equivalentFactor,
                roundingMode: item.roundingMode,
                productNameSnapshot: item.product.name,
                productSkuSnapshot: item.product.sku ?? null,
                unitPriceSnapshot: item.unitPrice,
                quantitySnapshot: item.billableQuantityKg,
                subtotal: item.subtotal,
                discount: 0,
                taxableBase: item.subtotal,
                tax: 0,
                total: item.subtotal,
                unitCostSnapshot: this.roundMoney(this.toNumber(item.product.purchaseCost)),
                costSubtotalSnapshot: this.roundMoney(this.toNumber(item.product.purchaseCost) * item.billableQuantityKg),
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
        const documentData = {
            saleId: sale.id,
            operationalLocationId: dto.locationId,
            physicalFolio: this.normalizeOptionalText(dto.physicalFolio ?? sale.saleNumber),
            status: SaleDocumentStatus.ISSUED,
            requiresAdministrativeInvoice: dto.requiresAdministrativeInvoice ?? false,
            deliveredByUserId: sale.deliveredByUserId ?? null,
            collectedByUserId: sale.collectedByUserId ?? null,
            routeId: sale.routeId ?? null,
            ...(customer ? { customerSnapshot: this.buildCustomerSnapshot(customer) as Prisma.InputJsonValue } : {}),
            productSnapshot: this.buildProductSnapshot(preparedItems),
            priceSnapshot: this.buildPriceSnapshot({
              subtotal,
              discount,
              tax: 0,
              total,
              paymentType: dto.paymentType,
              saleChannel: dto.saleChannel,
              physicalFolio: this.normalizeOptionalText(dto.physicalFolio ?? sale.saleNumber),
              requiresAdministrativeInvoice: dto.requiresAdministrativeInvoice ?? false,
            }),
        };
        const requestedDocument = await tx.saleDocument.create({
          data: { ...documentData, documentType: dto.documentType },
        });
        const internalReceiptDocument = dto.documentType === SaleDocumentType.INTERNAL_RECEIPT
          ? null
          : await tx.saleDocument.create({
              data: { ...documentData, documentType: SaleDocumentType.INTERNAL_RECEIPT },
            });
        const saleDocuments = [requestedDocument, internalReceiptDocument].filter(
          (document): document is NonNullable<typeof document> => document !== null,
        );

        const inventoryMovements = await this.recordInventoryMovements(tx, inventoryChanges, dto.locationId, sale.id, currentUser.id);
        const payment = dto.initialPayment
          ? await tx.payment.create({
              data: {
                accountReceivableId: null,
                saleId: sale.id,
                customerId: dto.customerId ?? null,
                userId: currentUser.id,
                amount: initialPaymentAmount,
                paymentMethod: dto.initialPayment.paymentMethod,
                operationalLocationId: dto.locationId,
                status: PaymentStatus.APPLIED,
                paidAt: new Date(),
                idempotencyKey,
                idempotencyPayloadHash: payloadHash,
              },
            })
          : null;

        const accountReceivable = outstandingAmount > 0 && customer
          ? await tx.accountReceivable.create({
              data: {
                customerId: customer.id,
                saleId: sale.id,
                originalSaleId: sale.id,
                originalAmount: outstandingAmount,
                outstandingAmount,
                saleDate: new Date(),
                dueDate: this.addDays(new Date(), customer.creditDays ?? 0),
                paymentTermsDays: customer.creditDays ?? 0,
                commercialPolicyId: this.normalizeOptionalText(dto.commercialPolicyId ?? customer.commercialPolicyId),
                status: CollectionStatus.UNPAID,
              },
            })
          : null;

        const billingRequest = dto.requiresAdministrativeInvoice && customer && dto.billingRequest
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
                    notes: this.normalizeOptionalText(dto.billingRequest.notes),
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
              requestedSubtotal: this.roundMoney(subtotal - discount),
              requestedTax: 0,
              requestedTotal: total,
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

        return {
          sale: this.toSaleResponse(sale),
          payment: payment ? this.toPaymentResponse(payment) : null,
          accountReceivable: accountReceivable ? this.toReceivableResponse(accountReceivable) : null,
          billingRequest,
          inventoryMovements: inventoryMovements.map((movement) => this.toMovementResponse(movement)),
          documents: saleDocuments.map((document) =>
            this.toSaleDocumentResponse(document as SaleDocumentListRecord),
          ),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ));
  }

  private assertOverrideIntent(dto: CreateSaleDto, currentUser: Actor): void {
    if (dto.administrativeOverrideReason === undefined) return;
    if (!dto.administrativeOverrideReason.trim()) {
      throw new BadRequestException({ code: 'CREDIT_OVERRIDE_REASON_REQUIRED', message: 'Administrative override reason must not be blank' });
    }
    if (currentUser.role !== 'ADMIN') {
      throw new BadRequestException({ code: 'CREDIT_OVERRIDE_FORBIDDEN', message: 'Administrative override requires ADMIN authorization' });
    }
    if (dto.paymentType !== SalePaymentType.CREDIT_SALE) {
      throw new BadRequestException({ code: 'CREDIT_OVERRIDE_NOT_APPLICABLE', message: 'Administrative override is not applicable to this sale' });
    }
  }

  private async withSerializableRetry<T>(operation: () => Promise<T>): Promise<T> {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        const serializationConflict = typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2034';
        const saleNumberConflict = this.isSaleNumberUniqueConflict(error);
        if (!serializationConflict && !saleNumberConflict) throw error;
        if (attempt === 3) {
          if (saleNumberConflict) {
            throw new ConflictException({
              code: 'SALE_NUMBER_RETRY_EXHAUSTED',
              message: 'Sale number could not be allocated after concurrent updates',
            });
          }
          throw new ConflictException({
            code: 'CREDIT_CONCURRENCY_RETRY_EXHAUSTED',
            message: 'Credit decision could not be completed after concurrent updates',
          });
        }
      }
    }
    throw new ConflictException({ code: 'CREDIT_CONCURRENCY_RETRY_EXHAUSTED' });
  }

  private assertBillingRequestInput(dto: CreateSaleDto, customer: CustomerCredit | null): void {
    if (!dto.requiresAdministrativeInvoice) {
      if (dto.billingRequest) {
        throw new BadRequestException('billingRequest requires requiresAdministrativeInvoice=true');
      }
      return;
    }
    if (!customer) {
      throw new BadRequestException('customerId is required for an administrative billing request');
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
    } as Prisma.SaleDocumentFindManyArgs)) as SaleDocumentListRecord[];

    return {
      items: documents.map((document) => this.toSaleDocumentResponse(document)),
    };
  }

  async cancel(id: string, dto: CancelSaleDto, currentUser: Actor, idempotencyKey: string) {
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

    const payloadHash = this.hashPayload({ reason, expectedVersion: dto.expectedVersion });

    return this.prisma.$transaction(
      async (tx) => {
        const sale = (await tx.sale.findFirst({
          where: this.buildCancellationScopeWhere(id, currentUser),
          include: {
            items: true,
            payments: { where: { status: PaymentStatus.APPLIED } },
            accountReceivable: {
              include: {
                payments: { where: { status: PaymentStatus.APPLIED }, take: 1 },
              },
            },
            pointOfSaleDailyClose: { select: { status: true } },
            route: { select: { settlement: { select: { status: true } } } },
            inventoryMovements: {
              where: { type: InventoryMovementType.CANCEL_SALE },
              orderBy: { createdAt: 'asc' },
            },
          },
        } as Prisma.SaleFindFirstArgs)) as SaleCancellationRecord | null;

        if (!sale) {
          throw new NotFoundException('Sale not found');
        }

        if (sale.status === SaleStatus.CANCELLED && sale.cancellationIdempotencyKey === idempotencyKey) {
          if (sale.cancellationPayloadHash !== payloadHash) {
            throw new ConflictException('Idempotency-Key was already used for a different sale cancellation payload');
          }

          return {
            sale: this.toSaleResponse(sale),
            inventoryMovements: (sale.inventoryMovements ?? []).map((movement) => this.toMovementResponse(movement)),
            accountReceivable: sale.accountReceivable ? this.toReceivableRecordResponse(sale.accountReceivable) : null,
          };
        }

        if (sale.status === SaleStatus.CANCELLED) {
          throw new BadRequestException('Sale is already cancelled');
        }

        if (sale.version !== dto.expectedVersion) {
          throw new ConflictException('Sale version does not match expectedVersion');
        }

        this.assertSaleCanBeCancelled(sale);

        const inventoryMovements = await this.restoreSaleInventory(tx, sale, currentUser.id, reason);
        const accountReceivable = sale.accountReceivable
          ? await this.cancelSaleReceivable(tx, sale.accountReceivable)
          : null;
        const updated = await tx.sale.updateMany({
          where: { id: sale.id, status: SaleStatus.CONFIRMED, version: dto.expectedVersion },
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
          throw new ConflictException('Sale was modified before cancellation could be persisted');
        }

        const cancelledSale = await tx.sale.findUnique({
          where: { id: sale.id },
          include: { items: true },
        });
        if (!cancelledSale) {
          throw new NotFoundException('Sale not found after cancellation');
        }

        return {
          sale: this.toSaleResponse(cancelledSale as UpdatedSale & { items?: Array<Record<string, unknown>> }),
          inventoryMovements: inventoryMovements.map((movement) => this.toMovementResponse(movement)),
          accountReceivable: accountReceivable ? this.toReceivableRecordResponse(accountReceivable as Record<string, unknown>) : null,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private buildCancellationScopeWhere(id: string, currentUser: Actor): Prisma.SaleWhereInput {
    if (currentUser.role === 'ADMIN') {
      return { id };
    }

    return { id: '__no_cancellable_sale__' };
  }

  private assertSaleCanBeCancelled(sale: SaleCancellationRecord): void {
    if (sale.payments?.length) {
      throw new BadRequestException('Sale has applied payments; reverse or refund payments before cancellation');
    }

    if (sale.accountReceivable?.payments?.length) {
      throw new BadRequestException('Sale account receivable has applied payments; reverse or refund payments before cancellation');
    }

    if (sale.pointOfSaleDailyClose?.status === PointOfSaleDailyCloseStatus.CLOSED) {
      throw new BadRequestException('Sale is associated with a closed POS daily close');
    }

    if (sale.route?.settlement?.status === RouteSettlementStatus.CLOSED) {
      throw new BadRequestException('Sale is associated with a closed route settlement');
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

      const balance = await tx.inventoryBalance.update({
        where: { productId_locationId: { productId: item.productId, locationId: sale.locationId } },
        data: {
          quantityKg: { increment: quantityKg },
          quantityPieces: { increment: quantityPieces },
        },
      });
      const newQuantityKg = this.toNumber(balance.quantityKg);
      const newQuantityPieces = balance.quantityPieces;
      const previousQuantityKg = this.roundQuantity(newQuantityKg - quantityKg);
      const previousQuantityPieces = newQuantityPieces - quantityPieces;

      movements.push(await tx.inventoryMovement.create({
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
      }));
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

  private async prepareItems(tx: Prisma.TransactionClient, items: CreateSaleItemDto[]): Promise<PreparedItem[]> {
    const prepared: PreparedItem[] = [];

    for (const item of items) {
      const quantityKg = this.roundQuantity(item.quantityKg ?? 0);
      const quantityPieces = item.quantityPieces ?? 0;
      if (quantityKg <= 0 && quantityPieces <= 0) {
        throw new BadRequestException('Sale item quantity must be greater than 0');
      }

      const product = (await tx.product.findUnique({
        where: { id: item.productId },
        include: { unitEquivalents: true },
      })) as SaleProduct | null;

      if (!product?.isActive) {
        throw new NotFoundException('Product not found');
      }

      this.assertItemMatchesProductUnit(item.unit, product.unit, quantityKg, quantityPieces);

      const equivalent = item.unitEquivalentId
        ? product.unitEquivalents?.find((candidate) => candidate.id === item.unitEquivalentId && candidate.status === EquivalentStatus.ACTIVE)
        : undefined;

      if (item.unitEquivalentId && !equivalent) {
        throw new BadRequestException('Active unit equivalent not found for product');
      }

      if (item.unitEquivalentId && (product.unit !== ProductUnit.KG_AND_PIECE || quantityPieces === 0)) {
        throw new BadRequestException('Unit equivalence is only valid when KG_AND_PIECE sales convert pieces');
      }

      if (quantityPieces > 0 && product.unit === ProductUnit.KG_AND_PIECE && !this.isActiveKgPieceEquivalent(equivalent)) {
        throw new BadRequestException('KG_AND_PIECE sales with pieces require an active KG/PIECE equivalent');
      }

      const billableQuantityKg = this.roundQuantity(
        quantityKg + (quantityPieces > 0 && equivalent ? this.convertPiecesToKg(quantityPieces, equivalent) : 0),
      );

      const unitPrice = this.roundMoney(this.toNumber(product.salePrice));
      prepared.push({
        product,
        unitEquivalentId: this.normalizeOptionalText(item.unitEquivalentId),
        quantityKg,
        quantityPieces,
        billableQuantityKg,
        unitPrice,
        subtotal: this.roundMoney(unitPrice * billableQuantityKg),
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
      throw new BadRequestException('Sale item unit must match the configured product unit');
    }

    if (productUnit === ProductUnit.KG && (quantityKg <= 0 || quantityPieces !== 0)) {
      throw new BadRequestException('KG products require a positive quantityKg only');
    }

    if (productUnit === ProductUnit.PIECE && (quantityPieces <= 0 || quantityKg !== 0)) {
      throw new BadRequestException('PIECE products require a positive quantityPieces only');
    }
  }

  private isActiveKgPieceEquivalent(
    equivalent: SaleProductUnitEquivalent | undefined,
  ): boolean {
    if (!equivalent || equivalent.status !== EquivalentStatus.ACTIVE || this.toNumber(equivalent.factor) <= 0) return false;
    const isKgPiecePair =
      (equivalent.unitFrom === ProductUnit.PIECE && equivalent.unitTo === ProductUnit.KG)
      || (equivalent.unitFrom === ProductUnit.KG && equivalent.unitTo === ProductUnit.PIECE);
    if (!isKgPiecePair || !equivalent.effectiveFrom) return false;

    const now = new Date();
    return equivalent.effectiveFrom <= now && (!equivalent.effectiveTo || equivalent.effectiveTo >= now);
  }

  private convertPiecesToKg(
    quantityPieces: number,
    equivalent: SaleProductUnitEquivalent,
  ): number {
    const factor = this.toNumber(equivalent.factor);
    if (equivalent.unitFrom === ProductUnit.PIECE && equivalent.unitTo === ProductUnit.KG) {
      return quantityPieces * factor;
    }
    if (equivalent.unitFrom === ProductUnit.KG && equivalent.unitTo === ProductUnit.PIECE) {
      return quantityPieces / factor;
    }
    throw new BadRequestException('Unit equivalent must convert between KG and PIECE');
  }

  private async reserveInventory(
    tx: Prisma.TransactionClient,
    items: PreparedItem[],
    locationId: string,
  ): Promise<Array<PreparedItem & { previousQuantityKg: number; previousQuantityPieces: number; newQuantityKg: number; newQuantityPieces: number }>> {
    const changes: Array<PreparedItem & { previousQuantityKg: number; previousQuantityPieces: number; newQuantityKg: number; newQuantityPieces: number }> = [];

    for (const item of items) {
      const updated = await tx.inventoryBalance.updateMany({
        where: {
          productId: item.product.id,
          locationId,
          quantityKg: { gte: item.quantityKg },
          quantityPieces: { gte: item.quantityPieces },
        },
        data: {
          quantityKg: { decrement: item.quantityKg },
          quantityPieces: { decrement: item.quantityPieces },
        },
      });

      if (updated.count !== 1) {
        throw new BadRequestException('Insufficient stock at selected location');
      }

      const balance = await tx.inventoryBalance.findUnique({ where: { productId_locationId: { productId: item.product.id, locationId } } });
      if (!balance) {
        throw new BadRequestException('Inventory balance not found after sale stock decrement');
      }

      const newQuantityKg = this.toNumber(balance.quantityKg);
      const newQuantityPieces = balance.quantityPieces;
      changes.push({
        ...item,
        previousQuantityKg: this.roundQuantity(newQuantityKg + item.quantityKg),
        previousQuantityPieces: newQuantityPieces + item.quantityPieces,
        newQuantityKg,
        newQuantityPieces,
      });
    }

    return changes;
  }

  private async recordInventoryMovements(
    tx: Prisma.TransactionClient,
    items: Array<PreparedItem & { previousQuantityKg: number; previousQuantityPieces: number; newQuantityKg: number; newQuantityPieces: number }>,
    locationId: string,
    saleId: string,
    userId: string,
  ): Promise<CreatedMovement[]> {
    const movements: CreatedMovement[] = [];

    for (const item of items) {
      movements.push(await tx.inventoryMovement.create({
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
      }));
    }

    return movements;
  }

  private assertLocationMatchesSaleChannel(dto: CreateSaleDto, locationType: OperationalLocationType) {
    if (!saleChannelLocationTypes[dto.saleChannel].has(locationType)) {
      throw new BadRequestException(`${dto.saleChannel} sales cannot use a ${locationType} location`);
    }
  }

  private assertLocationAccess(dto: CreateSaleDto, currentUser: Actor) {
    if (
      currentUser.role !== 'ADMIN' &&
      currentUser.operationalLocationId !== dto.locationId
    ) {
      throw new ForbiddenException('LOCATION_NOT_AUTHORIZED');
    }
  }

  private assertPaymentRules(dto: CreateSaleDto, customer: CustomerCredit | null, total: number, initialPaymentAmount: number) {
    if (initialPaymentAmount > total) {
      throw new BadRequestException('Initial payment cannot exceed sale total');
    }

    if (dto.paymentType === SalePaymentType.CREDIT_SALE && !customer) {
      throw new BadRequestException('customerId is required for credit sales');
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
    const prismaError = error as { code?: unknown; meta?: { target?: unknown } };
    if (prismaError.code !== 'P2002') return false;
    const target = prismaError.meta?.target;
    return Array.isArray(target)
      ? target.some((value) => String(value).includes('saleNumber'))
      : String(target).includes('saleNumber');
  }

  private toSaleResponse(sale: { [key: string]: unknown; items?: Array<Record<string, unknown>> }) {
    const creditDecision = sale.creditDecisionSnapshot as Record<string, unknown> | null | undefined;
    return {
      ...sale,
      creditWarnings: Array.isArray(creditDecision?.warnings) ? creditDecision.warnings : [],
      subtotal: this.decimalToString(sale.subtotal),
      discount: this.decimalToString(sale.discount),
      tax: this.decimalToString(sale.tax),
      total: this.decimalToString(sale.total),
      items: sale.items?.map((item) => ({
        ...item,
        quantity: this.decimalToString(item.quantity),
        quantityKg: this.decimalToString(item.quantityKg),
        unitPrice: this.decimalToString(item.unitPrice),
        unitPriceSnapshot: this.decimalToString(item.unitPriceSnapshot),
        quantitySnapshot: this.decimalToString(item.quantitySnapshot),
        appliedEquivalentFactor: this.decimalToString(item.appliedEquivalentFactor),
        subtotal: this.decimalToString(item.subtotal),
        unitCostSnapshot: this.decimalToString(item.unitCostSnapshot),
        costSubtotalSnapshot: this.decimalToString(item.costSubtotalSnapshot),
      })) ?? [],
    };
  }

  private buildVisibleSalesWhere(query: ListSalesQueryDto, currentUser: Actor): Prisma.SaleWhereInput {
    const where = this.buildSalesFilterWhere(query);
    return this.applyVisibilityScope(where, currentUser);
  }

  private buildVisibleSaleDetailWhere(id: string, currentUser: Actor): Prisma.SaleWhereInput {
    return this.applyVisibilityScope({ id }, currentUser);
  }

  private applyVisibilityScope(where: Prisma.SaleWhereInput, currentUser: Actor): Prisma.SaleWhereInput {
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

  private buildSalesFilterWhere(query: ListSalesQueryDto): Prisma.SaleWhereInput {
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
    if (query.paymentType ?? query.saleType) where.paymentType = query.paymentType ?? query.saleType;
    if (query.collectionStatus) where.collectionStatus = query.collectionStatus;
    if (query.saleChannel) where.saleChannel = query.saleChannel;
    if (query.documentType) where.documentType = query.documentType;
    if (query.physicalFolio) where.physicalFolio = query.physicalFolio;
    if (query.pointOfSaleDailyCloseId) where.pointOfSaleDailyCloseId = query.pointOfSaleDailyCloseId;
    if (query.paymentMethod) {
      where.payments = { some: { paymentMethod: query.paymentMethod, status: PaymentStatus.APPLIED } };
    }

    return where;
  }

  private buildPagination(query: Pick<ListSalesQueryDto, 'page' | 'limit'>): Pick<Prisma.SaleFindManyArgs, 'skip' | 'take'> {
    const take = query.limit;
    const page = query.page ?? 1;

    return {
      ...(take ? { take } : {}),
      ...(take ? { skip: (page - 1) * take } : {}),
    };
  }

  private toSaleListItem(sale: SaleListRecord) {
    const billingRequest = sale.billingRequests?.[0] ?? sale.billingRequest ?? null;
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
      subtotal: this.decimalToString(sale.subtotal),
      discount: this.decimalToString(sale.discount),
      tax: this.decimalToString(sale.tax),
      total: this.decimalToString(sale.total),
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

  private toSaleDetail(sale: SaleDetailRecord) {
    const route = sale.route;
    const billingRequest = sale.billingRequests?.[0] ?? sale.billingRequest ?? null;
    const routeGeometry = this.validLineStringGeometry(route?.geometry) ? route?.geometry ?? null : null;
    return {
      ...this.toSaleListItem(sale),
      items: sale.items?.map((item) => ({
        id: item.id,
        productId: item.productId,
        productName: item.productNameSnapshot ?? null,
        unit: item.unit,
        quantityKg: this.decimalToString(item.quantityKg),
        quantityPieces: item.quantityPieces ?? null,
        unitPrice: this.decimalToString(item.unitPrice),
        unitEquivalentId: item.unitEquivalentId ?? null,
        appliedEquivalentFactor: this.decimalToString(item.appliedEquivalentFactor),
        roundingMode: item.roundingMode ?? null,
        subtotal: this.decimalToString(item.subtotal),
      })) ?? [],
      customer: sale.customer ?? null,
      commercialPolicy: this.toCommercialPolicyResponse(sale.commercialPolicy ?? null),
      accountReceivable: sale.accountReceivable ? this.toReceivableRecordResponse(sale.accountReceivable as Record<string, unknown>) : null,
      billingRequest,
      ticket: this.findTicketDocument(sale.documents ?? []),
      documents: sale.documents ?? [],
      inventoryMovements: sale.inventoryMovements?.map((movement) => this.toMovementRecordResponse(movement)) ?? [],
      routePreview: route ? {
        id: route.id,
        name: route.name,
        geometry: routeGeometry,
        mapAvailable: route.optimizationStatus === 'OPTIMIZED' && routeGeometry !== null,
        distanceMeters: route.distanceMeters ?? null,
        durationSeconds: route.durationSeconds ?? null,
        order: sale.deliveryOrder?.latitude != null && sale.deliveryOrder.longitude != null ? {
          latitude: this.toNumber(sale.deliveryOrder.latitude),
          longitude: this.toNumber(sale.deliveryOrder.longitude),
          stopSequence: sale.deliveryOrder.stopSequence ?? null,
        } : null,
      } : null,
    };
  }

  private validLineStringGeometry(value: Prisma.JsonValue | null | undefined): boolean {
    if (!value || Array.isArray(value) || typeof value !== 'object') return false;
    const geometry = value as Prisma.JsonObject;
    if (geometry.type !== 'LineString' || !Array.isArray(geometry.coordinates) || geometry.coordinates.length < 2) return false;
    return geometry.coordinates.every((coordinate) => (
      Array.isArray(coordinate)
      && coordinate.length === 2
      && coordinate.every((axis) => typeof axis === 'number' && Number.isFinite(axis))
    ));
  }

  private toSaleTicket(sale: SaleTicketRecord) {
    const ticketDocument = this.findTicketDocument(sale.documents ?? []);
    const physicalFolio = (ticketDocument?.physicalFolio ?? sale.physicalFolio ?? null) as string | null;

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
      items: sale.items?.map((item) => ({
        productId: item.productId,
        productName: item.productNameSnapshot ?? null,
        unit: item.unit,
        quantityKg: this.decimalToString(item.quantityKg),
        quantityPieces: item.quantityPieces ?? null,
        unitPrice: this.decimalToString(item.unitPrice),
        subtotal: this.decimalToString(item.subtotal),
      })) ?? [],
      subtotal: this.decimalToString(sale.subtotal),
      discount: this.decimalToString(sale.discount),
      tax: this.decimalToString(sale.tax),
      total: this.decimalToString(sale.total),
      paymentType: sale.paymentType,
      collectionStatus: sale.collectionStatus,
      status: sale.status,
      payments: (sale.payments ?? []).map((payment) => ({
        amount: this.decimalToString(payment.amount),
        paymentMethod: payment.paymentMethod,
        paidAt: payment.paidAt ?? null,
        saleId: payment.saleId ?? null,
        accountReceivableId: payment.accountReceivableId ?? null,
      })),
      legend: 'Comprobante interno sin validez fiscal',
    };
  }

  private toPaymentsSummary(payments: SalePaymentSummaryInput[]) {
    const appliedPayments = payments.filter((payment) => payment.status === undefined || payment.status === PaymentStatus.APPLIED);
    const totalPaid = this.roundMoney(appliedPayments.reduce((sum, payment) => sum + this.toNumber(payment.amount), 0));
    const lastPaidAt = appliedPayments
      .map((payment) => payment.paidAt)
      .filter((paidAt): paidAt is Date | string => paidAt !== null && paidAt !== undefined)
      .map((paidAt) => (paidAt instanceof Date ? paidAt : new Date(paidAt)))
      .sort((left, right) => right.getTime() - left.getTime())[0] ?? null;
    const methods = Array.from(new Set(appliedPayments.map((payment) => payment.paymentMethod)));

    return {
      totalPaid: this.decimalToString(totalPaid),
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
      originalAmount: this.decimalToString(receivable.originalAmount),
      outstandingAmount: this.decimalToString(receivable.outstandingAmount),
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
    return documents.find((document) => document.documentType === SaleDocumentType.INTERNAL_RECEIPT) ?? null;
  }

  private buildCustomerSnapshot(customer: CustomerCredit | null): Record<string, unknown> | undefined {
    if (!customer) {
      return undefined;
    }

    return {
      id: customer.id,
      name: customer.name ?? null,
      customerNumber: customer.customerNumber ?? null,
      customerType: customer.customerType ?? null,
    };
  }

  private buildProductSnapshot(items: PreparedItem[]) {
    return {
      items: items.map((item) => ({
        productId: item.product.id,
        productName: item.product.name,
        productSku: item.product.sku ?? null,
        unit: item.product.unit,
        quantityKg: item.quantityKg,
        quantityPieces: item.quantityPieces,
        unitPrice: item.unitPrice,
        subtotal: item.subtotal,
        equivalentFactor: item.equivalentFactor,
        roundingMode: item.roundingMode,
      })),
    };
  }

  private buildPriceSnapshot(snapshot: {
    subtotal: number;
    discount: number;
    tax: number;
    total: number;
    paymentType: SalePaymentType;
    saleChannel: SaleChannel;
    physicalFolio: string | null;
    requiresAdministrativeInvoice: boolean;
  }) {
    return {
      subtotal: snapshot.subtotal,
      discount: snapshot.discount,
      tax: snapshot.tax,
      total: snapshot.total,
      paymentType: snapshot.paymentType,
      saleChannel: snapshot.saleChannel,
      physicalFolio: snapshot.physicalFolio,
      requiresAdministrativeInvoice: snapshot.requiresAdministrativeInvoice,
    };
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
      customerSnapshot: document.customerSnapshot ?? null,
      productSnapshot: document.productSnapshot ?? null,
      priceSnapshot: document.priceSnapshot ?? null,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
    };
  }

  private toPaymentResponse(payment: CreatedPayment) {
    return { ...payment, amount: this.decimalToString(payment.amount) };
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
    return value instanceof Prisma.Decimal ? value.toString() : String(value);
  }

  private toNumber(value: DecimalLike): number {
    if (value === null || value === undefined) {
      return 0;
    }
    return Number(value instanceof Prisma.Decimal ? value.toString() : value);
  }

  private roundMoney(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
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

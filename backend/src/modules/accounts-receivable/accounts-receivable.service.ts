import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import {
  BillingRequestStatus,
  CollectionStatus,
  CreditStatus,
  PaymentStatus,
  PointOfSaleDailyCloseStatus,
  Prisma,
  SalePaymentType,
  SaleStatus,
  type AccountReceivable,
  type Payment,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { PERMISSIONS } from '../../common/authorization/permissions';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PointOfSaleDailyCloseService } from '../point-of-sale-daily-close/point-of-sale-daily-close.service';
import { acquireDraftDailyCloseLifecycleLock } from '../point-of-sale-daily-close/daily-close-lifecycle-lock';
import {
  ListAccountsReceivableQueryDto,
  RegisterReceivablePaymentDto,
} from './dto';
import { calculateReceivableAging } from './receivable-aging';
import { Money, toMoneyString } from '../../../../shared/money';

type DecimalLike = Prisma.Decimal | number | string | null | undefined;
type Actor = Pick<AuthenticatedUser, 'id' | 'role' | 'permissions'>;

type ReceivableRecord = AccountReceivable & {
  customer?: {
    id: string;
    name: string;
    customerType?: string;
    creditStatus?: string;
    customerNumber?: string | null;
    commercialName?: string | null;
  } | null;
  sale?: {
    id: string;
    saleNumber: string;
    userId?: string;
    total: DecimalLike;
    locationId: string;
    documentType: string;
    physicalFolio?: string | null;
  } | null;
  billingRequest?: { id?: string; status?: string } | null;
  payments?: Payment[];
};

type IdempotentPayment = Payment & { idempotencyPayloadHash?: string | null };

type CreditSaleRecord = {
  id: string;
  customerId: string | null;
  commercialPolicyId?: string | null;
  physicalFolio?: string | null;
  total: DecimalLike;
  paymentType: SalePaymentType;
  status: SaleStatus;
  createdAt: Date;
  customer?: {
    id: string;
    isActive: boolean;
    creditStatus: CreditStatus;
    creditLimit?: DecimalLike;
    creditDays?: number | null;
    commercialPolicyId?: string | null;
  } | null;
  payments?: Array<Pick<Payment, 'amount' | 'status'>>;
  accountReceivable?: AccountReceivable | null;
  pointOfSaleDailyClose?: {
    id: string;
    status: PointOfSaleDailyCloseStatus;
  } | null;
};

@Injectable()
export class AccountsReceivableService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dailyCloseService: PointOfSaleDailyCloseService,
  ) {}

  async findAll(
    query: ListAccountsReceivableQueryDto = {},
    currentUser?: Actor,
  ) {
    const receivables = (await this.prisma.accountReceivable.findMany({
      where: this.buildListWhere(query, currentUser),
      include: { customer: true, sale: true, billingRequest: true },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
      ...this.buildPagination(query),
    })) as ReceivableRecord[];

    return {
      items: receivables.map((receivable) => this.toListItem(receivable)),
    };
  }

  async findOne(id: string, currentUser?: Actor) {
    const receivable = (await this.prisma.accountReceivable.findUnique({
      where: { id },
      include: {
        customer: true,
        sale: true,
        billingRequest: true,
        payments: { orderBy: { paidAt: 'desc' } },
      },
    })) as ReceivableRecord | null;

    if (!receivable) {
      throw new NotFoundException('Account receivable not found');
    }

    this.assertSellerCanView(receivable, currentUser);

    return this.toDetail(receivable);
  }

  async registerPayment(
    id: string,
    dto: RegisterReceivablePaymentDto,
    currentUser: Actor,
    idempotencyKey: string,
  ) {
    if (dto.accountReceivableId !== id) {
      throw new BadRequestException('accountReceivableId must match route id');
    }

    const paymentAmount = Money.from(dto.amount);
    if (!paymentAmount.isPositive()) {
      throw new BadRequestException('amount must be greater than 0');
    }

    this.assertFixedCashCollectionPermission(dto, currentUser);

    const paidAt = dto.paidAt ? new Date(dto.paidAt) : new Date();
    const nextPaymentDate = dto.nextPaymentDate
      ? new Date(dto.nextPaymentDate)
      : null;
    const payloadHash = this.hashPayload(
      this.buildRegisterPaymentPayload(id, dto, currentUser.id),
    );

    try {
      return await this.withSerializableRetry(() =>
        this.prisma.$transaction(
          async (tx) => {
            let receivable: ReceivableRecord | null = null;
            if (currentUser.role === 'SELLER') {
              receivable = (await tx.accountReceivable.findUnique({
                where: { id },
                include: { sale: { select: { userId: true } } },
              })) as ReceivableRecord | null;
              if (!receivable) {
                throw new NotFoundException('Account receivable not found');
              }
              this.assertSellerCanRegisterPayment(receivable, currentUser);
            }

            const existingPayment = await tx.payment.findFirst({
              where: { idempotencyKey },
            });

            if (existingPayment) {
              return this.resolveExistingPaymentResponse(
                tx,
                existingPayment,
                id,
                payloadHash,
              );
            }

            if (!receivable) {
              receivable = await tx.accountReceivable.findUnique({
                where: { id },
              });
            }
            if (!receivable) {
              throw new NotFoundException('Account receivable not found');
            }

            this.assertReceivableCanReceivePayment(receivable);
            this.assertExpectedVersion(receivable, dto.expectedVersion);
            let outstandingAmount = Money.from(receivable.outstandingAmount);
            if (paymentAmount.compare(outstandingAmount) > 0) {
              throw new BadRequestException(
                'Payment amount cannot exceed outstanding balance',
              );
            }

            // The sale close is historical context. Only the collection context
            // may authorize and recalculate this payment.
            let sale = await tx.sale.findUnique({
              where: { id: receivable.saleId },
              select: { locationId: true },
            });
            let cashShift = await this.resolveCashShift(
              tx,
              dto,
              sale?.locationId ?? null,
              currentUser,
              { allowNonDraftClose: true },
            );
            let collectionDailyCloseId =
              cashShift?.pointOfSaleDailyCloseId ?? null;

            if (collectionDailyCloseId) {
              await acquireDraftDailyCloseLifecycleLock(
                tx,
                collectionDailyCloseId,
              );
              receivable = await tx.accountReceivable.findUnique({
                where: { id },
              });
              if (!receivable)
                throw new NotFoundException('Account receivable not found');
              this.assertReceivableCanReceivePayment(receivable);
              this.assertExpectedVersion(receivable, dto.expectedVersion);
              outstandingAmount = Money.from(receivable.outstandingAmount);
              if (paymentAmount.compare(outstandingAmount) > 0) {
                throw new BadRequestException(
                  'Payment amount cannot exceed outstanding balance',
                );
              }
              sale = await tx.sale.findUnique({
                where: { id: receivable.saleId },
                select: { locationId: true },
              });
              cashShift = await this.resolveCashShift(
                tx,
                dto,
                sale?.locationId ?? null,
                currentUser,
                { expectedCollectionDailyCloseId: collectionDailyCloseId },
              );
              collectionDailyCloseId =
                cashShift?.pointOfSaleDailyCloseId ?? null;
            }

            const newOutstandingAmount =
              outstandingAmount.subtract(paymentAmount);
            const nextStatus = newOutstandingAmount.isZero()
              ? CollectionStatus.PAID
              : CollectionStatus.PARTIALLY_PAID;
            const { daysOverdue, agingStatus } = calculateReceivableAging(
              receivable.dueDate,
              newOutstandingAmount,
              paidAt,
            );

            const payment = await tx.payment.create({
              data: {
                accountReceivableId: id,
                customerId: receivable.customerId,
                saleId: receivable.saleId,
                userId: currentUser.id,
                collectedByUserId: dto.collectedByUserId ?? currentUser.id,
                collectionPass: dto.collectionPass ?? null,
                nextPaymentDate,
                amount: paymentAmount.toString(),
                paymentMethod: dto.paymentMethod,
                bankName:
                  dto.paymentMethod === 'CASH'
                    ? null
                    : this.normalizeOptionalText(dto.bankName),
                referenceNumber:
                  dto.paymentMethod === 'CASH'
                    ? null
                    : this.normalizeOptionalText(dto.referenceNumber),
                appliedDocumentId: this.normalizeOptionalText(
                  dto.appliedDocumentId,
                ),
                appliedDocumentType: this.normalizeOptionalText(
                  dto.appliedDocumentType,
                ),
                routeId: this.normalizeOptionalText(dto.routeId),
                routeSettlementId: this.normalizeOptionalText(
                  dto.routeSettlementId,
                ),
                operationalLocationId: sale?.locationId ?? null,
                pointOfSaleDailyCloseId: collectionDailyCloseId,
                cashShiftId: cashShift?.id ?? null,
                status: PaymentStatus.APPLIED,
                paidAt,
                idempotencyKey,
                idempotencyPayloadHash: payloadHash,
              },
            });

            let updatedReceivable: AccountReceivable;
            try {
              updatedReceivable = await tx.accountReceivable.update({
                where: { id, version: receivable.version },
                data: {
                  outstandingAmount: newOutstandingAmount.toString(),
                  lastPaymentDate: paidAt,
                  daysOverdue,
                  agingStatus,
                  status: nextStatus,
                  paidAt: nextStatus === CollectionStatus.PAID ? paidAt : null,
                  version: { increment: 1 },
                },
              });
            } catch (error) {
              if (this.isStaleVersionError(error)) {
                throw new ConflictException(
                  'Account receivable version does not match expectedVersion',
                );
              }
              throw error;
            }

            await tx.sale.update({
              where: { id: receivable.saleId },
              data: { collectionStatus: nextStatus },
            });

            if (collectionDailyCloseId)
              await this.dailyCloseService.recalculateAfterDraftMutation(
                collectionDailyCloseId,
                tx,
              );

            return {
              payment: this.toPaymentResponse(payment),
              accountReceivable: this.toListItem(updatedReceivable),
            };
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        ),
      );
    } catch (error) {
      if (this.isIdempotencyUniqueConflict(error)) {
        return this.resolveExistingPaymentByKey(
          idempotencyKey,
          id,
          payloadHash,
        );
      }
      throw error;
    }
  }

  async createFromConfirmedCreditSale(saleId: string) {
    return this.prisma.$transaction(
      async (tx) => {
        let sale = (await tx.sale.findUnique({
          where: { id: saleId },
          include: {
            customer: true,
            payments: true,
            accountReceivable: true,
            pointOfSaleDailyClose: { select: { id: true, status: true } },
          },
        })) as CreditSaleRecord | null;

        if (!sale) {
          throw new NotFoundException('Sale not found');
        }

        if (sale.accountReceivable) {
          return this.toListItem(sale.accountReceivable);
        }

        if (sale.pointOfSaleDailyClose?.id) {
          await acquireDraftDailyCloseLifecycleLock(
            tx,
            sale.pointOfSaleDailyClose.id,
          );
          sale = await tx.sale.findUnique({
            where: { id: saleId },
            include: {
              customer: true,
              payments: true,
              accountReceivable: true,
              pointOfSaleDailyClose: {
                select: { id: true, status: true },
              },
            },
          });
          if (!sale) throw new NotFoundException('Sale not found');
          if (sale.accountReceivable) {
            return this.toListItem(sale.accountReceivable);
          }
        }

        this.assertEligibleCreditSale(sale);

        const initialPaid = this.sumActiveSalePayments(sale.payments ?? []);
        const pendingAmount = Money.from(sale.total).subtract(initialPaid);
        if (!pendingAmount.isPositive()) {
          throw new BadRequestException(
            'Confirmed credit sale has no outstanding balance',
          );
        }

        const creditDays = sale.customer?.creditDays ?? 0;
        const creditLimit = Money.from(sale.customer?.creditLimit);
        const dueDate = this.addDays(sale.createdAt, creditDays);

        const overdue = await tx.accountReceivable.findFirst({
          where: {
            customerId: sale.customerId ?? undefined,
            status: {
              in: [CollectionStatus.UNPAID, CollectionStatus.PARTIALLY_PAID],
            },
            dueDate: { lt: new Date() },
            outstandingAmount: { gt: 0 },
          },
          select: { id: true },
        });
        if (overdue) {
          throw new BadRequestException(
            'Customer has overdue accounts receivable',
          );
        }

        const openBalance = await tx.accountReceivable.aggregate({
          where: {
            customerId: sale.customerId ?? undefined,
            status: {
              in: [CollectionStatus.UNPAID, CollectionStatus.PARTIALLY_PAID],
            },
          },
          _sum: { outstandingAmount: true },
        });
        const currentOpenBalance = Money.from(
          openBalance._sum.outstandingAmount,
        );
        if (
          creditLimit.isPositive() &&
          currentOpenBalance.add(pendingAmount).compare(creditLimit) > 0
        ) {
          throw new BadRequestException(
            'Credit sale exceeds customer credit limit',
          );
        }

        const receivable = await tx.accountReceivable.create({
          data: {
            customerId: sale.customerId as string,
            saleId: sale.id,
            originalSaleId: sale.id,
            originalAmount: pendingAmount.toString(),
            outstandingAmount: pendingAmount.toString(),
            saleDate: sale.createdAt,
            dueDate,
            paymentTermsDays: creditDays,
            ...calculateReceivableAging(dueDate, pendingAmount),
            physicalDocumentFolio: this.normalizeOptionalText(
              sale.physicalFolio,
            ),
            commercialPolicyId:
              sale.commercialPolicyId ??
              sale.customer?.commercialPolicyId ??
              null,
            status: CollectionStatus.UNPAID,
          },
        });

        await tx.sale.update({
          where: { id: sale.id },
          data: { collectionStatus: CollectionStatus.UNPAID },
        });

        if (sale.pointOfSaleDailyClose?.id)
          await this.dailyCloseService.recalculateAfterDraftMutation(
            sale.pointOfSaleDailyClose.id,
            tx,
          );

        return this.toListItem(receivable);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private buildListWhere(
    query: ListAccountsReceivableQueryDto,
    currentUser?: Actor,
  ): Prisma.AccountReceivableWhereInput {
    return {
      ...(currentUser?.role === 'SELLER'
        ? { sale: { userId: currentUser.id } }
        : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.saleId ? { saleId: query.saleId } : {}),
      ...(query.billingRequestId
        ? { billingRequestId: query.billingRequestId }
        : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.agingStatus ? { agingStatus: query.agingStatus } : {}),
      ...(query.onlyOverdue
        ? { dueDate: { lt: new Date() } }
        : this.buildDueDateRange(query)),
      ...(query.onlyActiveBillingRequest
        ? {
            billingRequest: { status: { not: BillingRequestStatus.CANCELLED } },
          }
        : {}),
    };
  }

  private buildDueDateRange(query: ListAccountsReceivableQueryDto) {
    if (!query.dueDateFrom && !query.dueDateTo) {
      return {};
    }

    return {
      dueDate: {
        ...(query.dueDateFrom ? { gte: new Date(query.dueDateFrom) } : {}),
        ...(query.dueDateTo ? { lte: new Date(query.dueDateTo) } : {}),
      },
    };
  }

  private buildPagination(query: {
    page?: number;
    limit?: number;
  }): Pick<Prisma.AccountReceivableFindManyArgs, 'skip' | 'take'> {
    if (!query.limit) {
      return {};
    }

    return {
      skip: ((query.page ?? 1) - 1) * query.limit,
      take: query.limit,
    };
  }

  private assertSellerCanView(
    receivable: ReceivableRecord,
    currentUser?: Actor,
  ): void {
    if (
      currentUser?.role === 'SELLER' &&
      receivable.sale?.userId !== currentUser.id
    ) {
      throw new ForbiddenException(
        'SELLER can only consult accounts receivable from their own sales',
      );
    }
  }

  private assertReceivableCanReceivePayment(
    receivable: AccountReceivable,
  ): void {
    if (
      receivable.status === CollectionStatus.PAID ||
      receivable.status === CollectionStatus.CANCELLED
    ) {
      throw new BadRequestException(
        'Cannot register payments on paid or cancelled accounts receivable',
      );
    }
  }

  private assertExpectedVersion(
    receivable: AccountReceivable,
    expectedVersion?: number,
  ): void {
    if (
      expectedVersion !== undefined &&
      expectedVersion !== null &&
      receivable.version !== expectedVersion
    ) {
      throw new ConflictException(
        'Account receivable version does not match expectedVersion',
      );
    }
  }

  private assertSellerCanRegisterPayment(
    receivable: ReceivableRecord,
    currentUser: Actor,
  ): void {
    if (
      currentUser.role === 'SELLER' &&
      receivable.sale?.userId !== currentUser.id
    ) {
      throw new ForbiddenException(
        'SELLER can only register payments for accounts receivable from their own sales',
      );
    }
  }

  private assertFixedCashCollectionPermission(
    dto: RegisterReceivablePaymentDto,
    currentUser: Actor,
  ): void {
    if (
      dto.paymentMethod === 'CASH' &&
      !dto.routeId &&
      !dto.routeSettlementId &&
      !currentUser.permissions?.includes(PERMISSIONS.COLLECTIONS_RECEIVE_CASH)
    ) {
      throw new ForbiddenException('COLLECTIONS_CASH_PERMISSION_REQUIRED');
    }
  }

  private async resolveCashShift(
    tx: Prisma.TransactionClient,
    dto: RegisterReceivablePaymentDto,
    locationId: string | null,
    currentUser: Actor,
    options: {
      allowNonDraftClose?: boolean;
      expectedCollectionDailyCloseId?: string;
    } = {},
  ) {
    if (dto.routeId || dto.routeSettlementId) return null;
    if (dto.paymentMethod !== 'CASH') return null;
    if (!locationId) throw new BadRequestException('PAYMENT_LOCATION_REQUIRED');
    if (!dto.cashShiftId)
      throw new BadRequestException({
        code: 'CASH_SHIFT_REQUIRED',
        message:
          'An open cash shift is required before registering a cash payment',
      });
    if (!dto.deviceId?.trim())
      throw new BadRequestException({
        code: 'CASH_TERMINAL_DEVICE_REQUIRED',
        message: 'The registered terminal device is required',
      });
    const shift = await tx.cashShift.findUnique({
      where: { id: dto.cashShiftId },
      select: {
        id: true,
        operationalLocationId: true,
        pointOfSaleDailyCloseId: true,
        cashierUserId: true,
        status: true,
        terminal: { select: { deviceId: true, isActive: true } },
        pointOfSaleDailyClose: { select: { status: true } },
      },
    });
    if (!shift)
      throw new BadRequestException({
        code: 'CASH_SHIFT_NOT_FOUND',
        message: 'The selected cash shift does not exist',
      });
    if (shift.operationalLocationId !== locationId)
      throw new BadRequestException({
        code: 'CASH_SHIFT_LOCATION_MISMATCH',
        message: 'The cash shift does not belong to the payment location',
      });
    if (
      options.expectedCollectionDailyCloseId &&
      shift.pointOfSaleDailyCloseId !== options.expectedCollectionDailyCloseId
    )
      throw new BadRequestException({
        code: 'CASH_SHIFT_LOCATION_MISMATCH',
        message: 'The cash shift does not belong to the collection daily close',
      });
    if (shift.status !== 'OPEN')
      throw new BadRequestException({
        code: 'CASH_SHIFT_NOT_OPEN',
        message: 'The selected cash shift is not open for payments',
      });
    if (
      !options.allowNonDraftClose &&
      shift.pointOfSaleDailyClose.status !== PointOfSaleDailyCloseStatus.DRAFT
    )
      throw new BadRequestException('DAILY_CLOSE_REOPEN_REQUIRED');
    if (shift.cashierUserId !== currentUser.id)
      throw new BadRequestException({
        code: 'CASH_SHIFT_CASHIER_MISMATCH',
        message: 'The cash shift belongs to another cashier',
      });
    if (
      !shift.terminal.isActive ||
      shift.terminal.deviceId !== dto.deviceId.trim()
    )
      throw new BadRequestException({
        code: 'CASH_TERMINAL_DEVICE_MISMATCH',
        message: 'The device does not belong to the registered cash terminal',
      });
    return shift;
  }

  private assertEligibleCreditSale(sale: CreditSaleRecord): void {
    if (sale.paymentType !== SalePaymentType.CREDIT_SALE) {
      throw new BadRequestException(
        'Only credit sales can create accounts receivable',
      );
    }
    if (sale.status !== SaleStatus.CONFIRMED) {
      throw new BadRequestException(
        'Only confirmed credit sales can create accounts receivable',
      );
    }
    if (!sale.customerId || !sale.customer) {
      throw new BadRequestException('Credit sale requires a customer');
    }
    if (!sale.customer.isActive) {
      throw new BadRequestException(
        'Inactive customer cannot receive credit sales',
      );
    }
    if (sale.customer.creditStatus !== CreditStatus.ACTIVE) {
      throw new BadRequestException('Customer credit is not active');
    }
  }

  private sumActiveSalePayments(
    payments: Array<Pick<Payment, 'amount' | 'status'>>,
  ): Money {
    return Money.sum(
      payments
        .filter((payment) => payment.status !== PaymentStatus.CANCELLED)
        .map((payment) => payment.amount),
    );
  }

  private toDetail(receivable: ReceivableRecord) {
    return {
      ...this.toListItem(receivable),
      customer: receivable.customer
        ? {
            id: receivable.customer.id,
            name: receivable.customer.name,
            customerType: receivable.customer.customerType,
            creditStatus: receivable.customer.creditStatus,
            customerNumber: receivable.customer.customerNumber,
            commercialName: receivable.customer.commercialName,
          }
        : null,
      sale: receivable.sale
        ? {
            id: receivable.sale.id,
            saleNumber: receivable.sale.saleNumber,
            total: toMoneyString(receivable.sale.total),
            locationId: receivable.sale.locationId,
            documentType: receivable.sale.documentType,
            physicalFolio: receivable.sale.physicalFolio ?? null,
          }
        : null,
      billingRequest: receivable.billingRequest ?? null,
      payments: (receivable.payments ?? []).map((payment) =>
        this.toPaymentResponse(payment),
      ),
    };
  }

  private toListItem(receivable: ReceivableRecord) {
    return {
      id: receivable.id,
      customerId: receivable.customerId,
      customerName: receivable.customer?.name,
      saleId: receivable.saleId,
      saleNumber: receivable.sale?.saleNumber,
      saleLocationId: receivable.sale?.locationId ?? null,
      billingRequestId: receivable.billingRequestId,
      billingRequestStatus: receivable.billingRequest?.status ?? null,
      originalAmount: toMoneyString(receivable.originalAmount),
      outstandingAmount: toMoneyString(receivable.outstandingAmount),
      saleDate: receivable.saleDate,
      dueDate: receivable.dueDate,
      paymentTermsDays: receivable.paymentTermsDays,
      lastPaymentDate: receivable.lastPaymentDate,
      daysOverdue: receivable.daysOverdue,
      paidAt: receivable.paidAt,
      cancelledAt: receivable.cancelledAt,
      commercialPolicyId: receivable.commercialPolicyId,
      physicalDocumentFolio: receivable.physicalDocumentFolio,
      collectorUserId: receivable.collectorUserId,
      status: receivable.status,
      agingStatus: receivable.agingStatus,
      version: receivable.version,
      createdAt: receivable.createdAt,
      updatedAt: receivable.updatedAt,
    };
  }

  private toPaymentResponse(payment: Payment) {
    return {
      id: payment.id,
      accountReceivableId: payment.accountReceivableId,
      saleId: payment.saleId,
      customerId: payment.customerId,
      amount: toMoneyString(payment.amount),
      paymentMethod: payment.paymentMethod,
      bankName: payment.bankName,
      referenceNumber: payment.referenceNumber,
      appliedDocumentId: payment.appliedDocumentId,
      appliedDocumentType: payment.appliedDocumentType,
      routeId: payment.routeId,
      routeSettlementId: payment.routeSettlementId,
      operationalLocationId: payment.operationalLocationId,
      pointOfSaleDailyCloseId: payment.pointOfSaleDailyCloseId,
      collectedByUserId: payment.collectedByUserId,
      collectionPass: payment.collectionPass,
      nextPaymentDate: payment.nextPaymentDate,
      status: payment.status,
      paidAt: payment.paidAt,
    };
  }

  private buildRegisterPaymentPayload(
    accountReceivableId: string,
    dto: RegisterReceivablePaymentDto,
    userId: string,
  ) {
    return {
      operation: 'REGISTER_RECEIVABLE_PAYMENT',
      accountReceivableId,
      amount: dto.amount,
      paymentMethod: dto.paymentMethod,
      bankName:
        dto.paymentMethod === 'CASH'
          ? null
          : this.normalizeOptionalText(dto.bankName),
      referenceNumber:
        dto.paymentMethod === 'CASH'
          ? null
          : this.normalizeOptionalText(dto.referenceNumber),
      appliedDocumentId: this.normalizeOptionalText(dto.appliedDocumentId),
      appliedDocumentType: this.normalizeOptionalText(dto.appliedDocumentType),
      routeId: this.normalizeOptionalText(dto.routeId),
      routeSettlementId: this.normalizeOptionalText(dto.routeSettlementId),
      ...(dto.pointOfSaleDailyCloseId
        ? {
            pointOfSaleDailyCloseId: this.normalizeOptionalText(
              dto.pointOfSaleDailyCloseId,
            ),
          }
        : {}),
      collectedByUserId: dto.collectedByUserId ?? userId,
      collectionPass: dto.collectionPass ?? null,
      nextPaymentDate: dto.nextPaymentDate ?? null,
      paidAt: dto.paidAt ?? null,
      userId,
      ...(dto.expectedVersion !== undefined
        ? { expectedVersion: dto.expectedVersion }
        : {}),
    };
  }

  private async resolveExistingPaymentByKey(
    idempotencyKey: string,
    accountReceivableId: string,
    payloadHash: string,
  ) {
    const existingPayment = await this.prisma.payment.findFirst({
      where: { idempotencyKey },
    });

    if (!existingPayment) {
      throw new ConflictException(
        'Concurrent payment registration is still in progress; retry with the same Idempotency-Key',
      );
    }

    return this.resolveExistingPaymentResponse(
      this.prisma,
      existingPayment,
      accountReceivableId,
      payloadHash,
    );
  }

  private async resolveExistingPaymentResponse(
    client: Prisma.TransactionClient | PrismaService,
    existingPayment: IdempotentPayment,
    accountReceivableId: string,
    payloadHash: string,
  ) {
    this.assertSameIdempotencyPayload(
      existingPayment.idempotencyPayloadHash,
      payloadHash,
      'Idempotency-Key was already used for a different payment payload',
    );

    const receivable = (await client.accountReceivable.findUnique({
      where: { id: existingPayment.accountReceivableId ?? accountReceivableId },
      include: { customer: true, sale: true },
    })) as ReceivableRecord | null;

    if (!receivable) {
      throw new NotFoundException('Account receivable not found');
    }

    return {
      payment: this.toPaymentResponse(existingPayment),
      accountReceivable: this.toListItem(receivable),
    };
  }

  private async withSerializableRetry<T>(
    operation: () => Promise<T>,
  ): Promise<T> {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        if (!this.isSerializableConflict(error)) throw error;
        if (attempt === 3) {
          throw new ConflictException({
            code: 'COLLECTION_CONCURRENCY_CONFLICT',
            message:
              'The collection could not be completed after concurrent retries',
          });
        }
      }
    }

    throw new ConflictException({
      code: 'COLLECTION_CONCURRENCY_CONFLICT',
      message: 'The collection could not be completed after concurrent retries',
    });
  }

  private isSerializableConflict(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2034'
    );
  }

  private isIdempotencyUniqueConflict(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    );
  }

  private isStaleVersionError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2025'
    );
  }

  private assertSameIdempotencyPayload(
    existingHash: string | null | undefined,
    expectedHash: string,
    message: string,
  ): void {
    if (existingHash !== expectedHash) {
      throw new ConflictException(message);
    }
  }

  private hashPayload(payload: Record<string, unknown>): string {
    return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  }

  private addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setUTCDate(result.getUTCDate() + days);
    return result;
  }

  private normalizeOptionalText(value?: string | null): string | null {
    const normalized = value?.trim();
    return normalized ? normalized : null;
  }

  private toNumber(value: DecimalLike): number {
    return Number(value?.toString() ?? 0);
  }
}

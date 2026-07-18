import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import {
  BillingRequestStatus,
  CollectionStatus,
  CreditStatus,
  PaymentStatus,
  Prisma,
  SalePaymentType,
  SaleStatus,
  type AccountReceivable,
  type Payment,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { ListAccountsReceivableQueryDto, RegisterReceivablePaymentDto } from './dto';
import { calculateReceivableAging } from './receivable-aging';

type DecimalLike = Prisma.Decimal | number | string | null | undefined;
type Actor = Pick<AuthenticatedUser, 'id' | 'role'>;

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
};

@Injectable()
export class AccountsReceivableService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: ListAccountsReceivableQueryDto = {}, currentUser?: Actor) {
    this.assertSellerListScope(query, currentUser);

    const receivables = (await this.prisma.accountReceivable.findMany({
      where: this.buildListWhere(query),
      include: { customer: true, sale: true, billingRequest: true },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
      ...this.buildPagination(query),
    } as Prisma.AccountReceivableFindManyArgs)) as ReceivableRecord[];

    return { items: receivables.map((receivable) => this.toListItem(receivable)) };
  }

  async findOne(id: string, currentUser?: Actor) {
    this.assertSellerDetailScope(currentUser);

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

    if (dto.amount <= 0) {
      throw new BadRequestException('amount must be greater than 0');
    }

    const paidAt = dto.paidAt ? new Date(dto.paidAt) : new Date();
    const payloadHash = this.hashPayload(this.buildRegisterPaymentPayload(id, dto, currentUser.id, paidAt));

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const existingPayment = (await tx.payment.findFirst({
            where: { idempotencyKey },
          })) as IdempotentPayment | null;

          if (existingPayment) {
            return this.resolveExistingPaymentResponse(tx, existingPayment, id, payloadHash);
          }

        const receivable = (await tx.accountReceivable.findUnique({
          where: { id },
        })) as AccountReceivable | null;

        if (!receivable) {
          throw new NotFoundException('Account receivable not found');
        }

        this.assertReceivableCanReceivePayment(receivable);

        const outstandingAmount = this.toNumber(receivable.outstandingAmount);
        if (dto.amount > outstandingAmount) {
          throw new BadRequestException('Payment amount cannot exceed outstanding balance');
        }

        const newOutstandingAmount = this.roundMoney(outstandingAmount - dto.amount);
        const nextStatus = newOutstandingAmount === 0
          ? CollectionStatus.PAID
          : CollectionStatus.PARTIALLY_PAID;
        const { daysOverdue, agingStatus } = calculateReceivableAging(receivable.dueDate, newOutstandingAmount, paidAt);

        const payment = await tx.payment.create({
          data: {
            accountReceivableId: id,
            customerId: receivable.customerId,
            saleId: receivable.saleId,
            userId: currentUser.id,
            collectedByUserId: dto.collectedByUserId ?? currentUser.id,
            collectionPass: dto.collectionPass ?? null,
            amount: dto.amount,
            paymentMethod: dto.paymentMethod,
            bankName: this.normalizeOptionalText(dto.bankName),
            referenceNumber: this.normalizeOptionalText(dto.referenceNumber),
            appliedDocumentId: this.normalizeOptionalText(dto.appliedDocumentId),
            appliedDocumentType: this.normalizeOptionalText(dto.appliedDocumentType),
            routeId: this.normalizeOptionalText(dto.routeId),
            routeSettlementId: this.normalizeOptionalText(dto.routeSettlementId),
            status: PaymentStatus.APPLIED,
            paidAt,
            idempotencyKey,
            idempotencyPayloadHash: payloadHash,
          },
        });

        const updatedReceivable = await tx.accountReceivable.update({
          where: { id },
          data: {
            outstandingAmount: newOutstandingAmount,
            lastPaymentDate: paidAt,
            daysOverdue,
            agingStatus,
            status: nextStatus,
            paidAt: nextStatus === CollectionStatus.PAID ? paidAt : null,
          },
        });

        await tx.sale.update({
          where: { id: receivable.saleId },
          data: { collectionStatus: nextStatus },
        });

          return {
            payment: this.toPaymentResponse(payment),
            accountReceivable: this.toListItem(updatedReceivable as ReceivableRecord),
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (this.isIdempotencyRaceError(error)) {
        return this.resolveExistingPaymentByKey(idempotencyKey, id, payloadHash);
      }
      throw error;
    }
  }

  async createFromConfirmedCreditSale(saleId: string) {
    return this.prisma.$transaction(
      async (tx) => {
        const sale = (await tx.sale.findUnique({
          where: { id: saleId },
          include: { customer: true, payments: true, accountReceivable: true },
        })) as CreditSaleRecord | null;

        if (!sale) {
          throw new NotFoundException('Sale not found');
        }

        if (sale.accountReceivable) {
          return this.toListItem(sale.accountReceivable as ReceivableRecord);
        }

        this.assertEligibleCreditSale(sale);

        const initialPaid = this.sumActiveSalePayments(sale.payments ?? []);
        const pendingAmount = this.roundMoney(this.toNumber(sale.total) - initialPaid);
        if (pendingAmount <= 0) {
          throw new BadRequestException('Confirmed credit sale has no outstanding balance');
        }

        const creditDays = sale.customer?.creditDays ?? 0;
        const creditLimit = this.toNumber(sale.customer?.creditLimit);
        const dueDate = this.addDays(sale.createdAt, creditDays);

        const overdue = await tx.accountReceivable.findFirst({
          where: {
            customerId: sale.customerId ?? undefined,
            status: { in: [CollectionStatus.UNPAID, CollectionStatus.PARTIALLY_PAID] },
            dueDate: { lt: new Date() },
            outstandingAmount: { gt: 0 },
          },
          select: { id: true },
        });
        if (overdue) {
          throw new BadRequestException('Customer has overdue accounts receivable');
        }

        const openBalance = await tx.accountReceivable.aggregate({
          where: {
            customerId: sale.customerId ?? undefined,
            status: { in: [CollectionStatus.UNPAID, CollectionStatus.PARTIALLY_PAID] },
          },
          _sum: { outstandingAmount: true },
        });
        const currentOpenBalance = this.toNumber(openBalance._sum.outstandingAmount);
        if (creditLimit > 0 && this.roundMoney(currentOpenBalance + pendingAmount) > creditLimit) {
          throw new BadRequestException('Credit sale exceeds customer credit limit');
        }

        const receivable = await tx.accountReceivable.create({
          data: {
            customerId: sale.customerId as string,
            saleId: sale.id,
            originalSaleId: sale.id,
            originalAmount: pendingAmount,
            outstandingAmount: pendingAmount,
            saleDate: sale.createdAt,
            dueDate,
            paymentTermsDays: creditDays,
            ...calculateReceivableAging(dueDate, pendingAmount),
            physicalDocumentFolio: this.normalizeOptionalText(sale.physicalFolio),
            commercialPolicyId: sale.commercialPolicyId ?? sale.customer?.commercialPolicyId ?? null,
            status: CollectionStatus.UNPAID,
          },
        });

        await tx.sale.update({
          where: { id: sale.id },
          data: { collectionStatus: CollectionStatus.UNPAID },
        });

        return this.toListItem(receivable as ReceivableRecord);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private buildListWhere(query: ListAccountsReceivableQueryDto): Prisma.AccountReceivableWhereInput {
    return {
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.saleId ? { saleId: query.saleId } : {}),
      ...(query.billingRequestId ? { billingRequestId: query.billingRequestId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.agingStatus ? { agingStatus: query.agingStatus } : {}),
      ...(query.onlyOverdue ? { dueDate: { lt: new Date() } } : this.buildDueDateRange(query)),
      ...(query.onlyActiveBillingRequest ? { billingRequest: { status: { not: BillingRequestStatus.CANCELLED } } } : {}),
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

  private buildPagination(query: { page?: number; limit?: number }) {
    if (!query.limit) {
      return {};
    }

    return {
      skip: ((query.page ?? 1) - 1) * query.limit,
      take: query.limit,
    };
  }

  private assertSellerListScope(_query: ListAccountsReceivableQueryDto, currentUser?: Actor): void {
    if (currentUser?.role === 'SELLER') {
      throw new ForbiddenException('SELLER accounts receivable list access requires an ownership policy');
    }
  }

  private assertSellerDetailScope(currentUser?: Actor): void {
    if (currentUser?.role === 'SELLER') {
      throw new ForbiddenException('SELLER accounts receivable detail access requires an ownership policy');
    }
  }

  private assertReceivableCanReceivePayment(receivable: AccountReceivable): void {
    if (
      receivable.status === CollectionStatus.PAID ||
      receivable.status === CollectionStatus.CANCELLED
    ) {
      throw new BadRequestException('Cannot register payments on paid or cancelled accounts receivable');
    }
  }

  private assertEligibleCreditSale(sale: CreditSaleRecord): void {
    if (sale.paymentType !== SalePaymentType.CREDIT_SALE) {
      throw new BadRequestException('Only credit sales can create accounts receivable');
    }
    if (sale.status !== SaleStatus.CONFIRMED) {
      throw new BadRequestException('Only confirmed credit sales can create accounts receivable');
    }
    if (!sale.customerId || !sale.customer) {
      throw new BadRequestException('Credit sale requires a customer');
    }
    if (!sale.customer.isActive) {
      throw new BadRequestException('Inactive customer cannot receive credit sales');
    }
    if (sale.customer.creditStatus !== CreditStatus.ACTIVE) {
      throw new BadRequestException('Customer credit is not active');
    }
  }

  private sumActiveSalePayments(payments: Array<Pick<Payment, 'amount' | 'status'>>): number {
    return this.roundMoney(
      payments
        .filter((payment) => payment.status !== PaymentStatus.CANCELLED)
        .reduce((sum, payment) => sum + this.toNumber(payment.amount), 0),
    );
  }

  private toDetail(receivable: ReceivableRecord) {
    return {
      ...this.toListItem(receivable),
      customer: receivable.customer ? {
        id: receivable.customer.id,
        name: receivable.customer.name,
        customerType: receivable.customer.customerType,
        creditStatus: receivable.customer.creditStatus,
        customerNumber: receivable.customer.customerNumber,
        commercialName: receivable.customer.commercialName,
      } : null,
      sale: receivable.sale ? {
        id: receivable.sale.id,
        saleNumber: receivable.sale.saleNumber,
        total: this.toMoneyString(receivable.sale.total),
        locationId: receivable.sale.locationId,
        documentType: receivable.sale.documentType,
        physicalFolio: receivable.sale.physicalFolio ?? null,
      } : null,
      billingRequest: receivable.billingRequest ?? null,
      payments: (receivable.payments ?? []).map((payment) => this.toPaymentResponse(payment)),
    };
  }

  private toListItem(receivable: ReceivableRecord) {
    return {
      id: receivable.id,
      customerId: receivable.customerId,
      customerName: receivable.customer?.name,
      saleId: receivable.saleId,
      saleNumber: receivable.sale?.saleNumber,
      billingRequestId: receivable.billingRequestId,
      billingRequestStatus: receivable.billingRequest?.status ?? null,
      originalAmount: this.toMoneyString(receivable.originalAmount),
      outstandingAmount: this.toMoneyString(receivable.outstandingAmount),
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
      amount: this.toMoneyString(payment.amount),
      paymentMethod: payment.paymentMethod,
      bankName: payment.bankName,
      referenceNumber: payment.referenceNumber,
      appliedDocumentId: payment.appliedDocumentId,
      appliedDocumentType: payment.appliedDocumentType,
      routeId: payment.routeId,
      routeSettlementId: payment.routeSettlementId,
      collectedByUserId: payment.collectedByUserId,
      collectionPass: payment.collectionPass,
      status: payment.status,
      paidAt: payment.paidAt,
    };
  }

  private buildRegisterPaymentPayload(
    accountReceivableId: string,
    dto: RegisterReceivablePaymentDto,
    userId: string,
    paidAt: Date,
  ) {
    return {
      operation: 'REGISTER_RECEIVABLE_PAYMENT',
      accountReceivableId,
      amount: dto.amount,
      paymentMethod: dto.paymentMethod,
      bankName: this.normalizeOptionalText(dto.bankName),
      referenceNumber: this.normalizeOptionalText(dto.referenceNumber),
      appliedDocumentId: this.normalizeOptionalText(dto.appliedDocumentId),
      appliedDocumentType: this.normalizeOptionalText(dto.appliedDocumentType),
      routeId: this.normalizeOptionalText(dto.routeId),
      routeSettlementId: this.normalizeOptionalText(dto.routeSettlementId),
      collectedByUserId: dto.collectedByUserId ?? userId,
      collectionPass: dto.collectionPass ?? null,
      paidAt: dto.paidAt ?? null,
      userId,
    };
  }


  private async resolveExistingPaymentByKey(
    idempotencyKey: string,
    accountReceivableId: string,
    payloadHash: string,
  ) {
    const existingPayment = (await this.prisma.payment.findFirst({
      where: { idempotencyKey },
    })) as IdempotentPayment | null;

    if (!existingPayment) {
      throw new ConflictException('Concurrent payment registration is still in progress; retry with the same Idempotency-Key');
    }

    return this.resolveExistingPaymentResponse(this.prisma, existingPayment, accountReceivableId, payloadHash);
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

  private isIdempotencyRaceError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error.code === 'P2002' || error.code === 'P2034')
    );
  }

  private assertSameIdempotencyPayload(existingHash: string | null | undefined, expectedHash: string, message: string): void {
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

  private toMoneyString(value: DecimalLike): string {
    return this.toNumber(value).toString();
  }

  private roundMoney(value: number): number {
    return Math.round(value * 100) / 100;
  }
}

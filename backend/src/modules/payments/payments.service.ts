import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { CollectionStatus, PaymentStatus, Prisma, type AccountReceivable, type Payment } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { calculateReceivableAging } from '../accounts-receivable/receivable-aging';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CancelPaymentDto } from './dto';

type DecimalLike = Prisma.Decimal | number | string | null | undefined;
type Actor = Pick<AuthenticatedUser, 'id' | 'role'>;
type PaymentWithReceivable = Payment & {
  accountReceivable?: Pick<AccountReceivable, 'id' | 'saleId' | 'outstandingAmount' | 'originalAmount' | 'dueDate' | 'status'> | null;
  version?: number;
  cancellationPayloadHash?: string | null;
  cancellationReason?: string | null;
  cancellationIdempotencyKey?: string | null;
  cancelledByUserId?: string | null;
};

type LastPaymentDate = { paidAt: Date } | null;

@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  async cancel(id: string, dto: CancelPaymentDto, currentUser: Actor, idempotencyKey: string) {
    const reason = dto.reason?.trim();
    if (!reason) {
      throw new BadRequestException('reason is required');
    }

    if (dto.expectedVersion === undefined || dto.expectedVersion === null) {
      throw new BadRequestException('expectedVersion is required');
    }

    const payloadHash = this.hashPayload(this.buildCancelPayload(id, currentUser.id, reason, dto.expectedVersion));

    try {
      return await this.prisma.$transaction(
        async (tx) => {
        const existingCancellation = (await tx.payment.findFirst({
          where: { cancellationIdempotencyKey: idempotencyKey },
          include: { accountReceivable: true },
        })) as PaymentWithReceivable | null;

        if (existingCancellation) {
          this.assertSameIdempotencyPayload(
            existingCancellation.cancellationPayloadHash,
            payloadHash,
            'Idempotency-Key was already used for a different payment cancellation payload',
          );
          return this.buildCancellationResponse(tx, existingCancellation);
        }

        const payment = (await tx.payment.findUnique({
          where: { id },
          include: { accountReceivable: true },
        })) as PaymentWithReceivable | null;

        if (!payment) {
          throw new NotFoundException('Payment not found');
        }

        if (payment.status === PaymentStatus.CANCELLED) {
          throw new BadRequestException('Payment is already cancelled');
        }

        if (payment.version !== dto.expectedVersion) {
          throw new ConflictException('Payment version does not match expectedVersion');
        }

        const cancelledPayment = await this.updatePaymentCancellation(tx, {
          where: { id, version: dto.expectedVersion },
          data: {
            status: PaymentStatus.CANCELLED,
            cancelledAt: new Date(),
            cancelledByUserId: currentUser.id,
            cancellationReason: reason,
            cancellationIdempotencyKey: idempotencyKey,
            cancellationPayloadHash: payloadHash,
            version: { increment: 1 },
          },
        });

          if (!payment.accountReceivable) {
            return { payment: this.toPaymentResponse(cancelledPayment), accountReceivable: null };
          }

          return this.restoreReceivableAfterCancellation(tx, cancelledPayment, payment.accountReceivable);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (this.isIdempotencyRaceError(error)) {
        return this.resolveExistingCancellationByKey(idempotencyKey, payloadHash);
      }
      throw error;
    }
  }


  private async updatePaymentCancellation(
    tx: Prisma.TransactionClient | PrismaService,
    args: Prisma.PaymentUpdateArgs,
  ): Promise<Payment> {
    try {
      return await tx.payment.update(args);
    } catch (error) {
      if (this.isStaleUpdateError(error)) {
        throw new ConflictException('Payment version does not match expectedVersion');
      }
      throw error;
    }
  }

  private async resolveExistingCancellationByKey(idempotencyKey: string, payloadHash: string) {
    const existingCancellation = (await this.prisma.payment.findFirst({
      where: { cancellationIdempotencyKey: idempotencyKey },
      include: { accountReceivable: true },
    })) as PaymentWithReceivable | null;

    if (!existingCancellation) {
      throw new ConflictException('Concurrent payment cancellation is still in progress; retry with the same Idempotency-Key');
    }

    this.assertSameIdempotencyPayload(
      existingCancellation.cancellationPayloadHash,
      payloadHash,
      'Idempotency-Key was already used for a different payment cancellation payload',
    );
    return this.buildCancellationResponse(this.prisma, existingCancellation);
  }

  private isIdempotencyRaceError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error.code === 'P2002' || error.code === 'P2034')
    );
  }

  private isStaleUpdateError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2025'
    );
  }

  private async buildCancellationResponse(
    tx: Prisma.TransactionClient | PrismaService,
    payment: PaymentWithReceivable,
  ) {
    if (!payment.accountReceivable) {
      return { payment: this.toPaymentResponse(payment), accountReceivable: null };
    }

    const receivable = (await tx.accountReceivable.findUnique({
      where: { id: payment.accountReceivable.id },
    })) as AccountReceivable | null;

    return {
      payment: this.toPaymentResponse(payment),
      accountReceivable: receivable ? this.toReceivableResponse(receivable) : null,
    };
  }

  private async restoreReceivableAfterCancellation(
    tx: Prisma.TransactionClient,
    cancelledPayment: Payment,
    accountReceivable: Pick<AccountReceivable, 'id' | 'saleId' | 'outstandingAmount' | 'originalAmount' | 'dueDate' | 'status'>,
  ) {
    const originalAmount = this.toNumber(accountReceivable.originalAmount);
    const restoredOutstanding = Math.min(
      originalAmount,
      this.roundMoney(this.toNumber(accountReceivable.outstandingAmount) + this.toNumber(cancelledPayment.amount)),
    );
    const nextStatus = restoredOutstanding >= originalAmount
      ? CollectionStatus.UNPAID
      : CollectionStatus.PARTIALLY_PAID;
    const aging = calculateReceivableAging(accountReceivable.dueDate, restoredOutstanding);
    const lastPayment = (await tx.payment.findFirst({
      where: {
        accountReceivableId: accountReceivable.id,
        status: { not: PaymentStatus.CANCELLED },
        id: { not: cancelledPayment.id },
      },
      orderBy: { paidAt: 'desc' },
      select: { paidAt: true },
    })) as LastPaymentDate;

    const updatedReceivable = await tx.accountReceivable.update({
      where: { id: accountReceivable.id },
      data: {
        outstandingAmount: restoredOutstanding,
        status: nextStatus,
        ...aging,
        lastPaymentDate: lastPayment?.paidAt ?? null,
        paidAt: null,
      },
    });

    await tx.sale.update({
      where: { id: accountReceivable.saleId },
      data: { collectionStatus: nextStatus },
    });

    return {
      payment: this.toPaymentResponse(cancelledPayment),
      accountReceivable: this.toReceivableResponse(updatedReceivable),
    };
  }

  private buildCancelPayload(paymentId: string, userId: string, reason: string, expectedVersion?: number) {
    return {
      operation: 'CANCEL_PAYMENT',
      paymentId,
      userId,
      reason,
      expectedVersion: expectedVersion ?? null,
    };
  }

  private assertSameIdempotencyPayload(existingHash: string | null | undefined, expectedHash: string, message: string): void {
    if (existingHash !== expectedHash) {
      throw new ConflictException(message);
    }
  }

  private hashPayload(payload: Record<string, unknown>): string {
    return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  }

  private toPaymentResponse(payment: PaymentWithReceivable) {
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
      status: payment.status,
      paidAt: payment.paidAt,
      cancelledAt: payment.cancelledAt,
      cancelledByUserId: payment.cancelledByUserId ?? null,
      cancellationReason: payment.cancellationReason ?? null,
      version: payment.version,
    };
  }

  private toReceivableResponse(receivable: Pick<AccountReceivable, 'id' | 'outstandingAmount' | 'daysOverdue' | 'lastPaymentDate' | 'status'>) {
    return {
      id: receivable.id,
      outstandingAmount: this.toMoneyString(receivable.outstandingAmount),
      daysOverdue: receivable.daysOverdue,
      lastPaymentDate: receivable.lastPaymentDate,
      status: receivable.status,
    };
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

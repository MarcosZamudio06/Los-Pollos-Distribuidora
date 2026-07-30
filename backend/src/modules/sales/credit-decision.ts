import { BadRequestException } from '@nestjs/common';
import {
  AgingStatus,
  CollectionStatus,
  CreditStatus,
  type Prisma,
} from '@prisma/client';
import { calculateReceivableAging } from '../accounts-receivable/receivable-aging';
import { Money } from '../../../../shared/money';

type DecimalLike = Prisma.Decimal | number | string | null | undefined;
type CreditDecisionInput = {
  customer: {
    id: string;
    creditStatus: CreditStatus;
    creditLimit?: DecimalLike;
    commercialPolicyId?: string | null;
  };
  newOutstandingAmount: DecimalLike;
  actor: { id: string; role: string };
  policyId?: string | null;
  overrideReason?: string;
  asOf?: Date;
};

export type CreditStateInput = {
  creditStatus: CreditStatus;
  creditLimit?: DecimalLike;
  newOutstandingAmount: DecimalLike;
  receivables: Array<{
    dueDate: Date;
    outstandingAmount: DecimalLike;
    status: CollectionStatus;
  }>;
  policy: {
    id: string;
    isActive?: boolean;
    effectiveFrom?: Date | null;
    effectiveTo?: Date | null;
    overdueBlockingMode: string | null;
    allowAdministrativeOverride: boolean;
  } | null;
  asOf: Date;
};

export function calculateCreditState(input: CreditStateInput) {
  const policyIsEffective = Boolean(
    input.policy?.isActive !== false &&
    input.policy?.effectiveFrom instanceof Date &&
    input.policy.effectiveFrom <= input.asOf &&
    (!input.policy?.effectiveTo || input.policy.effectiveTo >= input.asOf),
  );
  const policy = policyIsEffective ? input.policy : null;
  let currentExposure = Money.zero();
  let overdueAmount = Money.zero();
  let maximumDaysOverdue = 0;
  let hasDueSoon = false;
  for (const receivable of input.receivables) {
    const outstanding = Money.from(receivable.outstandingAmount);
    currentExposure = currentExposure.add(outstanding);
    const aging = calculateReceivableAging(
      receivable.dueDate,
      outstanding,
      input.asOf,
    );
    if (aging.agingStatus === AgingStatus.OVERDUE) {
      overdueAmount = overdueAmount.add(outstanding);
      maximumDaysOverdue = Math.max(maximumDaysOverdue, aging.daysOverdue);
    }
    if (aging.agingStatus === AgingStatus.DUE_SOON) hasDueSoon = true;
  }
  const projectedExposure = currentExposure.add(
    Money.from(input.newOutstandingAmount),
  );
  const creditLimit = Money.from(input.creditLimit);
  const reasons: string[] = [];
  if (input.creditStatus !== CreditStatus.ACTIVE) {
    reasons.push('CREDIT_ADMINISTRATIVELY_BLOCKED');
  } else {
    if (
      overdueAmount.isPositive() &&
      policy?.overdueBlockingMode === 'BLOCK_NEW_CREDIT'
    )
      reasons.push('CREDIT_OVERDUE_BLOCKED');
    if (
      overdueAmount.isPositive() &&
      policy?.overdueBlockingMode === 'WARN_ONLY'
    )
      reasons.push('CREDIT_OVERDUE_WARNING');
    if (creditLimit.isPositive() && projectedExposure.compare(creditLimit) > 0)
      reasons.push('CREDIT_LIMIT_EXCEEDED');
  }
  const hasBlock = reasons.some(
    (reason) => reason !== 'CREDIT_OVERDUE_WARNING',
  );
  const hasOverrideableBlock = reasons.some(
    (reason) =>
      reason === 'CREDIT_OVERDUE_BLOCKED' || reason === 'CREDIT_LIMIT_EXCEEDED',
  );
  const effectiveCreditStatus: 'ACTIVE' | 'BLOCKED' | 'WARNING' = hasBlock
    ? 'BLOCKED'
    : reasons.length
      ? 'WARNING'
      : 'ACTIVE';
  return {
    policyId: policy?.id ?? null,
    overdueBlockingMode: policy?.overdueBlockingMode ?? null,
    overdueAmount: overdueAmount.toString(),
    maximumDaysOverdue,
    currentExposure: currentExposure.toString(),
    projectedExposure: projectedExposure.toString(),
    creditLimit: creditLimit.toString(),
    effectiveCreditStatus,
    blockingReasons: reasons,
    canAdministrativeOverride: Boolean(
      policy?.allowAdministrativeOverride && hasOverrideableBlock,
    ),
    agingStatus: overdueAmount.isPositive()
      ? AgingStatus.OVERDUE
      : hasDueSoon
        ? AgingStatus.DUE_SOON
        : AgingStatus.CURRENT,
  };
}

function denial(code: string, message: string): BadRequestException {
  return new BadRequestException({ code, message });
}

export async function evaluateCreditDecision(
  tx: Prisma.TransactionClient,
  input: CreditDecisionInput,
) {
  if (input.customer.creditStatus !== CreditStatus.ACTIVE) {
    throw denial(
      'CREDIT_ADMINISTRATIVELY_BLOCKED',
      'Customer credit is not active',
    );
  }

  if (
    input.policyId !== undefined &&
    input.policyId !== input.customer.commercialPolicyId
  ) {
    throw denial(
      'CREDIT_POLICY_MISMATCH',
      'Requested commercial policy does not match the customer assignment',
    );
  }
  const policyId = input.customer.commercialPolicyId ?? null;
  const asOf = input.asOf ?? new Date();
  const policy = policyId
    ? await tx.commercialPolicy.findFirst({
        where: {
          id: policyId,
          isActive: true,
          effectiveFrom: { lte: asOf },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: asOf } }],
        },
        select: {
          id: true,
          isActive: true,
          effectiveFrom: true,
          effectiveTo: true,
          overdueBlockingMode: true,
          allowAdministrativeOverride: true,
        },
      })
    : null;
  const receivables = await tx.accountReceivable.findMany({
    where: {
      customerId: input.customer.id,
      status: {
        in: [CollectionStatus.UNPAID, CollectionStatus.PARTIALLY_PAID],
      },
      outstandingAmount: { gt: 0 },
    },
    select: { dueDate: true, outstandingAmount: true, status: true },
  });
  const state = calculateCreditState({
    creditStatus: input.customer.creditStatus,
    creditLimit: input.customer.creditLimit,
    newOutstandingAmount: input.newOutstandingAmount,
    receivables,
    policy,
    asOf,
  });
  const overdueBlocked = state.blockingReasons.includes(
    'CREDIT_OVERDUE_BLOCKED',
  );
  const limitBlocked = state.blockingReasons.includes('CREDIT_LIMIT_EXCEEDED');
  const overrideReason = input.overrideReason?.trim();
  if (input.overrideReason !== undefined && !overrideReason) {
    throw denial(
      'CREDIT_OVERRIDE_REASON_REQUIRED',
      'Administrative override reason must not be blank',
    );
  }
  if (overrideReason) {
    if (input.actor.role !== 'ADMIN') {
      throw denial(
        'CREDIT_OVERRIDE_FORBIDDEN',
        'Administrative override requires ADMIN authorization',
      );
    }
    if (!policy?.allowAdministrativeOverride) {
      throw denial(
        'CREDIT_OVERRIDE_NOT_ALLOWED',
        'Administrative override is not allowed by the active commercial policy',
      );
    }
    if (!overdueBlocked && !limitBlocked) {
      throw denial(
        'CREDIT_OVERRIDE_NOT_APPLICABLE',
        'Administrative override requires an overdue or credit-limit denial',
      );
    }
  }

  if ((overdueBlocked || limitBlocked) && !overrideReason) {
    if (overdueBlocked)
      throw denial('CREDIT_OVERDUE_BLOCKED', 'Customer has overdue credit');
    throw denial('CREDIT_LIMIT_EXCEEDED', 'Customer credit limit exceeded');
  }

  const warnings = overrideReason
    ? ['CREDIT_OVERRIDE_APPLIED']
    : state.blockingReasons.includes('CREDIT_OVERDUE_WARNING')
      ? ['CREDIT_OVERDUE_WARNING']
      : [];
  return {
    policyId: state.policyId,
    overdueBlockingMode: state.overdueBlockingMode,
    overdueAmount: state.overdueAmount,
    maximumDaysOverdue: state.maximumDaysOverdue,
    currentExposure: state.currentExposure,
    projectedExposure: state.projectedExposure,
    creditLimit: state.creditLimit,
    outcome: overrideReason
      ? 'OVERRIDDEN'
      : warnings.length
        ? 'WARNING'
        : 'PERMITTED',
    warnings,
    overrideActorId: overrideReason ? input.actor.id : null,
    overrideReason: overrideReason ?? null,
  };
}

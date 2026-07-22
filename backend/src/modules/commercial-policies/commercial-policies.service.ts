import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CreateCommercialPolicyDto, CreateDiscountAuthorizationDto, ListCommercialPoliciesQueryDto, UpdateCommercialPolicyDto } from './dto';

type CommercialPolicyRecord = Prisma.CommercialPolicyGetPayload<Record<string, never>>;
type PolicyMutationDto = CreateCommercialPolicyDto | UpdateCommercialPolicyDto;

const HISTORICAL_POLICY_FIELDS: Array<keyof UpdateCommercialPolicyDto> = [
  'customerType',
  'priceListId',
  'defaultCreditLimit',
  'defaultCreditDays',
  'overdueBlockingMode',
  'creditLimitBlockingMode',
  'allowAdministrativeOverride',
  'maximumDiscountPercentage',
  'effectiveFrom',
];

@Injectable()
export class CommercialPoliciesService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: ListCommercialPoliciesQueryDto = {}) {
    const policies = (await this.prisma.commercialPolicy.findMany({
      where: this.buildListWhere(query),
      orderBy: { name: 'asc' },
      ...this.buildPagination(query),
    })) as CommercialPolicyRecord[];

    return { items: policies.map((policy) => this.toResponse(policy)) };
  }

  async create(dto: CreateCommercialPolicyDto, currentUser: AuthenticatedUser) {
    const data = this.normalizeMutationData(dto, currentUser.id, true) as Prisma.CommercialPolicyUncheckedCreateInput;
    const policy = (await this.prisma.commercialPolicy.create({ data })) as CommercialPolicyRecord;
    return this.toResponse(policy);
  }

  async update(id: string, dto: UpdateCommercialPolicyDto, currentUser: AuthenticatedUser) {
    const current = await this.findActivePolicy(id);
    await this.assertHistoricalConditionsAreNotOverwritten(id, dto);

    const merged = { ...this.toMutationSnapshot(current), ...dto };
    const data = this.normalizeMutationData(merged, currentUser.id, false) as Prisma.CommercialPolicyUncheckedUpdateInput;
    const policy = (await this.prisma.commercialPolicy.update({ where: { id }, data })) as CommercialPolicyRecord;
    return this.toResponse(policy);
  }

  async deactivate(id: string, currentUser: AuthenticatedUser) {
    await this.findActivePolicy(id);
    await this.assertNoOpenPolicyDependencies(id);

    const policy = (await this.prisma.commercialPolicy.update({
      where: { id },
      data: { isActive: false, updatedByUserId: currentUser.id },
    })) as CommercialPolicyRecord;

    return this.toResponse(policy);
  }

  async authorizeDiscount(policyId: string, dto: CreateDiscountAuthorizationDto, currentUser: AuthenticatedUser) {
    const policy = await this.findActivePolicy(policyId);
    this.assertPolicyIsEffective(policy);
    const maximumDiscountPercentage = Number(policy.maximumDiscountPercentage);
    if (dto.maximumPercentage > maximumDiscountPercentage) {
      throw new BadRequestException('Discount authorization exceeds the commercial policy maximum');
    }

    if (dto.authorizedForUserId) {
      const user = await this.prisma.user.findUnique({ where: { id: dto.authorizedForUserId }, select: { id: true, isActive: true } });
      if (!user?.isActive) throw new NotFoundException('Authorized seller not found');
    }

    return this.prisma.discountAuthorization.create({
      data: {
        commercialPolicyId: policy.id,
        authorizedForUserId: dto.authorizedForUserId?.trim() || null,
        maximumPercentage: dto.maximumPercentage,
        reason: dto.reason.trim(),
        evidence: dto.evidence.trim(),
        expiresAt: dto.expiresAt ? this.parseDate(dto.expiresAt, 'expiresAt') : null,
        authorizedByUserId: currentUser.id,
      },
    });
  }

  private buildListWhere(query: ListCommercialPoliciesQueryDto): Prisma.CommercialPolicyWhereInput {
    const search = query.search?.trim();
    return {
      ...(query.customerType ? { customerType: query.customerType } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(search ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { description: { contains: search, mode: 'insensitive' } }] } : {}),
    };
  }

  private buildPagination(query: ListCommercialPoliciesQueryDto): { skip?: number; take?: number } {
    if (!query.limit) return {};
    return { skip: ((query.page ?? 1) - 1) * query.limit, take: query.limit };
  }

  private normalizeMutationData(dto: PolicyMutationDto, userId: string, isCreate: boolean) {
    const name = dto.name?.trim();
    if (dto.name !== undefined && !name) throw new BadRequestException('Policy name is required');
    if (isCreate && !name) throw new BadRequestException('Policy name is required');
    if (dto.defaultCreditLimit !== undefined && dto.defaultCreditLimit < 0) throw new BadRequestException('Credit limit must be greater than or equal to zero');
    if (dto.defaultCreditDays !== undefined && dto.defaultCreditDays < 0) throw new BadRequestException('Credit days must be greater than or equal to zero');
    if (dto.maximumDiscountPercentage !== undefined && dto.maximumDiscountPercentage > 100) throw new BadRequestException('Maximum discount percentage must not exceed 100');

    const overdueBlockingMode = dto.overdueBlockingMode?.trim();
    const creditLimitBlockingMode = dto.creditLimitBlockingMode?.trim();
    if (dto.defaultCreditDays !== undefined && dto.defaultCreditDays > 0 && !overdueBlockingMode) {
      throw new BadRequestException('overdueBlockingMode is required when credit days are configured');
    }
    if (dto.defaultCreditLimit !== undefined && dto.defaultCreditLimit > 0 && !creditLimitBlockingMode) {
      throw new BadRequestException('creditLimitBlockingMode is required when credit limit is configured');
    }

    const isActive = dto.isActive ?? (isCreate ? true : undefined);
    if (isActive === true && !dto.effectiveFrom) throw new BadRequestException('effectiveFrom is required for active policies');

    const effectiveFrom = dto.effectiveFrom !== undefined ? this.parseDate(dto.effectiveFrom, 'effectiveFrom') : undefined;
    const effectiveTo = dto.effectiveTo !== undefined && dto.effectiveTo !== null ? this.parseDate(dto.effectiveTo, 'effectiveTo') : null;
    if (effectiveFrom && effectiveTo && effectiveTo < effectiveFrom) {
      throw new BadRequestException('effectiveTo must be greater than or equal to effectiveFrom');
    }

    return {
      ...(dto.name !== undefined ? { name } : {}),
      ...(dto.description !== undefined ? { description: dto.description?.trim() || null } : {}),
      ...(dto.customerType !== undefined ? { customerType: dto.customerType } : {}),
      ...(dto.priceListId !== undefined ? { priceListId: dto.priceListId?.trim() || null } : {}),
      ...(dto.defaultCreditLimit !== undefined ? { defaultCreditLimit: dto.defaultCreditLimit } : {}),
      ...(dto.defaultCreditDays !== undefined ? { defaultCreditDays: dto.defaultCreditDays } : {}),
      ...(dto.overdueBlockingMode !== undefined ? { overdueBlockingMode: overdueBlockingMode || null } : {}),
      ...(dto.creditLimitBlockingMode !== undefined ? { creditLimitBlockingMode: creditLimitBlockingMode || null } : {}),
      ...(dto.allowAdministrativeOverride !== undefined ? { allowAdministrativeOverride: dto.allowAdministrativeOverride } : {}),
      ...(dto.maximumDiscountPercentage !== undefined ? { maximumDiscountPercentage: dto.maximumDiscountPercentage } : {}),
      ...(dto.effectiveFrom !== undefined ? { effectiveFrom } : {}),
      ...(dto.effectiveTo !== undefined ? { effectiveTo } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
      ...(isCreate ? { createdByUserId: userId } : {}),
      updatedByUserId: userId,
    };
  }

  private async findActivePolicy(id: string): Promise<CommercialPolicyRecord> {
    const policy = (await this.prisma.commercialPolicy.findFirst({ where: { id, isActive: true } })) as CommercialPolicyRecord | null;
    if (!policy) throw new NotFoundException('Commercial policy not found');
    return policy;
  }

  private assertPolicyIsEffective(policy: CommercialPolicyRecord): void {
    const now = new Date();
    if (!policy.effectiveFrom || policy.effectiveFrom > now || (policy.effectiveTo && policy.effectiveTo <= now)) {
      throw new BadRequestException('Commercial policy is not currently effective');
    }
  }

  private async assertHistoricalConditionsAreNotOverwritten(id: string, dto: UpdateCommercialPolicyDto): Promise<void> {
    const changesHistoricalConditions = HISTORICAL_POLICY_FIELDS.some((field) => dto[field] !== undefined);
    if (!changesHistoricalConditions) return;

    const [sale, accountReceivable] = await Promise.all([
      this.prisma.sale.findFirst({ where: { commercialPolicyId: id }, select: { id: true } }),
      this.prisma.accountReceivable.findFirst({ where: { commercialPolicyId: id }, select: { id: true } }),
    ]);

    if (sale || accountReceivable) {
      throw new BadRequestException('Cannot overwrite commercial conditions already applied to sales or accounts receivable');
    }
  }

  private async assertNoOpenPolicyDependencies(id: string): Promise<void> {
    const openSale = await this.prisma.sale.findFirst({ where: { commercialPolicyId: id, status: { in: ['DRAFT', 'CONFIRMED'] } }, select: { id: true } });
    if (openSale) throw new BadRequestException('Cannot deactivate commercial policy with open sales');

    const openReceivable = await this.prisma.accountReceivable.findFirst({ where: { commercialPolicyId: id, status: { in: ['UNPAID', 'PARTIALLY_PAID'] } }, select: { id: true } });
    if (openReceivable) throw new BadRequestException('Cannot deactivate commercial policy with open receivables');
  }

  private parseDate(value: string, field: string): Date {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new BadRequestException(`${field} must be a valid date`);
    return date;
  }

  private toMutationSnapshot(policy: CommercialPolicyRecord): PolicyMutationDto {
    return {
      name: policy.name,
      description: policy.description ?? undefined,
      customerType: policy.customerType ?? undefined,
      priceListId: policy.priceListId ?? undefined,
      defaultCreditLimit: policy.defaultCreditLimit === null ? undefined : Number(policy.defaultCreditLimit),
      defaultCreditDays: policy.defaultCreditDays ?? undefined,
      overdueBlockingMode: policy.overdueBlockingMode ?? undefined,
      creditLimitBlockingMode: policy.creditLimitBlockingMode ?? undefined,
      allowAdministrativeOverride: policy.allowAdministrativeOverride,
      maximumDiscountPercentage: Number(policy.maximumDiscountPercentage),
      effectiveFrom: policy.effectiveFrom?.toISOString(),
      effectiveTo: policy.effectiveTo?.toISOString() ?? null,
      isActive: policy.isActive,
    };
  }

  private toResponse(policy: CommercialPolicyRecord) {
    return {
      id: policy.id,
      name: policy.name,
      description: policy.description,
      customerType: policy.customerType,
      priceListId: policy.priceListId,
      defaultCreditLimit: policy.defaultCreditLimit?.toString() ?? null,
      defaultCreditDays: policy.defaultCreditDays,
      overdueBlockingMode: policy.overdueBlockingMode,
      creditLimitBlockingMode: policy.creditLimitBlockingMode,
      allowAdministrativeOverride: policy.allowAdministrativeOverride,
      maximumDiscountPercentage: policy.maximumDiscountPercentage?.toString() ?? '0',
      isActive: policy.isActive,
      effectiveFrom: policy.effectiveFrom,
      effectiveTo: policy.effectiveTo,
      createdByUserId: policy.createdByUserId,
      updatedByUserId: policy.updatedByUserId,
      createdAt: policy.createdAt,
      updatedAt: policy.updatedAt,
    };
  }
}

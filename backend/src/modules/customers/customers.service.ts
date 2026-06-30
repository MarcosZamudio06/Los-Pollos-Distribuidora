import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreditStatus, type Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  CreateCustomerDto,
  ListCustomersQueryDto,
  UpdateCustomerDto,
} from './dto';

type CustomerRecord = Prisma.CustomerGetPayload<{
  include: {
    commercialPolicy: true;
    accountReceivables: true;
    payments: true;
    billingRequests: true;
  };
}>;
type CustomerListRecord = Prisma.CustomerGetPayload<Record<string, never>>;
type CustomerMutationDto = CreateCustomerDto | UpdateCustomerDto;

type CreditCompletenessSource = {
  creditLimit?: unknown;
  creditDays?: number | null;
  creditStatus?: CreditStatus | null;
};

type CustomerResponse = Omit<CustomerListRecord, 'creditLimit'> & {
  creditLimit: string | number | null;
  isBlockedForCredit: boolean;
  commercialPolicy?: unknown;
  creditSummary?: {
    globalBalance: string;
    outstandingAmount: string;
    overdueAmount: string;
    availableCredit: string | null;
    creditLimit: string | null;
    creditDays: number | null;
    daysOverdue: number;
    lastPaymentDate: Date | null;
    creditStatus: CreditStatus;
    isBlockedForCredit: boolean;
  };
  billingSummary?: {
    billedAmount: string;
    paidAmount: string;
    finalBalance: string;
    openAdministrativeOrders: number;
  };
};

type CustomerListResponse = { items: CustomerResponse[] };

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    query: ListCustomersQueryDto = {},
  ): Promise<CustomerListResponse> {
    const customers = (await this.prisma.customer.findMany({
      where: this.buildListWhere(query),
      orderBy: { name: 'asc' },
      ...this.buildPagination(query),
    })) as CustomerListRecord[];

    return {
      items: customers.map((customer) => this.toCustomerResponse(customer)),
    };
  }

  async findOne(id: string): Promise<CustomerResponse> {
    const customer = (await this.prisma.customer.findFirst({
      where: { id, isActive: true },
      include: {
        commercialPolicy: true,
        accountReceivables: true,
        payments: true,
        billingRequests: true,
      },
    })) as CustomerRecord | null;

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    return this.toCustomerResponse(customer);
  }

  async create(
    dto: CreateCustomerDto,
    currentUser?: AuthenticatedUser,
  ): Promise<CustomerResponse> {
    this.assertCanMutateCommercialTerms(dto, currentUser);
    this.assertCoherentCreditTerms(dto);

    const data = this.normalizeMutationData(
      dto,
      true,
    ) as Prisma.CustomerCreateInput;

    if (typeof data.phone === 'string') {
      await this.assertPhoneAvailable(data.phone);
    }

    const customer = (await this.prisma.customer
      .create({ data: { ...data, isActive: true } })
      .catch((error: unknown) => {
        this.throwUniqueConflict(error);
        throw error;
      })) as CustomerListRecord;

    return this.toCustomerResponse(customer);
  }

  async update(
    id: string,
    dto: UpdateCustomerDto,
    currentUser?: AuthenticatedUser,
  ): Promise<CustomerResponse> {
    const currentCustomer = await this.findActiveCustomerForMutation(id);
    this.assertCanMutateCommercialTerms(dto, currentUser);
    this.assertCoherentCreditTermsForUpdate(dto, currentCustomer);

    const data = this.normalizeMutationData(
      dto,
      false,
    ) as Prisma.CustomerUpdateInput;

    if (typeof data.phone === 'string') {
      await this.assertPhoneAvailable(data.phone, currentCustomer.id);
    }

    const customer = (await this.prisma.customer
      .update({ where: { id: currentCustomer.id }, data })
      .catch((error: unknown) => {
        this.throwUniqueConflict(error);
        throw error;
      })) as CustomerListRecord;

    return this.toCustomerResponse(customer);
  }

  async deactivate(id: string): Promise<CustomerResponse> {
    const currentCustomer = await this.findActiveCustomerForMutation(id);
    const customer = (await this.prisma.customer.update({
      where: { id: currentCustomer.id },
      data: { isActive: false },
    })) as CustomerListRecord;

    return this.toCustomerResponse(customer);
  }

  private buildListWhere(
    query: ListCustomersQueryDto,
  ): Prisma.CustomerWhereInput {
    const search = query.search?.trim();

    return {
      isActive: query.isActive ?? true,
      ...(query.customerType ? { customerType: query.customerType } : {}),
      ...(query.creditStatus ? { creditStatus: query.creditStatus } : {}),
      ...(query.commercialPolicyId
        ? { commercialPolicyId: query.commercialPolicyId }
        : {}),
      ...(query.assignedRouteId
        ? { assignedRouteId: query.assignedRouteId }
        : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { commercialName: { contains: search, mode: 'insensitive' } },
              { customerNumber: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
  }

  private buildPagination(query: ListCustomersQueryDto): {
    skip?: number;
    take?: number;
  } {
    if (!query.limit) {
      return {};
    }

    return {
      skip: ((query.page ?? 1) - 1) * query.limit,
      take: query.limit,
    };
  }

  private async findActiveCustomerForMutation(
    id: string,
  ): Promise<CustomerListRecord> {
    const customer = (await this.prisma.customer.findFirst({
      where: { id, isActive: true },
    })) as CustomerListRecord | null;

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    return customer;
  }

  private async assertPhoneAvailable(
    phone: string,
    currentCustomerId?: string,
  ): Promise<void> {
    const existingCustomer = await this.prisma.customer.findUnique({
      where: { phone },
      select: { id: true },
    });

    if (existingCustomer && existingCustomer.id !== currentCustomerId) {
      throw new ConflictException('Customer phone is already registered');
    }
  }

  private assertCanMutateCommercialTerms(
    dto: CustomerMutationDto,
    currentUser?: AuthenticatedUser,
  ): void {
    if (!this.hasRestrictedCommercialTerms(dto)) {
      return;
    }

    if (currentUser?.role !== 'ADMIN') {
      throw new ForbiddenException(
        'Only ADMIN can modify customer commercial credit terms',
      );
    }
  }

  private hasRestrictedCommercialTerms(dto: CustomerMutationDto): boolean {
    return [
      'creditLimit',
      'creditDays',
      'creditStatus',
      'commercialPolicyId',
      'priceListId',
    ].some((field) => Object.prototype.hasOwnProperty.call(dto, field));
  }

  private assertCoherentCreditTerms(source: CreditCompletenessSource): void {
    const hasAnyCreditTerm =
      source.creditLimit !== undefined ||
      source.creditDays !== undefined ||
      source.creditStatus !== undefined;

    if (!hasAnyCreditTerm) {
      return;
    }

    if (
      source.creditLimit === undefined ||
      source.creditLimit === null ||
      source.creditDays === undefined ||
      source.creditDays === null ||
      source.creditStatus === undefined ||
      source.creditStatus === null
    ) {
      throw new BadRequestException(
        'creditLimit, creditDays and creditStatus are required for credited customers',
      );
    }
  }

  private assertCoherentCreditTermsForUpdate(
    dto: UpdateCustomerDto,
    currentCustomer: CreditCompletenessSource,
  ): void {
    if (!this.hasCreditTermMutation(dto)) {
      return;
    }

    this.assertCoherentCreditTerms({ ...currentCustomer, ...dto });
  }

  private hasCreditTermMutation(dto: CustomerMutationDto): boolean {
    return ['creditLimit', 'creditDays', 'creditStatus'].some((field) =>
      Object.prototype.hasOwnProperty.call(dto, field),
    );
  }

  private normalizeMutationData(
    dto: CustomerMutationDto,
    requireCustomerType: boolean,
  ): Partial<Prisma.CustomerCreateInput & Prisma.CustomerUpdateInput> {
    const name = dto.name !== undefined ? dto.name.trim() : undefined;

    if (name !== undefined && name.length === 0) {
      throw new BadRequestException('name is required');
    }

    if (requireCustomerType && dto.customerType === undefined) {
      throw new BadRequestException('customerType is required');
    }

    return {
      ...(name !== undefined ? { name } : {}),
      ...(dto.customerNumber !== undefined
        ? { customerNumber: this.normalizeOptionalText(dto.customerNumber) }
        : {}),
      ...(dto.commercialName !== undefined
        ? { commercialName: this.normalizeOptionalText(dto.commercialName) }
        : {}),
      ...(dto.phone !== undefined
        ? { phone: this.normalizeOptionalText(dto.phone) }
        : {}),
      ...(dto.email !== undefined
        ? { email: this.normalizeOptionalText(dto.email) }
        : {}),
      ...(dto.billingEmail !== undefined
        ? { billingEmail: this.normalizeOptionalText(dto.billingEmail) }
        : {}),
      ...(dto.address !== undefined
        ? { address: this.normalizeOptionalText(dto.address) }
        : {}),
      ...(dto.customerType !== undefined
        ? { customerType: dto.customerType }
        : {}),
      ...(dto.priceListId !== undefined
        ? { priceListId: this.normalizeOptionalText(dto.priceListId) }
        : {}),
      ...(dto.creditLimit !== undefined ? { creditLimit: dto.creditLimit } : {}),
      ...(dto.creditDays !== undefined ? { creditDays: dto.creditDays } : {}),
      ...(dto.creditStatus !== undefined
        ? { creditStatus: dto.creditStatus }
        : {}),
      ...(dto.requiresBilling !== undefined
        ? { requiresBilling: dto.requiresBilling }
        : {}),
      ...(dto.fiscalName !== undefined
        ? { fiscalName: this.normalizeOptionalText(dto.fiscalName) }
        : {}),
      ...(dto.taxId !== undefined
        ? { taxId: this.normalizeOptionalText(dto.taxId) }
        : {}),
      ...(dto.fiscalAddress !== undefined
        ? { fiscalAddress: this.normalizeOptionalText(dto.fiscalAddress) }
        : {}),
      ...(dto.deliveryAddress !== undefined
        ? { deliveryAddress: this.normalizeOptionalText(dto.deliveryAddress) }
        : {}),
      ...(dto.assignedRouteId !== undefined
        ? { assignedRouteId: this.normalizeOptionalText(dto.assignedRouteId) }
        : {}),
      ...(dto.commercialPolicyId !== undefined
        ? { commercialPolicyId: this.normalizeOptionalText(dto.commercialPolicyId) }
        : {}),
    };
  }

  private normalizeOptionalText(value?: string | null): string | null {
    if (value === undefined || value === null) {
      return null;
    }

    const normalizedValue = value.trim();
    return normalizedValue.length > 0 ? normalizedValue : null;
  }

  private toCustomerResponse(
    customer: CustomerListRecord | CustomerRecord,
  ): CustomerResponse {
    const response = {
      ...customer,
      creditLimit: customer.creditLimit?.toString() ?? null,
      isBlockedForCredit: customer.creditStatus !== CreditStatus.ACTIVE,
    } as CustomerResponse;

    if (this.isCustomerDetailRecord(customer)) {
      response.commercialPolicy = customer.commercialPolicy;
      response.creditSummary = this.buildCreditSummary(customer);
      response.billingSummary = this.buildBillingSummary(customer);
    }

    return response;
  }

  private isCustomerDetailRecord(
    customer: CustomerListRecord | CustomerRecord,
  ): customer is CustomerRecord {
    return 'accountReceivables' in customer && 'payments' in customer;
  }

  private buildCreditSummary(customer: CustomerRecord): CustomerResponse['creditSummary'] {
    const outstandingAmount = customer.accountReceivables.reduce(
      (total, accountReceivable) =>
        total + Number(accountReceivable.outstandingAmount),
      0,
    );
    const overdueAmount = customer.accountReceivables
      .filter((accountReceivable) => accountReceivable.daysOverdue > 0)
      .reduce(
        (total, accountReceivable) =>
          total + Number(accountReceivable.outstandingAmount),
        0,
      );
    const lastPaymentDate = customer.payments.reduce<Date | null>(
      (latestDate, payment) =>
        latestDate === null || payment.paidAt > latestDate
          ? payment.paidAt
          : latestDate,
      null,
    );
    const creditLimit = customer.creditLimit === null ? null : Number(customer.creditLimit);

    return {
      globalBalance: outstandingAmount.toString(),
      outstandingAmount: outstandingAmount.toString(),
      overdueAmount: overdueAmount.toString(),
      availableCredit:
        creditLimit === null ? null : Math.max(creditLimit - outstandingAmount, 0).toString(),
      creditLimit: customer.creditLimit?.toString() ?? null,
      creditDays: customer.creditDays,
      daysOverdue: Math.max(
        0,
        ...customer.accountReceivables.map(
          (accountReceivable) => accountReceivable.daysOverdue,
        ),
      ),
      lastPaymentDate,
      creditStatus: customer.creditStatus,
      isBlockedForCredit: customer.creditStatus !== CreditStatus.ACTIVE,
    };
  }

  private buildBillingSummary(
    customer: CustomerRecord,
  ): CustomerResponse['billingSummary'] {
    const billedAmount = customer.accountReceivables.reduce(
      (total, accountReceivable) => total + Number(accountReceivable.originalAmount),
      0,
    );
    const outstandingAmount = customer.accountReceivables.reduce(
      (total, accountReceivable) =>
        total + Number(accountReceivable.outstandingAmount),
      0,
    );
    const paidAmount = customer.payments.reduce(
      (total, payment) => total + Number(payment.amount),
      0,
    );

    return {
      billedAmount: billedAmount.toString(),
      paidAmount: paidAmount.toString(),
      finalBalance: outstandingAmount.toString(),
      openAdministrativeOrders: customer.billingRequests.filter(
        (billingRequest) => billingRequest.status !== 'CANCELLED',
      ).length,
    };
  }

  private throwUniqueConflict(error: unknown): void {
    if (this.isUniqueConstraintError(error)) {
      throw new ConflictException('Customer unique field is already registered');
    }
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    );
  }
}

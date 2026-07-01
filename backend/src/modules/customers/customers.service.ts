import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AgingStatus,
  CollectionStatus,
  CreditStatus,
  type Prisma,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  CreateCustomerDto,
  ListCustomerPaymentsQueryDto,
  ListCustomerSalesQueryDto,
  ListCustomersQueryDto,
  UpdateCustomerDto,
} from './dto';

type CustomerRecord = Prisma.CustomerGetPayload<{
  include: {
    commercialPolicy: true;
    accountReceivables: { include: { payments: true } };
    payments: true;
    billingRequests: true;
  };
}>;
type CustomerListRecord = Prisma.CustomerGetPayload<Record<string, never>>;
type CustomerSaleRecord = Prisma.SaleGetPayload<{
  include: {
    payments: true;
    accountReceivable: { select: { id: true } };
    billingRequest: { select: { id: true } };
  };
}>;
type CustomerPaymentRecord = Prisma.PaymentGetPayload<Record<string, never>>;
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
      include: {
        commercialPolicy: true,
        accountReceivables: { include: { payments: true } },
        payments: true,
        billingRequests: true,
      },
      orderBy: { name: 'asc' },
      ...this.buildPagination(query),
    })) as CustomerRecord[];

    return {
      items: customers.map((customer) => this.toCustomerResponse(customer)),
    };
  }

  async findOne(id: string): Promise<CustomerResponse> {
    return this.toCustomerResponse(await this.findCustomerDetail(id));
  }

  async getCreditSummary(id: string) {
    const customer = await this.findCustomerDetail(id);
    return this.buildCreditSummaryResponse(customer);
  }

  async findSales(id: string, query: ListCustomerSalesQueryDto = {}) {
    await this.assertCustomerExists(id);
    const sales = (await this.prisma.sale.findMany({
      where: {
        customerId: id,
        ...(query.paymentType ? { paymentType: query.paymentType } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.collectionStatus
          ? { collectionStatus: query.collectionStatus }
          : {}),
        ...this.buildDateRangeWhere('createdAt', query.dateFrom, query.dateTo),
      },
      include: {
        payments: true,
        accountReceivable: { select: { id: true } },
        billingRequest: { select: { id: true } },
      },
      orderBy: { createdAt: 'desc' },
      ...this.buildPagination(query),
    })) as CustomerSaleRecord[];

    return { items: sales.map((sale) => this.toSaleHistoryItem(sale)) };
  }

  async findPayments(id: string, query: ListCustomerPaymentsQueryDto = {}) {
    await this.assertCustomerExists(id);
    const payments = (await this.prisma.payment.findMany({
      where: {
        OR: [
          { customerId: id },
          { sale: { customerId: id } },
          { accountReceivable: { customerId: id } },
        ],
        ...(query.paymentMethod ? { paymentMethod: query.paymentMethod } : {}),
        ...(query.bankName ? { bankName: { contains: query.bankName, mode: 'insensitive' } } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...this.buildDateRangeWhere('paidAt', query.dateFrom, query.dateTo),
      },
      orderBy: { paidAt: 'desc' },
      ...this.buildPagination(query),
    })) as CustomerPaymentRecord[];

    return { items: payments.map((payment) => this.toPaymentHistoryItem(payment)) };
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

    const agingStatus = query.agingStatus ?? query.cartera;

    return {
      isActive: query.isActive ?? true,
      ...this.buildAgingWhere(agingStatus),
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

  private buildAgingWhere(
    agingStatus?: ListCustomersQueryDto['agingStatus'],
  ): Prisma.CustomerWhereInput {
    if (!agingStatus) {
      return {};
    }

    if (agingStatus === 'LATE') {
      return {
      accountReceivables: {
        some: {
          daysOverdue: { gt: 0 },
          status: { in: [CollectionStatus.UNPAID, CollectionStatus.PARTIALLY_PAID] },
        },
      },
    };
    }

    return {
      accountReceivables: {
        some: {
          agingStatus,
          status: { in: [CollectionStatus.UNPAID, CollectionStatus.PARTIALLY_PAID] },
        },
      },
    };
  }

  private buildDateRangeWhere<TField extends string>(
    field: TField,
    dateFrom?: string,
    dateTo?: string,
  ): Record<TField, { gte?: Date; lte?: Date }> | Record<string, never> {
    if (!dateFrom && !dateTo) {
      return {};
    }

    return {
      [field]: {
        ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
        ...(dateTo ? { lte: new Date(dateTo) } : {}),
      },
    } as Record<TField, { gte?: Date; lte?: Date }>;
  }

  private buildPagination(query: { page?: number; limit?: number }): {
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

  private async findCustomerDetail(id: string): Promise<CustomerRecord> {
    const customer = (await this.prisma.customer.findFirst({
      where: { id },
      include: {
        commercialPolicy: true,
        accountReceivables: { include: { payments: true } },
        payments: true,
        billingRequests: true,
      },
    })) as CustomerRecord | null;

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    return customer;
  }

  private async assertCustomerExists(id: string): Promise<void> {
    const customer = await this.prisma.customer.findFirst({
      where: { id },
      select: { id: true },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }
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
    return this.buildCreditSummaryResponse(customer);
  }

  private buildCreditSummaryResponse(customer: CustomerRecord) {
    const receivables = this.activeReceivables(customer);
    const outstandingAmount = receivables.reduce(
      (total, accountReceivable) =>
        total + Number(accountReceivable.outstandingAmount),
      0,
    );
    const overdueAmount = receivables
      .filter((accountReceivable) => accountReceivable.daysOverdue > 0)
      .reduce(
        (total, accountReceivable) =>
          total + Number(accountReceivable.outstandingAmount),
        0,
      );
    const payments = this.customerPayments(customer);
    const lastPaymentDate = payments.reduce<Date | null>(
      (latestDate, payment) =>
        latestDate === null || payment.paidAt > latestDate
          ? payment.paidAt
          : latestDate,
      null,
    );
    const creditLimit = customer.creditLimit === null ? null : Number(customer.creditLimit);
    const availableCredit =
      creditLimit === null ? null : Math.max(creditLimit - outstandingAmount, 0);
    const daysOverdue = Math.max(
      0,
      ...receivables.map(
        (accountReceivable) => accountReceivable.daysOverdue,
      ),
    );
    const hasOverdueBalance = overdueAmount > 0;
    const isLimitExceeded = creditLimit !== null && outstandingAmount > creditLimit;
    const isBlocked =
      customer.creditStatus !== CreditStatus.ACTIVE ||
      hasOverdueBalance ||
      isLimitExceeded;

    return {
      customerId: customer.id,
      creditStatus: customer.creditStatus,
      creditLimit: customer.creditLimit?.toString() ?? null,
      creditDays: customer.creditDays,
      paymentTermsDays: customer.creditDays,
      agingStatus: this.resolveAgingStatus(customer),
      collectionStatus: this.resolveCollectionStatus(customer),
      globalBalance: outstandingAmount.toString(),
      outstandingAmount: outstandingAmount.toString(),
      overdueAmount: overdueAmount.toString(),
      availableCredit: availableCredit === null ? null : availableCredit.toString(),
      hasOverdueBalance,
      isBlocked,
      isBlockedForCredit: isBlocked,
      blockingReason: this.resolveBlockingReason(
        customer,
        hasOverdueBalance,
        isLimitExceeded,
      ),
      daysOverdue,
      lastPaymentDate,
      commercialPolicyId: customer.commercialPolicyId,
      commercialPolicyApplied:
        typeof customer.commercialPolicy === 'object' &&
        customer.commercialPolicy !== null &&
        'name' in customer.commercialPolicy
          ? String(customer.commercialPolicy.name)
          : customer.commercialPolicyId,
      billingSummary: this.buildBillingSummary(customer),
      billedAmount: this.buildBillingSummary(customer)?.billedAmount,
      paidAmount: this.buildBillingSummary(customer)?.paidAmount,
      finalBalance: this.buildBillingSummary(customer)?.finalBalance,
    };
  }

  private resolveAgingStatus(customer: CustomerRecord): AgingStatus {
    if (
      this.activeReceivables(customer).some(
        (accountReceivable) => accountReceivable.agingStatus === AgingStatus.OVERDUE,
      )
    ) {
      return AgingStatus.OVERDUE;
    }

    if (
      this.activeReceivables(customer).some(
        (accountReceivable) => accountReceivable.agingStatus === AgingStatus.DUE_SOON,
      )
    ) {
      return AgingStatus.DUE_SOON;
    }

    return AgingStatus.CURRENT;
  }

  private resolveCollectionStatus(customer: CustomerRecord): CollectionStatus {
    if (
      this.activeReceivables(customer).some(
        (accountReceivable) => accountReceivable.status === CollectionStatus.UNPAID,
      )
    ) {
      return CollectionStatus.UNPAID;
    }

    if (
      this.activeReceivables(customer).some(
        (accountReceivable) =>
          accountReceivable.status === CollectionStatus.PARTIALLY_PAID,
      )
    ) {
      return CollectionStatus.PARTIALLY_PAID;
    }

    return CollectionStatus.PAID;
  }

  private activeReceivables(customer: CustomerRecord) {
    return customer.accountReceivables.filter(
      (accountReceivable) =>
        accountReceivable.status !== CollectionStatus.CANCELLED &&
        accountReceivable.status !== CollectionStatus.PAID,
    );
  }

  private customerPayments(customer: CustomerRecord) {
    const paymentsById = new Map<string, CustomerRecord['payments'][number]>();
    const anonymousPayments: Array<CustomerRecord['payments'][number]> = [];

    for (const payment of customer.payments) {
      if ('id' in payment && payment.id) {
        paymentsById.set(payment.id, payment);
      } else {
        anonymousPayments.push(payment);
      }
    }

    for (const accountReceivable of customer.accountReceivables) {
      const payments = (accountReceivable as typeof accountReceivable & { payments?: CustomerRecord['payments'] }).payments ?? [];
      for (const payment of payments) {
        if ('id' in payment && payment.id) {
          paymentsById.set(payment.id, payment);
        } else {
          anonymousPayments.push(payment);
        }
      }
    }

    return [...paymentsById.values(), ...anonymousPayments];
  }

  private resolveBlockingReason(
    customer: CustomerRecord,
    hasOverdueBalance: boolean,
    isLimitExceeded: boolean,
  ): string | null {
    if (customer.creditStatus !== CreditStatus.ACTIVE) {
      return 'CUSTOMER_CREDIT_STATUS';
    }

    if (hasOverdueBalance) {
      return 'OVERDUE_BALANCE';
    }

    if (isLimitExceeded) {
      return 'CREDIT_LIMIT_EXCEEDED';
    }

    return null;
  }

  private toSaleHistoryItem(sale: CustomerSaleRecord) {
    const totalPaid = sale.payments.reduce(
      (total, payment) => total + Number(payment.amount),
      0,
    );
    const lastPaidAt = sale.payments.reduce<Date | null>(
      (latestDate, payment) =>
        latestDate === null || payment.paidAt > latestDate
          ? payment.paidAt
          : latestDate,
      null,
    );
    const methods = Array.from(
      new Set(sale.payments.map((payment) => payment.paymentMethod)),
    );

    return {
      id: sale.id,
      saleNumber: sale.saleNumber,
      createdAt: sale.createdAt,
      total: sale.total.toString(),
      paymentType: sale.paymentType,
      collectionStatus: sale.collectionStatus,
      status: sale.status,
      locationId: sale.locationId,
      paymentsSummary: { totalPaid: totalPaid.toString(), lastPaidAt, methods },
      accountReceivableId: sale.accountReceivable?.id ?? null,
      billingRequestId: sale.billingRequest?.id ?? null,
    };
  }

  private toPaymentHistoryItem(payment: CustomerPaymentRecord) {
    return {
      id: payment.id,
      accountReceivableId: payment.accountReceivableId,
      saleId: payment.saleId,
      amount: payment.amount.toString(),
      paymentMethod: payment.paymentMethod,
      bankName: payment.bankName,
      referenceNumber: payment.referenceNumber,
      appliedDocumentId: payment.appliedDocumentId,
      appliedDocumentType: payment.appliedDocumentType,
      routeId: payment.routeId,
      routeSettlementId: payment.routeSettlementId,
      status: payment.status,
      paidAt: payment.paidAt,
    };
  }

  private buildBillingSummary(
    customer: CustomerRecord,
  ): CustomerResponse['billingSummary'] {
    const receivables = this.activeReceivables(customer);
    const billedAmount = receivables.reduce(
      (total, accountReceivable) => total + Number(accountReceivable.originalAmount),
      0,
    );
    const outstandingAmount = receivables.reduce(
      (total, accountReceivable) =>
        total + Number(accountReceivable.outstandingAmount),
      0,
    );
    const paidAmount = this.customerPayments(customer).reduce(
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

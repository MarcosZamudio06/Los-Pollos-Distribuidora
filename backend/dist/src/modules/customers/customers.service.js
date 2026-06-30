"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CustomersService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../../database/prisma.service");
let CustomersService = class CustomersService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async findAll(query = {}) {
        const customers = (await this.prisma.customer.findMany({
            where: this.buildListWhere(query),
            orderBy: { name: 'asc' },
            ...this.buildPagination(query),
        }));
        return {
            items: customers.map((customer) => this.toCustomerResponse(customer)),
        };
    }
    async findOne(id) {
        const customer = (await this.prisma.customer.findFirst({
            where: { id, isActive: true },
            include: {
                commercialPolicy: true,
                accountReceivables: true,
                payments: true,
                billingRequests: true,
            },
        }));
        if (!customer) {
            throw new common_1.NotFoundException('Customer not found');
        }
        return this.toCustomerResponse(customer);
    }
    async create(dto, currentUser) {
        this.assertCanMutateCommercialTerms(dto, currentUser);
        this.assertCoherentCreditTerms(dto);
        const data = this.normalizeMutationData(dto, true);
        if (typeof data.phone === 'string') {
            await this.assertPhoneAvailable(data.phone);
        }
        const customer = (await this.prisma.customer
            .create({ data: { ...data, isActive: true } })
            .catch((error) => {
            this.throwUniqueConflict(error);
            throw error;
        }));
        return this.toCustomerResponse(customer);
    }
    async update(id, dto, currentUser) {
        const currentCustomer = await this.findActiveCustomerForMutation(id);
        this.assertCanMutateCommercialTerms(dto, currentUser);
        this.assertCoherentCreditTermsForUpdate(dto, currentCustomer);
        const data = this.normalizeMutationData(dto, false);
        if (typeof data.phone === 'string') {
            await this.assertPhoneAvailable(data.phone, currentCustomer.id);
        }
        const customer = (await this.prisma.customer
            .update({ where: { id: currentCustomer.id }, data })
            .catch((error) => {
            this.throwUniqueConflict(error);
            throw error;
        }));
        return this.toCustomerResponse(customer);
    }
    async deactivate(id) {
        const currentCustomer = await this.findActiveCustomerForMutation(id);
        const customer = (await this.prisma.customer.update({
            where: { id: currentCustomer.id },
            data: { isActive: false },
        }));
        return this.toCustomerResponse(customer);
    }
    buildListWhere(query) {
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
    buildPagination(query) {
        if (!query.limit) {
            return {};
        }
        return {
            skip: ((query.page ?? 1) - 1) * query.limit,
            take: query.limit,
        };
    }
    async findActiveCustomerForMutation(id) {
        const customer = (await this.prisma.customer.findFirst({
            where: { id, isActive: true },
        }));
        if (!customer) {
            throw new common_1.NotFoundException('Customer not found');
        }
        return customer;
    }
    async assertPhoneAvailable(phone, currentCustomerId) {
        const existingCustomer = await this.prisma.customer.findUnique({
            where: { phone },
            select: { id: true },
        });
        if (existingCustomer && existingCustomer.id !== currentCustomerId) {
            throw new common_1.ConflictException('Customer phone is already registered');
        }
    }
    assertCanMutateCommercialTerms(dto, currentUser) {
        if (!this.hasRestrictedCommercialTerms(dto)) {
            return;
        }
        if (currentUser?.role !== 'ADMIN') {
            throw new common_1.ForbiddenException('Only ADMIN can modify customer commercial credit terms');
        }
    }
    hasRestrictedCommercialTerms(dto) {
        return [
            'creditLimit',
            'creditDays',
            'creditStatus',
            'commercialPolicyId',
            'priceListId',
        ].some((field) => Object.prototype.hasOwnProperty.call(dto, field));
    }
    assertCoherentCreditTerms(source) {
        const hasAnyCreditTerm = source.creditLimit !== undefined ||
            source.creditDays !== undefined ||
            source.creditStatus !== undefined;
        if (!hasAnyCreditTerm) {
            return;
        }
        if (source.creditLimit === undefined ||
            source.creditLimit === null ||
            source.creditDays === undefined ||
            source.creditDays === null ||
            source.creditStatus === undefined ||
            source.creditStatus === null) {
            throw new common_1.BadRequestException('creditLimit, creditDays and creditStatus are required for credited customers');
        }
    }
    assertCoherentCreditTermsForUpdate(dto, currentCustomer) {
        if (!this.hasCreditTermMutation(dto)) {
            return;
        }
        this.assertCoherentCreditTerms({ ...currentCustomer, ...dto });
    }
    hasCreditTermMutation(dto) {
        return ['creditLimit', 'creditDays', 'creditStatus'].some((field) => Object.prototype.hasOwnProperty.call(dto, field));
    }
    normalizeMutationData(dto, requireCustomerType) {
        const name = dto.name !== undefined ? dto.name.trim() : undefined;
        if (name !== undefined && name.length === 0) {
            throw new common_1.BadRequestException('name is required');
        }
        if (requireCustomerType && dto.customerType === undefined) {
            throw new common_1.BadRequestException('customerType is required');
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
    normalizeOptionalText(value) {
        if (value === undefined || value === null) {
            return null;
        }
        const normalizedValue = value.trim();
        return normalizedValue.length > 0 ? normalizedValue : null;
    }
    toCustomerResponse(customer) {
        const response = {
            ...customer,
            creditLimit: customer.creditLimit?.toString() ?? null,
            isBlockedForCredit: customer.creditStatus !== client_1.CreditStatus.ACTIVE,
        };
        if (this.isCustomerDetailRecord(customer)) {
            response.commercialPolicy = customer.commercialPolicy;
            response.creditSummary = this.buildCreditSummary(customer);
            response.billingSummary = this.buildBillingSummary(customer);
        }
        return response;
    }
    isCustomerDetailRecord(customer) {
        return 'accountReceivables' in customer && 'payments' in customer;
    }
    buildCreditSummary(customer) {
        const outstandingAmount = customer.accountReceivables.reduce((total, accountReceivable) => total + Number(accountReceivable.outstandingAmount), 0);
        const overdueAmount = customer.accountReceivables
            .filter((accountReceivable) => accountReceivable.daysOverdue > 0)
            .reduce((total, accountReceivable) => total + Number(accountReceivable.outstandingAmount), 0);
        const lastPaymentDate = customer.payments.reduce((latestDate, payment) => latestDate === null || payment.paidAt > latestDate
            ? payment.paidAt
            : latestDate, null);
        const creditLimit = customer.creditLimit === null ? null : Number(customer.creditLimit);
        return {
            globalBalance: outstandingAmount.toString(),
            outstandingAmount: outstandingAmount.toString(),
            overdueAmount: overdueAmount.toString(),
            availableCredit: creditLimit === null ? null : Math.max(creditLimit - outstandingAmount, 0).toString(),
            creditLimit: customer.creditLimit?.toString() ?? null,
            creditDays: customer.creditDays,
            daysOverdue: Math.max(0, ...customer.accountReceivables.map((accountReceivable) => accountReceivable.daysOverdue)),
            lastPaymentDate,
            creditStatus: customer.creditStatus,
            isBlockedForCredit: customer.creditStatus !== client_1.CreditStatus.ACTIVE,
        };
    }
    buildBillingSummary(customer) {
        const billedAmount = customer.accountReceivables.reduce((total, accountReceivable) => total + Number(accountReceivable.originalAmount), 0);
        const outstandingAmount = customer.accountReceivables.reduce((total, accountReceivable) => total + Number(accountReceivable.outstandingAmount), 0);
        const paidAmount = customer.payments.reduce((total, payment) => total + Number(payment.amount), 0);
        return {
            billedAmount: billedAmount.toString(),
            paidAmount: paidAmount.toString(),
            finalBalance: outstandingAmount.toString(),
            openAdministrativeOrders: customer.billingRequests.filter((billingRequest) => billingRequest.status !== 'CANCELLED').length,
        };
    }
    throwUniqueConflict(error) {
        if (this.isUniqueConstraintError(error)) {
            throw new common_1.ConflictException('Customer unique field is already registered');
        }
    }
    isUniqueConstraintError(error) {
        return (typeof error === 'object' &&
            error !== null &&
            'code' in error &&
            error.code === 'P2002');
    }
};
exports.CustomersService = CustomersService;
exports.CustomersService = CustomersService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], CustomersService);
//# sourceMappingURL=customers.service.js.map
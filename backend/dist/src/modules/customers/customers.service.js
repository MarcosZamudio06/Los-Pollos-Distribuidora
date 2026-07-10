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
            include: {
                commercialPolicy: true,
                accountReceivables: { include: { payments: true } },
                payments: true,
                billingRequests: true,
            },
            orderBy: { name: 'asc' },
            ...this.buildPagination(query),
        }));
        return {
            items: customers.map((customer) => this.toCustomerResponse(customer)),
        };
    }
    async findOne(id) {
        return this.toCustomerResponse(await this.findCustomerDetail(id));
    }
    async getCreditSummary(id) {
        const customer = await this.findCustomerDetail(id);
        return this.buildCreditSummaryResponse(customer);
    }
    async findSales(id, query = {}) {
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
        }));
        return { items: sales.map((sale) => this.toSaleHistoryItem(sale)) };
    }
    async findPayments(id, query = {}) {
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
        }));
        return { items: payments.map((payment) => this.toPaymentHistoryItem(payment)) };
    }
    async create(dto, currentUser) {
        this.assertCanMutateCommercialTerms(dto, currentUser);
        this.assertCoherentCreditTerms(dto);
        const data = this.normalizeMutationData(dto, true);
        if (typeof data.phone === 'string') {
            await this.assertPhoneAvailable(data.phone);
        }
        await this.assertReferencedRelationsAvailable(data);
        const customer = (await this.prisma.customer
            .create({
            data: { ...data, isActive: true },
        })
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
        await this.assertReferencedRelationsAvailable(data);
        const customer = (await this.prisma.customer
            .update({
            where: { id: currentCustomer.id },
            data: data,
        })
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
    buildAgingWhere(agingStatus) {
        if (!agingStatus) {
            return {};
        }
        if (agingStatus === 'LATE') {
            return {
                accountReceivables: {
                    some: {
                        daysOverdue: { gt: 0 },
                        status: { in: [client_1.CollectionStatus.UNPAID, client_1.CollectionStatus.PARTIALLY_PAID] },
                    },
                },
            };
        }
        return {
            accountReceivables: {
                some: {
                    agingStatus,
                    status: { in: [client_1.CollectionStatus.UNPAID, client_1.CollectionStatus.PARTIALLY_PAID] },
                },
            },
        };
    }
    buildDateRangeWhere(field, dateFrom, dateTo) {
        if (!dateFrom && !dateTo) {
            return {};
        }
        return {
            [field]: {
                ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
                ...(dateTo ? { lte: new Date(dateTo) } : {}),
            },
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
    async findCustomerDetail(id) {
        const customer = (await this.prisma.customer.findFirst({
            where: { id },
            include: {
                commercialPolicy: true,
                accountReceivables: { include: { payments: true } },
                payments: true,
                billingRequests: true,
            },
        }));
        if (!customer) {
            throw new common_1.NotFoundException('Customer not found');
        }
        return customer;
    }
    async assertCustomerExists(id) {
        const customer = await this.prisma.customer.findFirst({
            where: { id },
            select: { id: true },
        });
        if (!customer) {
            throw new common_1.NotFoundException('Customer not found');
        }
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
    async assertReferencedRelationsAvailable(data) {
        if (typeof data.assignedRouteId === 'string') {
            const route = await this.prisma.deliveryRoute.findFirst({
                where: { id: data.assignedRouteId },
                select: { id: true },
            });
            if (!route) {
                throw new common_1.BadRequestException('Assigned route does not exist');
            }
        }
        if (typeof data.commercialPolicyId === 'string') {
            const commercialPolicy = await this.prisma.commercialPolicy.findFirst({
                where: { id: data.commercialPolicyId, isActive: true },
                select: { id: true },
            });
            if (!commercialPolicy) {
                throw new common_1.BadRequestException('Commercial policy does not exist');
            }
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
        return this.buildCreditSummaryResponse(customer);
    }
    buildCreditSummaryResponse(customer) {
        const receivables = this.activeReceivables(customer);
        const outstandingAmount = receivables.reduce((total, accountReceivable) => total + Number(accountReceivable.outstandingAmount), 0);
        const overdueAmount = receivables
            .filter((accountReceivable) => accountReceivable.daysOverdue > 0)
            .reduce((total, accountReceivable) => total + Number(accountReceivable.outstandingAmount), 0);
        const payments = this.customerPayments(customer);
        const lastPaymentDate = payments.reduce((latestDate, payment) => latestDate === null || payment.paidAt > latestDate
            ? payment.paidAt
            : latestDate, null);
        const creditLimit = customer.creditLimit === null ? null : Number(customer.creditLimit);
        const availableCredit = creditLimit === null ? null : Math.max(creditLimit - outstandingAmount, 0);
        const daysOverdue = Math.max(0, ...receivables.map((accountReceivable) => accountReceivable.daysOverdue));
        const hasOverdueBalance = overdueAmount > 0;
        const isLimitExceeded = creditLimit !== null && outstandingAmount > creditLimit;
        const isBlocked = customer.creditStatus !== client_1.CreditStatus.ACTIVE ||
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
            blockingReason: this.resolveBlockingReason(customer, hasOverdueBalance, isLimitExceeded),
            daysOverdue,
            lastPaymentDate,
            commercialPolicyId: customer.commercialPolicyId,
            commercialPolicyApplied: typeof customer.commercialPolicy === 'object' &&
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
    resolveAgingStatus(customer) {
        if (this.activeReceivables(customer).some((accountReceivable) => accountReceivable.agingStatus === client_1.AgingStatus.OVERDUE)) {
            return client_1.AgingStatus.OVERDUE;
        }
        if (this.activeReceivables(customer).some((accountReceivable) => accountReceivable.agingStatus === client_1.AgingStatus.DUE_SOON)) {
            return client_1.AgingStatus.DUE_SOON;
        }
        return client_1.AgingStatus.CURRENT;
    }
    resolveCollectionStatus(customer) {
        if (this.activeReceivables(customer).some((accountReceivable) => accountReceivable.status === client_1.CollectionStatus.UNPAID)) {
            return client_1.CollectionStatus.UNPAID;
        }
        if (this.activeReceivables(customer).some((accountReceivable) => accountReceivable.status === client_1.CollectionStatus.PARTIALLY_PAID)) {
            return client_1.CollectionStatus.PARTIALLY_PAID;
        }
        return client_1.CollectionStatus.PAID;
    }
    activeReceivables(customer) {
        return customer.accountReceivables.filter((accountReceivable) => accountReceivable.status !== client_1.CollectionStatus.CANCELLED &&
            accountReceivable.status !== client_1.CollectionStatus.PAID);
    }
    customerPayments(customer) {
        const paymentsById = new Map();
        const anonymousPayments = [];
        for (const payment of customer.payments) {
            if ('id' in payment && payment.id) {
                paymentsById.set(payment.id, payment);
            }
            else {
                anonymousPayments.push(payment);
            }
        }
        for (const accountReceivable of customer.accountReceivables) {
            const payments = accountReceivable.payments ?? [];
            for (const payment of payments) {
                if ('id' in payment && payment.id) {
                    paymentsById.set(payment.id, payment);
                }
                else {
                    anonymousPayments.push(payment);
                }
            }
        }
        return [...paymentsById.values(), ...anonymousPayments];
    }
    resolveBlockingReason(customer, hasOverdueBalance, isLimitExceeded) {
        if (customer.creditStatus !== client_1.CreditStatus.ACTIVE) {
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
    toSaleHistoryItem(sale) {
        const totalPaid = sale.payments.reduce((total, payment) => total + Number(payment.amount), 0);
        const lastPaidAt = sale.payments.reduce((latestDate, payment) => latestDate === null || payment.paidAt > latestDate
            ? payment.paidAt
            : latestDate, null);
        const methods = Array.from(new Set(sale.payments.map((payment) => payment.paymentMethod)));
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
    toPaymentHistoryItem(payment) {
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
    buildBillingSummary(customer) {
        const receivables = this.activeReceivables(customer);
        const billedAmount = receivables.reduce((total, accountReceivable) => total + Number(accountReceivable.originalAmount), 0);
        const outstandingAmount = receivables.reduce((total, accountReceivable) => total + Number(accountReceivable.outstandingAmount), 0);
        const paidAmount = this.customerPayments(customer).reduce((total, payment) => total + Number(payment.amount), 0);
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
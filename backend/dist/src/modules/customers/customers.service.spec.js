"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const customers_service_1 = require("./customers.service");
const adminUser = {
    id: 'admin-1',
    name: 'Admin User',
    email: 'admin@pollos.local',
    role: 'ADMIN',
    mustChangePassword: false,
};
const sellerUser = {
    id: 'seller-1',
    name: 'Seller User',
    email: 'seller@pollos.local',
    role: 'SELLER',
    mustChangePassword: false,
};
function money(value) {
    return { toString: () => value };
}
function createCustomer(overrides = {}) {
    return {
        id: 'customer-1',
        customerNumber: 'C-1024',
        name: 'Restaurante El Centro',
        commercialName: 'El Centro',
        phone: '2290000000',
        email: 'cliente@example.com',
        billingEmail: 'facturacion@cliente.com',
        address: 'Customer address',
        customerType: client_1.CustomerType.INSTITUTIONAL,
        priceListId: 'price-list-1',
        creditLimit: money('50000'),
        creditDays: 15,
        creditStatus: client_1.CreditStatus.ACTIVE,
        requiresBilling: true,
        fiscalName: 'Razón social opcional',
        taxId: 'RFC123456789',
        fiscalAddress: 'Fiscal address',
        deliveryAddress: 'Delivery address',
        assignedRouteId: 'route-1',
        commercialPolicyId: 'policy-1',
        isActive: true,
        commercialPolicy: null,
        accountReceivables: [],
        payments: [],
        billingRequests: [],
        ...overrides,
    };
}
function createPrisma() {
    return {
        customer: {
            findMany: jest.fn(),
            findUnique: jest.fn(),
            findFirst: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
        },
    };
}
function createService(prisma = createPrisma()) {
    return {
        service: new customers_service_1.CustomersService(prisma),
        prisma,
    };
}
describe('CustomersService', () => {
    it('lists customers with documented filters and preserves commercial terms', async () => {
        const { service, prisma } = createService();
        prisma.customer.findMany.mockResolvedValue([
            createCustomer(),
            createCustomer({
                id: 'customer-2',
                name: 'Tienda La Esquina',
                customerType: client_1.CustomerType.RETAIL,
                creditLimit: null,
                creditDays: null,
                requiresBilling: false,
                fiscalName: null,
                taxId: null,
                fiscalAddress: null,
            }),
        ]);
        await expect(service.findAll({
            page: 2,
            limit: 10,
            search: 'centro',
            customerType: client_1.CustomerType.INSTITUTIONAL,
            creditStatus: client_1.CreditStatus.ACTIVE,
            commercialPolicyId: 'policy-1',
            assignedRouteId: 'route-1',
            isActive: true,
        })).resolves.toEqual({
            items: [
                expect.objectContaining({
                    id: 'customer-1',
                    customerType: client_1.CustomerType.INSTITUTIONAL,
                    creditLimit: '50000',
                    creditDays: 15,
                    priceListId: 'price-list-1',
                    deliveryAddress: 'Delivery address',
                    fiscalName: 'Razón social opcional',
                    requiresBilling: true,
                    isBlockedForCredit: false,
                }),
                expect.objectContaining({
                    id: 'customer-2',
                    customerType: client_1.CustomerType.RETAIL,
                    fiscalName: null,
                    requiresBilling: false,
                }),
            ],
        });
        expect(prisma.customer.findMany).toHaveBeenCalledWith({
            where: expect.objectContaining({
                isActive: true,
                customerType: client_1.CustomerType.INSTITUTIONAL,
                creditStatus: client_1.CreditStatus.ACTIVE,
                commercialPolicyId: 'policy-1',
                assignedRouteId: 'route-1',
                OR: expect.arrayContaining([
                    { name: { contains: 'centro', mode: 'insensitive' } },
                    { phone: { contains: 'centro', mode: 'insensitive' } },
                ]),
            }),
            orderBy: { name: 'asc' },
            skip: 10,
            take: 10,
        });
    });
    it('gets an active customer by id with optional fiscal fields treated as commercial data only', async () => {
        const { service, prisma } = createService();
        prisma.customer.findFirst.mockResolvedValueOnce(createCustomer());
        await expect(service.findOne('customer-1')).resolves.toEqual(expect.objectContaining({
            id: 'customer-1',
            fiscalName: 'Razón social opcional',
            taxId: 'RFC123456789',
            requiresBilling: true,
            commercialPolicy: null,
            creditSummary: expect.objectContaining({
                creditLimit: '50000',
                availableCredit: '50000',
                outstandingAmount: '0',
            }),
            billingSummary: expect.objectContaining({
                billedAmount: '0',
                paidAmount: '0',
                finalBalance: '0',
                openAdministrativeOrders: 0,
            }),
        }));
        expect(prisma.customer.findFirst).toHaveBeenCalledWith({
            where: { id: 'customer-1', isActive: true },
            include: {
                commercialPolicy: true,
                accountReceivables: true,
                payments: true,
                billingRequests: true,
            },
        });
        prisma.customer.findFirst.mockResolvedValueOnce(null);
        await expect(service.findOne('missing-customer')).rejects.toBeInstanceOf(common_1.NotFoundException);
    });
    it('creates wholesale and institutional customers while enforcing required names and unique phones', async () => {
        const { service, prisma } = createService();
        prisma.customer.findUnique.mockResolvedValueOnce(null);
        prisma.customer.create.mockImplementation(({ data }) => Promise.resolve(createCustomer(data)));
        await expect(service.create({
            name: ' Restaurante El Centro ',
            phone: ' 2290000000 ',
            email: 'cliente@example.com',
            billingEmail: 'facturacion@cliente.com',
            customerType: client_1.CustomerType.WHOLESALE,
            creditLimit: 50000,
            creditDays: 15,
            creditStatus: client_1.CreditStatus.ACTIVE,
            priceListId: 'price-list-1',
            assignedRouteId: 'route-1',
            deliveryAddress: ' Delivery address ',
            fiscalName: 'Razón social opcional',
        }, adminUser)).resolves.toEqual(expect.objectContaining({
            name: 'Restaurante El Centro',
            phone: '2290000000',
            customerType: client_1.CustomerType.WHOLESALE,
            creditLimit: '50000',
            deliveryAddress: 'Delivery address',
            fiscalName: 'Razón social opcional',
            isActive: true,
        }));
        expect(prisma.customer.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                name: 'Restaurante El Centro',
                phone: '2290000000',
                customerType: client_1.CustomerType.WHOLESALE,
                creditLimit: 50000,
                creditDays: 15,
                isActive: true,
            }),
        });
        await expect(service.create({ name: '   ', customerType: client_1.CustomerType.RETAIL }, adminUser)).rejects.toBeInstanceOf(common_1.BadRequestException);
        prisma.customer.findUnique.mockResolvedValueOnce(createCustomer());
        await expect(service.create({ name: 'Otro Cliente', phone: '2290000000', customerType: client_1.CustomerType.RETAIL }, adminUser)).rejects.toBeInstanceOf(common_1.ConflictException);
    });
    it('updates active customers, maps unique phone races, and soft-deactivates without physical delete', async () => {
        const { service, prisma } = createService();
        prisma.customer.findFirst.mockResolvedValueOnce(createCustomer());
        prisma.customer.findUnique.mockResolvedValueOnce(null);
        prisma.customer.update.mockResolvedValueOnce(createCustomer({ phone: '2291111111', creditStatus: client_1.CreditStatus.BLOCKED }));
        await expect(service.update('customer-1', { phone: '2291111111', creditStatus: client_1.CreditStatus.BLOCKED }, adminUser)).resolves.toEqual(expect.objectContaining({ phone: '2291111111', isBlockedForCredit: true }));
        expect(prisma.customer.update).toHaveBeenCalledWith({
            where: { id: 'customer-1' },
            data: expect.objectContaining({ phone: '2291111111', creditStatus: client_1.CreditStatus.BLOCKED }),
        });
        prisma.customer.findFirst.mockResolvedValueOnce(createCustomer());
        prisma.customer.findUnique.mockResolvedValueOnce(createCustomer({ id: 'customer-2' }));
        await expect(service.update('customer-1', { phone: '2290000000' }, adminUser)).rejects.toBeInstanceOf(common_1.ConflictException);
        prisma.customer.findFirst.mockResolvedValueOnce(createCustomer());
        prisma.customer.update.mockResolvedValueOnce(createCustomer({ isActive: false }));
        await expect(service.deactivate('customer-1')).resolves.toEqual(expect.objectContaining({ isActive: false }));
        expect(prisma.customer.update).toHaveBeenLastCalledWith({
            where: { id: 'customer-1' },
            data: { isActive: false },
        });
        expect(prisma.customer.delete).not.toHaveBeenCalled();
    });
    it('rejects SELLER attempts to capture or modify restricted commercial credit fields', async () => {
        const { service, prisma } = createService();
        await expect(service.create({
            name: 'Retail Customer',
            customerType: client_1.CustomerType.RETAIL,
            creditLimit: 1000,
            creditDays: 7,
            creditStatus: client_1.CreditStatus.ACTIVE,
        }, sellerUser)).rejects.toBeInstanceOf(common_1.ForbiddenException);
        prisma.customer.findFirst.mockResolvedValueOnce(createCustomer());
        await expect(service.update('customer-1', { priceListId: 'price-list-2' }, sellerUser)).rejects.toBeInstanceOf(common_1.ForbiddenException);
    });
    it('allows SELLER to maintain basic and delivery customer fields', async () => {
        const { service, prisma } = createService();
        prisma.customer.findUnique.mockResolvedValueOnce(null);
        prisma.customer.create.mockImplementation(({ data }) => Promise.resolve(createCustomer(data)));
        await expect(service.create({
            name: 'Retail Customer',
            customerType: client_1.CustomerType.RETAIL,
            phone: '2291111111',
            deliveryAddress: 'Route address',
            assignedRouteId: 'route-2',
        }, sellerUser)).resolves.toEqual(expect.objectContaining({
            name: 'Retail Customer',
            phone: '2291111111',
            deliveryAddress: 'Route address',
            assignedRouteId: 'route-2',
        }));
        prisma.customer.findFirst.mockResolvedValueOnce(createCustomer({ creditLimit: null, creditDays: null }));
        prisma.customer.update.mockResolvedValueOnce(createCustomer({
            deliveryAddress: 'Updated route address',
            creditLimit: null,
            creditDays: null,
        }));
        await expect(service.update('customer-1', { deliveryAddress: ' Updated route address ' }, sellerUser)).resolves.toEqual(expect.objectContaining({
            deliveryAddress: 'Updated route address',
            creditLimit: null,
            creditDays: null,
            creditStatus: client_1.CreditStatus.ACTIVE,
        }));
        expect(prisma.customer.update).toHaveBeenCalledWith({
            where: { id: 'customer-1' },
            data: expect.objectContaining({ deliveryAddress: 'Updated route address' }),
        });
    });
    it('requires coherent credit terms when a customer enters a credited state', async () => {
        const { service, prisma } = createService();
        await expect(service.create({
            name: 'Incomplete Credit Customer',
            customerType: client_1.CustomerType.WHOLESALE,
            creditLimit: 1000,
        }, adminUser)).rejects.toBeInstanceOf(common_1.BadRequestException);
        prisma.customer.findFirst.mockResolvedValueOnce(createCustomer({ creditLimit: null, creditDays: null }));
        await expect(service.update('customer-1', { creditStatus: client_1.CreditStatus.ACTIVE }, adminUser)).rejects.toBeInstanceOf(common_1.BadRequestException);
    });
});
//# sourceMappingURL=customers.service.spec.js.map
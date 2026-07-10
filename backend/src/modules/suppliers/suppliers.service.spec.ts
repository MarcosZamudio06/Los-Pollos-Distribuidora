import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { SuppliersService } from './suppliers.service';

type SupplierRecord = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type MockPrisma = {
  supplier: {
    count: jest.Mock;
    findMany: jest.Mock;
    findUnique: jest.Mock;
    findFirst: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
};

const now = new Date('2026-07-03T12:00:00.000Z');

function createSupplier(
  overrides: Partial<SupplierRecord> = {},
): SupplierRecord {
  return {
    id: 'supplier-1',
    name: 'Proveedor Norte',
    phone: '555-0101',
    email: 'norte@example.com',
    address: 'Central de abasto',
    isActive: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createPrisma(): MockPrisma {
  return {
    supplier: {
      count: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };
}

function createService(prisma = createPrisma()): {
  service: SuppliersService;
  prisma: MockPrisma;
} {
  return {
    service: new SuppliersService(prisma as unknown as PrismaService),
    prisma,
  };
}

describe('SuppliersService', () => {
  it('lists suppliers with active default, search, pagination totals, and response shape', async () => {
    const { service, prisma } = createService();
    prisma.supplier.count.mockResolvedValue(12);
    prisma.supplier.findMany.mockResolvedValue([
      createSupplier(),
      createSupplier({ id: 'supplier-2', name: 'Proveedor Sur', email: null }),
    ]);

    await expect(
      service.findAll({ page: 2, limit: 5, search: 'prove', isActive: true }),
    ).resolves.toEqual({
      items: [
        {
          id: 'supplier-1',
          name: 'Proveedor Norte',
          phone: '555-0101',
          email: 'norte@example.com',
          address: 'Central de abasto',
          isActive: true,
        },
        {
          id: 'supplier-2',
          name: 'Proveedor Sur',
          phone: '555-0101',
          email: null,
          address: 'Central de abasto',
          isActive: true,
        },
      ],
      total: 12,
      page: 2,
      limit: 5,
      totalPages: 3,
    });

    const expectedWhere = {
      isActive: true,
      OR: [
        { name: { contains: 'prove', mode: 'insensitive' } },
        { phone: { contains: 'prove', mode: 'insensitive' } },
        { email: { contains: 'prove', mode: 'insensitive' } },
        { address: { contains: 'prove', mode: 'insensitive' } },
      ],
    };

    expect(prisma.supplier.count).toHaveBeenCalledWith({
      where: expectedWhere,
    });
    expect(prisma.supplier.findMany).toHaveBeenCalledWith({
      where: expectedWhere,
      orderBy: { name: 'asc' },
      skip: 5,
      take: 5,
    });
  });

  it('gets supplier detail even when inactive but blocks mutation of inactive records', async () => {
    const { service, prisma } = createService();
    prisma.supplier.findUnique.mockResolvedValueOnce(
      createSupplier({ isActive: false }),
    );

    await expect(service.findOne('supplier-1')).resolves.toEqual(
      expect.objectContaining({ id: 'supplier-1', isActive: false }),
    );

    prisma.supplier.findFirst.mockResolvedValueOnce(null);
    await expect(
      service.update('supplier-1', { name: 'Nuevo proveedor' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('creates suppliers with required name, phone, valid email, and address trimmed before writing', async () => {
    const { service, prisma } = createService();
    prisma.supplier.create.mockImplementation(({ data }: { data: unknown }) =>
      Promise.resolve(createSupplier(data as Partial<SupplierRecord>)),
    );

    await expect(
      service.create({
        name: ' Proveedor Norte ',
        phone: ' 555-0101 ',
        email: ' NORTE@EXAMPLE.COM ',
        address: ' Central de abasto ',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        name: 'Proveedor Norte',
        phone: '555-0101',
        email: 'norte@example.com',
        address: 'Central de abasto',
        isActive: true,
      }),
    );

    expect(prisma.supplier.create).toHaveBeenCalledWith({
      data: {
        name: 'Proveedor Norte',
        phone: '555-0101',
        email: 'norte@example.com',
        address: 'Central de abasto',
        isActive: true,
      },
    });

    await expect(service.create({ name: '   ' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      service.create({
        name: 'Proveedor Sur',
        phone: '555-0202',
        address: 'Av. Principal',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.create({
        name: 'Proveedor Sur',
        phone: '555-0202',
        email: 'sur@example.com',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.create({
        name: 'Proveedor Sur',
        email: 'sur@example.com',
        address: 'Av. Principal',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.create({
        name: 'Proveedor Sur',
        phone: '   ',
        email: 'sur@example.com',
        address: 'Av. Principal',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.create({
        name: 'Proveedor Sur',
        phone: '555-0202',
        email: '   ',
        address: 'Av. Principal',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.create({
        name: 'Proveedor Sur',
        phone: '555-0202',
        email: 'not-an-email',
        address: 'Av. Principal',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.supplier.create).toHaveBeenCalledTimes(1);
  });

  it('updates active suppliers and soft-deactivates without physical delete', async () => {
    const { service, prisma } = createService();
    prisma.supplier.findFirst.mockResolvedValueOnce(createSupplier());

    await expect(
      service.update('supplier-1', { phone: '   ' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.supplier.update).not.toHaveBeenCalled();

    prisma.supplier.findFirst.mockResolvedValueOnce(createSupplier());
    prisma.supplier.update.mockResolvedValueOnce(
      createSupplier({ name: 'Proveedor Norte Actualizado' }),
    );

    await expect(
      service.update('supplier-1', { name: 'Proveedor Norte Actualizado' }),
    ).resolves.toEqual(
      expect.objectContaining({ name: 'Proveedor Norte Actualizado' }),
    );

    expect(prisma.supplier.update).toHaveBeenLastCalledWith({
      where: { id: 'supplier-1' },
      data: { name: 'Proveedor Norte Actualizado' },
    });

    prisma.supplier.findFirst.mockResolvedValueOnce(createSupplier());
    prisma.supplier.update.mockResolvedValueOnce(
      createSupplier({ isActive: false }),
    );

    await expect(service.deactivate('supplier-1')).resolves.toEqual(
      expect.objectContaining({ isActive: false }),
    );
    expect(prisma.supplier.update).toHaveBeenLastCalledWith({
      where: { id: 'supplier-1' },
      data: { isActive: false },
    });
    expect(prisma.supplier.delete).not.toHaveBeenCalled();
  });

  it('PATCH merges with existing supplier on partial body before checking required fields', async () => {
    const { service, prisma } = createService();

    prisma.supplier.findFirst.mockResolvedValueOnce(createSupplier());
    prisma.supplier.update.mockResolvedValueOnce(
      createSupplier({ name: 'Proveedor Norte Actualizado' }),
    );

    await expect(
      service.update('supplier-1', { name: 'Proveedor Norte Actualizado' }),
    ).resolves.toEqual(
      expect.objectContaining({ name: 'Proveedor Norte Actualizado' }),
    );
    expect(prisma.supplier.update).toHaveBeenLastCalledWith({
      where: { id: 'supplier-1' },
      data: { name: 'Proveedor Norte Actualizado' },
    });

    prisma.supplier.findFirst.mockResolvedValueOnce(createSupplier());
    prisma.supplier.update.mockResolvedValueOnce(
      createSupplier({
        address: 'Nueva dirección',
        email: 'nuevo@example.com',
        name: 'Proveedor Norte',
        phone: '555-0303',
      }),
    );

    await expect(
      service.update('supplier-1', {
        address: 'Nueva dirección',
        email: 'nuevo@example.com',
        phone: '555-0303',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        address: 'Nueva dirección',
        email: 'nuevo@example.com',
        phone: '555-0303',
      }),
    );

    const supplierMissingPhone = createSupplier({ phone: null });
    prisma.supplier.findFirst.mockResolvedValueOnce(supplierMissingPhone);

    await expect(
      service.update('supplier-1', { name: 'Nuevo Nombre' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const supplierMissingAddress = createSupplier({ address: null });
    prisma.supplier.findFirst.mockResolvedValueOnce(supplierMissingAddress);

    await expect(
      service.update('supplier-1', { email: 'nuevo@example.com' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const supplierMissingEmail = createSupplier({ email: null });
    prisma.supplier.findFirst.mockResolvedValueOnce(supplierMissingEmail);

    await expect(
      service.update('supplier-1', { phone: '555-0303' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    prisma.supplier.findFirst.mockResolvedValueOnce(createSupplier());

    await expect(
      service.update('supplier-1', { email: 'invalido' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    prisma.supplier.findFirst.mockResolvedValueOnce(
      createSupplier({ name: null }),
    );

    await expect(
      service.update('supplier-1', { phone: '555-0303' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.supplier.update).toHaveBeenCalledTimes(2);
  });
});

import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CategoriesService } from './categories.service';

type CategoryRecord = {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type MockPrisma = {
  category: {
    findMany: jest.Mock;
    findUnique: jest.Mock;
    findFirst: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
};

const now = new Date('2026-06-28T12:00:00.000Z');

function createCategory(
  overrides: Partial<CategoryRecord> = {},
): CategoryRecord {
  return {
    id: 'category-1',
    name: 'Cortes',
    description: 'Cortes por kilogramo',
    isActive: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createPrisma(): MockPrisma {
  return {
    category: {
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
  service: CategoriesService;
  prisma: MockPrisma;
} {
  return {
    service: new CategoriesService(prisma as unknown as PrismaService),
    prisma,
  };
}

describe('CategoriesService', () => {
  it('lists categories with default active filter, search, pagination, and response shape', async () => {
    const { service, prisma } = createService();
    prisma.category.findMany.mockResolvedValue([
      createCategory(),
      createCategory({
        id: 'category-2',
        name: 'Piernas',
        description: null,
      }),
    ]);

    await expect(
      service.findAll({ page: 2, limit: 10, search: 'cor', isActive: true }),
    ).resolves.toEqual({
      items: [
        {
          id: 'category-1',
          name: 'Cortes',
          description: 'Cortes por kilogramo',
          isActive: true,
        },
        {
          id: 'category-2',
          name: 'Piernas',
          description: null,
          isActive: true,
        },
      ],
    });

    expect(prisma.category.findMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        isActive: true,
        OR: [
          { name: { contains: 'cor', mode: 'insensitive' } },
          { description: { contains: 'cor', mode: 'insensitive' } },
        ],
      }),
      orderBy: { name: 'asc' },
      skip: 10,
      take: 10,
    });
  });

  it('rejects blank category names after trimming', async () => {
    const { service, prisma } = createService();

    await expect(service.create({ name: '   ' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      service.update('category-1', { name: '   ' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.category.findUnique).not.toHaveBeenCalled();
    expect(prisma.category.create).not.toHaveBeenCalled();
    expect(prisma.category.update).not.toHaveBeenCalled();
  });

  it('creates active categories and enforces unique names before writing', async () => {
    const { service, prisma } = createService();
    prisma.category.findUnique.mockResolvedValueOnce(null);
    prisma.category.create.mockImplementation(({ data }: { data: unknown }) =>
      Promise.resolve(createCategory(data as Partial<CategoryRecord>)),
    );

    await expect(
      service.create({ name: ' Cortes ', description: 'Cortes por kilogramo' }),
    ).resolves.toEqual({
      id: 'category-1',
      name: 'Cortes',
      description: 'Cortes por kilogramo',
      isActive: true,
    });

    expect(prisma.category.create).toHaveBeenCalledWith({
      data: {
        name: 'Cortes',
        description: 'Cortes por kilogramo',
        isActive: true,
      },
    });

    prisma.category.findUnique.mockResolvedValueOnce(createCategory());

    await expect(service.create({ name: 'Cortes' })).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.category.create).toHaveBeenCalledTimes(1);
  });

  it('maps database unique-name races to ConflictException on create and update', async () => {
    const { service, prisma } = createService();
    prisma.category.findUnique.mockResolvedValueOnce(null);
    prisma.category.create.mockRejectedValueOnce({ code: 'P2002' });

    await expect(service.create({ name: 'Cortes' })).rejects.toBeInstanceOf(
      ConflictException,
    );

    prisma.category.findFirst.mockResolvedValueOnce(createCategory());
    prisma.category.findUnique.mockResolvedValueOnce(
      createCategory({ id: 'category-2' }),
    );

    await expect(
      service.update('category-1', { name: 'Piernas' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.category.update).not.toHaveBeenCalled();
  });

  it('updates active categories and soft-deactivates without physical delete', async () => {
    const { service, prisma } = createService();
    prisma.category.findFirst.mockResolvedValueOnce(createCategory());
    prisma.category.update.mockResolvedValueOnce(
      createCategory({ description: 'Cortes actualizados' }),
    );

    await expect(
      service.update('category-1', { description: 'Cortes actualizados' }),
    ).resolves.toEqual(
      expect.objectContaining({ description: 'Cortes actualizados' }),
    );
    expect(prisma.category.update).toHaveBeenCalledWith({
      where: { id: 'category-1' },
      data: { description: 'Cortes actualizados' },
    });

    prisma.category.findFirst.mockResolvedValueOnce(createCategory());
    prisma.category.update.mockResolvedValueOnce(
      createCategory({ isActive: false }),
    );

    await expect(service.deactivate('category-1')).resolves.toEqual(
      expect.objectContaining({ isActive: false }),
    );
    expect(prisma.category.update).toHaveBeenLastCalledWith({
      where: { id: 'category-1' },
      data: { isActive: false },
    });
    expect(prisma.category.delete).not.toHaveBeenCalled();

    prisma.category.findFirst.mockResolvedValueOnce(null);
    await expect(service.deactivate('missing-category')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

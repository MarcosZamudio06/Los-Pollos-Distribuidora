import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import {
  CreateSupplierDto,
  ListSuppliersQueryDto,
  UpdateSupplierDto,
} from './dto';

type SupplierRecord = Prisma.SupplierGetPayload<Record<string, never>>;

type SupplierResponse = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  isActive: boolean;
};

type SupplierListResponse = {
  items: SupplierResponse[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

type SupplierMutationDto = CreateSupplierDto | UpdateSupplierDto;

@Injectable()
export class SuppliersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    query: ListSuppliersQueryDto = {},
  ): Promise<SupplierListResponse> {
    const where = this.buildListWhere(query);
    const pagination = this.buildPagination(query);
    const [total, suppliers] = await Promise.all([
      this.prisma.supplier.count({ where }),
      this.prisma.supplier.findMany({
        where,
        orderBy: { name: 'asc' },
        ...pagination,
      }),
    ]);

    const page = query.page ?? 1;
    const limit = query.limit ?? total;

    return {
      items: (suppliers as SupplierRecord[]).map((supplier) =>
        this.toSupplierResponse(supplier),
      ),
      total,
      page,
      limit,
      totalPages: limit > 0 ? Math.ceil(total / limit) : 0,
    };
  }

  async findOne(id: string): Promise<SupplierResponse> {
    const supplier = (await this.prisma.supplier.findUnique({
      where: { id },
    })) as SupplierRecord | null;

    if (!supplier) {
      throw new NotFoundException('Supplier not found');
    }

    return this.toSupplierResponse(supplier);
  }

  async create(dto: CreateSupplierDto): Promise<SupplierResponse> {
    const data = this.normalizeMutationData(
      dto,
      true,
    ) as Prisma.SupplierCreateInput;

    const supplier = (await this.prisma.supplier.create({
      data: { ...data, isActive: true },
    })) as SupplierRecord;

    return this.toSupplierResponse(supplier);
  }

  async update(
    id: string,
    dto: UpdateSupplierDto,
  ): Promise<SupplierResponse> {
    const currentSupplier = await this.findActiveSupplierForMutation(id);
    const data = this.normalizeMutationData(
      dto,
      false,
    ) as Prisma.SupplierUpdateInput;

    const supplier = (await this.prisma.supplier.update({
      where: { id: currentSupplier.id },
      data,
    })) as SupplierRecord;

    return this.toSupplierResponse(supplier);
  }

  async deactivate(id: string): Promise<SupplierResponse> {
    const currentSupplier = await this.findActiveSupplierForMutation(id);
    const supplier = (await this.prisma.supplier.update({
      where: { id: currentSupplier.id },
      data: { isActive: false },
    })) as SupplierRecord;

    return this.toSupplierResponse(supplier);
  }

  private buildListWhere(
    query: ListSuppliersQueryDto,
  ): Prisma.SupplierWhereInput {
    const search = query.search?.trim();

    return {
      isActive: query.isActive ?? true,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
              { address: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
  }

  private buildPagination(query: ListSuppliersQueryDto): {
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

  private async findActiveSupplierForMutation(
    id: string,
  ): Promise<SupplierRecord> {
    const supplier = (await this.prisma.supplier.findFirst({
      where: { id, isActive: true },
    })) as SupplierRecord | null;

    if (!supplier) {
      throw new NotFoundException('Supplier not found');
    }

    return supplier;
  }

  private normalizeMutationData(
    dto: SupplierMutationDto,
    isCreate: boolean,
  ): Prisma.SupplierCreateInput | Prisma.SupplierUpdateInput {
    const name = dto.name !== undefined ? dto.name.trim() : undefined;

    if ((isCreate || name !== undefined) && (!name || name.length === 0)) {
      throw new BadRequestException('name is required');
    }

    return {
      ...(name !== undefined ? { name } : {}),
      ...(dto.phone !== undefined
        ? { phone: this.normalizeOptionalText(dto.phone) }
        : {}),
      ...(dto.email !== undefined
        ? { email: this.normalizeOptionalEmail(dto.email) }
        : {}),
      ...(dto.address !== undefined
        ? { address: this.normalizeOptionalText(dto.address) }
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

  private normalizeOptionalEmail(value?: string | null): string | null {
    const normalizedValue = this.normalizeOptionalText(value);
    return normalizedValue ? normalizedValue.toLowerCase() : null;
  }

  private toSupplierResponse(supplier: SupplierRecord): SupplierResponse {
    return {
      id: supplier.id,
      name: supplier.name,
      phone: supplier.phone,
      email: supplier.email,
      address: supplier.address,
      isActive: supplier.isActive,
    };
  }
}

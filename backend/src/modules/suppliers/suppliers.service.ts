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
    const data = this.normalizeMutationData(dto);

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
    const data = this.normalizeUpdateData(dto, currentSupplier);

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
    dto: CreateSupplierDto,
  ): Prisma.SupplierCreateInput {
    const name = dto.name?.trim();
    const phone = dto.phone?.trim();
    const email = dto.email?.trim();
    const address = dto.address?.trim();

    this.assertRequiredFields({ address, email, name, phone });

    return {
      name,
      phone,
      email: this.normalizeEmail(email),
      address,
    };
  }

  private normalizeUpdateData(
    dto: UpdateSupplierDto,
    currentSupplier: SupplierRecord,
  ): Prisma.SupplierUpdateInput {
    const effectiveName =
      dto.name !== undefined ? dto.name.trim() : currentSupplier.name;
    const effectivePhone =
      dto.phone !== undefined ? dto.phone.trim() : currentSupplier.phone ?? '';
    const effectiveEmail =
      dto.email !== undefined ? dto.email.trim() : currentSupplier.email ?? '';
    const effectiveAddress =
      dto.address !== undefined
        ? dto.address.trim()
        : currentSupplier.address ?? '';

    this.assertRequiredFields({
      address: effectiveAddress,
      email: effectiveEmail,
      name: effectiveName,
      phone: effectivePhone,
    });

    const data: Prisma.SupplierUpdateInput = {};

    if (dto.name !== undefined) {
      data.name = effectiveName;
    }
    if (dto.phone !== undefined) {
      data.phone = effectivePhone;
    }
    if (dto.email !== undefined) {
      data.email = this.normalizeEmail(effectiveEmail);
    }
    if (dto.address !== undefined) {
      data.address = effectiveAddress;
    }

    return data;
  }

  private assertRequiredFields(fields: {
    address: string;
    email: string;
    name: string;
    phone: string;
  }): void {
    const { address, email, name, phone } = fields;

    if (!name || name.length === 0) {
      throw new BadRequestException('name is required');
    }
    if (!phone || phone.length === 0) {
      throw new BadRequestException('phone is required');
    }
    if (!email || email.length === 0) {
      throw new BadRequestException('email is required');
    }
    if (!this.isValidEmail(email)) {
      throw new BadRequestException('email must be a valid email address');
    }
    if (!address || address.length === 0) {
      throw new BadRequestException('address is required');
    }
  }

  private isValidEmail(value: string): boolean {
    const atIndex = value.indexOf('@');
    if (atIndex <= 0 || atIndex === value.length - 1) {
      return false;
    }
    const domain = value.slice(atIndex + 1);
    const dotIndex = domain.indexOf('.');
    return dotIndex > 0 && dotIndex < domain.length - 1;
  }

  private normalizeEmail(value: string): string {
    return value.toLowerCase();
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

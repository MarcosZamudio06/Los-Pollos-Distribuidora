import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type LegalEntity } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import {
  isStructurallyValidFiscalRfc,
  isValidMexicanFiscalPostalCode,
  isValidSatFiscalRegime,
  normalizeFiscalTaxId,
} from '../../../../shared/fiscal-catalog';
import {
  getLegalEntityCertificateValidationCode,
  LEGAL_ENTITY_CERTIFICATE_EXPIRED,
  LEGAL_ENTITY_CERTIFICATE_NOT_YET_VALID,
  LEGAL_ENTITY_FISCAL_PROFILE_INCOMPLETE,
  legalEntityFiscalProfileStatus,
  missingLegalEntityFiscalProfileFields,
  isValidLegalEntityDefaultSeries,
} from '../../../../shared/legal-entity-fiscal-profile';
import {
  CreateLegalEntityDto,
  ListLegalEntitiesQueryDto,
  UpdateLegalEntityDto,
} from './dto';

export const LEGAL_ENTITY_MAPPING_MISSING = 'CFDI_LEGAL_ENTITY_MAPPING_MISSING';
export const LEGAL_ENTITY_MAPPING_AMBIGUOUS =
  'CFDI_LEGAL_ENTITY_MAPPING_AMBIGUOUS';
export const LEGAL_ENTITY_INACTIVE = 'CFDI_LEGAL_ENTITY_INACTIVE';
export const LEGAL_ENTITY_CFDI_DISABLED = 'CFDI_LEGAL_ENTITY_DISABLED';

type LegalEntityClient = PrismaService | Prisma.TransactionClient;

type LegalEntityWithFiscalData = LegalEntity;

export type LegalEntityResponse = LegalEntityWithFiscalData & {
  fiscalProfileStatus: 'COMPLETE' | 'INCOMPLETE';
  fiscalProfileComplete: boolean;
  fiscalProfileMissingFields: string[];
  fiscalProfileValidationCode:
    typeof LEGAL_ENTITY_FISCAL_PROFILE_INCOMPLETE | null;
};

export type ResolvedLegalEntity = {
  mappingId: string;
  legalEntityId: string;
  legalEntity: LegalEntityWithFiscalData;
};

type LegalEntityMutation = {
  legalName?: string;
  taxId?: string;
  fiscalPostalCode?: string | null;
  fiscalRegime?: string | null;
  cfdiEnabled?: boolean;
  defaultSeries?: string | null;
  certificateSerialNumber?: string | null;
  certificateFingerprint?: string | null;
  certificateSubject?: string | null;
  certificateValidFrom?: Date | null;
  certificateValidTo?: Date | null;
  isActive?: boolean;
};

@Injectable()
export class LegalEntitiesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    query: ListLegalEntitiesQueryDto = {},
  ): Promise<{ items: LegalEntityResponse[] }> {
    const search = query.search?.trim();
    const entities = await this.prisma.legalEntity.findMany({
      where: {
        ...(query.isActive === undefined ? {} : { isActive: query.isActive }),
        ...(search
          ? {
              OR: [
                { legalName: { contains: search, mode: 'insensitive' } },
                { taxId: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: [{ legalName: 'asc' }, { id: 'asc' }],
      ...(query.limit
        ? {
            skip: ((query.page ?? 1) - 1) * query.limit,
            take: query.limit,
          }
        : {}),
    });

    return { items: entities.map((entity) => this.toResponse(entity)) };
  }

  async findOne(id: string): Promise<LegalEntityResponse> {
    const entity = await this.prisma.legalEntity.findUnique({ where: { id } });
    if (!entity) throw new NotFoundException('Legal entity not found');
    return this.toResponse(entity);
  }

  async create(dto: CreateLegalEntityDto): Promise<LegalEntityResponse> {
    const data = this.normalizeCreate(dto);
    this.assertMutationValidity(data);
    this.assertCfdiCompleteness(data, data.cfdiEnabled === true);

    try {
      const entity = await this.prisma.legalEntity.create({
        data: {
          legalName: data.legalName as string,
          taxId: data.taxId as string,
          fiscalPostalCode: data.fiscalPostalCode ?? null,
          fiscalRegime: data.fiscalRegime ?? null,
          cfdiEnabled: data.cfdiEnabled ?? false,
          defaultSeries: data.defaultSeries ?? null,
          certificateSerialNumber: data.certificateSerialNumber ?? null,
          certificateFingerprint: data.certificateFingerprint ?? null,
          certificateSubject: data.certificateSubject ?? null,
          certificateValidFrom: data.certificateValidFrom ?? null,
          certificateValidTo: data.certificateValidTo ?? null,
          isActive: true,
        },
      });
      return this.toResponse(entity);
    } catch (error: unknown) {
      this.throwTaxIdConflict(error);
      throw error;
    }
  }

  async update(
    id: string,
    dto: UpdateLegalEntityDto,
  ): Promise<LegalEntityResponse> {
    const current = await this.prisma.legalEntity.findUnique({
      where: { id },
    });
    if (!current) throw new NotFoundException('Legal entity not found');

    const data = this.normalizeUpdate(dto);
    const candidate = this.mergeCandidate(current, data);
    this.assertMutationValidity(candidate);
    this.assertCfdiCompleteness(candidate, candidate.cfdiEnabled === true);

    try {
      const entity = await this.prisma.legalEntity.update({
        where: { id },
        data,
      });
      return this.toResponse(entity);
    } catch (error: unknown) {
      this.throwTaxIdConflict(error);
      throw error;
    }
  }

  async deactivate(id: string): Promise<LegalEntityResponse> {
    const current = await this.prisma.legalEntity.findUnique({
      where: { id },
    });
    if (!current) throw new NotFoundException('Legal entity not found');

    const entity = await this.prisma.legalEntity.update({
      where: { id },
      data: { isActive: false },
    });
    return this.toResponse(entity);
  }

  async resolveForOperationalLocation(
    operationalLocationId: string,
    at = new Date(),
    client: LegalEntityClient = this.prisma,
  ): Promise<ResolvedLegalEntity> {
    const mappings = (await client.legalEntityOperationalLocation.findMany({
      where: {
        operationalLocationId,
        effectiveFrom: { lte: at },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: at } }],
      },
      include: { legalEntity: true },
      orderBy: [{ effectiveFrom: 'desc' }, { id: 'asc' }],
    })) as Array<{
      id: string;
      legalEntityId: string;
      legalEntity: LegalEntityWithFiscalData;
    }>;

    if (mappings.length === 0) {
      throw this.fiscalError(
        LEGAL_ENTITY_MAPPING_MISSING,
        'No active LegalEntity mapping exists for the operational location.',
      );
    }

    if (mappings.length > 1) {
      throw this.fiscalError(
        LEGAL_ENTITY_MAPPING_AMBIGUOUS,
        'More than one active LegalEntity mapping exists for the operational location.',
      );
    }

    const mapping = mappings[0];
    const entity = mapping.legalEntity;
    if (!entity.isActive) {
      throw this.fiscalError(
        LEGAL_ENTITY_INACTIVE,
        'The mapped LegalEntity is inactive.',
      );
    }

    if (!entity.cfdiEnabled) {
      throw this.fiscalError(
        LEGAL_ENTITY_CFDI_DISABLED,
        'CFDI is disabled for the mapped LegalEntity.',
      );
    }

    this.assertCfdiCompleteness(entity, true);
    const certificateCode = getLegalEntityCertificateValidationCode(entity, at);
    if (certificateCode === LEGAL_ENTITY_CERTIFICATE_EXPIRED) {
      throw this.fiscalError(
        certificateCode,
        'The mapped LegalEntity certificate metadata is expired.',
      );
    }
    if (certificateCode === LEGAL_ENTITY_CERTIFICATE_NOT_YET_VALID) {
      throw this.fiscalError(
        certificateCode,
        'The mapped LegalEntity certificate metadata is not yet valid.',
      );
    }

    return {
      mappingId: mapping.id,
      legalEntityId: mapping.legalEntityId,
      legalEntity: entity,
    };
  }

  private normalizeCreate(dto: CreateLegalEntityDto): LegalEntityMutation {
    return {
      legalName: this.requiredText(dto.legalName),
      taxId: this.requiredTaxId(dto.taxId),
      fiscalPostalCode: this.optionalText(dto.fiscalPostalCode),
      fiscalRegime: this.optionalCode(dto.fiscalRegime),
      cfdiEnabled: dto.cfdiEnabled ?? false,
      defaultSeries: this.optionalCode(dto.defaultSeries),
      certificateSerialNumber: this.optionalText(dto.certificateSerialNumber),
      certificateFingerprint: this.optionalText(dto.certificateFingerprint),
      certificateSubject: this.optionalText(dto.certificateSubject),
      certificateValidFrom: this.optionalDate(dto.certificateValidFrom),
      certificateValidTo: this.optionalDate(dto.certificateValidTo),
    };
  }

  private normalizeUpdate(dto: UpdateLegalEntityDto): LegalEntityMutation {
    const data: LegalEntityMutation = {};
    if (dto.legalName !== undefined) {
      data.legalName = this.requiredText(dto.legalName);
    }
    if (dto.taxId !== undefined) data.taxId = this.requiredTaxId(dto.taxId);
    if (dto.fiscalPostalCode !== undefined) {
      data.fiscalPostalCode = this.optionalText(dto.fiscalPostalCode);
    }
    if (dto.fiscalRegime !== undefined) {
      data.fiscalRegime = this.optionalCode(dto.fiscalRegime);
    }
    if (dto.cfdiEnabled !== undefined) data.cfdiEnabled = dto.cfdiEnabled;
    if (dto.defaultSeries !== undefined) {
      data.defaultSeries = this.optionalCode(dto.defaultSeries);
    }
    if (dto.certificateSerialNumber !== undefined) {
      data.certificateSerialNumber = this.optionalText(
        dto.certificateSerialNumber,
      );
    }
    if (dto.certificateFingerprint !== undefined) {
      data.certificateFingerprint = this.optionalText(
        dto.certificateFingerprint,
      );
    }
    if (dto.certificateSubject !== undefined) {
      data.certificateSubject = this.optionalText(dto.certificateSubject);
    }
    if (dto.certificateValidFrom !== undefined) {
      data.certificateValidFrom = this.optionalDate(dto.certificateValidFrom);
    }
    if (dto.certificateValidTo !== undefined) {
      data.certificateValidTo = this.optionalDate(dto.certificateValidTo);
    }
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    return data;
  }

  private mergeCandidate(
    current: LegalEntityWithFiscalData,
    data: LegalEntityMutation,
  ): LegalEntityMutation {
    return {
      legalName: data.legalName ?? current.legalName,
      taxId: data.taxId ?? current.taxId,
      fiscalPostalCode:
        data.fiscalPostalCode !== undefined
          ? data.fiscalPostalCode
          : current.fiscalPostalCode,
      fiscalRegime:
        data.fiscalRegime !== undefined
          ? data.fiscalRegime
          : current.fiscalRegime,
      cfdiEnabled: data.cfdiEnabled ?? current.cfdiEnabled,
      defaultSeries:
        data.defaultSeries !== undefined
          ? data.defaultSeries
          : current.defaultSeries,
      certificateSerialNumber:
        data.certificateSerialNumber !== undefined
          ? data.certificateSerialNumber
          : current.certificateSerialNumber,
      certificateFingerprint:
        data.certificateFingerprint !== undefined
          ? data.certificateFingerprint
          : current.certificateFingerprint,
      certificateValidFrom:
        data.certificateValidFrom !== undefined
          ? data.certificateValidFrom
          : current.certificateValidFrom,
      certificateValidTo:
        data.certificateValidTo !== undefined
          ? data.certificateValidTo
          : current.certificateValidTo,
      isActive: data.isActive ?? current.isActive,
    };
  }

  private assertMutationValidity(data: LegalEntityMutation): void {
    if (data.taxId !== undefined && !isStructurallyValidFiscalRfc(data.taxId)) {
      throw this.fiscalError(
        'INVALID_TAX_ID',
        'The RFC has an invalid structure.',
      );
    }

    if (
      data.fiscalPostalCode !== undefined &&
      data.fiscalPostalCode !== null &&
      !isValidMexicanFiscalPostalCode(data.fiscalPostalCode)
    ) {
      throw this.fiscalError(
        'INVALID_FISCAL_POSTAL_CODE',
        'Fiscal postal code must contain exactly five digits.',
      );
    }

    if (
      data.fiscalRegime !== undefined &&
      data.fiscalRegime !== null &&
      !isValidSatFiscalRegime(data.fiscalRegime)
    ) {
      throw this.fiscalError(
        'INVALID_FISCAL_REGIME',
        'Fiscal regime must be a valid SAT catalog code.',
      );
    }

    if (
      data.defaultSeries !== undefined &&
      data.defaultSeries !== null &&
      !isValidLegalEntityDefaultSeries(data.defaultSeries)
    ) {
      throw this.fiscalError(
        'INVALID_DEFAULT_SERIES',
        'Default series must contain 1 to 10 uppercase letters, digits, or hyphens.',
      );
    }

    const from = data.certificateValidFrom;
    const to = data.certificateValidTo;
    if ((from && !to) || (!from && to) || (from && to && from >= to)) {
      throw this.fiscalError(
        'INVALID_CERTIFICATE_DATES',
        'Certificate validity must provide an ordered valid-from and valid-to pair.',
      );
    }
  }

  private assertCfdiCompleteness(
    source: LegalEntityMutation | LegalEntityWithFiscalData,
    required: boolean,
  ): void {
    if (!required) return;
    const missing = missingLegalEntityFiscalProfileFields(source);
    if (missing.length > 0) {
      throw this.fiscalError(
        LEGAL_ENTITY_FISCAL_PROFILE_INCOMPLETE,
        'CFDI fiscal profile is incomplete.',
        { fields: missing },
      );
    }
  }

  private toResponse(entity: LegalEntityWithFiscalData): LegalEntityResponse {
    const missing = missingLegalEntityFiscalProfileFields(entity);
    const status = legalEntityFiscalProfileStatus(entity);
    return {
      ...entity,
      fiscalProfileStatus: status,
      fiscalProfileComplete: status === 'COMPLETE',
      fiscalProfileMissingFields: missing,
      fiscalProfileValidationCode:
        status === 'INCOMPLETE' ? LEGAL_ENTITY_FISCAL_PROFILE_INCOMPLETE : null,
    };
  }

  private requiredText(value: string | null | undefined): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw this.fiscalError('INVALID_LEGAL_NAME', 'Legal name is required.');
    }
    return value.trim();
  }

  private requiredTaxId(value: string | null | undefined): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw this.fiscalError('INVALID_TAX_ID', 'RFC is required.');
    }
    return normalizeFiscalTaxId(value);
  }

  private optionalText(value: string | null | undefined): string | null {
    if (value === null || value === undefined) return null;
    return value.trim() === '' ? null : value.trim();
  }

  private optionalCode(value: string | null | undefined): string | null {
    const normalized = this.optionalText(value);
    return normalized ? normalized.toUpperCase() : null;
  }

  private optionalDate(value: string | null | undefined): Date | null {
    if (value === null || value === undefined || value.trim() === '')
      return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw this.fiscalError(
        'INVALID_CERTIFICATE_DATES',
        'Certificate date is invalid.',
      );
    }
    return date;
  }

  private fiscalError(
    code: string,
    message: string,
    extra: object = {},
  ): BadRequestException {
    return new BadRequestException({ code, message, ...extra });
  }

  private throwTaxIdConflict(error: unknown): void {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002' &&
      Array.isArray(error.meta?.target) &&
      error.meta.target.includes('taxId')
    ) {
      throw new ConflictException({
        code: 'LEGAL_ENTITY_TAX_ID_ALREADY_EXISTS',
        message: 'A LegalEntity with this RFC already exists.',
      });
    }
  }
}

import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma, SatCatalogVersionStatus } from '@prisma/client';
import { createHash } from 'node:crypto';
import {
  SAT_CATALOG_DESCRIPTIONS,
  SAT_CATALOG_KEYS,
  normalizeSatCatalogKey,
  type SatCatalogKey,
} from '../../../../shared/sat-catalogs';
import {
  isSatCfdiUseCompatibilityMetadata,
  isSatFiscalRegimeCompatibilityMetadata,
} from '../../../../shared/fiscal-catalog';
import { PrismaService } from '../../database/prisma.service';
import type {
  NormalizedSatCatalogImportEntry,
  SatCatalogImportEntry,
  SatCatalogVersionSummary,
} from './sat-catalog.types';

const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_ENTRY_LIMIT = 250;
const MAX_ENTRY_LIMIT = 1_000;
const MAX_CACHE_ENTRIES = 256;

export type SatCatalogQuery = {
  code?: string;
  asOf?: Date;
  limit?: number;
};

export type SatCatalogResponse = {
  key: SatCatalogKey;
  configured: boolean;
  activeVersion: {
    id: string;
    sourceVersion: string;
    checksumSha256: string;
    rowCount: number;
    activatedAt: Date | null;
  } | null;
  entries: Array<{
    code: string;
    description: string;
    validFrom: Date | null;
    validTo: Date | null;
    metadata: Prisma.JsonValue | null;
  }>;
};

export type SatCatalogListItem = {
  key: SatCatalogKey;
  description: string;
  configured: boolean;
  activeVersion: SatCatalogResponse['activeVersion'];
};

function catalogValidationError(code: string, message: string) {
  return new UnprocessableEntityException({ code, message });
}

function normalizeDate(
  value: Date | string | null | undefined,
  field: 'validFrom' | 'validTo',
): Date | null {
  if (value === undefined || value === null || value === '') return null;
  const date =
    value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw catalogValidationError(
      'SAT_CATALOG_DATE_INVALID',
      `${field} must be a valid ISO date`,
    );
  }
  return date;
}

function normalizeMetadata(
  value: Prisma.InputJsonValue | Prisma.JsonValue | null | undefined,
): Prisma.InputJsonValue | null {
  if (value === undefined || value === null) return null;
  try {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  } catch {
    throw catalogValidationError(
      'SAT_CATALOG_METADATA_INVALID',
      'Catalog metadata must be JSON serializable',
    );
  }
}

function stableJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => stableJson(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stableJson(item)]),
    );
  }
  return value;
}

export function normalizeSatCatalogEntries(
  entries: readonly SatCatalogImportEntry[],
): NormalizedSatCatalogImportEntry[] {
  if (entries.length === 0) {
    throw catalogValidationError(
      'SAT_CATALOG_EMPTY',
      'A catalog version must contain at least one entry',
    );
  }

  const seenCodes = new Set<string>();
  return entries.map((entry) => {
    const code = entry.code.trim();
    const description = entry.description.trim();
    if (!code) {
      throw catalogValidationError(
        'SAT_CATALOG_CODE_REQUIRED',
        'Catalog entry code is required',
      );
    }
    if (!description) {
      throw catalogValidationError(
        'SAT_CATALOG_DESCRIPTION_REQUIRED',
        'Catalog entry description is required',
      );
    }
    if (code.length > 64 || description.length > 512) {
      throw catalogValidationError(
        'SAT_CATALOG_ENTRY_TOO_LONG',
        'Catalog entry exceeds the supported length',
      );
    }
    if (seenCodes.has(code)) {
      throw catalogValidationError(
        'SAT_CATALOG_DUPLICATE_CODE',
        `Catalog entry code ${code} is duplicated`,
      );
    }
    seenCodes.add(code);

    const validFrom = normalizeDate(entry.validFrom, 'validFrom');
    const validTo = normalizeDate(entry.validTo, 'validTo');
    if (validFrom && validTo && validFrom > validTo) {
      throw catalogValidationError(
        'SAT_CATALOG_DATE_RANGE_INVALID',
        `Catalog entry ${code} has an invalid validity range`,
      );
    }
    return {
      code,
      description,
      validFrom,
      validTo,
      metadata: normalizeMetadata(entry.metadata),
    };
  });
}

export function validateSatFiscalCompatibilityMetadata(
  key: SatCatalogKey,
  entries: readonly NormalizedSatCatalogImportEntry[],
): void {
  if (key !== 'c_UsoCFDI' && key !== 'c_RegimenFiscal') return;

  for (const entry of entries) {
    const valid =
      key === 'c_UsoCFDI'
        ? isSatCfdiUseCompatibilityMetadata(entry.metadata)
        : isSatFiscalRegimeCompatibilityMetadata(entry.metadata);
    if (!valid) {
      throw catalogValidationError(
        'SAT_CATALOG_COMPATIBILITY_METADATA_INVALID',
        `${key} entry ${entry.code} must include the reviewed compatibility metadata`,
      );
    }
  }
}

export function calculateSatCatalogChecksum(
  entries: readonly NormalizedSatCatalogImportEntry[],
): string {
  const canonical = [...entries]
    .sort((left, right) => left.code.localeCompare(right.code))
    .map((entry) =>
      JSON.stringify({
        code: entry.code,
        description: entry.description,
        validFrom: entry.validFrom?.toISOString() ?? null,
        validTo: entry.validTo?.toISOString() ?? null,
        metadata: stableJson(entry.metadata ?? null),
      }),
    )
    .join('\n');
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

type CatalogCacheValue = { expiresAt: number; value: SatCatalogResponse };

@Injectable()
export class SatCatalogService {
  private readonly cache = new Map<string, CatalogCacheValue>();

  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<SatCatalogListItem[]> {
    const rows = await this.prisma.satCatalog.findMany({
      orderBy: { key: 'asc' },
      select: {
        key: true,
        activeVersion: {
          select: {
            id: true,
            sourceVersion: true,
            checksumSha256: true,
            rowCount: true,
            activatedAt: true,
          },
        },
      },
    });
    const byKey = new Map(rows.map((row) => [row.key, row]));
    return SAT_CATALOG_KEYS.map((key) => {
      const row = byKey.get(key);
      return {
        key,
        description: SAT_CATALOG_DESCRIPTIONS[key],
        configured: Boolean(row?.activeVersion),
        activeVersion: row?.activeVersion ?? null,
      };
    });
  }

  async get(
    keyInput: string,
    query: SatCatalogQuery = {},
  ): Promise<SatCatalogResponse> {
    let key: SatCatalogKey;
    try {
      key = normalizeSatCatalogKey(keyInput);
    } catch {
      throw new NotFoundException('SAT_CATALOG_NOT_SUPPORTED');
    }
    const code = query.code?.trim() || undefined;
    const limit = Math.min(
      Math.max(Math.trunc(query.limit ?? DEFAULT_ENTRY_LIMIT), 1),
      MAX_ENTRY_LIMIT,
    );
    const asOf = query.asOf ?? null;
    const cacheKey = `${key}|${code ?? ''}|${asOf?.toISOString() ?? ''}|${limit}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    const entryWhere: Prisma.SatCatalogEntryWhereInput = {
      ...(code ? { code } : {}),
      ...(asOf
        ? {
            AND: [
              { OR: [{ validFrom: null }, { validFrom: { lte: asOf } }] },
              { OR: [{ validTo: null }, { validTo: { gt: asOf } }] },
            ],
          }
        : {}),
    };
    const row = await this.prisma.satCatalog.findUnique({
      where: { key },
      select: {
        activeVersion: {
          select: {
            id: true,
            sourceVersion: true,
            checksumSha256: true,
            rowCount: true,
            activatedAt: true,
            entries: {
              where: entryWhere,
              orderBy: { code: 'asc' },
              take: limit,
              select: {
                code: true,
                description: true,
                validFrom: true,
                validTo: true,
                metadata: true,
              },
            },
          },
        },
      },
    });
    const value: SatCatalogResponse = {
      key,
      configured: Boolean(row?.activeVersion),
      activeVersion: row?.activeVersion
        ? {
            id: row.activeVersion.id,
            sourceVersion: row.activeVersion.sourceVersion,
            checksumSha256: row.activeVersion.checksumSha256,
            rowCount: row.activeVersion.rowCount,
            activatedAt: row.activeVersion.activatedAt,
          }
        : null,
      entries: row?.activeVersion?.entries.map((entry) => ({ ...entry })) ?? [],
    };
    if (this.cache.size >= MAX_CACHE_ENTRIES) {
      for (const oldest of this.cache.keys()) {
        this.cache.delete(oldest);
        break;
      }
    }
    this.cache.set(cacheKey, {
      expiresAt: Date.now() + DEFAULT_CACHE_TTL_MS,
      value,
    });
    return value;
  }

  invalidate(keyInput?: string): void {
    if (!keyInput) {
      this.cache.clear();
      return;
    }
    for (const cacheKey of this.cache.keys()) {
      if (cacheKey.startsWith(`${keyInput}|`)) this.cache.delete(cacheKey);
    }
  }
}

@Injectable()
export class SatCatalogImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalogs: SatCatalogService,
  ) {}

  async stage(
    keyInput: string,
    sourceVersionInput: string,
    entries: readonly SatCatalogImportEntry[],
    suppliedChecksum?: string,
    metadata?: Prisma.InputJsonValue | null,
  ): Promise<SatCatalogVersionSummary> {
    let key: SatCatalogKey;
    try {
      key = normalizeSatCatalogKey(keyInput);
    } catch {
      throw new UnprocessableEntityException({
        code: 'SAT_CATALOG_NOT_SUPPORTED',
        message: 'Catalog key is not supported',
      });
    }
    const sourceVersion = sourceVersionInput.trim();
    if (!sourceVersion) {
      throw catalogValidationError(
        'SAT_CATALOG_SOURCE_VERSION_REQUIRED',
        'sourceVersion is required',
      );
    }
    if (sourceVersion.length > 128) {
      throw catalogValidationError(
        'SAT_CATALOG_SOURCE_VERSION_TOO_LONG',
        'sourceVersion exceeds the supported length',
      );
    }

    const normalizedEntries = normalizeSatCatalogEntries(entries);
    validateSatFiscalCompatibilityMetadata(key, normalizedEntries);
    const checksumSha256 = calculateSatCatalogChecksum(normalizedEntries);
    if (
      suppliedChecksum &&
      suppliedChecksum.trim().toLowerCase() !== checksumSha256
    ) {
      throw new UnprocessableEntityException({
        code: 'SAT_CATALOG_CHECKSUM_MISMATCH',
        message: 'Supplied catalog checksum does not match canonical entries',
      });
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const catalog = await tx.satCatalog.upsert({
        where: { key },
        create: {
          key,
          name: key,
          description: SAT_CATALOG_DESCRIPTIONS[key],
        },
        update: {},
        select: { id: true },
      });
      const existing = await tx.satCatalogVersion.findUnique({
        where: {
          catalogId_sourceVersion: {
            catalogId: catalog.id,
            sourceVersion,
          },
        },
        include: { catalog: { select: { key: true } } },
      });
      if (existing) {
        if (existing.checksumSha256 === checksumSha256) return existing;
        throw new UnprocessableEntityException({
          code: 'SAT_CATALOG_VERSION_CONFLICT',
          message: 'sourceVersion already exists with another checksum',
        });
      }

      return tx.satCatalogVersion.create({
        data: {
          catalogId: catalog.id,
          sourceVersion,
          status: SatCatalogVersionStatus.STAGING,
          checksumSha256,
          rowCount: normalizedEntries.length,
          metadata: normalizeMetadata(metadata) ?? Prisma.JsonNull,
          entries: {
            create: normalizedEntries.map((entry) => ({
              code: entry.code,
              description: entry.description,
              validFrom: entry.validFrom,
              validTo: entry.validTo,
              metadata: entry.metadata ?? Prisma.JsonNull,
            })),
          },
        },
        include: { catalog: { select: { key: true } } },
      });
    });

    this.catalogs.invalidate(key);
    return this.toSummary(result);
  }

  async validate(versionId: string): Promise<SatCatalogVersionSummary> {
    const version = await this.prisma.satCatalogVersion.findUnique({
      where: { id: versionId },
      include: {
        catalog: { select: { key: true } },
        entries: { orderBy: { code: 'asc' } },
      },
    });
    if (!version) throw new NotFoundException('SAT_CATALOG_VERSION_NOT_FOUND');
    if (version.status === SatCatalogVersionStatus.ACTIVE) {
      const normalizedEntries = normalizeSatCatalogEntries(version.entries);
      validateSatFiscalCompatibilityMetadata(
        normalizeSatCatalogKey(version.catalog.key),
        normalizedEntries,
      );
      return this.toSummary(version);
    }
    if (
      version.status !== SatCatalogVersionStatus.STAGING &&
      version.status !== SatCatalogVersionStatus.FAILED
    ) {
      throw new UnprocessableEntityException({
        code: 'SAT_CATALOG_VERSION_NOT_STAGING',
        message: 'Only staging catalog versions can be validated',
      });
    }

    let normalizedEntries: NormalizedSatCatalogImportEntry[];
    try {
      normalizedEntries = normalizeSatCatalogEntries(version.entries);
      validateSatFiscalCompatibilityMetadata(
        normalizeSatCatalogKey(version.catalog.key),
        normalizedEntries,
      );
      const checksum = calculateSatCatalogChecksum(normalizedEntries);
      if (checksum !== version.checksumSha256) {
        throw new UnprocessableEntityException({
          code: 'SAT_CATALOG_CHECKSUM_MISMATCH',
          message: 'Persisted catalog checksum does not match entries',
        });
      }
    } catch (error) {
      await this.prisma.satCatalogVersion.update({
        where: { id: versionId },
        data: { status: SatCatalogVersionStatus.FAILED },
      });
      throw error;
    }

    const updated = await this.prisma.satCatalogVersion.update({
      where: { id: versionId },
      data: {
        status: SatCatalogVersionStatus.VALIDATED,
        validatedAt: new Date(),
        rowCount: normalizedEntries.length,
      },
      include: { catalog: { select: { key: true } } },
    });
    this.catalogs.invalidate(updated.catalog.key);
    return this.toSummary(updated);
  }

  async activate(versionId: string): Promise<SatCatalogVersionSummary> {
    const result = await this.prisma.$transaction(async (tx) => {
      const version = await tx.satCatalogVersion.findUnique({
        where: { id: versionId },
        include: {
          catalog: {
            select: { id: true, key: true, activeVersionId: true },
          },
        },
      });
      if (!version)
        throw new NotFoundException('SAT_CATALOG_VERSION_NOT_FOUND');
      if (version.status === SatCatalogVersionStatus.ACTIVE) {
        // Repair an ACTIVE version whose catalog pointer was left stale by a
        // partial legacy import. The pointer is the read-side authority.
        if (version.catalog.activeVersionId !== version.id) {
          await tx.satCatalog.update({
            where: { id: version.catalog.id },
            data: { activeVersionId: version.id },
          });
        }
        return version;
      }
      if (version.status !== SatCatalogVersionStatus.VALIDATED) {
        throw new UnprocessableEntityException({
          code: 'SAT_CATALOG_VERSION_NOT_VALIDATED',
          message: 'Only validated catalog versions can be activated',
        });
      }

      const now = new Date();
      if (version.catalog.activeVersionId) {
        await tx.satCatalogVersion.update({
          where: { id: version.catalog.activeVersionId },
          data: { status: SatCatalogVersionStatus.RETIRED, retiredAt: now },
        });
      }
      const activated = await tx.satCatalogVersion.update({
        where: { id: version.id },
        data: { status: SatCatalogVersionStatus.ACTIVE, activatedAt: now },
        include: { catalog: { select: { key: true } } },
      });
      // Keep the catalog pointer in the same transaction as the status
      // change. Reads only follow this pointer, so activation is atomic from
      // the API's perspective and never exposes two active versions.
      await tx.satCatalog.update({
        where: { id: version.catalog.id },
        data: { activeVersionId: version.id },
      });
      return activated;
    });

    this.catalogs.invalidate(result.catalog.key);
    return this.toSummary(result);
  }

  private toSummary(version: {
    id: string;
    sourceVersion: string;
    status: SatCatalogVersionStatus;
    checksumSha256: string;
    rowCount: number;
    stagedAt: Date;
    validatedAt: Date | null;
    activatedAt: Date | null;
    retiredAt: Date | null;
    catalog: { key: string };
  }): SatCatalogVersionSummary {
    return {
      id: version.id,
      catalogKey: normalizeSatCatalogKey(version.catalog.key),
      sourceVersion: version.sourceVersion,
      status: version.status,
      checksumSha256: version.checksumSha256,
      rowCount: version.rowCount,
      stagedAt: version.stagedAt,
      validatedAt: version.validatedAt,
      activatedAt: version.activatedAt,
      retiredAt: version.retiredAt,
    };
  }
}

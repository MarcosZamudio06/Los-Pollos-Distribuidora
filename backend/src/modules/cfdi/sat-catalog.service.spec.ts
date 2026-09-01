import { NotFoundException } from '@nestjs/common';
import { SatCatalogVersionStatus } from '@prisma/client';
import {
  calculateSatCatalogChecksum,
  normalizeSatCatalogEntries,
  SatCatalogImportService,
  SatCatalogService,
} from './sat-catalog.service';
import { SAT_FISCAL_COMPATIBILITY_METADATA_SCHEMA } from '../../../../shared/fiscal-catalog';

const entry = {
  code: ' TEST-01 ',
  description: ' Test catalog entry ',
  validFrom: '2026-01-01T00:00:00.000Z',
  metadata: {
    schema: SAT_FISCAL_COMPATIBILITY_METADATA_SCHEMA,
    appliesTo: { physical: true, moral: true },
    fiscalRegimes: ['601'],
  },
};

function versionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'version-1',
    catalogId: 'catalog-1',
    sourceVersion: 'sat-2026-01',
    status: SatCatalogVersionStatus.STAGING,
    checksumSha256: 'a'.repeat(64),
    rowCount: 1,
    metadata: null,
    stagedAt: new Date('2026-01-01'),
    validatedAt: null,
    activatedAt: null,
    retiredAt: null,
    catalog: { key: 'c_UsoCFDI' },
    entries: [],
    ...overrides,
  };
}

describe('SAT catalog normalization', () => {
  it('normalizes entries and calculates an order-independent checksum', () => {
    const normalized = normalizeSatCatalogEntries([entry]);
    const other = normalizeSatCatalogEntries([
      { code: 'TEST-02', description: 'Second' },
      entry,
    ]);
    expect(normalized[0]).toEqual(
      expect.objectContaining({
        code: 'TEST-01',
        description: 'Test catalog entry',
      }),
    );
    expect(calculateSatCatalogChecksum(other)).toBe(
      calculateSatCatalogChecksum([...other].reverse()),
    );
  });

  it.each([
    [
      { code: 'A', description: 'x' },
      { code: 'A', description: 'y' },
    ],
    [{ code: 'A', description: ' ' }],
  ])('rejects malformed or duplicate entries', (...entries) => {
    expect(() => normalizeSatCatalogEntries(entries)).toThrow();
  });
});

describe('SatCatalogService', () => {
  it('returns all supported keys and marks missing imports unconfigured', async () => {
    const prisma = {
      satCatalog: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new SatCatalogService(prisma as never);
    const result = await service.list();
    expect(result).toHaveLength(16);
    expect(result.find((item) => item.key === 'c_UsoCFDI')).toEqual(
      expect.objectContaining({ configured: false, activeVersion: null }),
    );
    expect(result.find((item) => item.key === 'c_TipoRelacion')).toEqual(
      expect.objectContaining({ configured: false, activeVersion: null }),
    );
    expect(result.find((item) => item.key === 'c_Periodicidad')).toEqual(
      expect.objectContaining({ configured: false, activeVersion: null }),
    );
    expect(result.find((item) => item.key === 'c_Meses')).toEqual(
      expect.objectContaining({ configured: false, activeVersion: null }),
    );
  });

  it('caches an active catalog response and rejects unsupported keys', async () => {
    const prisma = {
      satCatalog: {
        findUnique: jest.fn().mockResolvedValue({
          activeVersion: {
            id: 'version-1',
            sourceVersion: 'sat-2026-01',
            checksumSha256: 'a'.repeat(64),
            rowCount: 1,
            activatedAt: new Date(),
            entries: [
              {
                code: 'G03',
                description: 'Gastos',
                validFrom: null,
                validTo: null,
                metadata: null,
              },
            ],
          },
        }),
      },
    };
    const service = new SatCatalogService(prisma as never);
    const first = await service.get('c_UsoCFDI', { code: 'G03' });
    const second = await service.get('c_UsoCFDI', { code: 'G03' });
    expect(first.entries[0].code).toBe('G03');
    expect(second).toBe(first);
    expect(prisma.satCatalog.findUnique).toHaveBeenCalledTimes(1);
    await expect(service.get('unsupported')).rejects.toEqual(
      new NotFoundException('SAT_CATALOG_NOT_SUPPORTED'),
    );
  });
});

describe('SatCatalogImportService', () => {
  function harness() {
    const tx = {
      satCatalog: {
        upsert: jest.fn().mockResolvedValue({ id: 'catalog-1' }),
        update: jest.fn().mockResolvedValue({}),
      },
      satCatalogVersion: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
      satCatalogVersion: { findUnique: jest.fn(), update: jest.fn() },
    };
    const catalogs = { invalidate: jest.fn() };
    return {
      tx,
      prisma,
      catalogs,
      service: new SatCatalogImportService(prisma as never, catalogs as never),
    };
  }

  it('stages a reviewed import with canonical checksum', async () => {
    const { service, tx, catalogs } = harness();
    const checksum = calculateSatCatalogChecksum(
      normalizeSatCatalogEntries([entry]),
    );
    tx.satCatalogVersion.create.mockResolvedValue(
      versionRow({ checksumSha256: checksum }),
    );
    const result = await service.stage('c_UsoCFDI', 'sat-2026-01', [entry]);
    expect(result.status).toBe(SatCatalogVersionStatus.STAGING);
    expect(tx.satCatalogVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ rowCount: 1 }),
      }),
    );
    expect(catalogs.invalidate).toHaveBeenCalledWith('c_UsoCFDI');
  });

  it('rejects checksum mismatch before a transaction', async () => {
    const { service, prisma } = harness();
    await expect(
      service.stage('c_UsoCFDI', 'sat-2026-01', [entry], 'b'.repeat(64)),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'SAT_CATALOG_CHECKSUM_MISMATCH',
      }),
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('requires compatibility metadata when importing c_UsoCFDI', async () => {
    const { service, prisma } = harness();
    await expect(
      service.stage('c_UsoCFDI', 'sat-2026-01', [
        { code: 'G03', description: 'Gastos en general' },
      ]),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'SAT_CATALOG_COMPATIBILITY_METADATA_INVALID',
      }),
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('validates and atomically activates a version while retiring the previous one', async () => {
    const { service, prisma, tx } = harness();
    const normalized = normalizeSatCatalogEntries([entry]);
    const checksum = calculateSatCatalogChecksum(normalized);
    prisma.satCatalogVersion.findUnique.mockResolvedValue(
      versionRow({ checksumSha256: checksum, entries: normalized }),
    );
    prisma.satCatalogVersion.update.mockResolvedValue(
      versionRow({
        status: SatCatalogVersionStatus.VALIDATED,
        checksumSha256: checksum,
        entries: normalized,
        validatedAt: new Date(),
      }),
    );
    await expect(service.validate('version-1')).resolves.toEqual(
      expect.objectContaining({ status: SatCatalogVersionStatus.VALIDATED }),
    );
    tx.satCatalogVersion.findUnique.mockResolvedValue(
      versionRow({
        status: SatCatalogVersionStatus.VALIDATED,
        catalog: {
          key: 'c_UsoCFDI',
          id: 'catalog-1',
          activeVersionId: 'old-version',
        },
      }),
    );
    tx.satCatalogVersion.update.mockResolvedValue(
      versionRow({
        status: SatCatalogVersionStatus.ACTIVE,
        catalog: { key: 'c_UsoCFDI' },
        activatedAt: new Date(),
      }),
    );
    await expect(service.activate('version-1')).resolves.toEqual(
      expect.objectContaining({ status: SatCatalogVersionStatus.ACTIVE }),
    );
    expect(tx.satCatalogVersion.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'old-version' } }),
    );
    expect(tx.satCatalog.update).toHaveBeenCalledWith({
      where: { id: 'catalog-1' },
      data: { activeVersionId: 'version-1' },
    });
  });
});

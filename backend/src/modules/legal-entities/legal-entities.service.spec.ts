import { PrismaService } from '../../database/prisma.service';
import { CreateLegalEntityDto } from './dto/create-legal-entity.dto';
import {
  LEGAL_ENTITY_CFDI_DISABLED,
  LEGAL_ENTITY_INACTIVE,
  LEGAL_ENTITY_MAPPING_AMBIGUOUS,
  LEGAL_ENTITY_MAPPING_MISSING,
  LegalEntitiesService,
} from './legal-entities.service';

type MockPrisma = {
  legalEntity: {
    findMany: jest.Mock;
    findUnique: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  legalEntityOperationalLocation: { findMany: jest.Mock };
};

const now = new Date('2026-08-22T12:00:00.000Z');
const certificateFrom = new Date('2026-01-01T00:00:00.000Z');
const certificateTo = new Date('2027-01-01T00:00:00.000Z');

function createLegalEntity(overrides: Record<string, unknown> = {}) {
  return {
    id: 'legal-entity-1',
    legalName: 'Pollos Distribuidora, S.A. de C.V.',
    taxId: 'PDI010101ABC',
    fiscalPostalCode: '91700',
    fiscalRegime: '601',
    cfdiEnabled: true,
    defaultSeries: 'A',
    certificateSerialNumber: '30001000000500003416',
    certificateFingerprint: 'sha256:certificate-fingerprint',
    certificateSubject: 'CN=Pollos Distribuidora',
    certificateValidFrom: certificateFrom,
    certificateValidTo: certificateTo,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createPrisma(): MockPrisma {
  return {
    legalEntity: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    legalEntityOperationalLocation: { findMany: jest.fn() },
  };
}

function createService(prisma = createPrisma()) {
  return {
    prisma,
    service: new LegalEntitiesService(prisma as unknown as PrismaService),
  };
}

function completeDto(): CreateLegalEntityDto {
  return {
    legalName: ' Pollos Distribuidora, S.A. de C.V. ',
    taxId: ' pdi 010101abc ',
    fiscalPostalCode: '91700',
    fiscalRegime: '601',
    cfdiEnabled: true,
    defaultSeries: ' a ',
    certificateSerialNumber: '30001000000500003416',
    certificateFingerprint: 'sha256:certificate-fingerprint',
    certificateSubject: 'CN=Pollos Distribuidora',
    certificateValidFrom: certificateFrom.toISOString(),
    certificateValidTo: certificateTo.toISOString(),
  };
}

describe('LegalEntitiesService', () => {
  it('allows an incomplete legacy issuer while exposing a stable incomplete status', async () => {
    const { service, prisma } = createService();
    const entity = createLegalEntity({
      fiscalPostalCode: null,
      fiscalRegime: null,
      cfdiEnabled: false,
      defaultSeries: null,
      certificateSerialNumber: null,
      certificateFingerprint: null,
      certificateValidFrom: null,
      certificateValidTo: null,
    });
    prisma.legalEntity.create.mockResolvedValue(entity);

    const response = await service.create({
      legalName: entity.legalName,
      taxId: entity.taxId,
    });

    expect(response).toEqual(
      expect.objectContaining({
        fiscalProfileStatus: 'INCOMPLETE',
        fiscalProfileComplete: false,
        fiscalProfileValidationCode:
          'CFDI_LEGAL_ENTITY_FISCAL_PROFILE_INCOMPLETE',
      }),
    );
    expect(prisma.legalEntity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          cfdiEnabled: false,
          fiscalPostalCode: null,
          fiscalRegime: null,
        }),
      }),
    );
  });

  it('normalizes and creates a complete CFDI issuer without secret fields', async () => {
    const { service, prisma } = createService();
    const entity = createLegalEntity();
    prisma.legalEntity.create.mockResolvedValue(entity);

    const response = await service.create(completeDto());
    const createCall = prisma.legalEntity.create.mock.calls[0][0];

    expect(response.fiscalProfileStatus).toBe('COMPLETE');
    expect(createCall.data).toEqual(
      expect.objectContaining({
        legalName: 'Pollos Distribuidora, S.A. de C.V.',
        taxId: 'PDI010101ABC',
        defaultSeries: 'A',
      }),
    );
    expect(createCall.data).not.toHaveProperty('key');
    expect(createCall.data).not.toHaveProperty('password');
    expect(createCall.data).not.toHaveProperty('pacToken');
  });

  it('rejects enabling an incomplete issuer with a stable validation code', async () => {
    const { service, prisma } = createService();
    const incomplete = createLegalEntity({
      cfdiEnabled: false,
      fiscalPostalCode: null,
      fiscalRegime: null,
      defaultSeries: null,
      certificateSerialNumber: null,
      certificateFingerprint: null,
      certificateValidFrom: null,
      certificateValidTo: null,
    });
    prisma.legalEntity.findUnique.mockResolvedValue(incomplete);

    await expect(
      service.update(incomplete.id, { cfdiEnabled: true }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'CFDI_LEGAL_ENTITY_FISCAL_PROFILE_INCOMPLETE',
        fields: expect.arrayContaining(['fiscalPostalCode', 'defaultSeries']),
      }),
    });
    expect(prisma.legalEntity.update).not.toHaveBeenCalled();
  });

  it.each([
    ['RFC', { taxId: 'INVALID' }, 'INVALID_TAX_ID'],
    [
      'fiscal postal code',
      { fiscalPostalCode: '9170' },
      'INVALID_FISCAL_POSTAL_CODE',
    ],
    ['fiscal regime', { fiscalRegime: '999' }, 'INVALID_FISCAL_REGIME'],
    [
      'default series',
      { defaultSeries: 'lower case' },
      'INVALID_DEFAULT_SERIES',
    ],
  ])('rejects an invalid %s before persistence', async (_, overrides, code) => {
    const { service, prisma } = createService();

    await expect(
      service.create({ ...completeDto(), ...overrides }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code }),
    });
    expect(prisma.legalEntity.create).not.toHaveBeenCalled();
  });

  it('resolves exactly one current active mapping to an active fiscal issuer', async () => {
    const { service, prisma } = createService();
    const entity = createLegalEntity();
    prisma.legalEntityOperationalLocation.findMany.mockResolvedValue([
      {
        id: 'mapping-1',
        legalEntityId: entity.id,
        legalEntity: entity,
      },
    ]);

    await expect(
      service.resolveForOperationalLocation('location-1', now),
    ).resolves.toEqual({
      mappingId: 'mapping-1',
      legalEntityId: entity.id,
      legalEntity: entity,
    });
    expect(prisma.legalEntityOperationalLocation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          operationalLocationId: 'location-1',
          effectiveFrom: { lte: now },
        }),
      }),
    );
  });

  it.each([
    ['location without an issuer', [], LEGAL_ENTITY_MAPPING_MISSING],
    [
      'inactive issuer',
      [
        {
          id: 'mapping-1',
          legalEntityId: 'legal-entity-1',
          legalEntity: createLegalEntity({ isActive: false }),
        },
      ],
      LEGAL_ENTITY_INACTIVE,
    ],
    [
      'disabled issuer',
      [
        {
          id: 'mapping-1',
          legalEntityId: 'legal-entity-1',
          legalEntity: createLegalEntity({ cfdiEnabled: false }),
        },
      ],
      LEGAL_ENTITY_CFDI_DISABLED,
    ],
    [
      'ambiguous current mappings',
      [
        {
          id: 'mapping-1',
          legalEntityId: 'legal-entity-1',
          legalEntity: createLegalEntity(),
        },
        {
          id: 'mapping-2',
          legalEntityId: 'legal-entity-2',
          legalEntity: createLegalEntity({ id: 'legal-entity-2' }),
        },
      ],
      LEGAL_ENTITY_MAPPING_AMBIGUOUS,
    ],
  ])(
    'rejects %s without selecting a fallback issuer',
    async (_, mappings, code) => {
      const { service, prisma } = createService();
      prisma.legalEntityOperationalLocation.findMany.mockResolvedValue(
        mappings,
      );

      await expect(
        service.resolveForOperationalLocation('location-1', now),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code }),
      });
    },
  );

  it('rejects an issuer whose certificate metadata is no longer valid', async () => {
    const { service, prisma } = createService();
    prisma.legalEntityOperationalLocation.findMany.mockResolvedValue([
      {
        id: 'mapping-1',
        legalEntityId: 'legal-entity-1',
        legalEntity: createLegalEntity({
          certificateValidFrom: new Date('2025-01-01T00:00:00.000Z'),
          certificateValidTo: new Date('2026-01-01T00:00:00.000Z'),
        }),
      },
    ]);

    await expect(
      service.resolveForOperationalLocation('location-1', now),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'CFDI_LEGAL_ENTITY_CERTIFICATE_EXPIRED',
      }),
    });
  });
});

import { ConflictException } from '@nestjs/common';
import { BrandingService, MAX_BRANDING_LOGO_BYTES } from './branding.service';

jest.mock('../../database/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

const admin = { id: 'admin-1', role: 'ADMIN' } as never;
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    displayName: 'ERP',
    shortName: null,
    logoObjectKey: null,
    logoMimeType: null,
    version: 1,
    updatedByUserId: 'admin-1',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function setup() {
  const prisma = {
    companyBranding: {
      findUnique: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
  };
  const storage = {
    isConfigured: jest.fn().mockReturnValue(true),
    putObject: jest.fn().mockResolvedValue(undefined),
    deleteObject: jest.fn().mockResolvedValue(undefined),
    getDownloadUrl: jest
      .fn()
      .mockResolvedValue('https://objects.example.com/signed-logo'),
  };
  return {
    prisma,
    service: new BrandingService(prisma as never, storage as never),
    storage,
  };
}

function uploadFile(overrides: Record<string, unknown> = {}) {
  return {
    buffer: png,
    mimetype: 'image/png',
    originalname: 'company.png',
    size: png.length,
    ...overrides,
  } as never;
}

describe('BrandingService', () => {
  it('returns a neutral ERP fallback when the database has no branding row', async () => {
    const { prisma, service } = setup();
    prisma.companyBranding.findUnique.mockResolvedValue(null);

    await expect(service.getBranding()).resolves.toEqual({
      displayName: 'ERP',
      shortName: null,
      logoUrl: null,
      logoMimeType: null,
      hasLogo: false,
      version: 0,
    });
  });

  it('resolves different branding from isolated database clients', async () => {
    const first = setup();
    const second = setup();
    first.prisma.companyBranding.findUnique.mockResolvedValue(
      row({ displayName: 'North Branch' }),
    );
    second.prisma.companyBranding.findUnique.mockResolvedValue(
      row({ displayName: 'Coastal Supply' }),
    );

    const [firstBranding, secondBranding] = await Promise.all([
      first.service.getBranding(),
      second.service.getBranding(),
    ]);

    expect(firstBranding.displayName).toBe('North Branch');
    expect(secondBranding.displayName).toBe('Coastal Supply');
    expect(first.prisma.companyBranding.findUnique).toHaveBeenCalledWith({
      where: { id: 1 },
    });
    expect(second.prisma.companyBranding.findUnique).toHaveBeenCalledWith({
      where: { id: 1 },
    });
  });

  it('trims and saves the required display name with an optimistic version', async () => {
    const { prisma, service } = setup();
    prisma.companyBranding.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(
        row({
          displayName: 'North Supply',
          shortName: 'North',
          version: 1,
        }),
      );
    prisma.companyBranding.create.mockResolvedValue(
      row({ displayName: 'North Supply', shortName: 'North', version: 1 }),
    );

    await expect(
      service.updateBranding(
        { displayName: '  North Supply  ', shortName: '  North  ', version: 0 },
        admin,
      ),
    ).resolves.toMatchObject({
      displayName: 'North Supply',
      shortName: 'North',
      version: 1,
    });
    expect(prisma.companyBranding.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: 1,
        displayName: 'North Supply',
        shortName: 'North',
        updatedByUserId: 'admin-1',
        version: 1,
      }),
    });
  });

  it('rejects stale updates rather than overwriting a newer version', async () => {
    const { prisma, service } = setup();
    prisma.companyBranding.findUnique.mockResolvedValue(row({ version: 3 }));
    prisma.companyBranding.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.updateBranding(
        { displayName: 'Changed name', version: 2 },
        admin,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects upload content whose MIME or extension does not match its signature', async () => {
    const { prisma, service, storage } = setup();
    prisma.companyBranding.findUnique.mockResolvedValue(null);

    await expect(
      service.uploadLogo(
        uploadFile({ mimetype: 'image/jpeg' }),
        0,
        admin,
      ),
    ).rejects.toThrow(/PNG, JPEG, or WebP/i);
    await expect(
      service.uploadLogo(uploadFile({ originalname: 'company.svg' }), 0, admin),
    ).rejects.toThrow(/PNG, JPEG, or WebP/i);
    await expect(
      service.uploadLogo(
        uploadFile({ buffer: Buffer.from('not an image') }),
        0,
        admin,
      ),
    ).rejects.toThrow(/PNG, JPEG, or WebP/i);
    expect(storage.putObject).not.toHaveBeenCalled();
  });

  it('rejects oversized logos before calling Object Storage', async () => {
    const { service, storage } = setup();

    await expect(
      service.uploadLogo(
        uploadFile({
          buffer: Buffer.alloc(MAX_BRANDING_LOGO_BYTES + 1),
          size: MAX_BRANDING_LOGO_BYTES + 1,
        }),
        0,
        admin,
      ),
    ).rejects.toThrow(/5 MB/i);
    expect(storage.putObject).not.toHaveBeenCalled();
  });

  it('uploads before switching the singleton and cleans up the prior key afterward', async () => {
    const { prisma, service, storage } = setup();
    const previous = row({
      displayName: 'North Supply',
      logoObjectKey: 'branding/logo/old.png',
      logoMimeType: 'image/png',
      version: 4,
    });
    const next = row({
      displayName: 'North Supply',
      logoObjectKey: 'branding/logo/new.png',
      logoMimeType: 'image/png',
      version: 5,
    });
    prisma.companyBranding.findUnique
      .mockResolvedValueOnce(previous)
      .mockResolvedValueOnce(next);
    prisma.companyBranding.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.uploadLogo(uploadFile(), 4, admin);

    expect(storage.putObject).toHaveBeenCalledWith(
      expect.objectContaining({
        key: expect.stringMatching(/^branding\/logo\/[0-9a-f-]+\.png$/),
        body: png,
        contentType: 'image/png',
      }),
    );
    expect(prisma.companyBranding.updateMany).toHaveBeenCalledWith({
      where: { id: 1, version: 4 },
      data: expect.objectContaining({
        logoObjectKey: expect.stringMatching(/^branding\/logo\//),
        logoMimeType: 'image/png',
        version: { increment: 1 },
        updatedByUserId: 'admin-1',
      }),
    });
    expect(storage.deleteObject).toHaveBeenCalledWith(
      'branding/logo/old.png',
    );
    expect(result).toMatchObject({ hasLogo: true, version: 5 });
    expect(result).not.toHaveProperty('logoObjectKey');
  });

  it('does not break an active brand when cleanup of the old logo fails', async () => {
    const { prisma, service, storage } = setup();
    const previous = row({ logoObjectKey: 'branding/logo/old.png', version: 1 });
    const next = row({
      logoObjectKey: 'branding/logo/new.png',
      logoMimeType: 'image/png',
      version: 2,
    });
    prisma.companyBranding.findUnique
      .mockResolvedValueOnce(previous)
      .mockResolvedValueOnce(next);
    prisma.companyBranding.updateMany.mockResolvedValue({ count: 1 });
    storage.deleteObject.mockRejectedValue(new Error('storage unavailable'));

    await expect(service.uploadLogo(uploadFile(), 1, admin)).resolves.toMatchObject({
      hasLogo: true,
      version: 2,
    });
  });

  it('preserves an uploaded logo when the database commit succeeded but its readback failed', async () => {
    const { prisma, service, storage } = setup();
    const previous = row({ logoObjectKey: 'branding/logo/old.png', version: 4 });
    const next = row({
      logoMimeType: 'image/png',
      version: 5,
    });
    storage.putObject.mockImplementation(({ key }: { key: string }) => {
      next.logoObjectKey = key;
      return Promise.resolve();
    });
    prisma.companyBranding.findUnique
      .mockResolvedValueOnce(previous)
      .mockRejectedValueOnce(new Error('temporary read failure'))
      .mockResolvedValueOnce(next);
    prisma.companyBranding.updateMany.mockResolvedValue({ count: 1 });

    await expect(service.uploadLogo(uploadFile(), 4, admin)).rejects.toThrow(
      'temporary read failure',
    );

    expect(storage.putObject).toHaveBeenCalledTimes(1);
    expect(storage.deleteObject).not.toHaveBeenCalledWith(
      expect.stringMatching(/^branding\/logo\/[0-9a-f-]+\.png$/),
    );
  });

  it('removes the logo reference before best-effort object cleanup', async () => {
    const { prisma, service, storage } = setup();
    const previous = row({ logoObjectKey: 'branding/logo/old.png', version: 2 });
    const next = row({ version: 3 });
    prisma.companyBranding.findUnique
      .mockResolvedValueOnce(previous)
      .mockResolvedValueOnce(next);
    prisma.companyBranding.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.removeLogo(2, admin);

    expect(prisma.companyBranding.updateMany).toHaveBeenCalledWith({
      where: { id: 1, version: 2 },
      data: {
        logoObjectKey: null,
        logoMimeType: null,
        version: { increment: 1 },
        updatedByUserId: 'admin-1',
      },
    });
    expect(storage.deleteObject).toHaveBeenCalledWith('branding/logo/old.png');
    expect(result).toMatchObject({ hasLogo: false, logoUrl: null, version: 3 });
  });
});

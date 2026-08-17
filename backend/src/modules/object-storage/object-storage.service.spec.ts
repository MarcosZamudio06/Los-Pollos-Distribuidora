import { S3Client } from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';
import { ObjectStorageService } from './object-storage.service';

function createConfig(overrides: Record<string, unknown> = {}) {
  return new ConfigService({
    OBJECT_STORAGE_BUCKET: 'delivery-evidence',
    OBJECT_STORAGE_REGION: 'us-east-1',
    OBJECT_STORAGE_ENDPOINT: 'https://objects.example.com',
    OBJECT_STORAGE_PUBLIC_ENDPOINT: 'https://public-objects.example.com',
    OBJECT_STORAGE_ACCESS_KEY_ID: 'access-key',
    OBJECT_STORAGE_SECRET_ACCESS_KEY: 'secret-key',
    OBJECT_STORAGE_FORCE_PATH_STYLE: true,
    OBJECT_STORAGE_SIGNED_URL_TTL_SECONDS: 300,
    ...overrides,
  });
}

describe('ObjectStorageService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('reports when the production storage bucket is not configured', async () => {
    const service = new ObjectStorageService(
      createConfig({ OBJECT_STORAGE_BUCKET: '' }),
    );

    expect(service.isConfigured()).toBe(false);
    await expect(
      service.putObject({
        key: 'evidence/order/photo.jpg',
        body: Buffer.from('photo'),
        contentType: 'image/jpeg',
      }),
    ).rejects.toThrow('OBJECT_STORAGE_BUCKET is required');
  });

  it('uploads and deletes evidence through the S3-compatible client', async () => {
    const send = jest
      .spyOn(S3Client.prototype, 'send')
      .mockResolvedValue({} as never);
    const service = new ObjectStorageService(createConfig());

    await service.putObject({
      key: 'evidence/order/photo.jpg',
      body: Buffer.from('photo'),
      contentType: 'image/jpeg',
      checksumSha256: 'c2hhMjU2',
    });
    await service.deleteObject('evidence/order/photo.jpg');

    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0][0].input).toEqual(
      expect.objectContaining({
        Bucket: 'delivery-evidence',
        Key: 'evidence/order/photo.jpg',
        ContentType: 'image/jpeg',
        ChecksumSHA256: 'c2hhMjU2',
      }),
    );
    expect(send.mock.calls[1][0].input).toEqual(
      expect.objectContaining({
        Bucket: 'delivery-evidence',
        Key: 'evidence/order/photo.jpg',
      }),
    );
  });

  it('creates a short-lived signed read URL for private evidence', async () => {
    const service = new ObjectStorageService(createConfig());

    await expect(
      service.getDownloadUrl('evidence/order/photo.jpg'),
    ).resolves.toContain('public-objects.example.com');
  });
});

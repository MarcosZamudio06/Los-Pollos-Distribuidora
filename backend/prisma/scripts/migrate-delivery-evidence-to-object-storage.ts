import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { ObjectStorageService } from '../../src/modules/object-storage/object-storage.service';
import { buildDeliveryEvidenceStorageKey } from '../../src/modules/delivery/delivery-evidence-storage';
import { parseDeliveryPhotoDataUrl } from '../../src/modules/delivery/delivery-evidence.validation';

function createObjectStorage() {
  return new ObjectStorageService(
    new ConfigService({
      OBJECT_STORAGE_BUCKET: process.env.OBJECT_STORAGE_BUCKET,
      OBJECT_STORAGE_REGION: process.env.OBJECT_STORAGE_REGION,
      OBJECT_STORAGE_ENDPOINT: process.env.OBJECT_STORAGE_ENDPOINT,
      OBJECT_STORAGE_ACCESS_KEY_ID: process.env.OBJECT_STORAGE_ACCESS_KEY_ID,
      OBJECT_STORAGE_SECRET_ACCESS_KEY:
        process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY,
      OBJECT_STORAGE_FORCE_PATH_STYLE:
        process.env.OBJECT_STORAGE_FORCE_PATH_STYLE === 'true',
      OBJECT_STORAGE_SIGNED_URL_TTL_SECONDS: Number(
        process.env.OBJECT_STORAGE_SIGNED_URL_TTL_SECONDS ?? 300,
      ),
    }),
  );
}

async function main() {
  const prisma = new PrismaClient();
  const storage = createObjectStorage();

  if (!storage.isConfigured()) {
    throw new Error(
      'OBJECT_STORAGE_BUCKET is required to migrate delivery evidence',
    );
  }

  let migrated = 0;
  let invalid = 0;
  let failed = 0;
  let alreadyMigrated = 0;
  let scanned = 0;

  try {
    const legacyEvidence = await prisma.deliveryEvidence.findMany({
      where: {
        type: 'PHOTO',
        storageKey: null,
        value: { not: null },
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        deliveryOrderId: true,
        value: true,
        capturedAt: true,
        mimeType: true,
        sha256: true,
        sizeBytes: true,
        metadata: true,
      },
    });
    scanned = legacyEvidence.length;

    for (const evidence of legacyEvidence) {
      if (!evidence.value) continue;

      let photo;
      try {
        photo = parseDeliveryPhotoDataUrl(evidence.value);
      } catch (error: unknown) {
        invalid += 1;
        console.error(
          `Invalid legacy delivery evidence ${evidence.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
        continue;
      }

      const storageKey = buildDeliveryEvidenceStorageKey({
        deliveryOrderId: evidence.deliveryOrderId,
        capturedAt: evidence.capturedAt,
        mimeType: photo.mimeType,
        evidenceId: evidence.id,
      });

      try {
        await storage.putObject({
          key: storageKey,
          body: photo.content,
          contentType: photo.mimeType,
          checksumSha256: Buffer.from(photo.sha256, 'hex').toString('base64'),
        });

        const updated = await prisma.deliveryEvidence.updateMany({
          where: {
            id: evidence.id,
            storageKey: null,
            value: evidence.value,
          },
          data: {
            value: null,
            storageKey,
            mimeType: evidence.mimeType ?? photo.mimeType,
            sha256: evidence.sha256 ?? photo.sha256,
            sizeBytes: evidence.sizeBytes ?? photo.sizeBytes,
            metadata: evidence.metadata ?? photo.metadata,
          },
        });

        if (updated.count === 1) migrated += 1;
        else alreadyMigrated += 1;
      } catch (error: unknown) {
        failed += 1;
        console.error(
          `Failed to migrate delivery evidence ${evidence.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  } finally {
    await prisma.$disconnect();
  }

  console.log(
    JSON.stringify({
      scanned,
      migrated,
      alreadyMigrated,
      invalid,
      failed,
    }),
  );

  if (invalid > 0 || failed > 0) process.exitCode = 1;
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

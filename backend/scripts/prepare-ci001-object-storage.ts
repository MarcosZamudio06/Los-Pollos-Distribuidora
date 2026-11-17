import {
  CreateBucketCommand,
  HeadBucketCommand,
  S3Client,
} from '@aws-sdk/client-s3';

/** CI-only prerequisite. Never discover credentials or connect to a remote store. */
async function prepare() {
  const endpoint = new URL(process.env.OBJECT_STORAGE_ENDPOINT ?? '');
  const bucket = process.env.OBJECT_STORAGE_BUCKET;
  const accessKeyId = process.env.OBJECT_STORAGE_ACCESS_KEY_ID;
  const secretAccessKey = process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY;
  if (
    process.env.E2E_DATABASE_DISPOSABLE !== 'true' ||
    endpoint.protocol !== 'http:' ||
    endpoint.hostname !== '127.0.0.1' ||
    !endpoint.port ||
    endpoint.username ||
    endpoint.password ||
    endpoint.pathname !== '/' ||
    endpoint.search ||
    endpoint.hash ||
    bucket !== 'security-evidence' ||
    accessKeyId !== 'ci001-database-disposable' ||
    secretAccessKey !== 'ci001-disposable-secret-for-tests-only'
  ) {
    throw new Error(
      'CI001 requires its own loopback storage and synthetic credentials',
    );
  }
  const client = new S3Client({
    endpoint: endpoint.href,
    region: 'us-east-1',
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
    maxAttempts: 1,
  });
  try {
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
    console.info(
      'CI001 disposable security-evidence bucket authenticated and ready',
    );
  } finally {
    client.destroy();
  }
}

void prepare().catch(() => {
  // Avoid logging SDK diagnostics or credential-bearing environment values.
  console.error('CI001 disposable Object Storage preparation failed');
  process.exitCode = 1;
});

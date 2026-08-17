import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  ObjectStoragePort,
  ObjectStoragePutInput,
} from './object-storage.port';

const DEFAULT_OBJECT_STORAGE_REGION = 'us-east-1';
const DEFAULT_SIGNED_URL_TTL_SECONDS = 300;

@Injectable()
export class ObjectStorageService implements ObjectStoragePort {
  private readonly bucket: string;
  private readonly signedUrlTtlSeconds: number;
  private readonly client: S3Client;
  private readonly publicClient: S3Client;

  constructor(config: ConfigService) {
    this.bucket = config.get<string>('OBJECT_STORAGE_BUCKET')?.trim() ?? '';
    this.signedUrlTtlSeconds =
      config.get<number>('OBJECT_STORAGE_SIGNED_URL_TTL_SECONDS') ??
      DEFAULT_SIGNED_URL_TTL_SECONDS;

    const region =
      config.get<string>('OBJECT_STORAGE_REGION')?.trim() ||
      DEFAULT_OBJECT_STORAGE_REGION;
    const endpoint = config.get<string>('OBJECT_STORAGE_ENDPOINT')?.trim();
    const publicEndpoint = config
      .get<string>('OBJECT_STORAGE_PUBLIC_ENDPOINT')
      ?.trim();

    const accessKeyId = config
      .get<string>('OBJECT_STORAGE_ACCESS_KEY_ID')
      ?.trim();
    const secretAccessKey = config
      .get<string>('OBJECT_STORAGE_SECRET_ACCESS_KEY')
      ?.trim();
    const forcePathStyle =
      config.get<boolean>('OBJECT_STORAGE_FORCE_PATH_STYLE') ?? false;

    const credentials =
      accessKeyId && secretAccessKey
        ? { credentials: { accessKeyId, secretAccessKey } }
        : {};

    this.client = new S3Client({
      region,
      ...(endpoint ? { endpoint } : {}),
      forcePathStyle,
      ...credentials,
    });

    this.publicClient = new S3Client({
      region,
      ...(publicEndpoint
        ? { endpoint: publicEndpoint }
        : endpoint
          ? { endpoint }
          : {}),
      forcePathStyle,
      ...credentials,
    });
  }

  isConfigured() {
    return Boolean(this.bucket);
  }

  async putObject(input: ObjectStoragePutInput) {
    this.assertConfigured();
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: input.key,
        Body: input.body,
        ContentType: input.contentType,
        ...(input.checksumSha256
          ? { ChecksumSHA256: input.checksumSha256 }
          : {}),
      }),
    );
  }

  async deleteObject(key: string) {
    this.assertConfigured();
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }

  async getDownloadUrl(
    key: string,
    expiresInSeconds = this.signedUrlTtlSeconds,
  ) {
    this.assertConfigured();
    return getSignedUrl(
      this.publicClient,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: expiresInSeconds },
    );
  }

  private assertConfigured() {
    if (!this.isConfigured()) {
      throw new Error(
        'Object Storage is not configured: OBJECT_STORAGE_BUCKET is required',
      );
    }
  }
}

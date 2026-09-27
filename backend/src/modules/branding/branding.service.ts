import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { CompanyBranding } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { OBJECT_STORAGE } from '../object-storage/object-storage.port';
import type { ObjectStoragePort } from '../object-storage/object-storage.port';

export const COMPANY_BRANDING_ID = 1;
export const MAX_BRANDING_LOGO_BYTES = 5 * 1024 * 1024;
export const BRANDING_LOGO_URL_TTL_SECONDS = 300;
export const DEFAULT_BRANDING_NAME = 'ERP';

type BrandingActor = { id: string };
type BrandingUpdateInput = {
  displayName: string;
  shortName?: string | null;
  version: number;
};
export type UploadedBrandingLogo = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
};
type LogoMimeType = 'image/jpeg' | 'image/png' | 'image/webp';
type ValidatedLogo = { extension: string; mimeType: LogoMimeType };

const EXTENSION_MIME_TYPES: Record<string, LogoMimeType> = {
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

@Injectable()
export class BrandingService {
  private readonly logger = new Logger(BrandingService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(OBJECT_STORAGE)
    private readonly objectStorage: ObjectStoragePort,
  ) {}

  async getBranding() {
    const branding = await this.findSingleton();
    return branding ? this.toPublicResponse(branding) : this.defaultResponse();
  }

  async updateBranding(input: BrandingUpdateInput, actor: BrandingActor) {
    const displayName = this.normalizeDisplayName(input.displayName);
    const shortName = this.normalizeShortName(input.shortName);
    this.assertVersion(input.version);

    const current = await this.findSingleton();
    if (!current) {
      if (input.version !== 0) {
        throw this.versionConflict();
      }

      try {
        const created = await this.prisma.companyBranding.create({
          data: {
            id: COMPANY_BRANDING_ID,
            displayName,
            shortName,
            version: 1,
            updatedByUserId: actor.id,
          },
        });
        return this.toPublicResponse(created);
      } catch (error) {
        if (this.isUniqueConstraintError(error)) {
          throw this.versionConflict();
        }
        throw error;
      }
    }

    if (current.version !== input.version) {
      throw this.versionConflict();
    }

    const updated = await this.prisma.companyBranding.updateMany({
      where: { id: COMPANY_BRANDING_ID, version: input.version },
      data: {
        displayName,
        shortName,
        version: { increment: 1 },
        updatedByUserId: actor.id,
      },
    });
    if (updated.count !== 1) {
      throw this.versionConflict();
    }

    const saved = await this.findSingleton();
    if (!saved) {
      throw new ConflictException('Branding changed while it was being saved.');
    }
    return this.toPublicResponse(saved);
  }

  async uploadLogo(
    file: UploadedBrandingLogo | undefined,
    expectedVersion: number,
    actor: BrandingActor,
  ) {
    this.assertVersion(expectedVersion);
    if (!file) {
      throw new BadRequestException('A logo file is required.');
    }
    const validatedLogo = this.validateLogo(file);
    if (!this.objectStorage.isConfigured()) {
      throw new ServiceUnavailableException('Logo storage is not configured.');
    }

    const current = await this.findSingleton();
    this.assertCurrentVersion(current, expectedVersion);

    const objectKey =
      'branding/logo/' +
      randomUUID() +
      '.' +
      validatedLogo.extension;
    await this.objectStorage.putObject({
      key: objectKey,
      body: file.buffer,
      contentType: validatedLogo.mimeType,
    });

    let saved!: NonNullable<typeof current>;
    try {
      if (!current) {
        try {
          saved = await this.prisma.companyBranding.create({
            data: {
              id: COMPANY_BRANDING_ID,
              displayName: DEFAULT_BRANDING_NAME,
              logoObjectKey: objectKey,
              logoMimeType: validatedLogo.mimeType,
              version: 1,
              updatedByUserId: actor.id,
            },
          });
        } catch (error) {
          if (this.isUniqueConstraintError(error)) {
            throw this.versionConflict();
          }
          throw error;
        }
      } else {
        const updated = await this.prisma.companyBranding.updateMany({
          where: {
            id: COMPANY_BRANDING_ID,
            version: expectedVersion,
          },
          data: {
            logoObjectKey: objectKey,
            logoMimeType: validatedLogo.mimeType,
            version: { increment: 1 },
            updatedByUserId: actor.id,
          },
        });
        if (updated.count !== 1) {
          throw this.versionConflict();
        }
        const found = await this.findSingleton();
        if (!found) {
          throw new ConflictException(
            'Branding changed while the logo was being saved.',
          );
        }
        saved = found;
      }
    } catch (error) {
      await this.deleteUploadedObjectIfUnreferenced(objectKey);
      throw error;
    }

    if (current?.logoObjectKey) {
      await this.deleteObjectBestEffort(current.logoObjectKey);
    }
    return this.toPublicResponse(saved);
  }

  async removeLogo(expectedVersion: number, actor: BrandingActor) {
    this.assertVersion(expectedVersion);
    const current = await this.findSingleton();
    this.assertCurrentVersion(current, expectedVersion);

    if (!current) {
      return this.defaultResponse();
    }
    if (!current.logoObjectKey) {
      return this.toPublicResponse(current);
    }

    const updated = await this.prisma.companyBranding.updateMany({
      where: {
        id: COMPANY_BRANDING_ID,
        version: expectedVersion,
      },
      data: {
        logoObjectKey: null,
        logoMimeType: null,
        version: { increment: 1 },
        updatedByUserId: actor.id,
      },
    });
    if (updated.count !== 1) {
      throw this.versionConflict();
    }

    const saved = await this.findSingleton();
    if (!saved) {
      throw new ConflictException(
        'Branding changed while the logo was removed.',
      );
    }
    await this.deleteObjectBestEffort(current.logoObjectKey);
    return this.toPublicResponse(saved);
  }

  private async findSingleton(): Promise<CompanyBranding | null> {
    return this.prisma.companyBranding.findUnique({
      where: { id: COMPANY_BRANDING_ID },
    });
  }

  private async toPublicResponse(branding: CompanyBranding) {
    let logoUrl: string | null = null;
    if (branding.logoObjectKey && this.objectStorage.isConfigured()) {
      try {
        logoUrl = await this.objectStorage.getDownloadUrl(
          branding.logoObjectKey,
          BRANDING_LOGO_URL_TTL_SECONDS,
        );
      } catch {
        this.logger.warn('Could not issue a signed branding logo URL.');
      }
    }

    return {
      displayName: branding.displayName,
      shortName: branding.shortName,
      logoUrl,
      logoMimeType: branding.logoMimeType,
      hasLogo: Boolean(branding.logoObjectKey),
      version: branding.version,
    };
  }

  private defaultResponse() {
    return {
      displayName: DEFAULT_BRANDING_NAME,
      shortName: null,
      logoUrl: null,
      logoMimeType: null,
      hasLogo: false,
      version: 0,
    };
  }

  private normalizeDisplayName(value: string) {
    const displayName = typeof value === 'string' ? value.trim() : '';
    if (!displayName || displayName.length > 80) {
      throw new BadRequestException(
        'Display name must contain 1 to 80 characters.',
      );
    }
    return displayName;
  }

  private normalizeShortName(value?: string | null) {
    if (typeof value !== 'string') {
      return null;
    }
    const shortName = value.trim();
    if (shortName.length > 32) {
      throw new BadRequestException(
        'Short name must contain at most 32 characters.',
      );
    }
    return shortName || null;
  }

  private validateLogo(file: UploadedBrandingLogo): ValidatedLogo {
    if (!file.buffer?.length) {
      throw new BadRequestException('A logo file is required.');
    }
    if (file.buffer.length > MAX_BRANDING_LOGO_BYTES) {
      throw new BadRequestException('Logo must be 5 MB or smaller.');
    }

    const actualMimeType = this.detectMimeType(file.buffer);
    const extension = extname(file.originalname).toLowerCase();
    if (
      !actualMimeType ||
      file.mimetype !== actualMimeType ||
      EXTENSION_MIME_TYPES[extension] !== actualMimeType
    ) {
      throw new BadRequestException(
        'Logo must be a matching PNG, JPEG, or WebP image.',
      );
    }

    return {
      extension: actualMimeType === 'image/jpeg' ? 'jpg' : extension.slice(1),
      mimeType: actualMimeType,
    };
  }

  private detectMimeType(buffer: Buffer): LogoMimeType | null {
    const pngSignature = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    if (
      buffer.length >= pngSignature.length &&
      buffer.subarray(0, pngSignature.length).equals(pngSignature)
    ) {
      return 'image/png';
    }
    if (
      buffer.length >= 3 &&
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff
    ) {
      return 'image/jpeg';
    }
    if (
      buffer.length >= 12 &&
      buffer.toString('ascii', 0, 4) === 'RIFF' &&
      buffer.toString('ascii', 8, 12) === 'WEBP'
    ) {
      return 'image/webp';
    }
    return null;
  }

  private assertCurrentVersion(
    current: CompanyBranding | null,
    expectedVersion: number,
  ) {
    if ((current?.version ?? 0) !== expectedVersion) {
      throw this.versionConflict();
    }
  }

  private assertVersion(version: number) {
    if (!Number.isInteger(version) || version < 0) {
      throw new BadRequestException(
        'Branding version must be a non-negative integer.',
      );
    }
  }

  private versionConflict() {
    return new ConflictException(
      'Branding changed. Reload it before saving again.',
    );
  }

  private isUniqueConstraintError(error: unknown) {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    );
  }

  private async deleteObjectBestEffort(key: string) {
    if (!this.objectStorage.isConfigured()) {
      return;
    }
    try {
      await this.objectStorage.deleteObject(key);
    } catch {
      this.logger.warn(
        'Branding logo cleanup failed; saved branding is unchanged.',
      );
    }
  }

  private async deleteUploadedObjectIfUnreferenced(key: string) {
    try {
      const current = await this.findSingleton();
      if (current?.logoObjectKey === key) {
        return;
      }
      await this.deleteObjectBestEffort(key);
    } catch {
      this.logger.warn(
        'Could not verify branding logo cleanup; preserving the uploaded object.',
      );
    }
  }
}

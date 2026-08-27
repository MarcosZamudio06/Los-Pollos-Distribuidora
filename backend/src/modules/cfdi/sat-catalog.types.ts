import type { Prisma } from '@prisma/client';
import type { SatCatalogKey } from '../../../../shared/sat-catalogs';

export type SatCatalogImportEntry = {
  code: string;
  description: string;
  validFrom?: Date | string | null;
  validTo?: Date | string | null;
  metadata?: Prisma.InputJsonValue | null;
};

export type NormalizedSatCatalogImportEntry = {
  code: string;
  description: string;
  validFrom: Date | null;
  validTo: Date | null;
  metadata: Prisma.InputJsonValue | null;
};

export type SatCatalogVersionSummary = {
  id: string;
  catalogKey: SatCatalogKey;
  sourceVersion: string;
  status: string;
  checksumSha256: string;
  rowCount: number;
  stagedAt: Date;
  validatedAt: Date | null;
  activatedAt: Date | null;
  retiredAt: Date | null;
};

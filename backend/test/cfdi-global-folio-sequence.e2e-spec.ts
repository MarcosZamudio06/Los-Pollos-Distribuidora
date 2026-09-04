import { CfdiDocumentType, PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';

import { assertDisposableE2eEnvironment } from './e2e-environment';

describe('global CFDI folio sequence (e2e)', () => {
  const runId = randomUUID().replaceAll('-', '').toUpperCase();
  const taxId = `FOL010101${runId.slice(0, 3)}`;
  const series = 'A';
  let firstClient: PrismaClient;
  let secondClient: PrismaClient;
  let legalEntityId: string;

  beforeAll(async () => {
    assertDisposableE2eEnvironment();
    firstClient = new PrismaClient();
    secondClient = new PrismaClient();
    await Promise.all([firstClient.$connect(), secondClient.$connect()]);

    const legalEntity = await firstClient.legalEntity.create({
      data: {
        legalName: `Global folio fixture ${runId}`,
        taxId,
        fiscalPostalCode: '64000',
        fiscalRegime: '601',
        cfdiEnabled: true,
        defaultSeries: series,
        certificateSerialNumber: `FOL-${runId}`,
        certificateFingerprint: runId.padEnd(64, '0').slice(0, 64),
        certificateValidFrom: new Date('2026-01-01T00:00:00.000Z'),
        certificateValidTo: new Date('2030-01-01T00:00:00.000Z'),
      },
      select: { id: true },
    });
    legalEntityId = legalEntity.id;
  });

  afterAll(async () => {
    await Promise.all([firstClient.$disconnect(), secondClient.$disconnect()]);
  });

  async function reserveFolio(client: PrismaClient): Promise<string> {
    const sequence = await client.fiscalFolioSequence.upsert({
      where: { legalEntityId_series: { legalEntityId, series } },
      update: { nextValue: { increment: 1 } },
      create: { legalEntityId, series, nextValue: 2 },
      select: { nextValue: true },
    });

    return (sequence.nextValue - 1n).toString();
  }

  it('advances one shared series across INCOME, PAYMENT_RECEIPT and EXPENSE', async () => {
    const allocations = [] as Array<{
      type: CfdiDocumentType;
      folio: string;
    }>;

    for (const type of [
      CfdiDocumentType.INCOME,
      CfdiDocumentType.PAYMENT_RECEIPT,
      CfdiDocumentType.EXPENSE,
    ]) {
      allocations.push({ type, folio: await reserveFolio(firstClient) });
    }

    expect(allocations).toEqual([
      { type: CfdiDocumentType.INCOME, folio: '1' },
      { type: CfdiDocumentType.PAYMENT_RECEIPT, folio: '2' },
      { type: CfdiDocumentType.EXPENSE, folio: '3' },
    ]);
    expect(
      await firstClient.fiscalFolioSequence.count({
        where: { legalEntityId, series },
      }),
    ).toBe(1);
  });

  it('allocates different folios without losing a concurrent increment', async () => {
    const concurrentFolios = await Promise.all([
      reserveFolio(firstClient),
      reserveFolio(secondClient),
    ]);

    expect(concurrentFolios.sort()).toEqual(['4', '5']);
    await expect(
      firstClient.fiscalFolioSequence.findUniqueOrThrow({
        where: { legalEntityId_series: { legalEntityId, series } },
        select: { nextValue: true },
      }),
    ).resolves.toEqual({ nextValue: 6n });
  });
});

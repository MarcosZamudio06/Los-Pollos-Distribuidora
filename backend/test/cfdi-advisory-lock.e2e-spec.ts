import { PrismaClient } from '@prisma/client';

import { assertDisposableE2eEnvironment } from './e2e-environment';

describe('CFDI reconciliation advisory locks (e2e)', () => {
  let firstClient: PrismaClient;
  let secondClient: PrismaClient;

  beforeAll(async () => {
    assertDisposableE2eEnvironment();
    firstClient = new PrismaClient();
    secondClient = new PrismaClient();
    await Promise.all([firstClient.$connect(), secondClient.$connect()]);
  });

  afterAll(async () => {
    await Promise.all([firstClient.$disconnect(), secondClient.$disconnect()]);
  });

  it.each([71823043, 71823044])(
    'allows only one transaction to own fiscal job lock %i',
    async (lockKey) => {
      let announceOwner!: () => void;
      let releaseOwner!: () => void;
      const ownerReady = new Promise<void>((resolve) => {
        announceOwner = resolve;
      });
      const ownerRelease = new Promise<void>((resolve) => {
        releaseOwner = resolve;
      });

      const owner = firstClient.$transaction(async (transaction) => {
        const [result] = await transaction.$queryRaw<
          Array<{ acquired: boolean }>
        >`SELECT pg_try_advisory_xact_lock(${lockKey}) AS acquired`;
        expect(result.acquired).toBe(true);
        announceOwner();
        await ownerRelease;
      });

      await ownerReady;
      const [contender] = await secondClient.$queryRaw<
        Array<{ acquired: boolean }>
      >`SELECT pg_try_advisory_xact_lock(${lockKey}) AS acquired`;
      expect(contender.acquired).toBe(false);

      releaseOwner();
      await owner;

      const [afterCommit] = await secondClient.$queryRaw<
        Array<{ acquired: boolean }>
      >`SELECT pg_try_advisory_xact_lock(${lockKey}) AS acquired`;
      expect(afterCommit.acquired).toBe(true);
    },
  );
});

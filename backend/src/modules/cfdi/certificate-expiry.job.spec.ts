import { CertificateExpiryJob } from './certificate-expiry.job';

const NOW = new Date('2026-08-25T12:00:00.000Z');

function harness() {
  const tx = {
    $queryRawUnsafe: jest.fn().mockResolvedValue([{ acquired: true }]),
    legalEntity: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
  const prisma = {
    $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
      callback(tx),
    ),
  };
  const events = { emit: jest.fn() };
  const job = new CertificateExpiryJob(prisma as never, events as never);
  return { job, prisma, tx, events };
}

describe('CertificateExpiryJob', () => {
  it('skips when another ERP instance owns the PostgreSQL advisory lock', async () => {
    const { job, tx, events } = harness();
    tx.$queryRawUnsafe.mockResolvedValue([{ acquired: false }]);

    await expect(job.check(NOW)).resolves.toEqual({
      skipped: true,
      checked: 0,
      expiring: 0,
      expired: 0,
    });
    expect(tx.legalEntity.findMany).not.toHaveBeenCalled();
    expect(events.emit).toHaveBeenCalledWith(
      'cfdi.certificate.expiry.completed',
      expect.objectContaining({ skipped: true }),
    );
  });

  it('reports enabled issuers with expired or soon-to-expire CSD metadata', async () => {
    const { job, tx, events } = harness();
    tx.legalEntity.findMany.mockResolvedValue([
      {
        id: 'expired-entity',
        certificateValidTo: new Date('2026-08-24T12:00:00.000Z'),
      },
      {
        id: 'expiring-entity',
        certificateValidTo: new Date('2026-09-04T12:00:00.000Z'),
      },
      {
        id: 'valid-entity',
        certificateValidTo: new Date('2027-08-25T12:00:00.000Z'),
      },
    ]);

    await expect(job.check(NOW)).resolves.toEqual({
      skipped: false,
      checked: 3,
      expiring: 1,
      expired: 1,
    });
    expect(events.emit).toHaveBeenCalledWith(
      'cfdi.certificate.expiry.expired',
      expect.objectContaining({ legalEntityId: 'expired-entity' }),
    );
    expect(events.emit).toHaveBeenCalledWith(
      'cfdi.certificate.expiry.expiring',
      expect.objectContaining({
        legalEntityId: 'expiring-entity',
        daysRemaining: 10,
      }),
    );
  });
});

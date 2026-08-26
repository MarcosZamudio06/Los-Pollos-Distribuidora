import { BadRequestException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { RepIssuanceController } from './rep-issuance.controller';

describe('RepIssuanceController', () => {
  it('installs authentication and role guards so ADMIN/BILLING metadata is enforced', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, RepIssuanceController)).toEqual(
      expect.arrayContaining([JwtAuthGuard, RolesGuard]),
    );
  });

  it('requires Idempotency-Key and forwards expectedVersion to the service', async () => {
    const service = { issue: jest.fn().mockResolvedValue({ uuid: null }) };
    const controller = new RepIssuanceController(service as never);
    const user = { id: 'billing-1', role: 'BILLING' } as never;

    await expect(
      controller.issue('payment-1', { expectedVersion: 4 }, user),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      controller.issue('payment-1', { expectedVersion: 4 }, user, 'rep-key'),
    ).resolves.toMatchObject({ success: true });
    expect(service.issue).toHaveBeenCalledWith(
      'payment-1',
      { expectedVersion: 4 },
      user,
      'rep-key',
    );
  });
});

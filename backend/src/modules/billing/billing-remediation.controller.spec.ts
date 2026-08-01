import { BadRequestException } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { BillingRemediationController } from './billing-remediation.controller';

function methodOf(target: object, key: string): object {
  return Object.getOwnPropertyDescriptor(target, key)?.value as object;
}

describe('BillingRemediationController', () => {
  const service = { resolve: jest.fn().mockResolvedValue({ id: 'rem-1' }) };
  const controller = new BillingRemediationController(service as never);

  it('exposes the remediation inbox with explicit backend roles', () => {
    expect(
      Reflect.getMetadata(PATH_METADATA, BillingRemediationController),
    ).toBe('billing/remediations');
    expect(
      Reflect.getMetadata(
        ROLES_KEY,
        methodOf(BillingRemediationController.prototype, 'list'),
      ),
    ).toEqual(['ADMIN', 'BILLING']);
    expect(
      Reflect.getMetadata(
        ROLES_KEY,
        methodOf(BillingRemediationController.prototype, 'resolve'),
      ),
    ).toEqual(['ADMIN']);
  });

  it('requires Idempotency-Key and delegates the normalized key', async () => {
    const body = {
      expectedRemediationVersion: 2,
      expectedSaleVersion: 4,
      expectedDocumentVersions: [],
      reason: 'Correction',
    };

    await expect(
      controller.resolve('rem-1', body, {} as never, undefined),
    ).rejects.toBeInstanceOf(BadRequestException);
    await controller.resolve('rem-1', body, {} as never, ' remediation-key-1 ');

    expect(service.resolve as jest.Mock).toHaveBeenCalledWith(
      'rem-1',
      body,
      {},
      'remediation-key-1',
    );
  });
});

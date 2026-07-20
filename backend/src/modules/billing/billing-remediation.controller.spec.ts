import { PATH_METADATA } from '@nestjs/common/constants';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { BillingRemediationController } from './billing-remediation.controller';

describe('BillingRemediationController', () => {
  it('exposes the remediation inbox with explicit backend roles', () => {
    expect(Reflect.getMetadata(PATH_METADATA, BillingRemediationController)).toBe('billing/remediations');
    expect(Reflect.getMetadata(ROLES_KEY, BillingRemediationController.prototype.list)).toEqual(['ADMIN', 'BILLING']);
    expect(Reflect.getMetadata(ROLES_KEY, BillingRemediationController.prototype.resolve)).toEqual(['ADMIN']);
  });
});

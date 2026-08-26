import { BadRequestException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CreditAdjustmentController } from './credit-adjustment.controller';

describe('CreditAdjustmentController', () => {
  const service = {
    create: jest.fn(),
    findOne: jest.fn(),
    approve: jest.fn(),
    issue: jest.fn(),
  };
  const controller = new CreditAdjustmentController(service as never);
  const actor = { id: 'user-1', role: 'BILLING' } as never;

  beforeEach(() => jest.clearAllMocks());

  it('installs authentication and role guards so ADMIN/BILLING metadata is enforced', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, CreditAdjustmentController),
    ).toEqual(expect.arrayContaining([JwtAuthGuard, RolesGuard]));
  });

  it('requires idempotency for creation and issuance', async () => {
    await expect(
      controller.create({} as never, actor, undefined),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      controller.issue('adjustment-1', { expectedVersion: 2 }, actor, ' '),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('exposes explicit create, approve and issue commands', async () => {
    service.create.mockResolvedValue({ id: 'adjustment-1', status: 'DRAFT' });
    service.approve.mockResolvedValue({
      id: 'adjustment-1',
      status: 'APPROVED',
    });
    service.issue.mockResolvedValue({ adjustmentStatus: 'ISSUED' });

    await controller.create({} as never, actor, 'create-key');
    await controller.approve('adjustment-1', { expectedVersion: 1 }, actor);
    await controller.issue(
      'adjustment-1',
      { expectedVersion: 2 },
      actor,
      'issue-key',
    );

    expect(service.create).toHaveBeenCalledWith({}, actor, 'create-key');
    expect(service.approve).toHaveBeenCalledWith(
      'adjustment-1',
      { expectedVersion: 1 },
      actor,
    );
    expect(service.issue).toHaveBeenCalledWith(
      'adjustment-1',
      { expectedVersion: 2 },
      actor,
      'issue-key',
    );
  });

  it('restricts commands to ADMIN and BILLING', () => {
    for (const method of ['create', 'approve', 'issue'] as const) {
      const handler = Object.getOwnPropertyDescriptor(
        CreditAdjustmentController.prototype,
        method,
      )?.value as unknown;
      expect(Reflect.getMetadata(ROLES_KEY, handler)).toEqual([
        'ADMIN',
        'BILLING',
      ]);
    }
  });
});

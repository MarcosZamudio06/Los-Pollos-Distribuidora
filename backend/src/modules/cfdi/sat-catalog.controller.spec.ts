import { PATH_METADATA } from '@nestjs/common/constants';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { SatCatalogController } from './sat-catalog.controller';

function methodOf(target: object, key: string): object {
  return Object.getOwnPropertyDescriptor(target, key)?.value as object;
}

describe('SatCatalogController', () => {
  it('exposes read-only catalog endpoints to ADMIN/BILLING', async () => {
    const service = {
      list: jest.fn().mockResolvedValue([]),
      get: jest.fn().mockResolvedValue({ key: 'c_UsoCFDI', entries: [] }),
    };
    const controller = new SatCatalogController(service as never);
    const user = { id: 'billing-1', role: 'BILLING' } as never;

    expect(Reflect.getMetadata(PATH_METADATA, SatCatalogController)).toBe(
      'cfdi/catalogs',
    );
    expect(Reflect.getMetadata(ROLES_KEY, SatCatalogController)).toEqual([
      'ADMIN',
      'BILLING',
    ]);
    expect(
      Reflect.getMetadata(
        ROLES_KEY,
        methodOf(SatCatalogController.prototype, 'list'),
      ),
    ).toBeUndefined();
    await controller.list(user);
    await controller.get('c_UsoCFDI', { limit: 10 } as never, user);
    expect(service.list).toHaveBeenCalledTimes(1);
    expect(service.get).toHaveBeenCalledWith('c_UsoCFDI', {
      code: undefined,
      asOf: undefined,
      limit: 10,
    });
  });
});

import { PERMISSIONS } from '../../common/authorization/permissions';
import { REQUIRED_PERMISSIONS_KEY } from '../../common/decorators/require-permissions.decorator';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { LegalEntitiesController } from './legal-entities.controller';
import { LegalEntitiesService } from './legal-entities.service';

describe('LegalEntitiesController', () => {
  it('restricts issuer configuration CRUD to ADMIN/BILLING with the CFDI manage permission', () => {
    expect(Reflect.getMetadata(ROLES_KEY, LegalEntitiesController)).toEqual([
      'ADMIN',
      'BILLING',
    ]);
    expect(
      Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, LegalEntitiesController),
    ).toEqual([PERMISSIONS.CFDI_PROVIDER_MANAGE]);
  });

  it('delegates CRUD operations to the authoritative service', async () => {
    const service = {
      findAll: jest.fn().mockResolvedValue({ items: [] }),
      findOne: jest.fn().mockResolvedValue({ id: 'legal-entity-1' }),
      create: jest.fn().mockResolvedValue({ id: 'legal-entity-1' }),
      update: jest.fn().mockResolvedValue({ id: 'legal-entity-1' }),
      deactivate: jest.fn().mockResolvedValue({ id: 'legal-entity-1' }),
    } as unknown as LegalEntitiesService;
    const controller = new LegalEntitiesController(service);

    await expect(controller.findAll({})).resolves.toEqual(
      expect.objectContaining({ success: true, data: { items: [] } }),
    );
    await expect(controller.findOne('legal-entity-1')).resolves.toEqual(
      expect.objectContaining({ success: true }),
    );
    await expect(controller.create({} as never)).resolves.toEqual(
      expect.objectContaining({ success: true }),
    );
    await expect(
      controller.update('legal-entity-1', {} as never),
    ).resolves.toEqual(expect.objectContaining({ success: true }));
    await expect(controller.deactivate('legal-entity-1')).resolves.toEqual(
      expect.objectContaining({ success: true }),
    );
    expect(service.findAll).toHaveBeenCalled();
    expect(service.findOne).toHaveBeenCalledWith('legal-entity-1');
    expect(service.create).toHaveBeenCalled();
    expect(service.update).toHaveBeenCalledWith('legal-entity-1', {});
    expect(service.deactivate).toHaveBeenCalledWith('legal-entity-1');
  });
});

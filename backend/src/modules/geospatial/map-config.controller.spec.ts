import { MapConfigController } from './map-config.controller';
import { MapConfigService } from './map-config.service';

describe('MapConfigController', () => {
  it('delegates the browser-safe configuration to the service', async () => {
    const service = {
      getClientConfig: jest.fn().mockResolvedValue({ available: true }),
    } as unknown as MapConfigService;

    await expect(new MapConfigController(service).getConfig()).resolves.toEqual(
      {
        success: true,
        message: 'Map configuration retrieved successfully',
        data: { available: true },
      },
    );
  });
});

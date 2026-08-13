import { MODULE_METADATA } from '@nestjs/common/constants';
import { GeospatialModule } from './geospatial.module';
import { GEOCODING_PROVIDER } from './contracts/geocoding-provider';
import { MAP_STYLE_CONFIG_PROVIDER } from './contracts/map-style-config-provider';
import { ROUTE_OPTIMIZATION_PROVIDER } from './contracts/route-optimization-provider';
import { ROUTING_PROVIDER } from './contracts/routing-provider';
import { MapConfigController } from './map-config.controller';

describe('GeospatialModule', () => {
  it('registers one adapter per capability behind stable DI tokens', () => {
    const controllers = Reflect.getMetadata(
      MODULE_METADATA.CONTROLLERS,
      GeospatialModule,
    ) as unknown[];
    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      GeospatialModule,
    ) as unknown[];
    const exports = Reflect.getMetadata(
      MODULE_METADATA.EXPORTS,
      GeospatialModule,
    ) as unknown[];

    expect(controllers).toContain(MapConfigController);
    expect(providers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ provide: GEOCODING_PROVIDER }),
        expect.objectContaining({ provide: ROUTING_PROVIDER }),
        expect.objectContaining({ provide: ROUTE_OPTIMIZATION_PROVIDER }),
        expect.objectContaining({ provide: MAP_STYLE_CONFIG_PROVIDER }),
      ]),
    );
    expect(exports).toEqual(
      expect.arrayContaining([
        GEOCODING_PROVIDER,
        ROUTING_PROVIDER,
        ROUTE_OPTIMIZATION_PROVIDER,
        MAP_STYLE_CONFIG_PROVIDER,
      ]),
    );
  });
});

import { ConfigService } from '@nestjs/config';
import { MapConfigService } from './map-config.service';

describe('MapConfigService', () => {
  it('returns browser-safe map configuration without internal provider URLs', async () => {
    const values: Record<string, unknown> = {
      MAP_RENDERING_ENABLED: true,
      MAP_STYLE_PROVIDER: 'self-hosted',
      MAP_STYLE_PUBLIC_URL: '/maps/styles/operations/style.json',
      MAP_STYLE_REVISION: 'mexico-2026-08',
      MAP_DEFAULT_LATITUDE: 19.1738,
      MAP_DEFAULT_LONGITUDE: -96.1342,
      MAP_DEFAULT_ZOOM: 11,
      GEOCODING_PROVIDER: 'photon',
      ROUTING_PROVIDER: 'osrm',
      ROUTE_OPTIMIZATION_PROVIDER: 'vroom',
    };
    const config = {
      get: jest.fn(
        (key: string, fallback?: unknown) => values[key] ?? fallback,
      ),
    } as unknown as ConfigService;

    const result = await new MapConfigService(config).getClientConfig();

    expect(result).toEqual({
      renderer: 'maplibre',
      available: true,
      styleUrl: '/maps/styles/operations/style.json',
      revision: 'mexico-2026-08',
      attribution: [
        {
          label: '© OpenStreetMap contributors',
          url: 'https://www.openstreetmap.org/copyright',
        },
      ],
      defaultViewport: {
        latitude: 19.1738,
        longitude: -96.1342,
        zoom: 11,
      },
      capabilities: {
        geocoding: true,
        routing: true,
        optimization: true,
      },
    });

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('PHOTON_URL');
    expect(serialized).not.toContain('OSRM_URL');
    expect(serialized).not.toContain('VROOM_URL');
    expect(serialized).not.toContain('http://photon:2322');
  });

  it('reports the renderer unavailable while retaining a safe style contract', async () => {
    const config = {
      get: jest.fn(
        (key: string, fallback?: unknown) =>
          ({
            MAP_RENDERING_ENABLED: false,
            MAP_STYLE_PROVIDER: 'self-hosted',
            MAP_STYLE_PUBLIC_URL: '/maps/styles/operations/style.json',
            MAP_STYLE_REVISION: 'disabled',
            MAP_DEFAULT_LATITUDE: 19.1738,
            MAP_DEFAULT_LONGITUDE: -96.1342,
            MAP_DEFAULT_ZOOM: 11,
            GEOCODING_PROVIDER: 'photon',
            ROUTING_PROVIDER: 'osrm',
            ROUTE_OPTIMIZATION_PROVIDER: 'vroom',
          })[key] ?? fallback,
      ),
    } as unknown as ConfigService;

    await expect(
      new MapConfigService(config).getClientConfig(),
    ).resolves.toEqual(expect.objectContaining({ available: false }));
  });

  it('does not echo an internal style URL even when called outside validated bootstrap', async () => {
    const config = {
      get: jest.fn(
        (key: string, fallback?: unknown) =>
          ({
            MAP_RENDERING_ENABLED: true,
            MAP_STYLE_PROVIDER: 'self-hosted',
            MAP_STYLE_PUBLIC_URL: 'http://photon:2322/style.json',
          })[key] ?? fallback,
      ),
    } as unknown as ConfigService;

    const result = await new MapConfigService(config).getClientConfig();

    expect(result.styleUrl).toBe('/maps/styles/operations/style.json');
    expect(result.available).toBe(false);
  });
});

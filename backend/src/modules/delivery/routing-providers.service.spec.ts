import { Logger, ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RoutingProvidersService } from './routing-providers.service';

describe('RoutingProvidersService', () => {
  const config = {
    get: jest.fn((key: string, fallback?: unknown) => ({
      PHOTON_URL: 'http://photon:2322',
      VROOM_URL: 'http://vroom:3000',
      OSRM_URL: 'http://osrm:5000',
      ROUTING_TIMEOUT_MS: 5000,
    }[key] ?? fallback)),
  } as unknown as ConfigService;

  afterEach(() => jest.restoreAllMocks());

  it('normalizes Photon search results and limits the search to Mexico', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      features: [{
        geometry: { coordinates: [-96.1342, 19.1738] },
        properties: { name: 'Centro', city: 'Veracruz', state: 'Veracruz', country: 'México', osm_type: 'N', osm_id: 123 },
      }],
    }), { status: 200 }));

    const service = new RoutingProvidersService(config);
    await expect(service.searchAddress('Centro Veracruz', 5, 19.18, -96.14)).resolves.toEqual([
      { label: 'Centro, Veracruz, México', latitude: 19.1738, longitude: -96.1342, osmType: 'N', osmId: '123' },
    ]);

    const url = new URL((fetch as jest.Mock).mock.calls[0][0]);
    expect(url.pathname).toBe('/api/');
    expect(url.searchParams.get('lang')).toBe('es');
    expect(url.searchParams.get('limit')).toBe('5');
    expect(url.searchParams.get('lat')).toBe('19.18');
    expect(url.searchParams.get('lon')).toBe('-96.14');
    expect(url.searchParams.get('countrycode')).toBe('MX');
  });

  it('sends a closed single-vehicle problem to VROOM and rejects unassigned jobs', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      code: 0,
      unassigned: [{ id: 2 }],
      routes: [],
    }), { status: 200 }));

    const service = new RoutingProvidersService(config);
    await expect(service.optimizeStops(
      [-96.1421, 19.1802],
      [{ saleId: 'sale-1', longitude: -96.1342, latitude: 19.1738 }, { saleId: 'sale-2', longitude: -96.12, latitude: 19.16 }],
    )).rejects.toBeInstanceOf(UnprocessableEntityException);

    const body = JSON.parse((fetch as jest.Mock).mock.calls[0][1].body);
    expect(body.vehicles[0]).toEqual(expect.objectContaining({ start: [-96.1421, 19.1802], end: [-96.1421, 19.1802] }));
    expect(body.jobs[0].location).toEqual([-96.1342, 19.1738]);
  });

  it('requests the final OSRM route as full GeoJSON', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      code: 'Ok',
      routes: [{ distance: 8600.4, duration: 1440.2, geometry: { type: 'LineString', coordinates: [[-96.14, 19.18], [-96.13, 19.17]] }, legs: [{ distance: 4300, duration: 720 }, { distance: 4300, duration: 720 }] }],
    }), { status: 200 }));

    const service = new RoutingProvidersService(config);
    await expect(service.buildRoute([[-96.14, 19.18], [-96.13, 19.17], [-96.14, 19.18]])).resolves.toEqual(expect.objectContaining({ distanceMeters: 8600, durationSeconds: 1440 }));
    const url = new URL((fetch as jest.Mock).mock.calls[0][0]);
    expect(url.searchParams.get('geometries')).toBe('geojson');
    expect(url.searchParams.get('overview')).toBe('full');
  });

  it('translates provider failures into retryable 503 responses', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('network down'));
    const service = new RoutingProvidersService(config);
    await expect(service.searchAddress('Centro Veracruz', 5)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('logs provider outcome and latency without leaking the requested address', async () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ features: [] }), { status: 200 }));
    const service = new RoutingProvidersService(config);

    await service.searchAddress('Calle privada 123, Veracruz', 5);

    expect(log).toHaveBeenCalledWith(expect.objectContaining({ provider: 'Photon', outcome: 'success', latencyMs: expect.any(Number) }));
    expect(JSON.stringify(log.mock.calls)).not.toContain('Calle privada');
  });
});

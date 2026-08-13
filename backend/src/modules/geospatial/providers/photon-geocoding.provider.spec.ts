import {
  Logger,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PhotonGeocodingProvider } from './photon-geocoding.provider';

describe('PhotonGeocodingProvider', () => {
  const config = (values: Record<string, unknown>) =>
    ({
      get: jest.fn(
        (key: string, fallback?: unknown) => values[key] ?? fallback,
      ),
    }) as unknown as ConfigService;

  afterEach(() => jest.restoreAllMocks());

  it('normalizes search results and records a privacy-safe provider outcome', async () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          features: [
            {
              geometry: { coordinates: [-96.1342, 19.1738] },
              properties: {
                name: 'Centro',
                city: 'Veracruz',
                state: 'Veracruz',
                country: 'México',
                osm_type: 'N',
                osm_id: 123,
              },
            },
          ],
        }),
        { status: 200 },
      ),
    );

    const provider = new PhotonGeocodingProvider(
      config({
        PHOTON_URL: 'http://photon:2322',
        GEOCODING_TIMEOUT_MS: 5000,
      }),
    );

    await expect(
      provider.search({
        query: 'Centro Veracruz',
        limit: 5,
        proximity: { latitude: 19.18, longitude: -96.14 },
      }),
    ).resolves.toEqual([
      {
        label: 'Centro, Veracruz, México',
        latitude: 19.1738,
        longitude: -96.1342,
        osmType: 'N',
        osmId: '123',
      },
    ]);

    const url = new URL((fetch as jest.Mock).mock.calls[0][0]);
    expect(url.pathname).toBe('/api/');
    expect(url.searchParams.get('countrycode')).toBe('MX');
    expect(url.searchParams.get('lat')).toBe('19.18');
    expect(url.searchParams.get('lon')).toBe('-96.14');
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'Photon',
        operation: 'search',
        outcome: 'success',
        result: 'results',
        latencyMs: expect.any(Number),
      }),
    );
    expect(JSON.stringify(log.mock.calls)).not.toContain('Centro Veracruz');
  });

  it('turns an absent reverse result into a geocoding validation error', async () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ features: [] }), { status: 200 }),
      );

    const provider = new PhotonGeocodingProvider(
      config({ PHOTON_URL: 'http://photon:2322', GEOCODING_TIMEOUT_MS: 5000 }),
    );

    await expect(
      provider.reverse({ latitude: 19.1738, longitude: -96.1342 }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'Photon',
        operation: 'reverse',
        outcome: 'success',
        result: 'empty',
      }),
    );
  });

  it('maps transport failures to a geocoding-specific 503', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('network down'));
    const provider = new PhotonGeocodingProvider(
      config({ PHOTON_URL: 'http://photon:2322', GEOCODING_TIMEOUT_MS: 5000 }),
    );

    await expect(
      provider.search({ query: 'Centro Veracruz', limit: 5 }),
    ).rejects.toMatchObject({
      constructor: ServiceUnavailableException,
      message: 'Photon geocoding provider is unavailable',
    });
  });

  it('maps an aborted request to a retryable timeout 503', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    jest.spyOn(global, 'fetch').mockImplementation(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new Error('aborted')),
          );
        }),
    );
    const provider = new PhotonGeocodingProvider(
      config({ PHOTON_URL: 'http://photon:2322', GEOCODING_TIMEOUT_MS: 1 }),
    );

    await expect(
      provider.search({ query: 'Centro Veracruz', limit: 5 }),
    ).rejects.toMatchObject({
      constructor: ServiceUnavailableException,
      message: 'Photon geocoding provider is unavailable',
    });
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'Photon',
        operation: 'search',
        outcome: 'timeout',
        result: 'timeout',
      }),
    );
  });
});

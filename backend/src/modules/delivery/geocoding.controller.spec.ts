import { GeocodingController } from './geocoding.controller';
import type { GeocodingProvider } from '../geospatial/contracts/geocoding-provider';

describe('GeocodingController', () => {
  it('keeps the normalized search envelope while calling the geocoding port', async () => {
    const provider = {
      search: jest.fn().mockResolvedValue([
        {
          label: 'Centro, Veracruz',
          latitude: 19.1738,
          longitude: -96.1342,
          osmType: null,
          osmId: null,
        },
      ]),
      reverse: jest.fn(),
    } as unknown as GeocodingProvider;

    await expect(
      new GeocodingController(provider).search({
        q: 'Centro Veracruz',
        limit: 5,
        latitude: 19.18,
        longitude: -96.14,
      }),
    ).resolves.toEqual({
      success: true,
      message: 'Addresses retrieved successfully',
      data: {
        items: [
          {
            label: 'Centro, Veracruz',
            latitude: 19.1738,
            longitude: -96.1342,
            osmType: null,
            osmId: null,
          },
        ],
      },
    });
    expect((provider.search as jest.Mock).mock.calls).toEqual([
      [
        {
          query: 'Centro Veracruz',
          limit: 5,
          proximity: { latitude: 19.18, longitude: -96.14 },
        },
      ],
    ]);
  });

  it('delegates reverse no-result errors from the geocoding port', async () => {
    const provider = {
      search: jest.fn(),
      reverse: jest.fn().mockRejectedValue(new Error('No address found')),
    } as unknown as GeocodingProvider;

    await expect(
      new GeocodingController(provider).reverse({
        latitude: 19.1738,
        longitude: -96.1342,
      }),
    ).rejects.toThrow('No address found');
  });
});

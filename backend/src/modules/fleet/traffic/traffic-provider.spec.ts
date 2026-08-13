import { NullTrafficProvider } from './null-traffic.provider';

describe('NullTrafficProvider', () => {
  const provider = new NullTrafficProvider();

  it('does not fabricate traffic segments', async () => {
    await expect(
      provider.getTrafficSnapshot(
        { west: -96.2, south: 19.1, east: -96.1, north: 19.2 },
        new Date('2026-08-13T12:00:00.000Z'),
      ),
    ).resolves.toEqual([]);
  });

  it('reports that no traffic provider is available', async () => {
    await expect(provider.getCapabilities()).resolves.toEqual({
      available: false,
      provider: null,
    });
    await expect(provider.healthCheck()).resolves.toEqual({
      available: false,
      provider: null,
      status: 'unavailable',
    });
  });
});

import { assertSeedEnvironment } from '../../prisma/seed-guard';

describe('Prisma seed environment guard', () => {
  it('rejects every seed run in production', () => {
    expect(() => assertSeedEnvironment('production')).toThrow(
      'Development and operational seeds are disabled when NODE_ENV=production',
    );
  });

  it.each(['development', 'test', undefined])(
    'allows explicit non-production seed environment %s',
    (nodeEnv) => {
      expect(() => assertSeedEnvironment(nodeEnv)).not.toThrow();
    },
  );
});

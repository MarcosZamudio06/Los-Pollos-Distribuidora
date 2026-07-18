import { DEFAULT_DATABASE_URL } from './database.config';
import { validateEnvironment } from './env.validation';

describe('validateEnvironment', () => {
  it('defaults and validates the operational timezone', () => {
    expect(validateEnvironment({}).APP_TIMEZONE).toBe('America/Mexico_City');
    expect(validateEnvironment({ APP_TIMEZONE: 'America/Cancun' }).APP_TIMEZONE).toBe('America/Cancun');
    expect(() => validateEnvironment({ APP_TIMEZONE: 'Invalid/Timezone' })).toThrow('Invalid APP_TIMEZONE value');
  });
  it('uses the repo default DATABASE_URL when none is provided', () => {
    expect(
      validateEnvironment({
        API_PREFIX: 'api',
        DATABASE_SSL: 'false',
        PORT: '4000',
        SWAGGER_PATH: 'docs',
      }),
    ).toEqual(
      expect.objectContaining({
        DATABASE_URL: DEFAULT_DATABASE_URL,
      }),
    );
  });

  it('rejects a production environment without an explicit database URL', () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: 'production',
        JWT_ACCESS_SECRET: 'a'.repeat(32),
        JWT_REFRESH_SECRET: 'b'.repeat(32),
      }),
    ).toThrow('DATABASE_URL is required when NODE_ENV=production');
  });

  it('rejects missing, known, short, or repeated production JWT secrets', () => {
    const baseEnvironment = {
      DATABASE_URL: 'postgresql://user:password@database:5432/app',
      NODE_ENV: 'production',
    };

    expect(() => validateEnvironment(baseEnvironment)).toThrow(
      'JWT_ACCESS_SECRET is required when NODE_ENV=production',
    );
    expect(() =>
      validateEnvironment({
        ...baseEnvironment,
        JWT_ACCESS_SECRET: 'local_access_change_me',
        JWT_REFRESH_SECRET: 'b'.repeat(32),
      }),
    ).toThrow('JWT_ACCESS_SECRET must be an unpredictable value');
    expect(() =>
      validateEnvironment({
        ...baseEnvironment,
        JWT_ACCESS_SECRET: 'a'.repeat(32),
        JWT_REFRESH_SECRET: 'too-short',
      }),
    ).toThrow('JWT_REFRESH_SECRET must be an unpredictable value');
    expect(() =>
      validateEnvironment({
        ...baseEnvironment,
        JWT_ACCESS_SECRET: 'a'.repeat(32),
        JWT_REFRESH_SECRET: 'a'.repeat(32),
      }),
    ).toThrow('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different');
  });

  it('accepts independent production secrets with sufficient entropy space', () => {
    expect(
      validateEnvironment({
        DATABASE_URL: 'postgresql://user:password@database:5432/app',
        JWT_ACCESS_SECRET: 'access-'.padEnd(40, 'a'),
        JWT_REFRESH_SECRET: 'refresh-'.padEnd(40, 'b'),
        NODE_ENV: 'production',
        PORT: '4000',
      }),
    ).toEqual(
      expect.objectContaining({
        JWT_ACCESS_SECRET: 'access-'.padEnd(40, 'a'),
        JWT_REFRESH_SECRET: 'refresh-'.padEnd(40, 'b'),
        NODE_ENV: 'production',
      }),
    );
  });
});

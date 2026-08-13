import { DEFAULT_DATABASE_URL } from './database.config';
import { validateEnvironment } from './env.validation';

describe('validateEnvironment', () => {
  it('defaults and validates the operational timezone', () => {
    expect(validateEnvironment({}).APP_TIMEZONE).toBe('America/Mexico_City');
    expect(
      validateEnvironment({ APP_TIMEZONE: 'America/Cancun' }).APP_TIMEZONE,
    ).toBe('America/Cancun');
    expect(() =>
      validateEnvironment({ APP_TIMEZONE: 'Invalid/Timezone' }),
    ).toThrow('Invalid APP_TIMEZONE value');
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

  it('normalizes the CORS allowlist and HTTP security defaults', () => {
    expect(
      validateEnvironment({
        CORS_ORIGIN:
          'https://erp.example.com/, https://pos.example.com, https://erp.example.com',
      }),
    ).toEqual(
      expect.objectContaining({
        CORS_ORIGINS: ['https://erp.example.com', 'https://pos.example.com'],
        HTTP_BODY_LIMIT: '1mb',
        RATE_LIMIT_GLOBAL_MAX: 600,
        RATE_LIMIT_FLEET_POSITION_MAX: 60,
        ROUTING_TIMEOUT_MS: 10000,
        MAP_DATA_VERSION: 'unknown',
        SWAGGER_ENABLED: true,
        TRUST_PROXY_HOPS: 0,
        FLEET_POSITION_STALE_SECONDS: 60,
        FLEET_POSITION_FUTURE_TOLERANCE_SECONDS: 300,
        FLEET_ANALYTICS_MAX_RANGE_DAYS: 31,
      }),
    );
  });

  it('rejects unsafe HTTP configuration', () => {
    expect(() => validateEnvironment({ CORS_ORIGIN: '*' })).toThrow(
      'CORS_ORIGIN must be a non-empty allowlist without wildcards',
    );
    expect(() =>
      validateEnvironment({ CORS_ORIGIN: 'https://erp.example.com/path' }),
    ).toThrow('Invalid CORS_ORIGIN value');
    expect(() => validateEnvironment({ HTTP_BODY_LIMIT: '11mb' })).toThrow(
      'HTTP_BODY_LIMIT cannot exceed 10mb',
    );
    expect(() => validateEnvironment({ TRUST_PROXY_HOPS: '-1' })).toThrow(
      'TRUST_PROXY_HOPS must be a non-negative integer',
    );
    expect(() => validateEnvironment({ RATE_LIMIT_GLOBAL_MAX: '0' })).toThrow(
      'RATE_LIMIT_GLOBAL_MAX must be a positive integer',
    );
    expect(() =>
      validateEnvironment({ FLEET_POSITION_STALE_SECONDS: '0' }),
    ).toThrow('FLEET_POSITION_STALE_SECONDS must be a positive integer');
    expect(() =>
      validateEnvironment({ FLEET_ANALYTICS_MAX_RANGE_DAYS: '0' }),
    ).toThrow('FLEET_ANALYTICS_MAX_RANGE_DAYS must be a positive integer');
    expect(() => validateEnvironment({ ROUTING_TIMEOUT_MS: '120001' })).toThrow(
      'ROUTING_TIMEOUT_MS cannot exceed 120000 milliseconds',
    );
    expect(() =>
      validateEnvironment({ PHOTON_URL: 'ftp://photon.internal' }),
    ).toThrow('PHOTON_URL must use HTTP or HTTPS');
    expect(() =>
      validateEnvironment({ VROOM_URL: 'https://user:pass@vroom.internal' }),
    ).toThrow('VROOM_URL must not include URL credentials');
    expect(() =>
      validateEnvironment({ MAP_TILES_URL: 'https://user:pass@tiles.internal' }),
    ).toThrow('MAP_TILES_URL must not include URL credentials');
    expect(() =>
      validateEnvironment({ MAP_DATA_PREPARED_AT: 'not-a-date' }),
    ).toThrow('MAP_DATA_PREPARED_AT must be a valid ISO date');
  });

  it('does not allow Swagger in production', () => {
    expect(() =>
      validateEnvironment({ NODE_ENV: 'production', SWAGGER_ENABLED: 'true' }),
    ).toThrow('SWAGGER_ENABLED cannot be true when NODE_ENV=production');
  });

  it('validates absolute and inactivity session expiration windows', () => {
    expect(
      validateEnvironment({
        AUTH_SESSION_ABSOLUTE_TTL_SECONDS: '7200',
        AUTH_SESSION_IDLE_TTL_SECONDS: '1800',
      }),
    ).toEqual(
      expect.objectContaining({
        AUTH_SESSION_ABSOLUTE_TTL_SECONDS: 7200,
        AUTH_SESSION_IDLE_TTL_SECONDS: 1800,
      }),
    );
    expect(() =>
      validateEnvironment({
        AUTH_SESSION_ABSOLUTE_TTL_SECONDS: '3600',
        AUTH_SESSION_IDLE_TTL_SECONDS: '7200',
      }),
    ).toThrow(
      'AUTH_SESSION_IDLE_TTL_SECONDS cannot exceed AUTH_SESSION_ABSOLUTE_TTL_SECONDS',
    );
  });

  it('validates the bounded session activity write threshold', () => {
    expect(validateEnvironment({})).toEqual(
      expect.objectContaining({
        AUTH_SESSION_LAST_USED_AT_UPDATE_THRESHOLD_SECONDS: 300,
      }),
    );
    expect(
      validateEnvironment({
        AUTH_SESSION_IDLE_TTL_SECONDS: '600',
        AUTH_SESSION_LAST_USED_AT_UPDATE_THRESHOLD_SECONDS: '120',
      }),
    ).toEqual(
      expect.objectContaining({
        AUTH_SESSION_LAST_USED_AT_UPDATE_THRESHOLD_SECONDS: 120,
      }),
    );
    expect(() =>
      validateEnvironment({
        AUTH_SESSION_IDLE_TTL_SECONDS: '120',
        AUTH_SESSION_LAST_USED_AT_UPDATE_THRESHOLD_SECONDS: '120',
      }),
    ).toThrow(
      'AUTH_SESSION_LAST_USED_AT_UPDATE_THRESHOLD_SECONDS must be less than AUTH_SESSION_IDLE_TTL_SECONDS',
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
      DATABASE_URL:
        'postgresql://user:password@database:5432/app?sslmode=require',
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
        DATABASE_URL:
          'postgresql://user:password@database:5432/app?sslmode=verify-full',
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

  it('rejects an unencrypted production database connection', () => {
    expect(() =>
      validateEnvironment({
        DATABASE_URL: 'postgresql://user:password@database:5432/app',
        JWT_ACCESS_SECRET: 'access-'.padEnd(40, 'a'),
        JWT_REFRESH_SECRET: 'refresh-'.padEnd(40, 'b'),
        NODE_ENV: 'production',
      }),
    ).toThrow('DATABASE_URL must require TLS when NODE_ENV=production');
  });

  it('rejects a non-PostgreSQL production database URL', () => {
    expect(() =>
      validateEnvironment({
        DATABASE_URL: 'https://database.example.com/app?sslmode=require',
        JWT_ACCESS_SECRET: 'access-'.padEnd(40, 'a'),
        JWT_REFRESH_SECRET: 'refresh-'.padEnd(40, 'b'),
        NODE_ENV: 'production',
      }),
    ).toThrow('DATABASE_URL must use the PostgreSQL protocol');
  });
});

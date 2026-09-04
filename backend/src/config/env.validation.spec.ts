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

  it('defaults and validates the explicit CFDI fiscal timezone', () => {
    expect(validateEnvironment({}).CFDI_FISCAL_TIME_ZONE).toBe(
      'America/Mexico_City',
    );
    expect(
      validateEnvironment({ CFDI_FISCAL_TIME_ZONE: 'America/Cancun' })
        .CFDI_FISCAL_TIME_ZONE,
    ).toBe('America/Cancun');
    expect(() =>
      validateEnvironment({ CFDI_FISCAL_TIME_ZONE: 'Invalid/Timezone' }),
    ).toThrow('Invalid CFDI_FISCAL_TIME_ZONE value');
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
        HEALTH_DEPENDENCY_TIMEOUT_MS: 5000,
        MAP_DATA_VERSION: 'unknown',
        SWAGGER_ENABLED: true,
        TRUST_PROXY_HOPS: 0,
        FLEET_POSITION_STALE_SECONDS: 60,
        FLEET_POSITION_FUTURE_TOLERANCE_SECONDS: 300,
        FLEET_ANALYTICS_MAX_RANGE_DAYS: 31,
        FLEET_POSITION_RETENTION_DAYS: 365,
        CFDI_ENABLED: false,
        FISCAL_PROVIDER: 'NONE',
        FISCAL_PROVIDER_ENVIRONMENT: 'SANDBOX',
        CFDI_REQUEST_TIMEOUT_MS: 30000,
        CFDI_MAX_RETRIES: 3,
        FACTURAMA_API_MODE: 'MULTI_ISSUER',
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
    expect(() =>
      validateEnvironment({ FLEET_POSITION_RETENTION_DAYS: '0' }),
    ).toThrow('FLEET_POSITION_RETENTION_DAYS must be a positive integer');
    expect(() => validateEnvironment({ ROUTING_TIMEOUT_MS: '120001' })).toThrow(
      'ROUTING_TIMEOUT_MS cannot exceed 120000 milliseconds',
    );
    expect(() =>
      validateEnvironment({ HEALTH_DEPENDENCY_TIMEOUT_MS: '5001' }),
    ).toThrow('HEALTH_DEPENDENCY_TIMEOUT_MS cannot exceed 5000 milliseconds');
    expect(() =>
      validateEnvironment({ PHOTON_URL: 'ftp://photon.internal' }),
    ).toThrow('PHOTON_URL must use HTTP or HTTPS');
    expect(() =>
      validateEnvironment({ VROOM_URL: 'https://user:pass@vroom.internal' }),
    ).toThrow('VROOM_URL must not include URL credentials');
    expect(() =>
      validateEnvironment({
        MAP_TILES_URL: 'https://user:pass@tiles.internal',
      }),
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
      DATABASE_SSL: 'true',
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
        DATABASE_SSL: 'true',
        DATABASE_URL:
          'postgresql://user:password@database:5432/app?sslmode=require',
        JWT_ACCESS_SECRET: 'access-'.padEnd(40, 'a'),
        JWT_REFRESH_SECRET: 'refresh-'.padEnd(40, 'b'),
        NODE_ENV: 'production',
        PORT: '4000',
        OBJECT_STORAGE_BUCKET: 'delivery-evidence',
      }),
    ).toEqual(
      expect.objectContaining({
        JWT_ACCESS_SECRET: 'access-'.padEnd(40, 'a'),
        JWT_REFRESH_SECRET: 'refresh-'.padEnd(40, 'b'),
        NODE_ENV: 'production',
      }),
    );
  });

  it('rejects an unencrypted external production database connection', () => {
    expect(() =>
      validateEnvironment({
        DATABASE_SSL: 'true',
        DATABASE_URL: 'postgresql://user:password@database:5432/app',
        JWT_ACCESS_SECRET: 'access-'.padEnd(40, 'a'),
        JWT_REFRESH_SECRET: 'refresh-'.padEnd(40, 'b'),
        NODE_ENV: 'production',
      }),
    ).toThrow(
      'DATABASE_URL must use sslmode=require when DATABASE_SSL=true in production',
    );
  });

  it('allows explicit non-TLS PostgreSQL only for the production Docker database', () => {
    expect(
      validateEnvironment({
        DATABASE_SSL: 'false',
        DATABASE_URL:
          'postgresql://user:password@postgres:5432/app?sslmode=disable',
        JWT_ACCESS_SECRET: 'access-'.padEnd(40, 'a'),
        JWT_REFRESH_SECRET: 'refresh-'.padEnd(40, 'b'),
        NODE_ENV: 'production',
        OBJECT_STORAGE_BUCKET: 'delivery-evidence',
      }),
    ).toEqual(
      expect.objectContaining({
        DATABASE_SSL: false,
        NODE_ENV: 'production',
      }),
    );
  });

  it('rejects DATABASE_SSL=false outside the private Docker PostgreSQL service', () => {
    expect(() =>
      validateEnvironment({
        DATABASE_SSL: 'false',
        DATABASE_URL:
          'postgresql://user:password@database.example.com:5432/app?sslmode=disable',
        JWT_ACCESS_SECRET: 'access-'.padEnd(40, 'a'),
        JWT_REFRESH_SECRET: 'refresh-'.padEnd(40, 'b'),
        NODE_ENV: 'production',
      }),
    ).toThrow(
      'DATABASE_SSL=false is only allowed for the private Docker database at postgres:5432 in production',
    );
  });

  it('requires explicit sslmode=disable for the private Docker PostgreSQL service', () => {
    expect(() =>
      validateEnvironment({
        DATABASE_SSL: 'false',
        DATABASE_URL: 'postgresql://user:password@postgres:5432/app',
        JWT_ACCESS_SECRET: 'access-'.padEnd(40, 'a'),
        JWT_REFRESH_SECRET: 'refresh-'.padEnd(40, 'b'),
        NODE_ENV: 'production',
      }),
    ).toThrow(
      'DATABASE_URL must use sslmode=disable for the private Docker database in production',
    );
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

  it('requires production object storage and validates its credentials as a pair', () => {
    const productionEnvironment = {
      DATABASE_SSL: 'true',
      DATABASE_URL:
        'postgresql://user:password@database:5432/app?sslmode=require',
      JWT_ACCESS_SECRET: 'access-'.padEnd(40, 'a'),
      JWT_REFRESH_SECRET: 'refresh-'.padEnd(40, 'b'),
      NODE_ENV: 'production',
    };

    expect(() => validateEnvironment(productionEnvironment)).toThrow(
      'OBJECT_STORAGE_BUCKET is required when NODE_ENV=production',
    );
    expect(() =>
      validateEnvironment({
        ...productionEnvironment,
        OBJECT_STORAGE_BUCKET: 'delivery-evidence',
        OBJECT_STORAGE_ACCESS_KEY_ID: 'access-key',
      }),
    ).toThrow(
      'OBJECT_STORAGE_ACCESS_KEY_ID and OBJECT_STORAGE_SECRET_ACCESS_KEY must be provided together',
    );
    expect(
      validateEnvironment({
        ...productionEnvironment,
        OBJECT_STORAGE_BUCKET: 'delivery-evidence',
        OBJECT_STORAGE_ENDPOINT: 'https://objects.example.com',
        OBJECT_STORAGE_FORCE_PATH_STYLE: 'true',
        OBJECT_STORAGE_SIGNED_URL_TTL_SECONDS: '600',
      }),
    ).toEqual(
      expect.objectContaining({
        OBJECT_STORAGE_BUCKET: 'delivery-evidence',
        OBJECT_STORAGE_FORCE_PATH_STYLE: true,
        OBJECT_STORAGE_SIGNED_URL_TTL_SECONDS: 600,
      }),
    );
  });

  it('accepts a public endpoint for object storage signed URLs', () => {
    expect(
      validateEnvironment({
        DATABASE_SSL: 'true',
        DATABASE_URL:
          'postgresql://user:password@database:5432/app?sslmode=require',
        JWT_ACCESS_SECRET: 'access-'.padEnd(40, 'a'),
        JWT_REFRESH_SECRET: 'refresh-'.padEnd(40, 'b'),
        NODE_ENV: 'production',
        OBJECT_STORAGE_BUCKET: 'delivery-evidence',
        OBJECT_STORAGE_ENDPOINT: 'http://object-storage:8333',
        OBJECT_STORAGE_PUBLIC_ENDPOINT: 'https://objects.example.com',
      }),
    ).toEqual(
      expect.objectContaining({
        OBJECT_STORAGE_ENDPOINT: 'http://object-storage:8333',
        OBJECT_STORAGE_PUBLIC_ENDPOINT: 'https://objects.example.com',
      }),
    );
  });

  it('validates CFDI provider configuration without exposing credentials', () => {
    expect(
      validateEnvironment({
        CFDI_ENABLED: 'true',
        FISCAL_PROVIDER: 'FACTURAMA',
        FISCAL_PROVIDER_ENVIRONMENT: 'SANDBOX',
        FACTURAMA_API_BASE_URL: 'https://apisandbox.facturama.mx',
        FACTURAMA_CREDENTIAL_REF: 'secret-manager://facturama/sandbox',
      }),
    ).toEqual(
      expect.objectContaining({
        CFDI_ENABLED: true,
        FISCAL_PROVIDER: 'FACTURAMA',
        FISCAL_PROVIDER_ENVIRONMENT: 'SANDBOX',
        CFDI_REQUEST_TIMEOUT_MS: 30000,
        CFDI_MAX_RETRIES: 3,
        FACTURAMA_API_BASE_URL: 'https://apisandbox.facturama.mx',
        FACTURAMA_CREDENTIAL_REF: 'secret-manager://facturama/sandbox',
      }),
    );

    expect(() =>
      validateEnvironment({
        CFDI_ENABLED: 'true',
        FISCAL_PROVIDER: 'FACTURAMA',
        FISCAL_PROVIDER_ENVIRONMENT: 'SANDBOX',
        FACTURAMA_CREDENTIAL_REF: 'secret-manager://raw-secret',
      }),
    ).toThrow('FACTURAMA_API_BASE_URL is required');
  });

  it('requires complete Facturama configuration when fiscal mode is enabled', () => {
    expect(() => validateEnvironment({ CFDI_ENABLED: 'true' })).toThrow(
      'FISCAL_PROVIDER must be configured when CFDI_ENABLED=true',
    );
    expect(() =>
      validateEnvironment({
        CFDI_ENABLED: 'true',
        FISCAL_PROVIDER: 'FACTURAMA',
      }),
    ).toThrow('FISCAL_PROVIDER_ENVIRONMENT is required');
    expect(() =>
      validateEnvironment({
        CFDI_ENABLED: 'true',
        FISCAL_PROVIDER: 'FACTURAMA',
        FISCAL_PROVIDER_ENVIRONMENT: 'PRODUCTION',
      }),
    ).toThrow('FACTURAMA_API_BASE_URL is required');
    expect(() =>
      validateEnvironment({
        CFDI_ENABLED: 'true',
        FISCAL_PROVIDER: 'FACTURAMA',
        FISCAL_PROVIDER_ENVIRONMENT: 'PRODUCTION',
        FACTURAMA_API_BASE_URL: 'https://api.facturama.mx',
      }),
    ).toThrow('FACTURAMA_CREDENTIAL_REF is required');
  });

  it('accepts a complete production fiscal configuration with an opaque reference', () => {
    expect(
      validateEnvironment({
        NODE_ENV: 'production',
        DATABASE_SSL: 'true',
        DATABASE_URL:
          'postgresql://user:password@database:5432/app?sslmode=require',
        JWT_ACCESS_SECRET: 'access-'.padEnd(40, 'a'),
        JWT_REFRESH_SECRET: 'refresh-'.padEnd(40, 'b'),
        OBJECT_STORAGE_BUCKET: 'delivery-evidence',
        CFDI_ENABLED: 'true',
        FISCAL_PROVIDER: 'FACTURAMA',
        FISCAL_PROVIDER_ENVIRONMENT: 'PRODUCTION',
        CFDI_REQUEST_TIMEOUT_MS: '45000',
        CFDI_MAX_RETRIES: '2',
        FACTURAMA_API_BASE_URL: 'https://api.facturama.mx',
        FACTURAMA_API_MODE: 'MULTI_ISSUER',
        FACTURAMA_CREDENTIAL_REF:
          'docker-secret://facturama-production-credentials',
      }),
    ).toEqual(
      expect.objectContaining({
        CFDI_ENABLED: true,
        CFDI_REQUEST_TIMEOUT_MS: 45000,
        CFDI_MAX_RETRIES: 2,
        FISCAL_PROVIDER: 'FACTURAMA',
        FISCAL_PROVIDER_ENVIRONMENT: 'PRODUCTION',
        FACTURAMA_CREDENTIAL_REF:
          'docker-secret://facturama-production-credentials',
      }),
    );
  });

  it('requires HTTPS for the Facturama production endpoint', () => {
    expect(() =>
      validateEnvironment({
        FISCAL_PROVIDER_ENVIRONMENT: 'PRODUCTION',
        FACTURAMA_API_BASE_URL: 'http://api.facturama.mx',
      }),
    ).toThrow('FACTURAMA_API_BASE_URL must use HTTPS');
  });

  it('rejects Facturama endpoints outside the environment allowlist', () => {
    expect(() =>
      validateEnvironment({
        CFDI_ENABLED: 'true',
        FISCAL_PROVIDER: 'FACTURAMA',
        FISCAL_PROVIDER_ENVIRONMENT: 'PRODUCTION',
        FACTURAMA_API_BASE_URL: 'https://attacker.example',
        FACTURAMA_CREDENTIAL_REF: 'secret-manager://facturama/production',
      }),
    ).toThrow(
      'FACTURAMA_API_BASE_URL is not allowlisted for FISCAL_PROVIDER_ENVIRONMENT=PRODUCTION',
    );
    expect(() =>
      validateEnvironment({
        CFDI_ENABLED: 'true',
        FISCAL_PROVIDER: 'FACTURAMA',
        FISCAL_PROVIDER_ENVIRONMENT: 'SANDBOX',
        FACTURAMA_API_BASE_URL: 'https://api.facturama.mx',
        FACTURAMA_CREDENTIAL_REF: 'secret-manager://facturama/sandbox',
      }),
    ).toThrow(
      'FACTURAMA_API_BASE_URL is not allowlisted for FISCAL_PROVIDER_ENVIRONMENT=SANDBOX',
    );
  });

  it('rejects unsupported fiscal values, unsafe retries, and raw secret variables', () => {
    expect(() => validateEnvironment({ FISCAL_PROVIDER: 'UNKNOWN' })).toThrow(
      'FISCAL_PROVIDER must be one of NONE, FACTURAMA',
    );
    expect(() =>
      validateEnvironment({ FISCAL_PROVIDER_ENVIRONMENT: 'LIVE' }),
    ).toThrow('FISCAL_PROVIDER_ENVIRONMENT must be one of SANDBOX, PRODUCTION');
    expect(() =>
      validateEnvironment({ CFDI_REQUEST_TIMEOUT_MS: '99' }),
    ).toThrow('CFDI_REQUEST_TIMEOUT_MS must be between 100 and 120000');
    expect(() =>
      validateEnvironment({ CFDI_REQUEST_TIMEOUT_MS: '120001' }),
    ).toThrow('CFDI_REQUEST_TIMEOUT_MS must be between 100 and 120000');
    expect(() => validateEnvironment({ CFDI_MAX_RETRIES: '11' })).toThrow(
      'CFDI_MAX_RETRIES cannot exceed 10',
    );
    try {
      validateEnvironment({ FACTURAMA_PASSWORD: 'never-log-this' });
      throw new Error('expected raw secret rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain(
        'FACTURAMA_PASSWORD must not be configured; use FACTURAMA_CREDENTIAL_REF',
      );
      expect((error as Error).message).not.toContain('never-log-this');
    }
  });

  it('requires explicit fiscal environment and opaque reference syntax when enabled', () => {
    expect(() =>
      validateEnvironment({
        CFDI_ENABLED: 'true',
        FISCAL_PROVIDER: 'FACTURAMA',
        FACTURAMA_API_BASE_URL: 'https://apisandbox.facturama.mx',
        FACTURAMA_CREDENTIAL_REF: 'secret-manager://facturama/sandbox',
      }),
    ).toThrow('FISCAL_PROVIDER_ENVIRONMENT is required');
    expect(() =>
      validateEnvironment({
        CFDI_ENABLED: 'true',
        FISCAL_PROVIDER: 'FACTURAMA',
        FISCAL_PROVIDER_ENVIRONMENT: 'SANDBOX',
        FACTURAMA_API_BASE_URL: 'https://apisandbox.facturama.mx',
        FACTURAMA_CREDENTIAL_REF: 'contains whitespace',
      }),
    ).toThrow('FACTURAMA_CREDENTIAL_REF must be an opaque');
  });
});

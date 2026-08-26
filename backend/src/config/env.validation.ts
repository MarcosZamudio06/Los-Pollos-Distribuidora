import { DEFAULT_DATABASE_URL } from './database.config';
import { assertAllowlistedFacturamaBaseUrl } from './fiscal-provider-url';

type EnvironmentVariables = Record<string, string | undefined>;

const MINIMUM_PRODUCTION_SECRET_LENGTH = 32;
const KNOWN_INSECURE_SECRETS = new Set([
  'change_me',
  'local_access_change_me',
  'local_refresh_change_me',
]);
const MAXIMUM_BODY_LIMIT_BYTES = 10 * 1024 * 1024;
const MAXIMUM_ROUTING_TIMEOUT_MS = 120_000;
const MAXIMUM_HEALTH_DEPENDENCY_TIMEOUT_MS = 5_000;
const MINIMUM_CFDI_REQUEST_TIMEOUT_MS = 100;
const MAXIMUM_CFDI_REQUEST_TIMEOUT_MS = 120_000;
const MAXIMUM_CFDI_RETRIES = 10;

const FISCAL_PROVIDERS = ['NONE', 'FACTURAMA'] as const;
const FISCAL_PROVIDER_ENVIRONMENTS = ['SANDBOX', 'PRODUCTION'] as const;
const FACTURAMA_API_MODES = ['MULTI_ISSUER'] as const;
const RAW_FISCAL_SECRET_KEYS = [
  'FACTURAMA_USERNAME',
  'FACTURAMA_PASSWORD',
  'FACTURAMA_API_KEY',
  'FACTURAMA_TOKEN',
  'FACTURAMA_CREDENTIALS',
  'CFDI_CSD_KEY',
  'CFDI_CSD_PASSWORD',
  'CFDI_CSD_CERTIFICATE',
] as const;

function parseBoolean(
  env: EnvironmentVariables,
  key: string,
  defaultValue: boolean,
): boolean {
  const value = env[key]?.trim().toLowerCase();
  if (!value) return defaultValue;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`${key} must be true or false`);
}

function parseInteger(
  env: EnvironmentVariables,
  key: string,
  defaultValue: number,
  allowZero = false,
): number {
  const value = env[key]?.trim() || String(defaultValue);
  const parsed = Number(value);
  const minimum = allowZero ? 0 : 1;
  if (!Number.isInteger(parsed) || parsed < minimum) {
    throw new Error(
      `${key} must be ${allowZero ? 'a non-negative' : 'a positive'} integer`,
    );
  }
  return parsed;
}

function parseEnum<T extends readonly string[]>(
  env: EnvironmentVariables,
  key: string,
  defaultValue: T[number],
  allowed: T,
): T[number] {
  const value = env[key]?.trim().toUpperCase() || defaultValue;
  if (!allowed.includes(value)) {
    throw new Error(`${key} must be one of ${allowed.join(', ')}`);
  }
  return value;
}

function parseOpaqueReference(
  env: EnvironmentVariables,
  key: string,
): string | undefined {
  const value = env[key]?.trim();
  if (!value) return undefined;

  if (
    value.length > 256 ||
    [...value].some(
      (character) =>
        character.charCodeAt(0) <= 0x20 || character.charCodeAt(0) === 0x7f,
    )
  ) {
    throw new Error(`${key} must be an opaque secret-manager reference`);
  }

  return value;
}

function rejectRawFiscalSecrets(env: EnvironmentVariables): void {
  for (const key of RAW_FISCAL_SECRET_KEYS) {
    if (env[key]?.trim()) {
      throw new Error(
        `${key} must not be configured; use FACTURAMA_CREDENTIAL_REF with a secret manager or Docker secret`,
      );
    }
  }
}

function parseCorsOrigins(value: string | undefined): string[] {
  const origins = (value?.trim() || 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (origins.length === 0 || origins.includes('*')) {
    throw new Error(
      'CORS_ORIGIN must be a non-empty allowlist without wildcards',
    );
  }

  return [
    ...new Set(
      origins.map((origin) => {
        let parsed: URL;
        try {
          parsed = new URL(origin);
        } catch {
          throw new Error(`Invalid CORS_ORIGIN value: ${origin}`);
        }

        if (
          !['http:', 'https:'].includes(parsed.protocol) ||
          parsed.username ||
          parsed.password ||
          parsed.pathname !== '/' ||
          parsed.search ||
          parsed.hash
        ) {
          throw new Error(`Invalid CORS_ORIGIN value: ${origin}`);
        }
        return parsed.origin;
      }),
    ),
  ];
}

function parseBodyLimit(value: string | undefined): string {
  const bodyLimit = value?.trim().toLowerCase() || '1mb';
  const match = /^(\d+)(b|kb|mb)$/.exec(bodyLimit);
  if (!match || Number(match[1]) <= 0) {
    throw new Error('HTTP_BODY_LIMIT must use a positive b, kb, or mb value');
  }

  const multiplier =
    match[2] === 'mb' ? 1024 * 1024 : match[2] === 'kb' ? 1024 : 1;
  if (Number(match[1]) * multiplier > MAXIMUM_BODY_LIMIT_BYTES) {
    throw new Error('HTTP_BODY_LIMIT cannot exceed 10mb');
  }
  return bodyLimit;
}

function parseOptionalHttpUrl(
  env: EnvironmentVariables,
  key: string,
): string | undefined {
  const value = env[key]?.trim();
  if (!value) return undefined;

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${key} must be a valid URL`);
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`${key} must use HTTP or HTTPS`);
  }
  if (parsed.username || parsed.password) {
    throw new Error(`${key} must not include URL credentials`);
  }
  return value;
}

function requireProductionSecret(
  env: EnvironmentVariables,
  key: 'JWT_ACCESS_SECRET' | 'JWT_REFRESH_SECRET',
): string {
  const value = env[key]?.trim();

  if (!value) {
    throw new Error(`${key} is required when NODE_ENV=production`);
  }

  if (
    value.length < MINIMUM_PRODUCTION_SECRET_LENGTH ||
    KNOWN_INSECURE_SECRETS.has(value.toLowerCase())
  ) {
    throw new Error(
      `${key} must be an unpredictable value of at least ${MINIMUM_PRODUCTION_SECRET_LENGTH} characters`,
    );
  }

  return value;
}

export function validateEnvironment(env: EnvironmentVariables) {
  const portValue = env.PORT?.trim() ?? '3000';
  const parsedPort = Number(portValue);
  const nodeEnv = env.NODE_ENV?.trim() || 'development';
  const appTimezone = env.APP_TIMEZONE?.trim() || 'America/Mexico_City';
  const absoluteSessionTtl = Number(
    env.AUTH_SESSION_ABSOLUTE_TTL_SECONDS?.trim() || 604800,
  );
  const idleSessionTtl = Number(
    env.AUTH_SESSION_IDLE_TTL_SECONDS?.trim() || 86400,
  );
  const lastUsedAtUpdateThreshold = Number(
    env.AUTH_SESSION_LAST_USED_AT_UPDATE_THRESHOLD_SECONDS?.trim() || 300,
  );
  const corsOrigins = parseCorsOrigins(env.CORS_ORIGIN);
  const bodyLimit = parseBodyLimit(env.HTTP_BODY_LIMIT);
  const swaggerEnabled = parseBoolean(
    env,
    'SWAGGER_ENABLED',
    nodeEnv !== 'production',
  );
  const databaseSsl = parseBoolean(env, 'DATABASE_SSL', false);
  const trustProxyHops = parseInteger(env, 'TRUST_PROXY_HOPS', 0, true);
  const rateLimitGlobalMax = parseInteger(env, 'RATE_LIMIT_GLOBAL_MAX', 600);
  const rateLimitLoginAccountMax = parseInteger(
    env,
    'RATE_LIMIT_LOGIN_ACCOUNT_MAX',
    5,
  );
  const rateLimitLoginIpMax = parseInteger(env, 'RATE_LIMIT_LOGIN_IP_MAX', 30);
  const rateLimitRefreshMax = parseInteger(env, 'RATE_LIMIT_REFRESH_MAX', 120);
  const rateLimitFleetPositionMax = parseInteger(
    env,
    'RATE_LIMIT_FLEET_POSITION_MAX',
    60,
  );
  const routingTimeoutMs = parseInteger(env, 'ROUTING_TIMEOUT_MS', 10_000);
  const healthDependencyTimeoutMs = parseInteger(
    env,
    'HEALTH_DEPENDENCY_TIMEOUT_MS',
    5_000,
  );
  const fleetPositionStaleSeconds = parseInteger(
    env,
    'FLEET_POSITION_STALE_SECONDS',
    60,
  );
  const fleetPositionFutureToleranceSeconds = parseInteger(
    env,
    'FLEET_POSITION_FUTURE_TOLERANCE_SECONDS',
    300,
  );
  const fleetAnalyticsMaxRangeDays = parseInteger(
    env,
    'FLEET_ANALYTICS_MAX_RANGE_DAYS',
    31,
  );
  const fleetPositionRetentionDays = parseInteger(
    env,
    'FLEET_POSITION_RETENTION_DAYS',
    365,
  );
  const mapDataVersion = env.MAP_DATA_VERSION?.trim() || 'unknown';
  const mapDataPreparedAt = env.MAP_DATA_PREPARED_AT?.trim() || undefined;
  const photonUrl = parseOptionalHttpUrl(env, 'PHOTON_URL');
  const vroomUrl = parseOptionalHttpUrl(env, 'VROOM_URL');
  const osrmUrl = parseOptionalHttpUrl(env, 'OSRM_URL');
  const mapTilesUrl = parseOptionalHttpUrl(env, 'MAP_TILES_URL');
  const objectStorageBucket = env.OBJECT_STORAGE_BUCKET?.trim() || undefined;
  const objectStorageRegion = env.OBJECT_STORAGE_REGION?.trim() || 'us-east-1';
  const objectStorageEndpoint = parseOptionalHttpUrl(
    env,
    'OBJECT_STORAGE_ENDPOINT',
  );

  const objectStoragePublicEndpoint = parseOptionalHttpUrl(
    env,
    'OBJECT_STORAGE_PUBLIC_ENDPOINT',
  );
  const objectStorageAccessKeyId =
    env.OBJECT_STORAGE_ACCESS_KEY_ID?.trim() || undefined;
  const objectStorageSecretAccessKey =
    env.OBJECT_STORAGE_SECRET_ACCESS_KEY?.trim() || undefined;
  const objectStorageForcePathStyle = parseBoolean(
    env,
    'OBJECT_STORAGE_FORCE_PATH_STYLE',
    false,
  );
  const objectStorageSignedUrlTtlSeconds = parseInteger(
    env,
    'OBJECT_STORAGE_SIGNED_URL_TTL_SECONDS',
    300,
  );
  const cfdiEnabled = parseBoolean(env, 'CFDI_ENABLED', false);
  const fiscalProvider = parseEnum(
    env,
    'FISCAL_PROVIDER',
    'NONE',
    FISCAL_PROVIDERS,
  );
  const fiscalProviderEnvironment = parseEnum(
    env,
    'FISCAL_PROVIDER_ENVIRONMENT',
    'SANDBOX',
    FISCAL_PROVIDER_ENVIRONMENTS,
  );
  const cfdiRequestTimeoutMs = parseInteger(
    env,
    'CFDI_REQUEST_TIMEOUT_MS',
    30_000,
  );
  const cfdiMaxRetries = parseInteger(env, 'CFDI_MAX_RETRIES', 3, true);
  const facturamaApiBaseUrl = parseOptionalHttpUrl(
    env,
    'FACTURAMA_API_BASE_URL',
  );
  const facturamaApiMode = parseEnum(
    env,
    'FACTURAMA_API_MODE',
    'MULTI_ISSUER',
    FACTURAMA_API_MODES,
  );
  const facturamaCredentialRef = parseOpaqueReference(
    env,
    'FACTURAMA_CREDENTIAL_REF',
  );

  rejectRawFiscalSecrets(env);

  try {
    new Intl.DateTimeFormat('en-US', { timeZone: appTimezone }).format();
  } catch {
    throw new Error(`Invalid APP_TIMEZONE value: ${appTimezone}`);
  }

  if (Number.isNaN(parsedPort) || parsedPort <= 0) {
    throw new Error(`Invalid PORT value: ${portValue}`);
  }
  if (routingTimeoutMs > MAXIMUM_ROUTING_TIMEOUT_MS) {
    throw new Error(
      `ROUTING_TIMEOUT_MS cannot exceed ${MAXIMUM_ROUTING_TIMEOUT_MS} milliseconds`,
    );
  }
  if (healthDependencyTimeoutMs > MAXIMUM_HEALTH_DEPENDENCY_TIMEOUT_MS) {
    throw new Error(
      `HEALTH_DEPENDENCY_TIMEOUT_MS cannot exceed ${MAXIMUM_HEALTH_DEPENDENCY_TIMEOUT_MS} milliseconds`,
    );
  }
  if (
    cfdiRequestTimeoutMs < MINIMUM_CFDI_REQUEST_TIMEOUT_MS ||
    cfdiRequestTimeoutMs > MAXIMUM_CFDI_REQUEST_TIMEOUT_MS
  ) {
    throw new Error(
      `CFDI_REQUEST_TIMEOUT_MS must be between ${MINIMUM_CFDI_REQUEST_TIMEOUT_MS} and ${MAXIMUM_CFDI_REQUEST_TIMEOUT_MS} milliseconds`,
    );
  }
  if (cfdiMaxRetries > MAXIMUM_CFDI_RETRIES) {
    throw new Error(`CFDI_MAX_RETRIES cannot exceed ${MAXIMUM_CFDI_RETRIES}`);
  }
  if (facturamaApiBaseUrl) {
    assertAllowlistedFacturamaBaseUrl(
      facturamaApiBaseUrl,
      fiscalProviderEnvironment,
    );
  }
  if (cfdiEnabled) {
    if (fiscalProvider === 'NONE') {
      throw new Error(
        'FISCAL_PROVIDER must be configured when CFDI_ENABLED=true',
      );
    }
    if (!env.FISCAL_PROVIDER?.trim()) {
      throw new Error('FISCAL_PROVIDER is required when CFDI_ENABLED=true');
    }
    if (!env.FISCAL_PROVIDER_ENVIRONMENT?.trim()) {
      throw new Error(
        'FISCAL_PROVIDER_ENVIRONMENT is required when CFDI_ENABLED=true',
      );
    }
    if (fiscalProvider === 'FACTURAMA') {
      if (!facturamaApiBaseUrl) {
        throw new Error(
          'FACTURAMA_API_BASE_URL is required when CFDI_ENABLED=true and FISCAL_PROVIDER=FACTURAMA',
        );
      }
      if (!facturamaCredentialRef) {
        throw new Error(
          'FACTURAMA_CREDENTIAL_REF is required when CFDI_ENABLED=true and FISCAL_PROVIDER=FACTURAMA',
        );
      }
    }
  }
  if (mapDataPreparedAt && Number.isNaN(Date.parse(mapDataPreparedAt))) {
    throw new Error('MAP_DATA_PREPARED_AT must be a valid ISO date');
  }

  if (!Number.isInteger(absoluteSessionTtl) || absoluteSessionTtl <= 0) {
    throw new Error(
      'AUTH_SESSION_ABSOLUTE_TTL_SECONDS must be a positive integer',
    );
  }
  if (!Number.isInteger(idleSessionTtl) || idleSessionTtl <= 0) {
    throw new Error('AUTH_SESSION_IDLE_TTL_SECONDS must be a positive integer');
  }
  if (idleSessionTtl > absoluteSessionTtl) {
    throw new Error(
      'AUTH_SESSION_IDLE_TTL_SECONDS cannot exceed AUTH_SESSION_ABSOLUTE_TTL_SECONDS',
    );
  }
  if (
    !Number.isInteger(lastUsedAtUpdateThreshold) ||
    lastUsedAtUpdateThreshold <= 0
  ) {
    throw new Error(
      'AUTH_SESSION_LAST_USED_AT_UPDATE_THRESHOLD_SECONDS must be a positive integer',
    );
  }
  if (lastUsedAtUpdateThreshold >= idleSessionTtl) {
    throw new Error(
      'AUTH_SESSION_LAST_USED_AT_UPDATE_THRESHOLD_SECONDS must be less than AUTH_SESSION_IDLE_TTL_SECONDS',
    );
  }
  if (nodeEnv === 'production' && swaggerEnabled) {
    throw new Error('SWAGGER_ENABLED cannot be true when NODE_ENV=production');
  }
  let jwtAccessSecret = env.JWT_ACCESS_SECRET?.trim();
  let jwtRefreshSecret = env.JWT_REFRESH_SECRET?.trim();

  if (nodeEnv === 'production') {
    if (!env.DATABASE_URL?.trim()) {
      throw new Error('DATABASE_URL is required when NODE_ENV=production');
    }

    let databaseUrl: URL;
    try {
      databaseUrl = new URL(env.DATABASE_URL);
    } catch {
      throw new Error('DATABASE_URL must be a valid URL');
    }

    if (!['postgres:', 'postgresql:'].includes(databaseUrl.protocol)) {
      throw new Error('DATABASE_URL must use the PostgreSQL protocol');
    }

    const sslMode = databaseUrl.searchParams.get('sslmode');
    const isPrivateDockerPostgres =
      databaseUrl.hostname === 'postgres' && databaseUrl.port === '5432';

    if (databaseSsl) {
      if (sslMode !== 'require') {
        throw new Error(
          'DATABASE_URL must use sslmode=require when DATABASE_SSL=true in production',
        );
      }
    } else {
      if (!isPrivateDockerPostgres) {
        throw new Error(
          'DATABASE_SSL=false is only allowed for the private Docker database at postgres:5432 in production',
        );
      }

      if (sslMode !== 'disable') {
        throw new Error(
          'DATABASE_URL must use sslmode=disable for the private Docker database in production',
        );
      }
    }

    jwtAccessSecret = requireProductionSecret(env, 'JWT_ACCESS_SECRET');
    jwtRefreshSecret = requireProductionSecret(env, 'JWT_REFRESH_SECRET');

    if (jwtAccessSecret === jwtRefreshSecret) {
      throw new Error(
        'JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different',
      );
    }
  }

  if (nodeEnv === 'production' && !objectStorageBucket) {
    throw new Error(
      'OBJECT_STORAGE_BUCKET is required when NODE_ENV=production',
    );
  }
  if (
    (objectStorageAccessKeyId && !objectStorageSecretAccessKey) ||
    (!objectStorageAccessKeyId && objectStorageSecretAccessKey)
  ) {
    throw new Error(
      'OBJECT_STORAGE_ACCESS_KEY_ID and OBJECT_STORAGE_SECRET_ACCESS_KEY must be provided together',
    );
  }

  return {
    API_PREFIX: env.API_PREFIX?.trim() || 'api',
    APP_TIMEZONE: appTimezone,
    AUTH_SESSION_ABSOLUTE_TTL_SECONDS: absoluteSessionTtl,
    AUTH_SESSION_IDLE_TTL_SECONDS: idleSessionTtl,
    AUTH_SESSION_LAST_USED_AT_UPDATE_THRESHOLD_SECONDS:
      lastUsedAtUpdateThreshold,
    CORS_ORIGIN: corsOrigins.join(','),
    CORS_ORIGINS: corsOrigins,
    DATABASE_SSL: databaseSsl,
    DATABASE_URL: env.DATABASE_URL?.trim() || DEFAULT_DATABASE_URL,
    CFDI_ENABLED: cfdiEnabled,
    CFDI_REQUEST_TIMEOUT_MS: cfdiRequestTimeoutMs,
    CFDI_MAX_RETRIES: cfdiMaxRetries,
    FISCAL_PROVIDER: fiscalProvider,
    FISCAL_PROVIDER_ENVIRONMENT: fiscalProviderEnvironment,
    FACTURAMA_API_BASE_URL: facturamaApiBaseUrl,
    FACTURAMA_API_MODE: facturamaApiMode,
    FACTURAMA_CREDENTIAL_REF: facturamaCredentialRef,
    JWT_ACCESS_SECRET: jwtAccessSecret,
    JWT_REFRESH_SECRET: jwtRefreshSecret,
    NODE_ENV: nodeEnv,
    HTTP_BODY_LIMIT: bodyLimit,
    PORT: parsedPort,
    RATE_LIMIT_GLOBAL_MAX: rateLimitGlobalMax,
    RATE_LIMIT_LOGIN_ACCOUNT_MAX: rateLimitLoginAccountMax,
    RATE_LIMIT_LOGIN_IP_MAX: rateLimitLoginIpMax,
    RATE_LIMIT_REFRESH_MAX: rateLimitRefreshMax,
    RATE_LIMIT_FLEET_POSITION_MAX: rateLimitFleetPositionMax,
    ROUTING_TIMEOUT_MS: routingTimeoutMs,
    HEALTH_DEPENDENCY_TIMEOUT_MS: healthDependencyTimeoutMs,
    MAP_DATA_VERSION: mapDataVersion,
    MAP_DATA_PREPARED_AT: mapDataPreparedAt,
    PHOTON_URL: photonUrl,
    VROOM_URL: vroomUrl,
    OSRM_URL: osrmUrl,
    MAP_TILES_URL: mapTilesUrl,
    OBJECT_STORAGE_BUCKET: objectStorageBucket,
    OBJECT_STORAGE_REGION: objectStorageRegion,
    OBJECT_STORAGE_ENDPOINT: objectStorageEndpoint,
    OBJECT_STORAGE_PUBLIC_ENDPOINT: objectStoragePublicEndpoint,
    OBJECT_STORAGE_ACCESS_KEY_ID: objectStorageAccessKeyId,
    OBJECT_STORAGE_SECRET_ACCESS_KEY: objectStorageSecretAccessKey,
    OBJECT_STORAGE_FORCE_PATH_STYLE: objectStorageForcePathStyle,
    OBJECT_STORAGE_SIGNED_URL_TTL_SECONDS: objectStorageSignedUrlTtlSeconds,
    FLEET_POSITION_STALE_SECONDS: fleetPositionStaleSeconds,
    FLEET_POSITION_FUTURE_TOLERANCE_SECONDS:
      fleetPositionFutureToleranceSeconds,
    FLEET_ANALYTICS_MAX_RANGE_DAYS: fleetAnalyticsMaxRangeDays,
    FLEET_POSITION_RETENTION_DAYS: fleetPositionRetentionDays,
    SWAGGER_ENABLED: swaggerEnabled,
    SWAGGER_PATH: env.SWAGGER_PATH?.trim() || 'docs',
    TRUST_PROXY_HOPS: trustProxyHops,
  };
}

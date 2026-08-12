import { DEFAULT_DATABASE_URL } from './database.config';

type EnvironmentVariables = Record<string, string | undefined>;

const MINIMUM_PRODUCTION_SECRET_LENGTH = 32;
const KNOWN_INSECURE_SECRETS = new Set([
  'change_me',
  'local_access_change_me',
  'local_refresh_change_me',
]);
const MAXIMUM_BODY_LIMIT_BYTES = 10 * 1024 * 1024;

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
  const trustProxyHops = parseInteger(env, 'TRUST_PROXY_HOPS', 0, true);
  const rateLimitGlobalMax = parseInteger(env, 'RATE_LIMIT_GLOBAL_MAX', 600);
  const rateLimitLoginAccountMax = parseInteger(
    env,
    'RATE_LIMIT_LOGIN_ACCOUNT_MAX',
    5,
  );
  const rateLimitLoginIpMax = parseInteger(env, 'RATE_LIMIT_LOGIN_IP_MAX', 30);
  const rateLimitRefreshMax = parseInteger(env, 'RATE_LIMIT_REFRESH_MAX', 120);

  try {
    new Intl.DateTimeFormat('en-US', { timeZone: appTimezone }).format();
  } catch {
    throw new Error(`Invalid APP_TIMEZONE value: ${appTimezone}`);
  }

  if (Number.isNaN(parsedPort) || parsedPort <= 0) {
    throw new Error(`Invalid PORT value: ${portValue}`);
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
    if (!['require', 'verify-ca', 'verify-full'].includes(sslMode ?? '')) {
      throw new Error('DATABASE_URL must require TLS when NODE_ENV=production');
    }

    jwtAccessSecret = requireProductionSecret(env, 'JWT_ACCESS_SECRET');
    jwtRefreshSecret = requireProductionSecret(env, 'JWT_REFRESH_SECRET');

    if (jwtAccessSecret === jwtRefreshSecret) {
      throw new Error(
        'JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different',
      );
    }
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
    DATABASE_SSL: env.DATABASE_SSL === 'true',
    DATABASE_URL: env.DATABASE_URL?.trim() || DEFAULT_DATABASE_URL,
    JWT_ACCESS_SECRET: jwtAccessSecret,
    JWT_REFRESH_SECRET: jwtRefreshSecret,
    NODE_ENV: nodeEnv,
    HTTP_BODY_LIMIT: bodyLimit,
    PORT: parsedPort,
    RATE_LIMIT_GLOBAL_MAX: rateLimitGlobalMax,
    RATE_LIMIT_LOGIN_ACCOUNT_MAX: rateLimitLoginAccountMax,
    RATE_LIMIT_LOGIN_IP_MAX: rateLimitLoginIpMax,
    RATE_LIMIT_REFRESH_MAX: rateLimitRefreshMax,
    SWAGGER_ENABLED: swaggerEnabled,
    SWAGGER_PATH: env.SWAGGER_PATH?.trim() || 'docs',
    TRUST_PROXY_HOPS: trustProxyHops,
  };
}

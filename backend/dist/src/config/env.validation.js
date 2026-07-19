"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateEnvironment = validateEnvironment;
const database_config_1 = require("./database.config");
const MINIMUM_PRODUCTION_SECRET_LENGTH = 32;
const KNOWN_INSECURE_SECRETS = new Set([
    'change_me',
    'local_access_change_me',
    'local_refresh_change_me',
]);
function requireProductionSecret(env, key) {
    const value = env[key]?.trim();
    if (!value) {
        throw new Error(`${key} is required when NODE_ENV=production`);
    }
    if (value.length < MINIMUM_PRODUCTION_SECRET_LENGTH ||
        KNOWN_INSECURE_SECRETS.has(value.toLowerCase())) {
        throw new Error(`${key} must be an unpredictable value of at least ${MINIMUM_PRODUCTION_SECRET_LENGTH} characters`);
    }
    return value;
}
function validateEnvironment(env) {
    const portValue = env.PORT?.trim() ?? '3000';
    const parsedPort = Number(portValue);
    const nodeEnv = env.NODE_ENV?.trim() || 'development';
    const appTimezone = env.APP_TIMEZONE?.trim() || 'America/Mexico_City';
    try {
        new Intl.DateTimeFormat('en-US', { timeZone: appTimezone }).format();
    }
    catch {
        throw new Error(`Invalid APP_TIMEZONE value: ${appTimezone}`);
    }
    if (Number.isNaN(parsedPort) || parsedPort <= 0) {
        throw new Error(`Invalid PORT value: ${portValue}`);
    }
    let jwtAccessSecret = env.JWT_ACCESS_SECRET?.trim();
    let jwtRefreshSecret = env.JWT_REFRESH_SECRET?.trim();
    if (nodeEnv === 'production') {
        if (!env.DATABASE_URL?.trim()) {
            throw new Error('DATABASE_URL is required when NODE_ENV=production');
        }
        jwtAccessSecret = requireProductionSecret(env, 'JWT_ACCESS_SECRET');
        jwtRefreshSecret = requireProductionSecret(env, 'JWT_REFRESH_SECRET');
        if (jwtAccessSecret === jwtRefreshSecret) {
            throw new Error('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different');
        }
    }
    return {
        API_PREFIX: env.API_PREFIX?.trim() || 'api',
        APP_TIMEZONE: appTimezone,
        DATABASE_SSL: env.DATABASE_SSL === 'true',
        DATABASE_URL: env.DATABASE_URL?.trim() || database_config_1.DEFAULT_DATABASE_URL,
        JWT_ACCESS_SECRET: jwtAccessSecret,
        JWT_REFRESH_SECRET: jwtRefreshSecret,
        NODE_ENV: nodeEnv,
        PORT: parsedPort,
        SWAGGER_PATH: env.SWAGGER_PATH?.trim() || 'docs',
    };
}
//# sourceMappingURL=env.validation.js.map
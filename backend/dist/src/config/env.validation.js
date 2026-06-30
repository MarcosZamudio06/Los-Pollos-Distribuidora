"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateEnvironment = validateEnvironment;
const database_config_1 = require("./database.config");
function validateEnvironment(env) {
    const portValue = env.PORT?.trim() ?? '3000';
    const parsedPort = Number(portValue);
    if (Number.isNaN(parsedPort) || parsedPort <= 0) {
        throw new Error(`Invalid PORT value: ${portValue}`);
    }
    return {
        API_PREFIX: env.API_PREFIX?.trim() || 'api',
        DATABASE_SSL: env.DATABASE_SSL === 'true',
        DATABASE_URL: env.DATABASE_URL?.trim() || database_config_1.DEFAULT_DATABASE_URL,
        PORT: parsedPort,
        SWAGGER_PATH: env.SWAGGER_PATH?.trim() || 'docs',
    };
}
//# sourceMappingURL=env.validation.js.map
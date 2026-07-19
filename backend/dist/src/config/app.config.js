"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.appConfig = void 0;
const config_1 = require("@nestjs/config");
exports.appConfig = (0, config_1.registerAs)('app', () => {
    const parsedPort = Number(process.env.PORT ?? 3000);
    return {
        apiPrefix: process.env.API_PREFIX?.trim() || 'api',
        timezone: process.env.APP_TIMEZONE?.trim() || 'America/Mexico_City',
        port: Number.isNaN(parsedPort) || parsedPort <= 0 ? 3000 : parsedPort,
        swaggerPath: process.env.SWAGGER_PATH?.trim() || 'docs',
    };
});
//# sourceMappingURL=app.config.js.map
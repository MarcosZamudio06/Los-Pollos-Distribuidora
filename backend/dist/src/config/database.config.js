"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.databaseConfig = exports.DEFAULT_DATABASE_URL = void 0;
const config_1 = require("@nestjs/config");
exports.DEFAULT_DATABASE_URL = 'postgresql://postgres:postgres@localhost:5433/pollo_distribucion';
exports.databaseConfig = (0, config_1.registerAs)('database', () => ({
    ssl: process.env.DATABASE_SSL === 'true',
    url: process.env.DATABASE_URL?.trim() || exports.DEFAULT_DATABASE_URL,
}));
//# sourceMappingURL=database.config.js.map
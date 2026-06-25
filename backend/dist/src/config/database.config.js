"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.databaseConfig = void 0;
const config_1 = require("@nestjs/config");
exports.databaseConfig = (0, config_1.registerAs)('database', () => ({
    ssl: process.env.DATABASE_SSL === 'true',
    url: process.env.DATABASE_URL?.trim() ||
        'postgresql://localhost:5432/pollos_distribuidor',
}));
//# sourceMappingURL=database.config.js.map
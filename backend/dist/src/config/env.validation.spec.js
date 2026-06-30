"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const database_config_1 = require("./database.config");
const env_validation_1 = require("./env.validation");
describe('validateEnvironment', () => {
    it('uses the repo default DATABASE_URL when none is provided', () => {
        expect((0, env_validation_1.validateEnvironment)({
            API_PREFIX: 'api',
            DATABASE_SSL: 'false',
            PORT: '4000',
            SWAGGER_PATH: 'docs',
        })).toEqual(expect.objectContaining({
            DATABASE_URL: database_config_1.DEFAULT_DATABASE_URL,
        }));
    });
});
//# sourceMappingURL=env.validation.spec.js.map
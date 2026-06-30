"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const testing_1 = require("@nestjs/testing");
const constants_1 = require("@nestjs/common/constants");
const app_module_1 = require("./../src/app.module");
describe('AppModule bootstrap (e2e)', () => {
    let app;
    beforeAll(async () => {
        const moduleFixture = await testing_1.Test.createTestingModule({
            imports: [app_module_1.AppModule],
        }).compile();
        app = moduleFixture.createNestApplication();
        await app.init();
    });
    it('initializes the application module without starter routes', () => {
        expect(app).toBeDefined();
        expect(app.getHttpServer()).toBeDefined();
    });
    it('keeps the root module free of starter controllers and providers', () => {
        const controllers = Reflect.getMetadata(constants_1.MODULE_METADATA.CONTROLLERS, app_module_1.AppModule);
        const providers = Reflect.getMetadata(constants_1.MODULE_METADATA.PROVIDERS, app_module_1.AppModule);
        expect(controllers).toEqual([]);
        expect(providers).toEqual([]);
    });
    afterAll(async () => {
        await app.close();
    });
});
//# sourceMappingURL=app.e2e-spec.js.map
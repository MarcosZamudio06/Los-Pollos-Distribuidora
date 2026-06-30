"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const constants_1 = require("@nestjs/common/constants");
jest.mock('@prisma/client', () => ({
    PrismaClient: class {
        $connect = jest.fn().mockResolvedValue(undefined);
        $disconnect = jest.fn().mockResolvedValue(undefined);
    },
}));
const app_module_1 = require("../app.module");
const prisma_module_1 = require("./prisma.module");
const prisma_service_1 = require("./prisma.service");
describe('PrismaModule', () => {
    it('registers one shared PrismaService provider and exports it globally', () => {
        const isGlobal = Reflect.getMetadata(constants_1.GLOBAL_MODULE_METADATA, prisma_module_1.PrismaModule);
        const providers = Reflect.getMetadata(constants_1.MODULE_METADATA.PROVIDERS, prisma_module_1.PrismaModule);
        const exports = Reflect.getMetadata(constants_1.MODULE_METADATA.EXPORTS, prisma_module_1.PrismaModule);
        const appImports = Reflect.getMetadata(constants_1.MODULE_METADATA.IMPORTS, app_module_1.AppModule);
        expect(isGlobal).toBe(true);
        expect(providers).toEqual([prisma_service_1.PrismaService]);
        expect(exports).toEqual([prisma_service_1.PrismaService]);
        expect(appImports).toContain(prisma_module_1.PrismaModule);
    });
});
describe('PrismaService', () => {
    it('opens the shared Prisma connection when the Nest module initializes', async () => {
        const service = new prisma_service_1.PrismaService();
        const connect = jest
            .spyOn(service, '$connect')
            .mockResolvedValue(undefined);
        await service.onModuleInit();
        expect(connect).toHaveBeenCalledTimes(1);
    });
    it('closes the shared Prisma connection when the Nest module is destroyed', async () => {
        const service = new prisma_service_1.PrismaService();
        const disconnect = jest
            .spyOn(service, '$disconnect')
            .mockResolvedValue(undefined);
        await service.onModuleDestroy();
        expect(disconnect).toHaveBeenCalledTimes(1);
    });
});
//# sourceMappingURL=prisma.module.spec.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const core_1 = require("@nestjs/core");
const swagger_1 = require("@nestjs/swagger");
const app_module_1 = require("./app.module");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    const configService = app.get(config_1.ConfigService);
    const apiPrefix = configService.get('app.apiPrefix', 'api');
    const swaggerPath = configService.get('app.swaggerPath', 'docs');
    const port = configService.get('app.port', 3000);
    app.setGlobalPrefix(apiPrefix);
    app.useGlobalPipes(new common_1.ValidationPipe({
        forbidUnknownValues: true,
        transform: true,
        whitelist: true,
    }));
    const swaggerConfig = new swagger_1.DocumentBuilder()
        .setTitle('Pollos Distribuidor API')
        .setDescription('Backend bootstrap for the Pollos Distribuidor system')
        .setVersion('1.0.0')
        .addBearerAuth()
        .build();
    const document = swagger_1.SwaggerModule.createDocument(app, swaggerConfig);
    swagger_1.SwaggerModule.setup(swaggerPath, app, document);
    await app.listen(port);
}
void bootstrap();
//# sourceMappingURL=main.js.map
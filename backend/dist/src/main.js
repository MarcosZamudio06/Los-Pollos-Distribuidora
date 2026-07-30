"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const config_1 = require("@nestjs/config");
const core_1 = require("@nestjs/core");
const app_module_1 = require("./app.module");
const configure_http_application_1 = require("./bootstrap/configure-http-application");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    const configService = app.get(config_1.ConfigService);
    const port = configService.get('app.port', 3000);
    (0, configure_http_application_1.configureHttpApplication)(app, configService);
    await app.listen(port);
}
void bootstrap();
//# sourceMappingURL=main.js.map
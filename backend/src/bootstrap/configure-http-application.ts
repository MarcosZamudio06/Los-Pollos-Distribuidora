import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NestExpressApplication } from '@nestjs/platform-express';
import compression from 'compression';
import helmet from 'helmet';
import { SanitizedHttpExceptionFilter } from '../common/filters/sanitized-http-exception.filter';
import { requestIdMiddleware } from '../common/middleware/request-id.middleware';

export function configureHttpApplication(
  app: NestExpressApplication,
  configService: ConfigService,
): void {
  const apiPrefix = configService.get<string>('app.apiPrefix', 'api');
  const bodyLimit = configService.get<string>('HTTP_BODY_LIMIT', '1mb');
  const corsOrigins = configService.get<string[]>('CORS_ORIGINS', [
    'http://localhost:3000',
  ]);
  const nodeEnv = configService.get<string>('NODE_ENV', 'development');
  const swaggerEnabled = configService.get<boolean>(
    'SWAGGER_ENABLED',
    nodeEnv !== 'production',
  );
  const swaggerPath = configService.get<string>('app.swaggerPath', 'docs');
  const trustProxyHops = configService.get<number>('TRUST_PROXY_HOPS', 0);
  const allowedOrigins = new Set(corsOrigins);

  app.set('trust proxy', trustProxyHops);
  app.use(
    helmet(
      nodeEnv === 'production'
        ? {}
        : { contentSecurityPolicy: false, strictTransportSecurity: false },
    ),
  );
  app.use(requestIdMiddleware);
  app.use(compression());
  app.useBodyParser('json', { limit: bodyLimit });
  app.useBodyParser('urlencoded', { extended: true, limit: bodyLimit });
  app.setGlobalPrefix(apiPrefix);
  app.enableCors({
    credentials: true,
    exposedHeaders: ['Retry-After'],
    origin: (origin, callback) => {
      callback(null, !origin || allowedOrigins.has(origin));
    },
  });
  app.useGlobalPipes(
    new ValidationPipe({
      forbidUnknownValues: true,
      transform: true,
      whitelist: true,
    }),
  );
  app.useGlobalFilters(new SanitizedHttpExceptionFilter());

  if (swaggerEnabled && nodeEnv !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Pollos Distribuidor API')
      .setDescription('Backend bootstrap for the Pollos Distribuidor system')
      .setVersion('1.0.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup(swaggerPath, app, document);
  }
}

import {
  Body,
  Controller,
  Module,
  Post,
  Req,
  ValidationPipe,
  Catch,
  type ArgumentsHost,
  type ExceptionFilter,
  HttpException,
  BadRequestException,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import { createHmac } from 'node:crypto';
import { LeadDto } from './lead.dto';
import type { LeadConfig } from './config';
import { LeadStore } from './store';
import { notification } from './notification';

@Catch()
class SafeLeadErrors implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const code =
      error instanceof HttpException
        ? error.getStatus()
        : (error as { status?: number })?.status === 413
          ? 413
          : 503;
    const response = host.switchToHttp().getResponse<Response>();
    if (code === 429) response.setHeader('Retry-After', '600');
    response.status(code).json({
      accepted: false,
      code: `LEAD_${code}`,
      message:
        code === 503
          ? 'Reception unavailable. Please retry.'
          : 'Request could not be accepted.',
    });
  }
}
export async function createReceiver(config: LeadConfig, store: LeadStore) {
  @Controller('leads')
  class LeadController {
    @Post()
    receive(@Body() input: LeadDto, @Req() req: Request) {
      if (input.consentVersion !== config.privacyVersion)
        throw new BadRequestException();
      const key = req.get('Idempotency-Key') || '';
      if (
        !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          key,
        )
      )
        throw new BadRequestException();
      for (const field of ['name', 'company', 'email', 'phone'] as const) {
        if (
          [...input[field]].some(
            (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
          )
        )
          throw new BadRequestException();
        input[field] = input[field].trim();
      }
      if (
        [...input.message].some((char) => {
          const code = char.charCodeAt(0);
          return (code < 32 && ![9, 10, 13].includes(code)) || code === 127;
        })
      )
        throw new BadRequestException();
      input.email = input.email.toLowerCase();
      input.message = input.message.trim();
      return store.accept(key, input, config.privacyUrl, (id, date) =>
        notification(input, id, date, config),
      );
    }
  }
  @Module({ controllers: [LeadController] })
  class CommercialModule {}
  const app = await NestFactory.create<NestExpressApplication>(
    CommercialModule,
    { logger: false, bodyParser: false },
  );
  app.set(
    'trust proxy',
    config.trustedProxies.length ? config.trustedProxies : false,
  );
  app.use(helmet());
  // CORS supplies browser-readable error headers; it is NOT an authentication mechanism.
  app.enableCors({
    origin: config.origins,
    methods: ['POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Idempotency-Key'],
    exposedHeaders: ['Retry-After'],
    credentials: false,
    maxAge: 600,
  });
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      // Account for all POST attempts to this route, including forged/missing Origin.
      // Forwarding is trusted only from the configured edge IPs.
      if (req.method === 'POST' && req.path === '/leads')
        store.rateLimit(
          createHmac('sha256', config.rateSecret)
            .update(req.ip || req.socket.remoteAddress || 'unknown')
            .digest('hex'),
        );
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === 429) {
        const body = error.getResponse() as { retryAfterSeconds: number };
        res.setHeader('Retry-After', String(body.retryAfterSeconds));
        res
          .status(429)
          .json({
            accepted: false,
            code: 'LEAD_RATE_LIMITED',
            retryAfterSeconds: body.retryAfterSeconds,
          });
      } else
        res.status(503).json({ accepted: false, code: 'LEAD_UNAVAILABLE' });
      return;
    }
    const origin = req.get('Origin');
    if (!origin || !config.origins.includes(origin)) {
      res.status(403).json({ accepted: false, code: 'LEAD_403' });
      return;
    }
    next();
  });
  app.useBodyParser('json', { limit: '16kb', strict: true });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
      validationError: { target: false, value: false },
    }),
  );
  app.useGlobalFilters(new SafeLeadErrors());
  return app;
}

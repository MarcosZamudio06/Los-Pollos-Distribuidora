import { ConfigService } from '@nestjs/config';
import { minutes, seconds, type ThrottlerOptions } from '@nestjs/throttler';
import { createHash } from 'node:crypto';
import { hasRateLimitPolicy } from '../common/decorators/rate-limit-policy.decorator';

export function createHttpThrottlerOptions(
  configService: ConfigService,
): ThrottlerOptions[] {
  return [
    {
      name: 'default',
      ttl: seconds(60),
      limit: configService.get<number>('RATE_LIMIT_GLOBAL_MAX', 600),
    },
    {
      name: 'loginAccount',
      ttl: minutes(5),
      limit: configService.get<number>('RATE_LIMIT_LOGIN_ACCOUNT_MAX', 5),
      skipIf: (context) => !hasRateLimitPolicy(context, 'login'),
      getTracker: (request) => {
        const body = request.body as Record<string, unknown> | undefined;
        const email =
          typeof body?.email === 'string'
            ? body.email.trim().toLowerCase()
            : 'missing-email';
        return Promise.resolve(
          createHash('sha256').update(email).digest('hex'),
        );
      },
    },
    {
      name: 'loginIp',
      ttl: seconds(60),
      limit: configService.get<number>('RATE_LIMIT_LOGIN_IP_MAX', 30),
      skipIf: (context) => !hasRateLimitPolicy(context, 'login'),
    },
    {
      name: 'refreshIp',
      ttl: seconds(60),
      limit: configService.get<number>('RATE_LIMIT_REFRESH_MAX', 120),
      skipIf: (context) => !hasRateLimitPolicy(context, 'refresh'),
    },
    {
      name: 'fleetPosition',
      ttl: seconds(60),
      limit: configService.get<number>('RATE_LIMIT_FLEET_POSITION_MAX', 60),
      skipIf: (context) => !hasRateLimitPolicy(context, 'fleet-position'),
      getTracker: (request) => {
        const user = request.user as { id?: unknown } | undefined;
        const identity =
          typeof user?.id === 'string' && user.id.trim()
            ? `user:${user.id}`
            : `ip:${request.ip}`;
        return Promise.resolve(identity);
      },
    },
  ];
}

import { registerAs } from '@nestjs/config';
import { DEFAULT_APP_TIMEZONE } from '../common/utils/civil-date-range';

export type AppConfig = {
  apiPrefix: string;
  timezone: string;
  port: number;
  swaggerPath: string;
};

export const appConfig = registerAs('app', (): AppConfig => {
  const parsedPort = Number(process.env.PORT ?? 3000);

  return {
    apiPrefix: process.env.API_PREFIX?.trim() || 'api',
    timezone: process.env.APP_TIMEZONE?.trim() || DEFAULT_APP_TIMEZONE,
    port: Number.isNaN(parsedPort) || parsedPort <= 0 ? 3000 : parsedPort,
    swaggerPath: process.env.SWAGGER_PATH?.trim() || 'docs',
  };
});

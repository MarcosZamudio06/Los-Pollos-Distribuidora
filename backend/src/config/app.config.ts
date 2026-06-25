import { registerAs } from '@nestjs/config';

export type AppConfig = {
  apiPrefix: string;
  port: number;
  swaggerPath: string;
};

export const appConfig = registerAs('app', (): AppConfig => {
  const parsedPort = Number(process.env.PORT ?? 3000);

  return {
    apiPrefix: process.env.API_PREFIX?.trim() || 'api',
    port: Number.isNaN(parsedPort) || parsedPort <= 0 ? 3000 : parsedPort,
    swaggerPath: process.env.SWAGGER_PATH?.trim() || 'docs',
  };
});

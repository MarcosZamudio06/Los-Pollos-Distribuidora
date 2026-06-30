import { registerAs } from '@nestjs/config';

export type DatabaseConfig = {
  ssl: boolean;
  url: string;
};

export const DEFAULT_DATABASE_URL =
  'postgresql://postgres:postgres@localhost:5433/pollo_distribucion';

export const databaseConfig = registerAs(
  'database',
  (): DatabaseConfig => ({
    ssl: process.env.DATABASE_SSL === 'true',
    url: process.env.DATABASE_URL?.trim() || DEFAULT_DATABASE_URL,
  }),
);

import { registerAs } from '@nestjs/config';

export type DatabaseConfig = {
  ssl: boolean;
  url: string;
};

export const databaseConfig = registerAs(
  'database',
  (): DatabaseConfig => ({
    ssl: process.env.DATABASE_SSL === 'true',
    url:
      process.env.DATABASE_URL?.trim() ||
      'postgresql://localhost:5432/pollos_distribuidor',
  }),
);

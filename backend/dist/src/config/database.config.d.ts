export type DatabaseConfig = {
    ssl: boolean;
    url: string;
};
export declare const DEFAULT_DATABASE_URL = "postgresql://postgres:postgres@localhost:5433/pollo_distribucion";
export declare const databaseConfig: (() => DatabaseConfig) & import("@nestjs/config").ConfigFactoryKeyHost<DatabaseConfig>;

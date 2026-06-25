export type DatabaseConfig = {
    ssl: boolean;
    url: string;
};
export declare const databaseConfig: (() => DatabaseConfig) & import("@nestjs/config").ConfigFactoryKeyHost<DatabaseConfig>;

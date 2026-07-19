export type AppConfig = {
    apiPrefix: string;
    timezone: string;
    port: number;
    swaggerPath: string;
};
export declare const appConfig: (() => AppConfig) & import("@nestjs/config").ConfigFactoryKeyHost<AppConfig>;

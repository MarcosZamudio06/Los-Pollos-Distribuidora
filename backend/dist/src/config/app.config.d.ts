export type AppConfig = {
    apiPrefix: string;
    port: number;
    swaggerPath: string;
};
export declare const appConfig: (() => AppConfig) & import("@nestjs/config").ConfigFactoryKeyHost<AppConfig>;

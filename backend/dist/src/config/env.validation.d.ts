type EnvironmentVariables = Record<string, string | undefined>;
export declare function validateEnvironment(env: EnvironmentVariables): {
    API_PREFIX: string;
    APP_TIMEZONE: string;
    DATABASE_SSL: boolean;
    DATABASE_URL: string;
    JWT_ACCESS_SECRET: string | undefined;
    JWT_REFRESH_SECRET: string | undefined;
    NODE_ENV: string;
    PORT: number;
    SWAGGER_PATH: string;
};
export {};

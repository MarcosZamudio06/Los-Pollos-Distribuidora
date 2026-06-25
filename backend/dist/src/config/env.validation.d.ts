type EnvironmentVariables = Record<string, string | undefined>;
export declare function validateEnvironment(env: EnvironmentVariables): {
    API_PREFIX: string;
    DATABASE_SSL: boolean;
    DATABASE_URL: string;
    PORT: number;
    SWAGGER_PATH: string;
};
export {};

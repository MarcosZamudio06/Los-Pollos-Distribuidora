type EnvironmentVariables = Record<string, string | undefined>;

export function validateEnvironment(env: EnvironmentVariables) {
  const portValue = env.PORT?.trim() ?? '3000';
  const parsedPort = Number(portValue);

  if (Number.isNaN(parsedPort) || parsedPort <= 0) {
    throw new Error(`Invalid PORT value: ${portValue}`);
  }

  return {
    API_PREFIX: env.API_PREFIX?.trim() || 'api',
    DATABASE_SSL: env.DATABASE_SSL === 'true',
    DATABASE_URL:
      env.DATABASE_URL?.trim() ||
      'postgresql://localhost:5432/pollos_distribuidor',
    PORT: parsedPort,
    SWAGGER_PATH: env.SWAGGER_PATH?.trim() || 'docs',
  };
}

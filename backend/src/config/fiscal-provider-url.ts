export type FiscalProviderEnvironment = 'SANDBOX' | 'PRODUCTION';

const FACTURAMA_ORIGINS: Record<FiscalProviderEnvironment, string> = {
  SANDBOX: 'https://apisandbox.facturama.mx',
  PRODUCTION: 'https://api.facturama.mx',
};

/**
 * Accepts only the documented Facturama origin for the selected environment.
 * Paths, queries, fragments and URL credentials are rejected so configuration
 * cannot redirect authenticated PAC traffic to another destination.
 */
export function assertAllowlistedFacturamaBaseUrl(
  value: string,
  environment: FiscalProviderEnvironment,
): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('FACTURAMA_API_BASE_URL must be a valid URL');
  }

  if (parsed.protocol !== 'https:') {
    throw new Error('FACTURAMA_API_BASE_URL must use HTTPS');
  }

  if (
    parsed.origin !== FACTURAMA_ORIGINS[environment] ||
    parsed.username ||
    parsed.password ||
    (parsed.pathname !== '' && parsed.pathname !== '/') ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(
      `FACTURAMA_API_BASE_URL is not allowlisted for FISCAL_PROVIDER_ENVIRONMENT=${environment}`,
    );
  }

  return value;
}

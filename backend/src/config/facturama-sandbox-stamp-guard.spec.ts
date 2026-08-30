import {
  FACTURAMA_SANDBOX_BASE_URL,
  getFacturamaSandboxStampConfig,
} from './facturama-sandbox-stamp-guard';

function validEnvironment(): NodeJS.ProcessEnv {
  return {
    RUN_FACTURAMA_SANDBOX_STAMP: 'true',
    CFDI_ENABLED: 'true',
    FISCAL_PROVIDER: 'FACTURAMA',
    FISCAL_PROVIDER_ENVIRONMENT: 'SANDBOX',
    FACTURAMA_API_BASE_URL: FACTURAMA_SANDBOX_BASE_URL,
    FACTURAMA_API_MODE: 'MULTI_ISSUER',
    FACTURAMA_CREDENTIAL_REF: 'github-actions://facturama-sandbox',
    FACTURAMA_SANDBOX_USERNAME: 'sandbox-user',
    FACTURAMA_SANDBOX_PASSWORD: 'sandbox-password',
    FACTURAMA_SANDBOX_ISSUER_RFC: 'EKU9003173C9',
    FACTURAMA_SANDBOX_ISSUER_NAME: 'ESCUELA KEMPER URGATE',
    FACTURAMA_SANDBOX_ISSUER_FISCAL_REGIME: '601',
    FACTURAMA_SANDBOX_ISSUER_POSTAL_CODE: '78240',
  };
}

describe('Facturama sandbox stamp guard', () => {
  it('does not enable the protected contract when the flag is absent', () => {
    const fetcher = jest.fn();
    const environment = validEnvironment();
    delete environment.RUN_FACTURAMA_SANDBOX_STAMP;

    const result = getFacturamaSandboxStampConfig(environment);
    if (result.enabled) fetcher();

    expect(result).toEqual({
      enabled: false,
      reason: 'RUN_FACTURAMA_SANDBOX_STAMP must be exactly "true"',
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('does not enable the protected contract when the flag is false', () => {
    const fetcher = jest.fn();
    const environment = validEnvironment();
    environment.RUN_FACTURAMA_SANDBOX_STAMP = 'false';
    environment.FISCAL_PROVIDER_ENVIRONMENT = 'PRODUCTION';
    environment.FACTURAMA_API_BASE_URL = 'https://api.facturama.mx';
    delete environment.FACTURAMA_SANDBOX_USERNAME;
    delete environment.FACTURAMA_SANDBOX_PASSWORD;

    const result = getFacturamaSandboxStampConfig(environment);
    if (result.enabled) fetcher();

    expect(result).toEqual({
      enabled: false,
      reason: 'RUN_FACTURAMA_SANDBOX_STAMP must be exactly "true"',
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('rejects an environment other than SANDBOX before the stamp', () => {
    const environment = validEnvironment();
    environment.FISCAL_PROVIDER_ENVIRONMENT = 'PRODUCTION';

    expect(() => getFacturamaSandboxStampConfig(environment)).toThrow(
      'FISCAL_PROVIDER_ENVIRONMENT must be SANDBOX for the protected stamp contract',
    );
  });

  it('rejects the production Facturama URL before the stamp', () => {
    const environment = validEnvironment();
    environment.FACTURAMA_API_BASE_URL = 'https://api.facturama.mx';

    expect(() => getFacturamaSandboxStampConfig(environment)).toThrow(
      `FACTURAMA_API_BASE_URL must be exactly ${FACTURAMA_SANDBOX_BASE_URL}`,
    );
  });

  it('fails safely before the stamp when credentials are missing', () => {
    const environment = validEnvironment();
    delete environment.FACTURAMA_SANDBOX_USERNAME;

    expect(() => getFacturamaSandboxStampConfig(environment)).toThrow(
      'FACTURAMA_SANDBOX_USERNAME and FACTURAMA_SANDBOX_PASSWORD are required before the protected stamp',
    );
  });
});

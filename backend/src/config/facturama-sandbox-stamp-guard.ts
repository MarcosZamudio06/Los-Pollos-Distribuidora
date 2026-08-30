export const FACTURAMA_SANDBOX_BASE_URL =
  'https://apisandbox.facturama.mx' as const;
export const FACTURAMA_SANDBOX_CREDENTIAL_REF =
  'github-actions://facturama-sandbox' as const;

interface FacturamaSandboxStampCredentials {
  readonly username: string;
  readonly password: string;
}

export interface FacturamaSandboxStampIssuerFixture {
  readonly taxId: string;
  readonly legalName: string;
  readonly fiscalRegime: string;
  readonly fiscalPostalCode: string;
}

export type FacturamaSandboxStampConfig =
  | {
      readonly enabled: false;
      readonly reason: 'RUN_FACTURAMA_SANDBOX_STAMP must be exactly "true"';
    }
  | {
      readonly enabled: true;
      readonly credentialReference: typeof FACTURAMA_SANDBOX_CREDENTIAL_REF;
      readonly credentials: FacturamaSandboxStampCredentials;
      readonly issuer: FacturamaSandboxStampIssuerFixture;
    };

/**
 * Enforces the write-contract kill switch before NestJS or the PAC adapter is
 * initialized. The only enabled URL is the Facturama Sandbox origin.
 */
export function getFacturamaSandboxStampConfig(
  environment: NodeJS.ProcessEnv = process.env,
): FacturamaSandboxStampConfig {
  if (environment.RUN_FACTURAMA_SANDBOX_STAMP !== 'true') {
    return {
      enabled: false,
      reason: 'RUN_FACTURAMA_SANDBOX_STAMP must be exactly "true"',
    };
  }

  if (environment.CFDI_ENABLED !== 'true') {
    throw new Error(
      'CFDI_ENABLED must be exactly "true" for the protected stamp contract',
    );
  }
  if (environment.FISCAL_PROVIDER !== 'FACTURAMA') {
    throw new Error(
      'FISCAL_PROVIDER must be exactly FACTURAMA for the protected stamp contract',
    );
  }
  if (environment.FISCAL_PROVIDER_ENVIRONMENT !== 'SANDBOX') {
    throw new Error(
      'FISCAL_PROVIDER_ENVIRONMENT must be SANDBOX for the protected stamp contract',
    );
  }
  if (environment.FACTURAMA_API_BASE_URL !== FACTURAMA_SANDBOX_BASE_URL) {
    throw new Error(
      `FACTURAMA_API_BASE_URL must be exactly ${FACTURAMA_SANDBOX_BASE_URL}`,
    );
  }
  if (environment.FACTURAMA_API_MODE !== 'MULTI_ISSUER') {
    throw new Error(
      'FACTURAMA_API_MODE must be exactly MULTI_ISSUER for the protected stamp contract',
    );
  }
  if (
    environment.FACTURAMA_CREDENTIAL_REF !== FACTURAMA_SANDBOX_CREDENTIAL_REF
  ) {
    throw new Error(
      `FACTURAMA_CREDENTIAL_REF must be exactly ${FACTURAMA_SANDBOX_CREDENTIAL_REF}`,
    );
  }

  const username = requiredCredentialValue(
    environment,
    'FACTURAMA_SANDBOX_USERNAME',
  );
  const password = requiredSecret(environment, 'FACTURAMA_SANDBOX_PASSWORD');

  return {
    enabled: true,
    credentialReference: FACTURAMA_SANDBOX_CREDENTIAL_REF,
    credentials: { username, password },
    issuer: {
      taxId: requiredValue(environment, 'FACTURAMA_SANDBOX_ISSUER_RFC'),
      legalName: requiredValue(environment, 'FACTURAMA_SANDBOX_ISSUER_NAME'),
      fiscalRegime: requiredValue(
        environment,
        'FACTURAMA_SANDBOX_ISSUER_FISCAL_REGIME',
      ),
      fiscalPostalCode: requiredValue(
        environment,
        'FACTURAMA_SANDBOX_ISSUER_POSTAL_CODE',
      ),
    },
  };
}

function requiredValue(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required for the protected stamp contract`);
  }
  return value;
}

function requiredCredentialValue(
  environment: NodeJS.ProcessEnv,
  name: string,
): string {
  const value = environment[name]?.trim();
  if (!value) {
    throw new Error(
      'FACTURAMA_SANDBOX_USERNAME and FACTURAMA_SANDBOX_PASSWORD are required before the protected stamp',
    );
  }
  return value;
}

function requiredSecret(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name];
  if (!value?.trim()) {
    throw new Error(
      'FACTURAMA_SANDBOX_USERNAME and FACTURAMA_SANDBOX_PASSWORD are required before the protected stamp',
    );
  }
  return value;
}

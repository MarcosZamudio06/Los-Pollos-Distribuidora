import type { FiscalProviderEnvironment } from '../domain/fiscal-provider.port';

/** Secret-manager boundary; credentials never belong to the fiscal domain. */
export interface FiscalProviderCredential {
  readonly username: string;
  readonly password: string;
}

export interface FiscalCredentialResolver {
  resolve(
    reference: string,
    environment: FiscalProviderEnvironment,
  ): Promise<FiscalProviderCredential>;
}

export const FISCAL_CREDENTIAL_RESOLVER = Symbol('FISCAL_CREDENTIAL_RESOLVER');

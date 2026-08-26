import { ConfigService } from '@nestjs/config';

import { FacturamaAdapter } from './facturama/facturama.adapter';
import {
  DisabledFiscalProvider,
  FiscalProviderResolver,
} from './fiscal-provider.resolver';

describe('FiscalProviderResolver', () => {
  const facturama = { providerKey: 'FACTURAMA' } as FacturamaAdapter;

  it('returns the configured concrete Facturama adapter', () => {
    const resolver = new FiscalProviderResolver(
      new ConfigService({
        CFDI_ENABLED: true,
        FISCAL_PROVIDER: 'FACTURAMA',
        FISCAL_PROVIDER_ENVIRONMENT: 'SANDBOX',
        FACTURAMA_API_BASE_URL: 'https://apisandbox.facturama.mx',
        FACTURAMA_API_MODE: 'MULTI_ISSUER',
        FACTURAMA_CREDENTIAL_REF: 'docker-secret://facturama-sandbox',
      }),
      [facturama],
    );

    expect(resolver.resolve()).toBe(facturama);
  });

  it('returns a disabled provider when NONE is configured and CFDI is disabled', () => {
    const resolver = new FiscalProviderResolver(
      new ConfigService({ CFDI_ENABLED: false, FISCAL_PROVIDER: 'NONE' }),
      [facturama],
    );

    expect(resolver.resolve()).toBeInstanceOf(DisabledFiscalProvider);
  });

  it('rejects an unknown provider explicitly', () => {
    const resolver = new FiscalProviderResolver(
      new ConfigService({ CFDI_ENABLED: true, FISCAL_PROVIDER: 'UNKNOWN' }),
      [facturama],
    );

    expect(() => resolver.resolve()).toThrow('FISCAL_PROVIDER_UNKNOWN');
  });

  it.each([
    ['FISCAL_PROVIDER_ENVIRONMENT', undefined],
    ['FACTURAMA_API_BASE_URL', undefined],
    ['FACTURAMA_API_MODE', undefined],
    ['FACTURAMA_CREDENTIAL_REF', undefined],
  ])(
    'rejects enabled Facturama with incomplete %s configuration',
    (key, value) => {
      const configuration: Record<string, unknown> = {
        CFDI_ENABLED: true,
        FISCAL_PROVIDER: 'FACTURAMA',
        FISCAL_PROVIDER_ENVIRONMENT: 'SANDBOX',
        FACTURAMA_API_BASE_URL: 'https://apisandbox.facturama.mx',
        FACTURAMA_API_MODE: 'MULTI_ISSUER',
        FACTURAMA_CREDENTIAL_REF: 'docker-secret://facturama-sandbox',
        [key]: value,
      };
      const resolver = new FiscalProviderResolver(
        new ConfigService(configuration),
        [facturama],
      );

      expect(() => resolver.resolve()).toThrow('FISCAL_PROVIDER_CONFIGURATION');
    },
  );
});

import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';

import { CfdiModule } from './cfdi.module';
import {
  FISCAL_CREDENTIAL_RESOLVER,
  DockerSecretFiscalCredentialResolver,
} from './adapters/fiscal-credential.resolver';
import { FacturamaAdapter } from './adapters/facturama/facturama.adapter';
import {
  FISCAL_PROVIDER_PORT,
  type FiscalProviderPort,
} from './domain/fiscal-provider.port';

describe('CfdiModule fiscal provider wiring', () => {
  let moduleFixture: TestingModule | undefined;

  afterEach(async () => {
    jest.restoreAllMocks();
    await moduleFixture?.close();
  });

  it('wires the configured adapter and the concrete credential resolver', async () => {
    moduleFixture = await compileCfdiModule({
      CFDI_ENABLED: true,
      FISCAL_PROVIDER: 'FACTURAMA',
      FISCAL_PROVIDER_ENVIRONMENT: 'SANDBOX',
      FACTURAMA_API_BASE_URL: 'https://apisandbox.facturama.mx',
      FACTURAMA_API_MODE: 'MULTI_ISSUER',
      FACTURAMA_CREDENTIAL_REF: 'docker-secret://facturama-sandbox',
    });

    expect(moduleFixture.get(FISCAL_PROVIDER_PORT)).toBeInstanceOf(
      FacturamaAdapter,
    );
    expect(moduleFixture.get(FISCAL_CREDENTIAL_RESOLVER)).toBeInstanceOf(
      DockerSecretFiscalCredentialResolver,
    );
  });

  it('fails module wiring for an unknown provider', async () => {
    await expect(
      compileCfdiModule({ CFDI_ENABLED: true, FISCAL_PROVIDER: 'UNKNOWN' }),
    ).rejects.toThrow('FISCAL_PROVIDER_UNKNOWN');
  });

  it('fails module wiring for incomplete enabled provider configuration', async () => {
    await expect(
      compileCfdiModule({
        CFDI_ENABLED: true,
        FISCAL_PROVIDER: 'FACTURAMA',
        FISCAL_PROVIDER_ENVIRONMENT: 'SANDBOX',
      }),
    ).rejects.toThrow('FISCAL_PROVIDER_CONFIGURATION');
  });

  it('fails closed before HTTP when the configured credential secret is absent', async () => {
    moduleFixture = await compileCfdiModule({
      CFDI_ENABLED: true,
      FISCAL_PROVIDER: 'FACTURAMA',
      FISCAL_PROVIDER_ENVIRONMENT: 'SANDBOX',
      FACTURAMA_API_BASE_URL: 'https://apisandbox.facturama.mx',
      FACTURAMA_API_MODE: 'MULTI_ISSUER',
      FACTURAMA_CREDENTIAL_REF:
        'docker-secret://definitely-missing-facturama-secret',
    });
    const fetchSpy = jest.spyOn(globalThis, 'fetch');

    await expect(
      moduleFixture.get<FiscalProviderPort>(FISCAL_PROVIDER_PORT).getStatus({
        correlationId: 'missing-credentials',
        providerKey: 'FACTURAMA',
        providerDocumentId: 'provider-document-id',
      }),
    ).rejects.toMatchObject({
      code: 'FISCAL_PROVIDER_CREDENTIALS_UNAVAILABLE',
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

function compileCfdiModule(configuration: Record<string, unknown>) {
  return Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        ignoreEnvFile: true,
        load: [() => configuration],
      }),
      CfdiModule,
    ],
  }).compile();
}

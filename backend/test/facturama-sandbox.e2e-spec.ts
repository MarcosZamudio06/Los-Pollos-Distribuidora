import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';

import { CfdiModule } from '../src/modules/cfdi/cfdi.module';
import {
  FISCAL_CREDENTIAL_RESOLVER,
  type FiscalCredentialResolver,
} from '../src/modules/cfdi/adapters/fiscal-credential.resolver';
import {
  FISCAL_PROVIDER_PORT,
  type FiscalProviderPort,
} from '../src/modules/cfdi/domain/fiscal-provider.port';

describe('Facturama protected sandbox contract (e2e)', () => {
  it('is network-disabled in normal CI and reads an existing sandbox CFDI only when explicitly enabled', async () => {
    if (process.env.RUN_FACTURAMA_SANDBOX !== 'true') {
      expect(process.env.FISCAL_PROVIDER).not.toBe('FACTURAMA');
      return;
    }

    const username = requiredSecret('FACTURAMA_SANDBOX_USERNAME');
    const password = requiredSecret('FACTURAMA_SANDBOX_PASSWORD');
    const providerDocumentId = requiredSecret('FACTURAMA_SANDBOX_DOCUMENT_ID');
    const uuid = requiredSecret('FACTURAMA_SANDBOX_UUID').toUpperCase();
    const resolver: FiscalCredentialResolver = {
      resolve: (reference, environment) => {
        expect(reference).toBe('github-actions://facturama-sandbox');
        expect(environment).toBe('SANDBOX');
        return Promise.resolve({ username, password });
      },
    };
    const moduleFixture = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          ignoreEnvFile: true,
          load: [
            () => ({
              CFDI_ENABLED: true,
              FISCAL_PROVIDER: 'FACTURAMA',
              FISCAL_PROVIDER_ENVIRONMENT: 'SANDBOX',
              FACTURAMA_API_BASE_URL: 'https://apisandbox.facturama.mx',
              FACTURAMA_API_MODE: 'MULTI_ISSUER',
              FACTURAMA_CREDENTIAL_REF: 'github-actions://facturama-sandbox',
              CFDI_REQUEST_TIMEOUT_MS: 30_000,
            }),
          ],
        }),
        CfdiModule,
      ],
    })
      .overrideProvider(FISCAL_CREDENTIAL_RESOLVER)
      .useValue(resolver)
      .compile();
    const provider =
      moduleFixture.get<FiscalProviderPort>(FISCAL_PROVIDER_PORT);

    const status = await provider.getStatus({
      correlationId: 'github-actions-sandbox-status',
      providerKey: 'FACTURAMA',
      providerDocumentId,
      uuid,
    });
    const xml = await provider.getXml({
      correlationId: 'github-actions-sandbox-xml',
      providerKey: 'FACTURAMA',
      providerDocumentId,
    });

    expect(status.provider).toBe('FACTURAMA');
    expect(status.uuid).toBe(uuid);
    expect(xml.provider).toBe('FACTURAMA');
    expect(xml.artifactType).toBe('XML');
    expect(xml.content.length).toBeGreaterThan(0);
    await moduleFixture.close();
  });
});

function requiredSecret(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required by the protected sandbox`);
  return value;
}

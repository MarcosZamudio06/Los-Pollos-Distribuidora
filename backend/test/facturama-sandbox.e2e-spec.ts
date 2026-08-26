import { ConfigService } from '@nestjs/config';

import { FacturamaAdapter } from '../src/modules/cfdi/adapters/facturama/facturama.adapter';
import type { FiscalCredentialResolver } from '../src/modules/cfdi/adapters/fiscal-credential.resolver';

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
    const adapter = new FacturamaAdapter(
      new ConfigService({
        FISCAL_PROVIDER: 'FACTURAMA',
        FISCAL_PROVIDER_ENVIRONMENT: 'SANDBOX',
        FACTURAMA_API_BASE_URL: 'https://apisandbox.facturama.mx',
        FACTURAMA_API_MODE: 'MULTI_ISSUER',
        FACTURAMA_CREDENTIAL_REF: 'github-actions://facturama-sandbox',
        CFDI_REQUEST_TIMEOUT_MS: 30_000,
      }),
      resolver,
    );

    const status = await adapter.getStatus({
      correlationId: 'github-actions-sandbox-status',
      providerKey: 'FACTURAMA',
      providerDocumentId,
      uuid,
    });
    const xml = await adapter.getXml({
      correlationId: 'github-actions-sandbox-xml',
      providerKey: 'FACTURAMA',
      providerDocumentId,
    });

    expect(status.provider).toBe('FACTURAMA');
    expect(status.uuid).toBe(uuid);
    expect(xml.provider).toBe('FACTURAMA');
    expect(xml.artifactType).toBe('XML');
    expect(xml.content.length).toBeGreaterThan(0);
  });
});

function requiredSecret(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required by the protected sandbox`);
  return value;
}

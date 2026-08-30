import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';

import { CfdiModule } from '../src/modules/cfdi/cfdi.module';
import {
  DockerSecretFiscalCredentialResolver,
  FISCAL_CREDENTIAL_RESOLVER,
} from '../src/modules/cfdi/adapters/fiscal-credential.resolver';
import { FacturamaAdapter } from '../src/modules/cfdi/adapters/facturama/facturama.adapter';
import {
  FISCAL_PROVIDER_PORT,
  type FiscalProviderPort,
} from '../src/modules/cfdi/domain/fiscal-provider.port';
import { DisabledFiscalProvider } from '../src/modules/cfdi/adapters/fiscal-provider.resolver';

describe('CFDI PAC runtime wiring (e2e)', () => {
  let server: Server;
  let moduleFixture: TestingModule;
  let secretDirectory: string | undefined;

  afterEach(async () => {
    jest.restoreAllMocks();
    await moduleFixture?.close();
    if (server?.listening) {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
    if (secretDirectory) {
      await rm(secretDirectory, { recursive: true, force: true });
    }
  });

  it('resolves Facturama and crosses a real HTTP socket before normalizing the PAC response', async () => {
    const received: Array<{
      method?: string;
      url?: string;
      authorization?: string;
      correlationId?: string;
    }> = [];
    server = createServer((request, response) => {
      received.push({
        method: request.method,
        url: request.url,
        authorization: request.headers.authorization,
        correlationId: request.headers['x-correlation-id'] as
          string | undefined,
      });
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({
          Id: 'facturama-runtime-document',
          Date: '2026-08-26T10:00:00',
          Status: 'active',
          Complement: {
            TaxStamp: {
              Uuid: '215CEC43-7E57-44AC-9D63-B54BBC4745BD',
              Date: '2026-08-26T10:00:01',
              CfdiSign: 'synthetic-cfdi-seal',
              SatSign: 'synthetic-sat-seal',
              SatCertNumber: '20001000000300022323',
              RfcProvCertif: 'FLI081010EK2',
            },
          },
        }),
      );
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Local PAC sandbox did not expose a TCP port');
    }
    const localPacUrl = `http://127.0.0.1:${address.port}`;
    secretDirectory = await mkdtemp(
      join(tmpdir(), 'cfdi-pac-runtime-credentials-'),
    );
    await writeFile(
      join(secretDirectory, 'facturama-runtime-sandbox'),
      JSON.stringify({
        environment: 'SANDBOX',
        username: `runtime-sandbox-user-${process.pid}`,
        password: `runtime-sandbox-password-${process.pid}`,
      }),
      { mode: 0o600 },
    );
    const credentialResolver = new DockerSecretFiscalCredentialResolver(
      secretDirectory,
    );
    const realHttpFetcher: typeof fetch = (input, init) => {
      const pacUrl = new URL(
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url,
      );
      return globalThis.fetch(
        new URL(`${pacUrl.pathname}${pacUrl.search}`, localPacUrl),
        init,
      );
    };

    moduleFixture = await Test.createTestingModule({
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
              FACTURAMA_CREDENTIAL_REF:
                'docker-secret://facturama-runtime-sandbox',
              CFDI_REQUEST_TIMEOUT_MS: 5_000,
            }),
          ],
        }),
        CfdiModule,
      ],
    })
      .overrideProvider(FISCAL_CREDENTIAL_RESOLVER)
      .useValue(credentialResolver)
      .overrideProvider(FacturamaAdapter)
      .useFactory({
        inject: [ConfigService],
        factory: (config: ConfigService) =>
          new FacturamaAdapter(config, credentialResolver, realHttpFetcher),
      })
      .compile();

    const provider =
      moduleFixture.get<FiscalProviderPort>(FISCAL_PROVIDER_PORT);
    const status = await provider.getStatus({
      correlationId: 'runtime-http-correlation',
      providerKey: 'FACTURAMA',
      providerDocumentId: 'facturama-runtime-document',
      uuid: '215CEC43-7E57-44AC-9D63-B54BBC4745BD',
    });

    expect(provider).toBeInstanceOf(FacturamaAdapter);
    expect(received).toEqual([
      expect.objectContaining({
        method: 'GET',
        url: '/cfdi/facturama-runtime-document?type=issuedLite',
        authorization: expect.stringMatching(/^Basic /),
        correlationId: 'runtime-http-correlation',
      }),
    ]);
    expect(status).toMatchObject({
      provider: 'FACTURAMA',
      providerDocumentId: 'facturama-runtime-document',
      status: 'ACTIVE',
      uuid: '215CEC43-7E57-44AC-9D63-B54BBC4745BD',
    });
  });

  it('blocks all fiscal operations before Facturama credentials or HTTP are reached when CFDI is disabled', async () => {
    const received: Array<{ method?: string; url?: string }> = [];
    server = createServer((request, response) => {
      received.push({ method: request.method, url: request.url });
      response.writeHead(500);
      response.end();
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Local PAC sandbox did not expose a TCP port');
    }

    const stampSpy = jest.spyOn(FacturamaAdapter.prototype, 'stamp');
    const cancelSpy = jest.spyOn(FacturamaAdapter.prototype, 'cancel');
    const statusSpy = jest.spyOn(FacturamaAdapter.prototype, 'getStatus');
    const xmlSpy = jest.spyOn(FacturamaAdapter.prototype, 'getXml');
    const pdfSpy = jest.spyOn(FacturamaAdapter.prototype, 'getPdf');
    const credentialSpy = jest.spyOn(
      DockerSecretFiscalCredentialResolver.prototype,
      'resolve',
    );
    moduleFixture = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          ignoreEnvFile: true,
          load: [
            () => ({
              CFDI_ENABLED: false,
              FISCAL_PROVIDER: 'FACTURAMA',
              FISCAL_PROVIDER_ENVIRONMENT: 'SANDBOX',
              FACTURAMA_API_BASE_URL: `http://127.0.0.1:${address.port}`,
              FACTURAMA_API_MODE: 'MULTI_ISSUER',
              FACTURAMA_CREDENTIAL_REF:
                'docker-secret://missing-kill-switch-secret',
              CFDI_REQUEST_TIMEOUT_MS: 5_000,
            }),
          ],
        }),
        CfdiModule,
      ],
    }).compile();

    const provider =
      moduleFixture.get<FiscalProviderPort>(FISCAL_PROVIDER_PORT);

    expect(provider.providerKey).toBe('NONE');
    expect(provider).toBeInstanceOf(DisabledFiscalProvider);
    expect(provider).not.toBeInstanceOf(FacturamaAdapter);
    await expect(
      provider.stamp({
        correlationId: 'kill-switch-stamp',
        idempotencyKey: 'kill-switch-idempotency',
        folio: '1',
        snapshot: {} as never,
      }),
    ).rejects.toMatchObject({
      code: 'FISCAL_PROVIDER_CONFIGURATION',
      operation: 'STAMP',
      correlationId: 'kill-switch-stamp',
    });
    await expect(
      provider.cancel({
        correlationId: 'kill-switch-cancel',
        providerKey: 'FACTURAMA',
        providerDocumentId: 'provider-document-id',
        uuid: '215CEC43-7E57-44AC-9D63-B54BBC4745BD',
        motive: '02',
      }),
    ).rejects.toMatchObject({
      code: 'FISCAL_PROVIDER_CONFIGURATION',
      operation: 'CANCEL',
      correlationId: 'kill-switch-cancel',
    });
    await expect(
      provider.getStatus({
        correlationId: 'kill-switch-status',
        providerKey: 'FACTURAMA',
        providerDocumentId: 'provider-document-id',
      }),
    ).rejects.toMatchObject({
      code: 'FISCAL_PROVIDER_CONFIGURATION',
      operation: 'STATUS',
      correlationId: 'kill-switch-status',
    });
    await expect(
      provider.getXml({
        correlationId: 'kill-switch-xml',
        providerKey: 'FACTURAMA',
        providerDocumentId: 'provider-document-id',
      }),
    ).rejects.toMatchObject({
      code: 'FISCAL_PROVIDER_CONFIGURATION',
      operation: 'DOWNLOAD_XML',
      correlationId: 'kill-switch-xml',
    });
    await expect(
      provider.getPdf({
        correlationId: 'kill-switch-pdf',
        providerKey: 'FACTURAMA',
        providerDocumentId: 'provider-document-id',
      }),
    ).rejects.toMatchObject({
      code: 'FISCAL_PROVIDER_CONFIGURATION',
      operation: 'DOWNLOAD_PDF',
      correlationId: 'kill-switch-pdf',
    });

    expect(stampSpy).not.toHaveBeenCalled();
    expect(cancelSpy).not.toHaveBeenCalled();
    expect(statusSpy).not.toHaveBeenCalled();
    expect(xmlSpy).not.toHaveBeenCalled();
    expect(pdfSpy).not.toHaveBeenCalled();
    expect(credentialSpy).not.toHaveBeenCalled();
    expect(received).toEqual([]);
  });
});

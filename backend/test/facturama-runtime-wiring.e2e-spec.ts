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

describe('CFDI PAC runtime wiring (e2e)', () => {
  let server: Server;
  let moduleFixture: TestingModule;
  let secretDirectory: string | undefined;

  afterEach(async () => {
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
});

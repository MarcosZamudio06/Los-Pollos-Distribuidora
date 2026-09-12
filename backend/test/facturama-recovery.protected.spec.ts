import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';
import {
  getFacturamaSandboxStampConfig,
  FACTURAMA_SANDBOX_BASE_URL,
} from '../src/config/facturama-sandbox-stamp-guard';
import { PrismaService } from '../src/database/prisma.service';
import { FacturamaAdapter } from '../src/modules/cfdi/adapters/facturama/facturama.adapter';
import { CfdiIssuanceRepository } from '../src/modules/cfdi/cfdi-issuance.repository';
import { CfdiIssuanceService } from '../src/modules/cfdi/cfdi-issuance.service';
import { FiscalArtifactService } from '../src/modules/cfdi/fiscal-artifact.service';
import { StampReconciliationJob } from '../src/modules/cfdi/stamp-reconciliation.job';
import type { ObjectStoragePort } from '../src/modules/object-storage/object-storage.port';
import { assertDisposableE2eEnvironment } from './e2e-environment';
import { seedFixture } from './fixtures/cfdi-reconciliation.fixture';

/** Not selected by normal unit/e2e suites. No skipped PAC proof: guards fail. */
describe('CFDI-001 protected lost-response recovery', () => {
  it('recovers the same remote UUID/XML into PostgreSQL with exactly one stamp POST', async () => {
    const guarded = getFacturamaSandboxStampConfig();
    if (
      !guarded.enabled ||
      process.env.RUN_FACTURAMA_SANDBOX_RECOVERY !== 'true'
    ) {
      throw new Error(
        'Protected recovery requires explicit STAMP and RECOVERY opt-ins',
      );
    }
    assertDisposableE2eEnvironment();
    const certificateSerial =
      process.env.FACTURAMA_SANDBOX_CERTIFICATE_SERIAL?.trim();
    if (!certificateSerial || !/^\d{20}$/.test(certificateSerial)) {
      throw new Error(
        'Recovery requires the Sandbox issuer CSD certificate serial (20 digits)',
      );
    }
    const db = new PrismaClient({
      datasources: { db: { url: process.env.E2E_DATABASE_URL } },
    });
    const observer = new PrismaClient({
      datasources: { db: { url: process.env.E2E_DATABASE_URL } },
    });
    const logs = ['log', 'warn', 'error'].map((level) =>
      jest
        .spyOn(Logger.prototype, level as 'log')
        .mockImplementation(() => undefined),
    );
    const config = new ConfigService({
      FACTURAMA_API_BASE_URL: FACTURAMA_SANDBOX_BASE_URL,
      FACTURAMA_API_MODE: 'MULTI_ISSUER',
      FACTURAMA_CREDENTIAL_REF: guarded.credentialReference,
      FISCAL_PROVIDER: 'FACTURAMA',
      FISCAL_PROVIDER_ENVIRONMENT: 'SANDBOX',
      CFDI_REQUEST_TIMEOUT_MS: 30_000,
      CFDI_MAX_RETRIES: 3,
    });
    const resolver = { resolve: () => Promise.resolve(guarded.credentials) };
    let posts = 0;
    let oracle: { id: string; uuid: string; xml: Uint8Array } | undefined;
    const realFetch = globalThis.fetch.bind(globalThis);
    const oracleAdapter = new FacturamaAdapter(config, resolver, realFetch);
    const provider = new FacturamaAdapter(
      config,
      resolver,
      async (input, init) => {
        if (new URL(input).origin !== FACTURAMA_SANDBOX_BASE_URL)
          throw new Error('Sandbox only');
        if (init?.method !== 'POST') return realFetch(input, init);
        posts += 1;
        if (posts !== 1) throw new Error('Second stamp POST forbidden');
        const result = await realFetch(input, init);
        if (!result.ok) return result;
        // The fault injector, not the application, consumes the successful PAC
        // response and captures its oracle. Nothing is forwarded or persisted.
        const body = (await result.json()) as {
          Id?: string;
          Complement?: { TaxStamp?: { Uuid?: string } };
        };
        const id = body.Id;
        const uuid = body.Complement?.TaxStamp?.Uuid;
        if (!id || !uuid) throw new Error('PAC oracle unavailable');
        const xml = await oracleAdapter.getXml({
          correlationId: 'recovery-oracle',
          providerKey: 'FACTURAMA',
          providerDocumentId: id,
        });
        oracle = { id, uuid: uuid.toUpperCase(), xml: xml.content };
        throw new DOMException(
          'Deliberately lost successful stamp response',
          'AbortError',
        );
      },
    );
    const objects = new Map<string, Buffer>();
    const storage: ObjectStoragePort = {
      isConfigured: () => true,
      putObject: ({ key, body }) => {
        objects.set(key, Buffer.from(body));
        return Promise.resolve();
      },
      deleteObject: () => Promise.reject(new Error('Deletion forbidden')),
      getDownloadUrl: () =>
        Promise.reject(new Error('Public downloads forbidden')),
    };
    try {
      await db.$connect();
      await observer.$connect();
      const fixture = await seedFixture(db, {
        sandbox: { issuer: guarded.issuer, certificateSerial },
      });
      const prepared = fixture.prepared!;
      const prisma = db as unknown as PrismaService;
      // The fixture creates the canonical commercial graph and reserved STAMP
      // transaction. Only preparation is substituted; failure/finalization,
      // the PAC adapter, job and artifact metadata use real production code.
      const repository = new CfdiIssuanceRepository(prisma, undefined as never);
      const preparation = jest
        .spyOn(repository, 'prepare')
        .mockResolvedValueOnce(prepared);
      const artifacts = new FiscalArtifactService(
        prisma,
        storage,
        provider,
        config,
      );
      const issuance = new CfdiIssuanceService(repository, provider, artifacts);
      const result = await issuance.issue(
        fixture.billingRequestId,
        {
          expectedVersion: 1,
          cfdiUse: 'G03',
          paymentMethod: 'PUE',
          paymentForm: '01',
          exportCode: '01',
        },
        { id: prepared.actorUserId, role: 'ADMIN' },
        prepared.idempotencyKey,
      );
      preparation.mockRestore();
      expect(result.fiscalStatus).toBe('UNKNOWN');
      expect(Boolean(oracle)).toBe(true);
      const initial = await observer.fiscalOperationAttempt.findUniqueOrThrow({
        where: { id: fixture.stampAttemptId },
      });
      expect(initial.providerReference).toBeNull();
      expect(initial.status).toBe('UNKNOWN');
      const job = new StampReconciliationJob(
        prisma,
        provider,
        artifacts,
        config,
      );
      // Poll only GET/RECOVERY at the durable backoff; never repeat issue().
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const pending = await observer.fiscalOperationAttempt.findUniqueOrThrow(
          { where: { id: fixture.stampAttemptId } },
        );
        if (pending.nextRetryAt) {
          await new Promise((resolve) =>
            setTimeout(
              resolve,
              Math.max(0, pending.nextRetryAt!.getTime() - Date.now()) + 10,
            ),
          );
        }
        await job.reconcile();
        const state = await observer.invoice.findUniqueOrThrow({
          where: { id: fixture.invoiceId },
        });
        if (state.fiscalStatus === 'STAMPED') break;
        const source = await observer.fiscalOperationAttempt.findUniqueOrThrow({
          where: { id: fixture.stampAttemptId },
        });
        if (!source.nextRetryAt) break;
      }
      const final = await observer.invoice.findUniqueOrThrow({
        where: { id: fixture.invoiceId },
      });
      expect(final.fiscalStatus).toBe('STAMPED');
      // Booleans avoid leaking UUID/XML through Jest failure diffs.
      expect(final.uuid === oracle!.uuid).toBe(true);
      const stampAttempts = await observer.fiscalOperationAttempt.findMany({
        where: { invoiceId: fixture.invoiceId, operation: 'STAMP' },
      });
      expect(stampAttempts).toHaveLength(1);
      expect(stampAttempts[0].providerReference === oracle!.id).toBe(true);
      expect(stampAttempts[0].status).toBe('SUCCEEDED');
      const artifact = await observer.fiscalArtifact.findFirstOrThrow({
        where: {
          invoiceId: fixture.invoiceId,
          type: 'XML',
          status: 'AVAILABLE',
        },
      });
      expect(
        artifact.sha256 ===
          createHash('sha256').update(oracle!.xml).digest('hex'),
      ).toBe(true);
      expect(
        objects.get(artifact.storageKey)?.equals(Buffer.from(oracle!.xml)),
      ).toBe(true);
      const remoteCertificate = /\bNoCertificado\s*=\s*["'](\d{20})["']/.exec(
        Buffer.from(oracle!.xml).toString('utf8'),
      )?.[1];
      expect(remoteCertificate === certificateSerial).toBe(true);
      // Independent raw search, not findStampedDocument(), proves the remote
      // count visible to the documented API (not global PAC index consistency).
      let matches = 0;
      let exhausted = false;
      for (let page = 0; page < 3; page += 1) {
        const query = new URLSearchParams({
          type: 'issuedLite',
          status: 'all',
          rfcIssuer: guarded.issuer.taxId,
          serie: prepared.series,
          folio: prepared.folio,
          page: String(page),
        });
        const remote = await realFetch(
          `${FACTURAMA_SANDBOX_BASE_URL}/cfdi?${query}`,
          {
            headers: {
              Authorization: `Basic ${Buffer.from(`${guarded.credentials.username}:${guarded.credentials.password}`).toString('base64')}`,
            },
            signal: AbortSignal.timeout(30_000),
            redirect: 'error',
          },
        );
        expect(remote.ok).toBe(true);
        const rows = (await remote.json()) as Array<{
          Id: string;
          Uuid: string;
          RfcIssuer: string;
          Serie: string;
          Folio: string;
        }>;
        expect(Array.isArray(rows)).toBe(true);
        for (const row of rows) {
          if (
            row.RfcIssuer === guarded.issuer.taxId &&
            row.Serie === prepared.series &&
            row.Folio === prepared.folio
          ) {
            matches += 1;
            expect(
              row.Id === oracle!.id && row.Uuid.toUpperCase() === oracle!.uuid,
            ).toBe(true);
          }
        }
        if (rows.length < 100) {
          exhausted = true;
          break;
        }
      }
      expect(exhausted).toBe(true);
      expect(matches).toBe(1);
      expect(posts).toBe(1);
    } finally {
      await db.$disconnect();
      await observer.$disconnect();
      logs.forEach((spy) => spy.mockRestore());
    }
  }, 600_000);
});

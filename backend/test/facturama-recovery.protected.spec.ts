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

type RecoveryReceiver = {
  taxId: string;
  fiscalName: string;
  fiscalPostalCode: string;
  fiscalRegime: string;
  fiscalUseCode: string;
};

type ReceiverValidationResponse = {
  IsValid?: unknown;
  ExistRfc?: unknown;
  MatchName?: unknown;
  MatchZipCode?: unknown;
  MatchFiscalRegime?: unknown;
};

type StampFailureDiagnostic = {
  status: number;
  body: string;
};

const PAC_ERROR_BODY_LIMIT = 512;

const RECEIVER_SECRET_NAMES = [
  'FACTURAMA_SANDBOX_RECEIVER_RFC',
  'FACTURAMA_SANDBOX_RECEIVER_NAME',
  'FACTURAMA_SANDBOX_RECEIVER_FISCAL_REGIME',
  'FACTURAMA_SANDBOX_RECEIVER_POSTAL_CODE',
  'FACTURAMA_SANDBOX_RECEIVER_CFDI_USE',
] as const;

function readRecoveryReceiver(
  env: NodeJS.ProcessEnv = process.env,
): RecoveryReceiver {
  const missingSecrets = RECEIVER_SECRET_NAMES.filter(
    (name) => !env[name]?.trim(),
  );
  if (missingSecrets.length > 0) {
    throw new Error(
      `Protected recovery requires receiver secrets: ${missingSecrets.join(', ')}`,
    );
  }

  return {
    taxId: env.FACTURAMA_SANDBOX_RECEIVER_RFC!.trim(),
    fiscalName: env.FACTURAMA_SANDBOX_RECEIVER_NAME!.trim(),
    fiscalRegime: env.FACTURAMA_SANDBOX_RECEIVER_FISCAL_REGIME!.trim(),
    fiscalPostalCode: env.FACTURAMA_SANDBOX_RECEIVER_POSTAL_CODE!.trim(),
    fiscalUseCode: env.FACTURAMA_SANDBOX_RECEIVER_CFDI_USE!.trim(),
  };
}

async function preflightRecoveryReceiver(
  receiver: RecoveryReceiver,
  credentials: { username: string; password: string },
  fetchImpl: typeof fetch,
): Promise<void> {
  let response: Response;
  try {
    response = await fetchImpl(
      `${FACTURAMA_SANDBOX_BASE_URL}/api/customers/validate`,
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          Authorization: `Basic ${Buffer.from(`${credentials.username}:${credentials.password}`).toString('base64')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          Rfc: receiver.taxId,
          Name: receiver.fiscalName,
          ZipCode: receiver.fiscalPostalCode,
          FiscalRegime: receiver.fiscalRegime,
        }),
        signal: AbortSignal.timeout(30_000),
        redirect: 'error',
      },
    );
  } catch {
    throw new Error(
      'CFDI_SANDBOX_RECEIVER_PREFLIGHT_FAILED: Facturama Sandbox validation request failed',
    );
  }

  if (!response.ok) {
    throw new Error(
      `CFDI_SANDBOX_RECEIVER_PREFLIGHT_FAILED: Facturama Sandbox returned HTTP ${response.status}`,
    );
  }

  let validation: ReceiverValidationResponse;
  try {
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new Error('Invalid validation response');
    }
    validation = payload as ReceiverValidationResponse;
  } catch {
    throw new Error(
      'CFDI_SANDBOX_RECEIVER_PREFLIGHT_FAILED: Facturama Sandbox returned an unreadable validation response',
    );
  }

  const checks = {
    IsValid: validation.IsValid,
    ExistRfc: validation.ExistRfc,
    MatchName: validation.MatchName,
    MatchZipCode: validation.MatchZipCode,
    MatchFiscalRegime: validation.MatchFiscalRegime,
  };
  const failedChecks = Object.entries(checks)
    .filter(([, value]) => value !== true)
    .map(([name]) => name);
  if (failedChecks.length > 0) {
    throw new Error(
      `CFDI_SANDBOX_RECEIVER_INVALID: Facturama did not confirm ${failedChecks.join(', ')}`,
    );
  }
}

function createSingleStampPostTransport(
  fetchImpl: typeof fetch,
  onSuccessfulStamp: (response: Response) => Promise<Response> = (response) =>
    Promise.resolve(response),
  sensitiveValues: readonly string[] = [],
): {
  fetch: typeof fetch;
  readonly stampPostCount: number;
  readonly stampFailureDiagnostic: StampFailureDiagnostic | undefined;
} {
  let stampPostCount = 0;
  let stampFailureDiagnostic: StampFailureDiagnostic | undefined;
  const guardedFetch: typeof fetch = async (input, init) => {
    if (init?.method !== 'POST') return fetchImpl(input, init);
    if (stampPostCount > 0) {
      throw new Error('Second stamp POST forbidden');
    }
    stampPostCount += 1;

    const response = await fetchImpl(input, init);
    if (!response.ok) {
      let body = '[unreadable PAC error body]';
      try {
        body = await response.clone().text();
      } catch {
        // Keep the bounded placeholder without exposing the original failure.
      }
      for (const value of sensitiveValues) {
        if (value) body = body.split(value).join('[REDACTED]');
      }
      body = body
        .replace(
          /"(?:authorization|username|password)"\s*:\s*"[^"]*"/gi,
          '"[REDACTED]":"[REDACTED]"',
        )
        .replace(/\b(?:basic|bearer)\s+[a-z0-9._~+/=-]+/gi, '[REDACTED]')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, PAC_ERROR_BODY_LIMIT);
      stampFailureDiagnostic = { status: response.status, body };
      return response;
    }
    return onSuccessfulStamp(response);
  };

  return {
    fetch: guardedFetch,
    get stampPostCount() {
      return stampPostCount;
    },
    get stampFailureDiagnostic() {
      return stampFailureDiagnostic;
    },
  };
}

function stampFailureMessage(diagnostic: StampFailureDiagnostic): string {
  return `FACTURAMA_STAMP_REJECTED: HTTP ${diagnostic.status}; body=${diagnostic.body}`;
}

describe('CFDI-001 recovery receiver preflight', () => {
  const receiverEnvironment = {
    FACTURAMA_SANDBOX_RECEIVER_RFC: 'TST010101AA1',
    FACTURAMA_SANDBOX_RECEIVER_NAME: 'FACTURAMA TEST RECEIVER',
    FACTURAMA_SANDBOX_RECEIVER_FISCAL_REGIME: '601',
    FACTURAMA_SANDBOX_RECEIVER_POSTAL_CODE: '01000',
    FACTURAMA_SANDBOX_RECEIVER_CFDI_USE: 'G03',
  };
  const credentials = {
    username: 'sandbox-test-user',
    password: 'sandbox-test-password',
  };
  const validValidation = {
    IsValid: true,
    ExistRfc: true,
    MatchName: true,
    MatchZipCode: true,
    MatchFiscalRegime: true,
  };

  function validationFetch(overrides: Record<string, boolean> = {}) {
    return jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({ ...validValidation, ...overrides }),
    } as unknown as Response);
  }

  it('allows issue to continue only after a fully valid receiver response', async () => {
    const receiver = readRecoveryReceiver(receiverEnvironment);
    const fetchMock = validationFetch();
    const issue = jest.fn().mockResolvedValue({ fiscalStatus: 'UNKNOWN' });

    await preflightRecoveryReceiver(
      receiver,
      credentials,
      fetchMock as unknown as typeof fetch,
    );
    await issue();

    expect(issue).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${FACTURAMA_SANDBOX_BASE_URL}/api/customers/validate`);
    expect(request.method).toBe('POST');
    if (typeof request.body !== 'string') {
      throw new Error('Facturama validation body must be JSON text');
    }
    expect(JSON.parse(request.body)).toEqual({
      Rfc: receiver.taxId,
      Name: receiver.fiscalName,
      ZipCode: receiver.fiscalPostalCode,
      FiscalRegime: receiver.fiscalRegime,
    });
    expect(receiver.fiscalUseCode).toBe('G03');
  });

  it.each([
    'IsValid',
    'ExistRfc',
    'MatchName',
    'MatchZipCode',
    'MatchFiscalRegime',
  ])('aborts before stamp when %s is not true', async (failedCheck) => {
    const receiver = readRecoveryReceiver(receiverEnvironment);
    const fetchMock = validationFetch({ [failedCheck]: false });
    const stamp = jest.fn();

    await expect(
      (async () => {
        await preflightRecoveryReceiver(
          receiver,
          credentials,
          fetchMock as unknown as typeof fetch,
        );
        await stamp();
      })(),
    ).rejects.toThrow('CFDI_SANDBOX_RECEIVER_INVALID');

    expect(stamp).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fails on missing receiver secrets before making any PAC request', async () => {
    const fetchMock = jest.fn();

    await expect(
      (async () => {
        const receiver = readRecoveryReceiver({});
        await preflightRecoveryReceiver(
          receiver,
          credentials,
          fetchMock as unknown as typeof fetch,
        );
      })(),
    ).rejects.toThrow('FACTURAMA_SANDBOX_RECEIVER_RFC');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('blocks a second stamp POST before dispatching it', async () => {
    const dispatch = jest.fn(
      () => Promise.resolve({ ok: true }) as Promise<Response>,
    );
    const transport = createSingleStampPostTransport(
      dispatch as unknown as typeof fetch,
    );
    const url = `${FACTURAMA_SANDBOX_BASE_URL}/api/cfdi`;

    await transport.fetch(url, { method: 'POST' });
    await expect(transport.fetch(url, { method: 'POST' })).rejects.toThrow(
      'Second stamp POST forbidden',
    );

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(transport.stampPostCount).toBe(1);
  });

  it('retains bounded sanitized diagnostics for a rejected stamp POST', async () => {
    const username = 'diagnostic-user';
    const password = 'diagnostic-password';
    const authorization = 'Bearer diagnostic-token';
    const transport = createSingleStampPostTransport(
      jest.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            message: 'CFDI rejected',
            username,
            password,
            Authorization: authorization,
            detail: 'x'.repeat(1_000),
          }),
          { status: 422 },
        ),
      ) as unknown as typeof fetch,
      undefined,
      [username, password, authorization],
    );

    await transport.fetch(`${FACTURAMA_SANDBOX_BASE_URL}/api/cfdi`, {
      method: 'POST',
    });

    expect(transport.stampFailureDiagnostic).toMatchObject({ status: 422 });
    expect(transport.stampFailureDiagnostic?.body.length).toBeLessThanOrEqual(
      512,
    );
    expect(transport.stampFailureDiagnostic?.body).not.toContain(username);
    expect(transport.stampFailureDiagnostic?.body).not.toContain(password);
    expect(transport.stampFailureDiagnostic?.body).not.toContain(authorization);
    expect(transport.stampFailureDiagnostic?.body).not.toContain(
      'Authorization',
    );
  });
});

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
    const receiver = readRecoveryReceiver(process.env);
    const realFetch = globalThis.fetch.bind(globalThis);
    // The validation endpoint is read-only. Its successful response is required
    // before database fixtures or the issuance service can create a CFDI.
    await preflightRecoveryReceiver(receiver, guarded.credentials, realFetch);

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
    let oracle: { id: string; uuid: string; xml: Uint8Array } | undefined;
    const oracleAdapter = new FacturamaAdapter(config, resolver, realFetch);
    const stampTransport = createSingleStampPostTransport(
      (input, init) => {
        const requestUrl =
          input instanceof Request ? input.url : input.toString();
        if (new URL(requestUrl).origin !== FACTURAMA_SANDBOX_BASE_URL)
          throw new Error('Sandbox only');
        return realFetch(input, init);
      },
      async (result) => {
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
      [guarded.credentials.username, guarded.credentials.password],
    );
    const provider = new FacturamaAdapter(
      config,
      resolver,
      stampTransport.fetch,
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
        sandbox: {
          issuer: guarded.issuer,
          receiver,
          certificateSerial,
        },
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
      let result: Awaited<ReturnType<CfdiIssuanceService['issue']>>;
      try {
        result = await issuance.issue(
          fixture.billingRequestId,
          {
            expectedVersion: 1,
            cfdiUse: receiver.fiscalUseCode,
            paymentMethod: 'PUE',
            paymentForm: '01',
            exportCode: '01',
          },
          { id: prepared.actorUserId, role: 'ADMIN' },
          prepared.idempotencyKey,
        );
      } catch (error) {
        if (stampTransport.stampFailureDiagnostic) {
          throw new Error(
            stampFailureMessage(stampTransport.stampFailureDiagnostic),
          );
        }
        throw error;
      } finally {
        preparation.mockRestore();
      }
      if (stampTransport.stampFailureDiagnostic) {
        throw new Error(
          stampFailureMessage(stampTransport.stampFailureDiagnostic),
        );
      }
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
      expect(stampTransport.stampPostCount).toBe(1);
    } finally {
      await db.$disconnect();
      await observer.$disconnect();
      logs.forEach((spy) => spy.mockRestore());
    }
  }, 600_000);
});

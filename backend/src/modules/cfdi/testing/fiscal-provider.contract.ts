import { createHash } from 'node:crypto';
import type {
  FiscalArtifactCommand,
  FiscalCancelCommand,
  FiscalIssueCommand,
  FiscalProviderPort,
  FiscalStatusCommand,
} from '../domain/fiscal-provider.port';

export type FiscalProviderContractScenario =
  'STAMP' | 'STATUS_ACTIVE' | 'STATUS_UNKNOWN' | 'CANCEL' | 'DOWNLOAD_XML';

export interface FiscalProviderContractHarness {
  readonly provider: FiscalProviderPort;
  readonly issue: FiscalIssueCommand;
  readonly status: FiscalStatusCommand;
  readonly cancel: FiscalCancelCommand;
  readonly artifact: FiscalArtifactCommand;
}

export type FiscalProviderContractFactory = (
  scenario: FiscalProviderContractScenario,
) => FiscalProviderContractHarness;

/** Reusable behavioral contract for every PAC adapter. Provider-specific
 * fixtures stay in the adapter spec; assertions remain provider-neutral. */
export function fiscalProviderContract(
  adapterName: string,
  createHarness: FiscalProviderContractFactory,
): void {
  describe(`${adapterName} FiscalProviderPort contract`, () => {
    it('exposes provider-neutral identity and capabilities', () => {
      const { provider } = createHarness('STAMP');
      expect(provider.providerKey).toMatch(/^[A-Z][A-Z0-9_]{1,31}$/);
      expect(typeof provider.capabilities.providerSideIdempotency).toBe(
        'boolean',
      );
    });

    it('normalizes stamp identity and TFD metadata', async () => {
      const { provider, issue } = createHarness('STAMP');
      const result = await provider.stamp(issue);

      expect(result).toMatchObject({
        correlationId: issue.correlationId,
        provider: provider.providerKey,
        outcome: 'STAMPED',
        uuid: result.tfd.uuid,
      });
      expect(result.providerDocumentId).toEqual(expect.any(String));
      expect(result.xmlReference.artifactType).toBe('XML');
      expect(result.pdfReference.artifactType).toBe('PDF');
    });

    it('normalizes an active document status', async () => {
      const { provider, status } = createHarness('STATUS_ACTIVE');

      await expect(provider.getStatus(status)).resolves.toMatchObject({
        correlationId: status.correlationId,
        provider: provider.providerKey,
        status: 'ACTIVE',
      });
    });

    it('preserves an indeterminate status as UNKNOWN', async () => {
      const { provider, status } = createHarness('STATUS_UNKNOWN');

      await expect(provider.getStatus(status)).resolves.toMatchObject({
        correlationId: status.correlationId,
        provider: provider.providerKey,
        status: 'UNKNOWN',
      });
    });

    it('normalizes a completed cancellation', async () => {
      const { provider, cancel } = createHarness('CANCEL');

      await expect(provider.cancel(cancel)).resolves.toMatchObject({
        correlationId: cancel.correlationId,
        provider: provider.providerKey,
        providerDocumentId: cancel.providerDocumentId,
        uuid: cancel.uuid,
        status: 'CANCELLED',
      });
    });

    it('downloads normalized XML with a verified digest', async () => {
      const { provider, artifact } = createHarness('DOWNLOAD_XML');
      const result = await provider.getXml(artifact);

      expect(result).toMatchObject({
        correlationId: artifact.correlationId,
        provider: provider.providerKey,
        providerDocumentId: artifact.providerDocumentId,
        artifactType: 'XML',
        contentType: 'application/xml',
      });
      expect(result.sha256).toBe(
        createHash('sha256').update(result.content).digest('hex'),
      );
    });

    it('declares and honors provider-side issue idempotency when available', async () => {
      const { provider, issue } = createHarness('STAMP');
      expect(typeof provider.capabilities.providerSideIdempotency).toBe(
        'boolean',
      );
      if (!provider.capabilities.providerSideIdempotency) return;

      const first = await provider.stamp(issue);
      const replay = await provider.stamp(issue);
      expect(replay.providerDocumentId).toBe(first.providerDocumentId);
      expect(replay.uuid).toBe(first.uuid);
    });
  });
}

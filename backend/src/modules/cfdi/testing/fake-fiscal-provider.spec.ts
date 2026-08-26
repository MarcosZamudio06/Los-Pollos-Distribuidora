import { FakeFiscalProvider } from './fake-fiscal-provider';
import type { FiscalIssueCommand } from '../domain/fiscal-provider.port';

const command = {
  correlationId: 'corr-fake',
  idempotencyKey: 'idem-fake',
  folio: '1',
  snapshot: {
    issuedAt: '2026-08-22T10:00:00.000Z',
  },
} as FiscalIssueCommand;

describe('FakeFiscalProvider', () => {
  it('records calls and returns deterministic normalized results', async () => {
    const provider = new FakeFiscalProvider();

    const result = await provider.stamp(command);
    const xml = await provider.getXml({
      correlationId: 'corr-fake-xml',
      providerDocumentId: result.providerDocumentId,
    });

    expect(result.provider).toBe('FAKE');
    expect(provider.capabilities.providerSideIdempotency).toBe(true);
    expect(result.uuid).toHaveLength(36);
    expect(xml.artifactType).toBe('XML');
    expect(provider.calls.map((call) => call.operation)).toEqual([
      'stamp',
      'getXml',
    ]);
  });
});

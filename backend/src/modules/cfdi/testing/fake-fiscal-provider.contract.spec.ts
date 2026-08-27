import type { FiscalIssueCommand } from '../domain/fiscal-provider.port';
import {
  fiscalProviderContract,
  type FiscalProviderContractScenario,
} from './fiscal-provider.contract';
import { FakeFiscalProvider } from './fake-fiscal-provider';

const uuid = '215CEC43-7E57-44AC-9D63-B54BBC4745BD';
const issue = {
  correlationId: 'contract-stamp',
  idempotencyKey: 'contract-idempotency',
  folio: '100',
  snapshot: { issuedAt: '2026-08-24T10:00:00.000Z' },
} as FiscalIssueCommand;

fiscalProviderContract('FakeFiscalProvider', (scenario) => {
  const provider = providerFor(scenario);
  return {
    provider,
    issue,
    status: {
      correlationId: `contract-${scenario.toLowerCase()}`,
      providerKey: provider.providerKey,
      providerDocumentId: 'fake-100',
      uuid,
    },
    cancel: {
      correlationId: 'contract-cancel',
      providerKey: provider.providerKey,
      providerDocumentId: 'fake-100',
      uuid,
      motive: '02',
    },
    artifact: {
      correlationId: 'contract-download-xml',
      providerKey: provider.providerKey,
      providerDocumentId: 'fake-100',
    },
  };
});

function providerFor(scenario: FiscalProviderContractScenario) {
  if (scenario !== 'STATUS_UNKNOWN') return new FakeFiscalProvider();
  return new FakeFiscalProvider({
    getStatus: (command) => ({
      correlationId: command.correlationId,
      provider: 'FAKE',
      providerDocumentId: command.providerDocumentId,
      status: 'UNKNOWN',
      uuid: command.uuid ?? null,
      issuedAt: null,
      cancelledAt: null,
    }),
  });
}

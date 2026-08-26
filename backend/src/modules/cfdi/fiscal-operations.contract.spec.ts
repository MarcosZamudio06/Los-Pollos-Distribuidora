import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../../../../backend');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

describe('CFDI operations contract', () => {
  it.each([
    ['cfdi-issuance.service.ts', 'cfdi.stamp.started'],
    ['cfdi-issuance.service.ts', 'cfdi.stamp.completed'],
    ['cfdi-issuance.service.ts', 'cfdi.stamp.failed'],
    ['cfdi-issuance.service.ts', 'cfdi.stamp.unknown'],
    ['stamp-reconciliation.job.ts', 'cfdi.reconciliation.'],
    ['../billing/invoice-cancellation.service.ts', 'cfdi.cancel.'],
    ['fiscal-artifact.service.ts', 'cfdi.artifact.'],
    ['rep-issuance.service.ts', 'cfdi.rep.'],
  ])('%s emits %s structured events', (file, event) => {
    expect(read(`src/modules/cfdi/${file}`)).toContain(event);
  });

  it('documents every required recovery scenario', () => {
    const runbook = read('../docs/runbooks/cfdi-operations.md');
    for (const marker of [
      'PAC unavailable',
      'Unknown stamp state after timeout',
      'STAMPED invoice without XML',
      'XML available but PDF generation failed',
      'Customer did not receive the invoice',
      'Pending cancellation',
      'Database UUID does not match XML',
      'CSD nearing expiration',
      'Invalid PAC credentials',
      'Artifact restoration',
    ]) {
      expect(runbook).toContain(marker);
    }
    expect(runbook).not.toMatch(
      /\.key\s*[:=]|password\s*[:=]|<cfdi:Comprobante/i,
    );
  });
});

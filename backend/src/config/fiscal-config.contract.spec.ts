import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const productionCompose = readFileSync(
  resolve(__dirname, '../../../docker-compose.production.yml'),
  'utf8',
);

describe('fiscal production configuration contract', () => {
  it('propagates only fiscal references and non-secret settings', () => {
    expect(productionCompose).toContain(
      'FISCAL_PROVIDER: ${FISCAL_PROVIDER:-FACTURAMA}',
    );
    expect(productionCompose).toContain(
      'FISCAL_PROVIDER_ENVIRONMENT: ${FISCAL_PROVIDER_ENVIRONMENT:-PRODUCTION}',
    );
    expect(productionCompose).toContain(
      'FACTURAMA_CREDENTIAL_REF: ${FACTURAMA_CREDENTIAL_REF:-}',
    );
    expect(productionCompose).not.toMatch(
      /FACTURAMA_(?:USERNAME|PASSWORD|API_KEY|TOKEN|CREDENTIALS)\s*:/,
    );
    expect(productionCompose).not.toMatch(
      /CFDI_CSD_(?:KEY|PASSWORD|CERTIFICATE)\s*:/,
    );
  });
});

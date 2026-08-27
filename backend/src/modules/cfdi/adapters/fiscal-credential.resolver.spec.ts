import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { DockerSecretFiscalCredentialResolver } from './fiscal-credential.resolver';

describe('DockerSecretFiscalCredentialResolver', () => {
  let secretDirectory: string;

  beforeEach(async () => {
    secretDirectory = await mkdtemp(join(tmpdir(), 'cfdi-pac-credentials-'));
  });

  afterEach(async () => {
    await rm(secretDirectory, { recursive: true, force: true });
  });

  it('resolves a complete environment-bound Docker secret', async () => {
    await writeFile(
      join(secretDirectory, 'facturama-sandbox'),
      JSON.stringify({
        environment: 'SANDBOX',
        username: 'sandbox-user',
        password: 'sandbox-password',
      }),
      { mode: 0o600 },
    );
    const resolver = new DockerSecretFiscalCredentialResolver(secretDirectory);

    await expect(
      resolver.resolve('docker-secret://facturama-sandbox', 'SANDBOX'),
    ).resolves.toEqual({
      username: 'sandbox-user',
      password: 'sandbox-password',
    });
  });

  it.each([
    ['secret-manager://facturama/sandbox', 'SANDBOX'],
    ['docker-secret://../facturama', 'SANDBOX'],
    ['docker-secret://missing', 'SANDBOX'],
  ] as const)(
    'rejects unavailable or unsafe credential reference %s',
    async (reference, environment) => {
      const resolver = new DockerSecretFiscalCredentialResolver(
        secretDirectory,
      );

      await expect(resolver.resolve(reference, environment)).rejects.toThrow(
        'FISCAL_PROVIDER_CREDENTIALS_UNAVAILABLE',
      );
    },
  );

  it('rejects credentials bound to a different environment', async () => {
    await writeFile(
      join(secretDirectory, 'facturama'),
      JSON.stringify({
        environment: 'PRODUCTION',
        username: 'production-user',
        password: 'production-password',
      }),
      { mode: 0o600 },
    );
    const resolver = new DockerSecretFiscalCredentialResolver(secretDirectory);

    await expect(
      resolver.resolve('docker-secret://facturama', 'SANDBOX'),
    ).rejects.toThrow('FISCAL_PROVIDER_CREDENTIALS_UNAVAILABLE');
  });

  it('rejects incomplete credential material', async () => {
    await writeFile(
      join(secretDirectory, 'facturama'),
      JSON.stringify({ environment: 'SANDBOX', username: 'sandbox-user' }),
      { mode: 0o600 },
    );
    const resolver = new DockerSecretFiscalCredentialResolver(secretDirectory);

    await expect(
      resolver.resolve('docker-secret://facturama', 'SANDBOX'),
    ).rejects.toThrow('FISCAL_PROVIDER_CREDENTIALS_UNAVAILABLE');
  });
});

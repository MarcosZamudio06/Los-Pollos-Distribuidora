import { open } from 'node:fs/promises';
import { join } from 'node:path';

import type { FiscalProviderEnvironment } from '../domain/fiscal-provider.port';

/** Secret-manager boundary; credentials never belong to the fiscal domain. */
export interface FiscalProviderCredential {
  readonly username: string;
  readonly password: string;
}

export interface FiscalCredentialResolver {
  resolve(
    reference: string,
    environment: FiscalProviderEnvironment,
  ): Promise<FiscalProviderCredential>;
}

export const FISCAL_CREDENTIAL_RESOLVER = Symbol('FISCAL_CREDENTIAL_RESOLVER');

const DEFAULT_DOCKER_SECRET_DIRECTORY = '/run/secrets';
const MAX_CREDENTIAL_SECRET_BYTES = 4_096;
const DOCKER_SECRET_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

interface FiscalCredentialSecretEnvelope {
  readonly environment?: unknown;
  readonly username?: unknown;
  readonly password?: unknown;
}

/** Resolves environment-bound PAC credentials from one Docker secret file. */
export class DockerSecretFiscalCredentialResolver implements FiscalCredentialResolver {
  constructor(
    private readonly secretDirectory = DEFAULT_DOCKER_SECRET_DIRECTORY,
  ) {}

  async resolve(
    reference: string,
    environment: FiscalProviderEnvironment,
  ): Promise<FiscalProviderCredential> {
    try {
      const secretName = this.secretName(reference);
      const envelope = await this.readEnvelope(secretName);
      if (
        envelope.environment !== environment ||
        typeof envelope.username !== 'string' ||
        !envelope.username.trim() ||
        typeof envelope.password !== 'string' ||
        !envelope.password
      ) {
        throw new Error('invalid credential material');
      }
      return {
        username: envelope.username.trim(),
        password: envelope.password,
      };
    } catch {
      throw new Error('FISCAL_PROVIDER_CREDENTIALS_UNAVAILABLE');
    }
  }

  private secretName(reference: string): string {
    const parsed = new URL(reference);
    if (
      parsed.protocol !== 'docker-secret:' ||
      !DOCKER_SECRET_NAME.test(parsed.hostname) ||
      (parsed.pathname !== '' && parsed.pathname !== '/') ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash
    ) {
      throw new Error('unsupported credential reference');
    }
    return parsed.hostname;
  }

  private async readEnvelope(
    secretName: string,
  ): Promise<FiscalCredentialSecretEnvelope> {
    const handle = await open(join(this.secretDirectory, secretName), 'r');
    try {
      const buffer = Buffer.alloc(MAX_CREDENTIAL_SECRET_BYTES + 1);
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
      if (bytesRead === 0 || bytesRead > MAX_CREDENTIAL_SECRET_BYTES) {
        throw new Error('invalid credential secret size');
      }
      const parsed: unknown = JSON.parse(
        buffer.subarray(0, bytesRead).toString(),
      );
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('invalid credential secret');
      }
      return parsed;
    } finally {
      await handle.close();
    }
  }
}

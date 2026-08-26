import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { assertAllowlistedFacturamaBaseUrl } from '../../../config/fiscal-provider-url';
import type {
  FiscalArtifactCommand,
  FiscalArtifactContent,
  FiscalCancelCommand,
  FiscalCancellationResponse,
  FiscalIssueCommand,
  FiscalProviderPort,
  FiscalStampResponse,
  FiscalStatusCommand,
  FiscalStatusResponse,
} from '../domain/fiscal-provider.port';
import { FiscalProviderError } from '../domain/fiscal-provider.port';

const FACTURAMA_PROVIDER = 'FACTURAMA';
const NO_PROVIDER = 'NONE';
export const FISCAL_PROVIDER_ADAPTERS = Symbol('FISCAL_PROVIDER_ADAPTERS');

@Injectable()
export class FiscalProviderResolver {
  private readonly disabledProvider = new DisabledFiscalProvider();

  constructor(
    private readonly config: ConfigService,
    @Inject(FISCAL_PROVIDER_ADAPTERS)
    private readonly adapters: readonly FiscalProviderPort[],
  ) {}

  resolve(): FiscalProviderPort {
    const provider = this.config
      .get<string>('FISCAL_PROVIDER', NO_PROVIDER)
      .trim()
      .toUpperCase();

    if (provider === NO_PROVIDER) {
      if (this.cfdiEnabled()) {
        throw new Error('FISCAL_PROVIDER_CONFIGURATION');
      }
      return this.disabledProvider;
    }
    const adapter = this.adapters.find(
      (candidate) => candidate.providerKey.toUpperCase() === provider,
    );
    if (!adapter) {
      throw new Error('FISCAL_PROVIDER_UNKNOWN');
    }
    if (provider === FACTURAMA_PROVIDER && this.cfdiEnabled()) {
      this.assertFacturamaConfiguration();
    }
    return adapter;
  }

  private cfdiEnabled(): boolean {
    const value = this.config.get<boolean | string>('CFDI_ENABLED', false);
    return value === true || value === 'true';
  }

  private assertFacturamaConfiguration(): void {
    const environment = this.config.get<string>('FISCAL_PROVIDER_ENVIRONMENT');
    const baseUrl = this.config.get<string>('FACTURAMA_API_BASE_URL')?.trim();
    const mode = this.config.get<string>('FACTURAMA_API_MODE');
    const credentialRef = this.config
      .get<string>('FACTURAMA_CREDENTIAL_REF')
      ?.trim();
    if (
      (environment !== 'SANDBOX' && environment !== 'PRODUCTION') ||
      !baseUrl ||
      mode !== 'MULTI_ISSUER' ||
      !credentialRef
    ) {
      throw new Error('FISCAL_PROVIDER_CONFIGURATION');
    }
    try {
      assertAllowlistedFacturamaBaseUrl(baseUrl, environment);
    } catch {
      throw new Error('FISCAL_PROVIDER_CONFIGURATION');
    }
  }
}

export class DisabledFiscalProvider implements FiscalProviderPort {
  readonly providerKey = NO_PROVIDER;
  readonly capabilities = Object.freeze({ providerSideIdempotency: false });

  stamp(command: FiscalIssueCommand): Promise<FiscalStampResponse> {
    return this.unavailable('STAMP', command.correlationId);
  }

  cancel(command: FiscalCancelCommand): Promise<FiscalCancellationResponse> {
    return this.unavailable('CANCEL', command.correlationId);
  }

  getStatus(command: FiscalStatusCommand): Promise<FiscalStatusResponse> {
    return this.unavailable('STATUS', command.correlationId);
  }

  getXml(command: FiscalArtifactCommand): Promise<FiscalArtifactContent> {
    return this.unavailable('DOWNLOAD_XML', command.correlationId);
  }

  getPdf(command: FiscalArtifactCommand): Promise<FiscalArtifactContent> {
    return this.unavailable('DOWNLOAD_PDF', command.correlationId);
  }

  getCancellationStatus(
    command: FiscalStatusCommand,
  ): Promise<FiscalCancellationResponse> {
    return this.unavailable('CANCELLATION_STATUS', command.correlationId);
  }

  private unavailable<T>(
    operation: ConstructorParameters<typeof FiscalProviderError>[1],
    correlationId: string,
  ): Promise<T> {
    return Promise.reject(
      new FiscalProviderError(
        'FISCAL_PROVIDER_CONFIGURATION',
        operation,
        correlationId,
      ),
    );
  }
}

import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type RequestResult = string;

type ProviderRequestOptions<T> = {
  logger: Logger;
  provider: string;
  operation: string;
  unavailableMessage: string;
  timeoutMs: number;
  url: URL;
  init?: RequestInit;
  resultFor?: (payload: T) => RequestResult;
};

export async function requestProviderJson<T>({
  logger,
  provider,
  operation,
  unavailableMessage,
  timeoutMs,
  url,
  init,
  resultFor,
}: ProviderRequestOptions<T>): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();

  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) {
      logger.warn({
        provider,
        operation,
        outcome: 'failure',
        result: `http_${response.status}`,
        latencyMs: Date.now() - startedAt,
      });
      throw new ServiceUnavailableException(unavailableMessage);
    }

    const payload = (await response.json()) as T;
    logger.log({
      provider,
      operation,
      outcome: 'success',
      result: resultFor?.(payload) ?? 'success',
      latencyMs: Date.now() - startedAt,
    });
    return payload;
  } catch (error) {
    if (error instanceof ServiceUnavailableException) throw error;

    const timedOut = controller.signal.aborted;
    logger.warn({
      provider,
      operation,
      outcome: timedOut ? 'timeout' : 'failure',
      result: timedOut ? 'timeout' : 'transport_error',
      latencyMs: Date.now() - startedAt,
    });
    throw new ServiceUnavailableException(unavailableMessage);
  } finally {
    clearTimeout(timeout);
  }
}

export function requiredProviderUrl(
  config: ConfigService,
  key: string,
): string {
  const value = config.get<string>(key)?.trim();
  if (!value) throw new Error(`${key} is required`);

  try {
    const parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error();
  } catch {
    throw new Error(`${key} must be a valid HTTP URL`);
  }

  return value;
}

export function configuredTimeout(
  config: ConfigService,
  key: string,
  fallbackKey: string,
  fallbackValue: number,
): number {
  const value = Number(
    config.get<number | string>(key) ??
      config.get<number | string>(fallbackKey, fallbackValue),
  );
  return Number.isInteger(value) && value > 0 ? value : fallbackValue;
}

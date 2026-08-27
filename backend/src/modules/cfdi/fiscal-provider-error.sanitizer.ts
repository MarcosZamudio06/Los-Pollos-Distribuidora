const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SAFE_PROVIDER_IDENTIFIER = /^[A-Z][A-Z0-9_]{1,31}$/;
const SENSITIVE_KEY =
  /authorization|password|secret|token|api[-_]?key|credential|private[-_]?key|certificate/i;
const UNSAFE_CONTENT_KEY =
  /^(message|url|uri|href|body|data|headers?|request|response|error|details)$/i;
const SAFE_OPERATIONS = new Set([
  'STAMP',
  'CANCEL',
  'STATUS',
  'RECOVERY',
  'DOWNLOAD_XML',
  'DOWNLOAD_PDF',
  'CANCELLATION_STATUS',
]);

export interface FiscalProviderErrorContext {
  provider: string;
  operation: string;
  correlationId?: string;
}

export interface SanitizedFiscalProviderError {
  readonly code: 'FISCAL_PROVIDER_ERROR';
  readonly provider: string;
  readonly operation: string;
  readonly statusCode: number | null;
  readonly retryable: boolean;
  readonly correlationId?: string;
  readonly message: string;
}

function safeIdentifier(value: string, fallback: string): string {
  const normalized = value.trim().toUpperCase();
  return SAFE_IDENTIFIER.test(normalized) ? normalized : fallback;
}

function safeProvider(value: string): string {
  const normalized = value.trim().toUpperCase();
  return SAFE_PROVIDER_IDENTIFIER.test(normalized) &&
    !SENSITIVE_KEY.test(normalized)
    ? normalized
    : 'UNKNOWN';
}

function safeOperation(value: string): string {
  const normalized = safeIdentifier(value, 'UNKNOWN');
  return SAFE_OPERATIONS.has(normalized) ? normalized : 'UNKNOWN';
}

function statusCodeOf(error: unknown): number | null {
  if (!error || typeof error !== 'object') return null;
  const candidate = error as {
    status?: unknown;
    statusCode?: unknown;
    response?: { status?: unknown };
  };
  const status =
    candidate.status ?? candidate.statusCode ?? candidate.response?.status;
  return typeof status === 'number' && Number.isInteger(status)
    ? status >= 100 && status <= 599
      ? status
      : null
    : null;
}

function errorCodeOf(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code.toUpperCase() : null;
}

function isRetryable(
  statusCode: number | null,
  errorCode: string | null,
): boolean {
  if (statusCode === null) return true;
  if (statusCode === 408 || statusCode === 425 || statusCode === 429)
    return true;
  if (statusCode >= 500) return true;
  return errorCode === 'ECONNABORTED' || errorCode === 'ETIMEDOUT';
}

function genericMessage(statusCode: number | null): string {
  if (statusCode !== null && statusCode >= 400 && statusCode < 500) {
    return 'Fiscal provider rejected the request';
  }
  if (statusCode !== null && statusCode >= 500) {
    return 'Fiscal provider is temporarily unavailable';
  }
  return 'Fiscal provider request failed';
}

/**
 * Converts an arbitrary provider/HTTP error to a safe domain record.
 * Never copies provider messages, response bodies, URLs, headers, or tokens.
 */
export function sanitizeFiscalProviderError(
  error: unknown,
  context: FiscalProviderErrorContext,
): SanitizedFiscalProviderError {
  const statusCode = statusCodeOf(error);
  const errorCode = errorCodeOf(error);
  const correlationId = context.correlationId?.trim();

  return {
    code: 'FISCAL_PROVIDER_ERROR',
    provider: safeProvider(context.provider),
    operation: safeOperation(context.operation),
    statusCode,
    retryable: isRetryable(statusCode, errorCode),
    ...(correlationId && SAFE_IDENTIFIER.test(correlationId)
      ? { correlationId }
      : {}),
    message: genericMessage(statusCode),
  };
}

/**
 * Redacts arbitrary provider metadata before it can be attached to a log or
 * sanitized audit record. It is intentionally conservative and bounded.
 */
export function redactFiscalProviderMetadata(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => redactFiscalProviderMetadata(entry));
  }
  if (!value || typeof value !== 'object') {
    if (typeof value !== 'string') return value;
    return value.length > 256 ? `${value.slice(0, 256)}…` : value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      SENSITIVE_KEY.test(key) || UNSAFE_CONTENT_KEY.test(key)
        ? '[REDACTED]'
        : redactFiscalProviderMetadata(entry),
    ]),
  );
}

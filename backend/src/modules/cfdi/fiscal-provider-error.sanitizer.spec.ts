import {
  redactFiscalProviderMetadata,
  sanitizeFiscalProviderError,
} from './fiscal-provider-error.sanitizer';

describe('fiscal provider error sanitization', () => {
  it('does not copy external messages, URLs, headers, or credentials', () => {
    const result = sanitizeFiscalProviderError(
      {
        message: 'Bearer super-secret-password at https://pac.test/token',
        response: {
          status: 401,
          data: { token: 'must-not-escape' },
        },
      },
      {
        provider: 'facturama',
        operation: 'stamp',
        correlationId: 'cfdi-attempt-1',
      },
    );

    expect(result).toEqual({
      code: 'FISCAL_PROVIDER_ERROR',
      provider: 'FACTURAMA',
      operation: 'STAMP',
      statusCode: 401,
      retryable: false,
      correlationId: 'cfdi-attempt-1',
      message: 'Fiscal provider rejected the request',
    });
    expect(JSON.stringify(result)).not.toContain('super-secret-password');
    expect(JSON.stringify(result)).not.toContain('pac.test');
  });

  it('classifies transport and server errors as retryable without leaking raw codes', () => {
    expect(
      sanitizeFiscalProviderError(
        { code: 'ETIMEDOUT', response: { status: 504 } },
        { provider: 'FACTURAMA', operation: 'status' },
      ),
    ).toMatchObject({
      statusCode: 504,
      retryable: true,
      message: 'Fiscal provider is temporarily unavailable',
    });
  });

  it('does not echo untrusted provider or operation labels', () => {
    const result = sanitizeFiscalProviderError(new Error('failure'), {
      provider: 'secret-token',
      operation: 'authorization-password',
    });

    expect(result.provider).toBe('UNKNOWN');
    expect(result.operation).toBe('UNKNOWN');
    expect(JSON.stringify(result)).not.toContain('SECRET-TOKEN');
  });

  it('redacts sensitive provider metadata recursively', () => {
    expect(
      redactFiscalProviderMetadata({
        requestId: 'safe-id',
        authorization: 'Bearer secret-token',
        message: 'provider body with secret-token',
        url: 'https://pac.example/secret',
        nested: {
          password: 'secret-password',
          apiKey: 'secret-api-key',
          value: 'safe',
        },
      }),
    ).toEqual({
      requestId: 'safe-id',
      authorization: '[REDACTED]',
      message: '[REDACTED]',
      url: '[REDACTED]',
      nested: {
        password: '[REDACTED]',
        apiKey: '[REDACTED]',
        value: 'safe',
      },
    });
  });
});

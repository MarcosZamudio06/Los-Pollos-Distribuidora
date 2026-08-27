import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import type { RequestWithId } from '../middleware/request-id.middleware';

type ExceptionPayload = {
  blockers?: unknown;
  code?: unknown;
  error?: unknown;
  errors?: unknown;
  fields?: unknown;
  findings?: unknown;
  message?: unknown;
  saleIds?: unknown;
};

const STATUS_CODES: Partial<Record<number, string>> = {
  [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'PAYLOAD_TOO_LARGE',
  [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMIT_EXCEEDED',
};

@Catch()
export class SanitizedHttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(SanitizedHttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<RequestWithId>();
    const response = context.getResponse<Response>();
    const status = this.getStatus(exception);
    const requestId = request.requestId;
    const isServerError = status >= 500;
    const payload = isServerError ? {} : this.getPayload(exception);
    const message = isServerError
      ? 'Internal server error'
      : this.getMessage(payload.message, exception);
    const error = isServerError
      ? 'INTERNAL_SERVER_ERROR'
      : this.getErrorCode(payload, status);
    const extensions = isServerError ? {} : this.getSafeExtensions(payload);

    if (isServerError) {
      const stack = exception instanceof Error ? exception.stack : undefined;
      this.logger.error(
        `${request.method} ${request.path} ${status} requestId=${requestId}`,
        stack,
      );
    } else if (status === 429) {
      this.logger.warn(
        `${request.method} ${request.path} ${status} requestId=${requestId}`,
      );
    }

    response.status(status).json({
      ...extensions,
      success: false,
      message,
      error,
      statusCode: status,
      requestId,
    });
  }

  private getStatus(exception: unknown): number {
    if (exception instanceof HttpException) return exception.getStatus();
    if (
      typeof exception === 'object' &&
      exception !== null &&
      'status' in exception &&
      typeof exception.status === 'number' &&
      exception.status >= 400 &&
      exception.status < 600
    ) {
      return exception.status;
    }
    return HttpStatus.INTERNAL_SERVER_ERROR;
  }

  private getPayload(exception: unknown): ExceptionPayload {
    if (!(exception instanceof HttpException)) return {};
    const response = exception.getResponse();
    return typeof response === 'string' ? { message: response } : response;
  }

  private getMessage(message: unknown, exception: unknown): string {
    if (typeof message === 'string' && message.trim()) return message;
    if (Array.isArray(message)) {
      const messages = message.filter(
        (value): value is string =>
          typeof value === 'string' && value.length > 0,
      );
      if (messages.length > 0) return messages.join('; ');
    }
    return exception instanceof HttpException
      ? exception.message
      : 'Request could not be processed';
  }

  private getErrorCode(payload: ExceptionPayload, status: number): string {
    if (typeof payload.code === 'string' && payload.code.trim()) {
      return payload.code;
    }
    if (
      typeof payload.error === 'string' &&
      /^[A-Z][A-Z0-9_]*$/.test(payload.error)
    ) {
      return payload.error;
    }
    if (
      typeof payload.message === 'string' &&
      /^[A-Z][A-Z0-9_]*$/.test(payload.message.trim())
    ) {
      return payload.message.trim();
    }
    return STATUS_CODES[status] ?? `HTTP_${status}`;
  }

  private getSafeExtensions(
    payload: ExceptionPayload,
  ): Record<string, unknown> {
    const extensions: Record<string, unknown> = {};
    if (typeof payload.code === 'string' && payload.code.trim()) {
      extensions.code = payload.code;
    } else if (
      typeof payload.error === 'string' &&
      /^[A-Z][A-Z0-9_]*$/.test(payload.error.trim())
    ) {
      extensions.code = payload.error.trim();
    } else if (
      typeof payload.message === 'string' &&
      /^[A-Z][A-Z0-9_]*$/.test(payload.message.trim())
    ) {
      extensions.code = payload.message.trim();
    }
    for (const key of [
      'blockers',
      'errors',
      'fields',
      'findings',
      'saleIds',
    ] as const) {
      if (Array.isArray(payload[key])) extensions[key] = payload[key];
    }
    return extensions;
  }
}

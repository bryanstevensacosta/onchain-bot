import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { DomainError, ErrorCode } from '../kernel/domain-error';

/**
 * Maps DomainError to HTTP responses.
 * Mirrors apps/backend/src/shared/filters/domain-error.filter.ts.
 */
@Catch(DomainError)
export class DomainExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(DomainExceptionFilter.name);

  public catch(exception: DomainError, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();

    const status = this.getHttpStatus(exception.code);
    const isExpected =
      status === HttpStatus.NOT_FOUND ||
      status === HttpStatus.BAD_REQUEST ||
      status === HttpStatus.CONFLICT;

    if (!isExpected) {
      this.logger.error(
        `[${exception.code}] ${exception.message}`,
        exception.stack,
      );
    }

    response.status(status).json({
      error: exception.code,
      message: exception.message,
      details: exception.details,
    });
  }

  private getHttpStatus(code: string): HttpStatus {
    switch (code) {
      case ErrorCode.NOT_FOUND:
        return HttpStatus.NOT_FOUND;
      case ErrorCode.VALIDATION:
        return HttpStatus.BAD_REQUEST;
      case ErrorCode.CONFLICT:
        return HttpStatus.CONFLICT;
      case ErrorCode.UNAUTHORIZED:
        return HttpStatus.UNAUTHORIZED;
      case ErrorCode.FORBIDDEN:
        return HttpStatus.FORBIDDEN;
      case ErrorCode.RATE_LIMITED:
        return HttpStatus.TOO_MANY_REQUESTS;
      case ErrorCode.QUEUE_FULL:
      case ErrorCode.LLM_FAILED:
      case ErrorCode.PUBLISH_FAILED:
      case ErrorCode.SCHEDULE_INVALID:
        return HttpStatus.UNPROCESSABLE_ENTITY;
      default:
        return HttpStatus.INTERNAL_SERVER_ERROR;
    }
  }
}

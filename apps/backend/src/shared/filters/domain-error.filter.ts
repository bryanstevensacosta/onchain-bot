import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { DomainError, ErrorCode } from '../kernel/domain-error';

@Catch(DomainError)
export class DomainErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(DomainErrorFilter.name);

  catch(exception: DomainError, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

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
      case ErrorCode.TOKEN_NOT_FOUND:
        return HttpStatus.NOT_FOUND;
      case ErrorCode.VALIDATION:
      case ErrorCode.INVALID_ADDRESS:
      case ErrorCode.UNSUPPORTED_CHAIN:
      case ErrorCode.NO_CONTRACT_ADDRESS:
      case ErrorCode.NO_PARSED_CALL:
        return HttpStatus.BAD_REQUEST;
      case ErrorCode.CONFLICT:
        return HttpStatus.CONFLICT;
      case ErrorCode.UNAUTHORIZED:
        return HttpStatus.UNAUTHORIZED;
      case ErrorCode.FORBIDDEN:
        return HttpStatus.FORBIDDEN;
      case ErrorCode.RATE_LIMITED:
        return HttpStatus.TOO_MANY_REQUESTS;
      case ErrorCode.HONEYPOT_DETECTED:
        return HttpStatus.UNPROCESSABLE_ENTITY;
      default:
        return HttpStatus.INTERNAL_SERVER_ERROR;
    }
  }
}

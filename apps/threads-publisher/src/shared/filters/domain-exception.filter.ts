import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { DomainError } from '../kernel/domain-error';

/**
 * Maps DomainError to HTTP (403/409/422 survive the wire).
 * Unknown errors become 500 without leaking internals.
 */
@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  public catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<{
      status: (code: number) => {
        json: (body: unknown) => void;
      };
    }>();
    if (exception instanceof DomainError) {
      response
        .status(exception.status)
        .json({ code: exception.code, message: exception.message });
      return;
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      response
        .status(status)
        .json(typeof body === 'string' ? { message: body } : body);
      return;
    }
    response
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .json({ message: 'internal server error' });
  }
}

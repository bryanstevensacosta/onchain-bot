import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import { DomainError, ErrorCode } from '../kernel/domain-error';

const STATUS: Record<ErrorCode, number> = {
  [ErrorCode.VALIDATION]: HttpStatus.BAD_REQUEST,
  [ErrorCode.NOT_FOUND]: HttpStatus.NOT_FOUND,
  [ErrorCode.CONFLICT]: HttpStatus.CONFLICT,
  [ErrorCode.UNAUTHORIZED]: HttpStatus.UNAUTHORIZED,
  [ErrorCode.FORBIDDEN]: HttpStatus.FORBIDDEN,
  [ErrorCode.UPSTREAM]: HttpStatus.BAD_GATEWAY,
  [ErrorCode.RATE_LIMITED]: HttpStatus.TOO_MANY_REQUESTS,
};

@Catch(DomainError)
export class DomainExceptionFilter implements ExceptionFilter {
  public catch(exception: DomainError, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse();
    res
      .status(STATUS[exception.code] ?? HttpStatus.INTERNAL_SERVER_ERROR)
      .json({ error: exception.message, code: exception.code });
  }
}

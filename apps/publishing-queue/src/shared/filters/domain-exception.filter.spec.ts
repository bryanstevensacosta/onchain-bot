import { ArgumentsHost, HttpStatus } from '@nestjs/common';
import { DomainError, ErrorCode } from '../kernel/domain-error';
import { DomainExceptionFilter } from './domain-exception.filter';

describe('DomainExceptionFilter', () => {
  const filter = new DomainExceptionFilter();

  function runWith(code: ErrorCode): {
    status: number;
    body: unknown;
  } {
    let status = 0;
    let body: unknown;
    const response = {
      status: (code: number): unknown => {
        status = code;
        return {
          json: (payload: unknown): void => {
            body = payload;
          },
        };
      },
    };
    const host = {
      switchToHttp: (): unknown => ({ getResponse: () => response }),
    } as ArgumentsHost;
    filter.catch(new DomainError(code, 'boom', { k: 1 }), host);
    return { status, body };
  }

  it('maps QUEUE_FULL/LLM_FAILED/PUBLISH_FAILED to 422', () => {
    expect(runWith(ErrorCode.QUEUE_FULL).status).toBe(
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
    expect(runWith(ErrorCode.LLM_FAILED).status).toBe(
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  });

  it('maps NOT_FOUND/VALIDATION/CONFLICT to 404/400/409', () => {
    expect(runWith(ErrorCode.NOT_FOUND).status).toBe(HttpStatus.NOT_FOUND);
    expect(runWith(ErrorCode.VALIDATION).status).toBe(HttpStatus.BAD_REQUEST);
    expect(runWith(ErrorCode.CONFLICT).status).toBe(HttpStatus.CONFLICT);
  });

  it('includes error, message and details in the body', () => {
    const { body } = runWith(ErrorCode.VALIDATION);
    expect(body).toEqual({
      error: ErrorCode.VALIDATION,
      message: 'boom',
      details: { k: 1 },
    });
  });
});

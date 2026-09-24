import { ArgumentsHost, HttpStatus } from '@nestjs/common';
import { DomainError, ErrorCode } from '../kernel/domain-error';
import { DomainExceptionFilter } from './domain-exception.filter';

function hostWithResponse(): {
  host: ArgumentsHost;
  status: jest.Mock;
  json: jest.Mock;
} {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
    }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe('DomainExceptionFilter', () => {
  const filter = new DomainExceptionFilter();

  it('maps NOT_FOUND to 404 with error envelope', () => {
    const { host, status, json } = hostWithResponse();
    filter.catch(new DomainError(ErrorCode.NOT_FOUND, 'missing'), host);
    expect(status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(json).toHaveBeenCalledWith({
      error: 'NOT_FOUND',
      message: 'missing',
      details: undefined,
    });
  });

  it('maps VALIDATION to 400', () => {
    const { host, status } = hostWithResponse();
    filter.catch(new DomainError(ErrorCode.VALIDATION, 'bad'), host);
    expect(status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
  });

  it('maps UNAUTHORIZED to 401 and INTERNAL to 500', () => {
    const first = hostWithResponse();
    filter.catch(new DomainError(ErrorCode.UNAUTHORIZED, 'no'), first.host);
    expect(first.status).toHaveBeenCalledWith(HttpStatus.UNAUTHORIZED);

    const second = hostWithResponse();
    filter.catch(new DomainError(ErrorCode.INTERNAL, 'boom'), second.host);
    expect(second.status).toHaveBeenCalledWith(
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  });

  it('preserves details in the envelope', () => {
    const { host, json } = hostWithResponse();
    filter.catch(
      new DomainError(ErrorCode.CONFLICT, 'dup', { kolId: '1' }),
      host,
    );
    expect(json).toHaveBeenCalledWith({
      error: 'CONFLICT',
      message: 'dup',
      details: { kolId: '1' },
    });
  });
});

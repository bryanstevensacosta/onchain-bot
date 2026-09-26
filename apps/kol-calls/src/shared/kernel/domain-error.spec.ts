import { DomainError, ErrorCode } from './domain-error';

describe('DomainError', () => {
  it('carries code, message, and optional details', () => {
    const error = new DomainError(ErrorCode.VALIDATION, 'bad input', {
      field: 'kolId',
    });
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe('VALIDATION');
    expect(error.message).toBe('bad input');
    expect(error.details).toEqual({ field: 'kolId' });
  });

  it('works without details', () => {
    const error = new DomainError(ErrorCode.NOT_FOUND, 'missing');
    expect(error.details).toBeUndefined();
  });

  it('exposes stable ErrorCode literals', () => {
    expect(ErrorCode.NOT_FOUND).toBe('NOT_FOUND');
    expect(ErrorCode.UNAUTHORIZED).toBe('UNAUTHORIZED');
    expect(ErrorCode.CONFLICT).toBe('CONFLICT');
  });
});

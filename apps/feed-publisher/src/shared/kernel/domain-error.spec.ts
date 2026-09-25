import { DomainError, ErrorCode } from './domain-error';

describe('DomainError', () => {
  it('carries code, message and details', () => {
    const err = new DomainError(ErrorCode.QUEUE_FULL, 'queue is full', {
      pending: 100,
    });
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('DomainError');
    expect(err.code).toBe(ErrorCode.QUEUE_FULL);
    expect(err.details).toEqual({ pending: 100 });
  });
});

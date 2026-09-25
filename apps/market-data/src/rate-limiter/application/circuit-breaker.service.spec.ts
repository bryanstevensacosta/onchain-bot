import { CircuitBreakerService } from './circuit-breaker.service';

/**
 * Failing-first spec (Tramo 3, todo 2): circuit breaker.
 */
describe('CircuitBreakerService', () => {
  it('stays closed on successes', () => {
    const breaker = new CircuitBreakerService();
    expect(breaker.canExecute('p')).toBe(true);
    breaker.recordSuccess('p');
    expect(breaker.getState('p')).toBe('closed');
  });

  it('opens after the failure threshold', () => {
    const breaker = new CircuitBreakerService();
    for (let i = 0; i < 5; i++) {
      breaker.recordFailure('p');
    }
    expect(breaker.getState('p')).toBe('open');
    expect(breaker.canExecute('p')).toBe(false);
  });

  it('half-opens after the reset timeout', () => {
    const breaker = new CircuitBreakerService(2, 1000);
    breaker.recordFailure('p', 0);
    breaker.recordFailure('p', 0);
    expect(breaker.canExecute('p', 500)).toBe(false);
    expect(breaker.canExecute('p', 1500)).toBe(true);
  });

  it('closes again on success after half-open', () => {
    const breaker = new CircuitBreakerService(1, 1000);
    breaker.recordFailure('p', 0);
    expect(breaker.canExecute('p', 2000)).toBe(true);
    breaker.recordSuccess('p');
    expect(breaker.getState('p')).toBe('closed');
  });
});

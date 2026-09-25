/**
 * CircuitBreakerPort (Tramo 3, todo 12, P50 — rate-limiter domain).
 *
 * Per-key breaker contract: closed → open after `failureThreshold`
 * consecutive failures → half-open after the reset timeout → closed
 * on success. Guards provider calls against hammering dead RPCs.
 */
export type CircuitState = 'closed' | 'open' | 'half-open';

export abstract class CircuitBreakerPort {
  public abstract canExecute(key: string, now?: number): boolean;
  public abstract recordSuccess(key: string): void;
  public abstract recordFailure(key: string, now?: number): void;
  public abstract getState(key: string): CircuitState;
  public abstract resetKey(key: string): void;
}

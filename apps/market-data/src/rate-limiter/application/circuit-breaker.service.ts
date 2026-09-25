import { Injectable, Optional } from '@nestjs/common';
import { CircuitBreakerPort, CircuitState } from '../domain/circuit-breaker.port';

interface CircuitRow {
  failures: number;
  state: CircuitState;
  openedAt: number;
}

/**
 * CircuitBreakerService (Tramo 3, todo 2; hexagonal home todo 12, P50).
 *
 * Per-key breaker: closed → open after `failureThreshold` consecutive
 * failures → half-open after `resetTimeoutMs` → closed on success.
 * Guards provider calls (todo-4 adapters) against hammering dead RPCs.
 */
@Injectable()
export class CircuitBreakerService implements CircuitBreakerPort {
  private readonly circuits = new Map<string, CircuitRow>();

  public constructor(
    @Optional() private readonly failureThreshold: number = 5,
    @Optional() private readonly resetTimeoutMs: number = 30_000,
  ) {}

  public canExecute(key: string, now: number = Date.now()): boolean {
    const row = this.circuits.get(key);
    if (row === undefined || row.state === 'closed') {
      return true;
    }
    if (row.state === 'open') {
      if (now - row.openedAt >= this.resetTimeoutMs) {
        row.state = 'half-open';
        return true;
      }
      return false;
    }
    return true;
  }

  public recordSuccess(key: string): void {
    this.circuits.set(key, { failures: 0, state: 'closed', openedAt: 0 });
  }

  public recordFailure(key: string, now: number = Date.now()): void {
    const row = this.circuits.get(key) ?? { failures: 0, state: 'closed' as CircuitState, openedAt: 0 };
    const failures = row.failures + 1;
    if (failures >= this.failureThreshold) {
      this.circuits.set(key, { failures, state: 'open', openedAt: now });
      return;
    }
    this.circuits.set(key, { failures, state: row.state, openedAt: row.openedAt });
  }

  public getState(key: string): CircuitState {
    return this.circuits.get(key)?.state ?? 'closed';
  }

  public resetKey(key: string): void {
    this.circuits.delete(key);
  }
}

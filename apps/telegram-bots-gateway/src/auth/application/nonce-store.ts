import { Injectable } from '@nestjs/common';

/**
 * Anti-replay nonce store (in-memory, todo 2).
 *
 * Nonces are recorded ONLY after a request's HMAC verifies, so failed
 * attempts can never fill the store (nonce-fill DoS). Entries expire
 * after `ttlMs` (2x the clock-skew window) and are pruned on access.
 */
@Injectable()
export class NonceStore {
  private readonly seen = new Map<string, number>();

  /**
   * Records `key` when fresh. Returns `true` when the nonce is new
   * (recorded), `false` when it is a replay of a live entry.
   */
  public consume(key: string, ttlMs: number, nowMs = Date.now()): boolean {
    this.prune(nowMs);
    const expiresAt = this.seen.get(key);
    if (expiresAt !== undefined && expiresAt > nowMs) return false;
    this.seen.set(key, nowMs + ttlMs);
    return true;
  }

  private prune(nowMs: number): void {
    for (const [key, expiresAt] of this.seen) {
      if (expiresAt <= nowMs) this.seen.delete(key);
    }
  }
}

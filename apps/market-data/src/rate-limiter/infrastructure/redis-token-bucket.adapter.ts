import { Injectable, Optional } from '@nestjs/common';
import Redis from 'ioredis';
import { RateLimiterPort } from '../domain/rate-limiter.port';

export interface TokenBucketState {
  readonly tokens: number;
  readonly updatedAt: number;
}

export interface TokenBucketOutcome {
  readonly allowed: boolean;
  readonly state: TokenBucketState;
}

/**
 * Minimal Redis surface the bucket needs (kept narrow so specs can
 * fake it; the default runner adapts ioredis).
 */
export interface BucketRedisClient {
  eval(
    script: string,
    keys: ReadonlyArray<string>,
    args: ReadonlyArray<string | number>,
  ): Promise<unknown>;
}

/**
 * Pure token-bucket step (Tramo 3, todo 14, anti-ban).
 *
 * Capacity = limit, refill = limit per windowMs. The Lua script below
 * runs this exact math atomically in Redis; this function pins the
 * semantics in-process so the deny/refill behavior is unit-testable
 * without a live Redis.
 */
export function computeTokenBucket(
  state: TokenBucketState | null,
  now: number,
  limit: number,
  windowMs: number,
): TokenBucketOutcome {
  const previous = state ?? { tokens: limit, updatedAt: now };
  const elapsed = Math.max(0, now - previous.updatedAt);
  const refilled = Math.min(limit, previous.tokens + elapsed / (windowMs / limit));
  if (refilled < 1) {
    return { allowed: false, state: { tokens: refilled, updatedAt: now } };
  }
  return { allowed: true, state: { tokens: refilled - 1, updatedAt: now } };
}

/**
 * Atomic Lua twin of `computeTokenBucket`: one round-trip per
 * acquisition, per-bucket TTL of two windows (stale buckets expire
 * on their own — no janitor needed for rate state).
 */
export const TOKEN_BUCKET_LUA = [
  'local limit = tonumber(ARGV[1])',
  'local windowMs = tonumber(ARGV[2])',
  'local now = tonumber(ARGV[3])',
  "local data = redis.call('HMGET', KEYS[1], 'tokens', 'ts')",
  "local tokens = tonumber(data[1])",
  "local ts = tonumber(data[2])",
  'if tokens == nil then tokens = limit ts = now end',
  'local refilled = math.min(limit, tokens + math.max(0, now - ts) / (windowMs / limit))',
  "if refilled < 1 then redis.call('HMSET', KEYS[1], 'tokens', refilled, 'ts', now) redis.call('PEXPIRE', KEYS[1], windowMs * 2) return 0 end",
  "redis.call('HMSET', KEYS[1], 'tokens', refilled - 1, 'ts', now) redis.call('PEXPIRE', KEYS[1], windowMs * 2) return 1",
].join('\n');

/**
 * Redis token-bucket adapter (Tramo 3, todo 14, GAP-3).
 *
 * Distributed outbound budgets behind the centralized
 * `RateLimiterPort`. Fail-open by contract: no Redis configured, or
 * any Redis error, allows the call (a down Redis must never block
 * snapshots — the in-memory service owns the budget when Redis is
 * absent). Keys land under `ratelimit:<key>` so outbound
 * (`outbound:<provider>`) and edge (`gw:<ip>`) budgets never share
 * a bucket. Lazy client: no connection until the first acquisition.
 */
@Injectable()
export class RedisTokenBucketAdapter extends RateLimiterPort {
  private runner: BucketRedisClient | null = null;

  private readonly redisUrl: string | null;

  public constructor(@Optional() client?: BucketRedisClient | null) {
    super();
    if (client !== undefined && client !== null) {
      this.runner = client;
      this.redisUrl = null;
    } else {
      this.redisUrl = process.env.REDIS_URL ?? null;
    }
  }

  public async tryAcquire(
    key: string,
    limit: number,
    windowMs: number,
    now: number = Date.now(),
  ): Promise<boolean> {
    const runner = this.connected();
    if (runner === null) {
      return true;
    }
    try {
      const verdict = await runner.eval(
        TOKEN_BUCKET_LUA,
        [`ratelimit:${key}`],
        [limit, windowMs, now],
      );
      return Number(verdict) === 1;
    } catch {
      return true;
    }
  }

  public resetKey(key: string): void {
    if (this.runner === null) {
      return;
    }
    this.runner
      .eval('redis.call("DEL", KEYS[1]) return 1', [`ratelimit:${key}`], [])
      .catch(() => undefined);
  }

  public resetAll(): void {
    // Intentionally a no-op: never flush a shared Redis. Per-key
    // resets via resetKey; bucket TTLs (2 windows) bound stale state.
  }

  private connected(): BucketRedisClient | null {
    if (this.runner !== null) {
      return this.runner;
    }
    if (this.redisUrl === null) {
      return null;
    }
    try {
      const client = new Redis(this.redisUrl, {
        lazyConnect: true,
        enableOfflineQueue: false,
        enableReadyCheck: false,
        maxRetriesPerRequest: 1,
        retryStrategy: () => null,
      });
      const runner: BucketRedisClient = {
        eval: (script, keys, args) =>
          client.eval(script, keys.length, ...keys, ...args.map(String)) as unknown as Promise<unknown>,
      };
      this.runner = runner;
      return runner;
    } catch {
      return null;
    }
  }
}

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  SNAPSHOT_EDGE_TTL_SECONDS,
  SNAPSHOT_NUMBERS_TTL_SECONDS,
  SNAPSHOT_TTL_POLICY,
  isStaleTrioValid,
  isTailDegraded,
} from '../domain/snapshot-ttl-policy';
import { SNAPSHOT_CACHE_TTL_SECONDS } from '../domain/snapshot-quote.types';
import {
  GATEWAY_BATCH_TTL_SECONDS,
  GATEWAY_LIMIT_PER_MINUTE,
} from '../../gateway/domain/gateway-policy';

const SRC = join(__dirname, '..', '..');

function readSource(relativePath: string): string {
  return readFileSync(join(SRC, relativePath), 'utf8');
}

describe('snapshot TTL policy (plan todo 41b — single source of truth)', () => {
  it('preserves the 30s default on every snapshot writer (one knob)', () => {
    expect(SNAPSHOT_NUMBERS_TTL_SECONDS).toBe(30);
    expect(SNAPSHOT_EDGE_TTL_SECONDS).toBe(30);
    expect(SNAPSHOT_CACHE_TTL_SECONDS).toBe(30);
    expect(GATEWAY_BATCH_TTL_SECONDS).toBe(30);
    expect(SNAPSHOT_TTL_POLICY.numbers.ttlSeconds).toBe(30);
  });

  it('pins the per-class rules (no hours-class without a trigger)', () => {
    expect(SNAPSHOT_TTL_POLICY.identity.ttlSeconds).toBeNull();
    expect(SNAPSHOT_TTL_POLICY['venue-launchpad'].ttlSeconds).toBeNull();
    expect(SNAPSHOT_TTL_POLICY['holders-dev'].ttlSeconds).toBe(
      SNAPSHOT_NUMBERS_TTL_SECONDS,
    );
    // Holders/dev MUST NOT offer an hours-class: rug/dev-dump moves in
    // minutes and no invalidation trigger exists (regression tripwire —
    // lengthening this silently would serve dead safety data as live).
    expect(
      SNAPSHOT_TTL_POLICY['holders-dev'].ttlSeconds as number,
    ).toBeLessThanOrEqual(300);
  });

  it('fails if a snapshot writer hardcodes a TTL literal (anti-hardcode tripwire)', () => {
    // Service writer: references the shared const, never a literal.
    const service = readSource(
      'snapshot/application/address-snapshot.service.ts',
    );
    expect(service).toContain('SNAPSHOT_CACHE_TTL_SECONDS');
    expect(service).not.toMatch(/cache\.set\(cacheKey, snapshot, 30\)/);
    // Quote-types: the const derives from the policy, never `= 30`.
    const quoteTypes = readSource('snapshot/domain/snapshot-quote.types.ts');
    expect(quoteTypes).toContain('SNAPSHOT_NUMBERS_TTL_SECONDS');
    expect(quoteTypes).not.toMatch(/SNAPSHOT_CACHE_TTL_SECONDS = 30/);
    // Batch writer: derives from the policy, never `= 30`.
    const gatewayPolicy = readSource('gateway/domain/gateway-policy.ts');
    expect(gatewayPolicy).toContain('SNAPSHOT_NUMBERS_TTL_SECONDS');
    expect(gatewayPolicy).not.toMatch(/GATEWAY_BATCH_TTL_SECONDS = 30/);
    // Edge interceptor default: derives from the policy, never `= 30`.
    const interceptor = readSource(
      'shared/infrastructure/cache/infrastructure/cache.interceptor.ts',
    );
    expect(interceptor).toContain('SNAPSHOT_EDGE_TTL_SECONDS');
    expect(interceptor).not.toMatch(/DEFAULT_TTL_SECONDS = 30/);
    // Snapshot GET edges: policy TTL, never a `@CacheTTL(30)` literal.
    for (const edge of [
      'gateway/infrastructure/http/market-data-snapshot.controller.ts',
      'gateway/infrastructure/http/addresses.controller.ts',
    ]) {
      const source = readSource(edge);
      expect(source).toContain('SNAPSHOT_EDGE_TTL_SECONDS');
      expect(source).not.toMatch(/CacheTTL\(30\)/);
    }
  });

  it('documents the non-snapshot TTLs as deliberately out of scope (15s providers, 60s chains)', () => {
    // These surfaces cache non-snapshot payloads (provider catalogs,
    // chain lists) — their own windows, NOT the snapshot numbers TTL.
    // Pinned so a future "unify all TTLs" drive trips here first.
    const providers = readSource(
      'gateway/infrastructure/http/providers.controller.ts',
    );
    expect(providers).toMatch(/CacheTTL\(15\)/);
    const chains = readSource(
      'gateway/infrastructure/http/chains.controller.ts',
    );
    expect(chains).toMatch(/CacheTTL\(60\)/);
    expect(GATEWAY_LIMIT_PER_MINUTE).toBe(60);
  });
});

describe('stale-trio invariant (plan todo 41c `no-bit-without-age`)', () => {
  it('accepts a full trio on stale and nulls on fresh', () => {
    expect(isStaleTrioValid(true, '2026-10-06T12:00:00.000Z', 3_600_000)).toBe(
      true,
    );
    expect(isStaleTrioValid(false, null, null)).toBe(true);
  });

  it('rejects every bit-without-age shape (missing/garbage age or as-of)', () => {
    expect(isStaleTrioValid(true, null, 1000)).toBe(false);
    expect(isStaleTrioValid(true, '2026-10-06T12:00:00.000Z', null)).toBe(
      false,
    );
    expect(isStaleTrioValid(true, '', 1000)).toBe(false);
    expect(isStaleTrioValid(true, 'not-a-date', 1000)).toBe(false);
    expect(isStaleTrioValid(true, '2026-10-06T12:00:00.000Z', -1)).toBe(false);
    expect(isStaleTrioValid(true, '2026-10-06T12:00:00.000Z', NaN)).toBe(false);
    // Fresh with a dangling age is equally invalid (never half-set).
    expect(isStaleTrioValid(false, null, 1000)).toBe(false);
    expect(isStaleTrioValid(false, '2026-10-06T12:00:00.000Z', null)).toBe(
      false,
    );
  });
});

describe('tail-degraded signal (plan todo 41b — ONE decision)', () => {
  it('marks tail timeouts, fast-path dev skips and metadata timeouts', () => {
    expect(
      isTailDegraded({
        'tail:launchpad':
          'timeout (detector budget 2000ms) — degraded to null, fail-open',
      }),
    ).toBe(true);
    expect(
      isTailDegraded({ 'dev:fast-path': 'skipped (fast-path budget)' }),
    ).toBe(true);
    expect(isTailDegraded({ 'metadata-identity': 'timeout' })).toBe(true);
  });

  it('stays false on full cards, honest empties and governor/breaker notes', () => {
    expect(isTailDegraded({})).toBe(false);
    expect(isTailDegraded({ dexscreener: 'no data' })).toBe(false);
    expect(
      isTailDegraded({
        birdeye:
          'breaker skip (open 30s cool-off or half-open probe busy) — fail-open (resets on deploy)',
      }),
    ).toBe(false);
    expect(
      isTailDegraded({
        'governor:shed-tier-2':
          'skipped birdeye at pressure L1 — Tier-0 live, fail-open',
      }),
    ).toBe(false);
  });
});

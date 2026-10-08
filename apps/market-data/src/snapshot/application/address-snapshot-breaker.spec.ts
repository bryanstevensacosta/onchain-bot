import {
  AddressSnapshotService,
  snapshotBreakerKey,
} from './address-snapshot.service';
import { SnapshotAggregatorService } from 'aggregators/application/snapshot-aggregator.service';
import { SnapshotHistoryRepository } from '../infrastructure/snapshot-history.repository';
import { CircuitBreakerService } from 'shared/infrastructure/rate-limiter/application/circuit-breaker.service';
import type { QuoteFetcher } from '../domain/snapshot-quote.types';

function healthyFetcher(
  name: string,
  calls: Record<string, number>,
): QuoteFetcher {
  return {
    name,
    supportsChains: ['solana'],
    fetch: async () => {
      calls[name] = (calls[name] ?? 0) + 1;
      return { priceUsd: 2.5, symbol: 'WIF' };
    },
  };
}

function flakyFetcher(
  name: string,
  calls: Record<string, number>,
): QuoteFetcher {
  return {
    name,
    supportsChains: ['solana'],
    fetch: async () => {
      calls[name] = (calls[name] ?? 0) + 1;
      throw new Error('transport boom');
    },
  };
}

function emptyFetcher(
  name: string,
  calls: Record<string, number>,
): QuoteFetcher {
  return {
    name,
    supportsChains: ['solana'],
    fetch: async () => {
      calls[name] = (calls[name] ?? 0) + 1;
      return null;
    },
  };
}

function buildService(
  fetchers: ReadonlyArray<QuoteFetcher>,
  breaker: CircuitBreakerService | null,
) {
  const catalog = { findById: async (id: string) => ({ id }) };
  const providers = {
    listProviders: () => [
      { name: 'dexscreener', supportsChains: ['solana'] },
      { name: 'geckoterminal', supportsChains: ['solana'] },
      { name: 'birdeye', supportsChains: ['solana'] },
    ],
    recordSuccess: jest.fn(),
    recordFailure: jest.fn(),
  };
  const kinds = { detect: async () => 'token' as const };
  const service = new AddressSnapshotService(
    catalog as never,
    providers as never,
    kinds as never,
    new SnapshotAggregatorService(),
    new SnapshotHistoryRepository(),
    fetchers,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    breaker,
  );
  return { service, providers };
}

const INPUT = {
  chain: 'solana',
  value: 'So11111111111111111111111111111111111111112',
};

/**
 * Breaker wiring (dexter plan todo 29, 19b3): the ONE gating path is
 * the existing CircuitBreakerService (memory store, 5 fails -> 30s
 * cool-off defaults); the registry counters stay telemetry-only.
 * `canExecute === false` skips the fetcher (fail-open, never throws);
 * half-open admits a SINGLE cheapest-fetcher probe; state is exposed
 * via `breakerStates()`. Specs use threshold 2 for speed — the
 * production default (5/30s) is pinned in the service's own spec.
 */
describe('AddressSnapshotService breaker gate (todo 29)', () => {
  it('closed breakers admit every fetcher (throws stay visible)', async () => {
    const calls: Record<string, number> = {};
    const { service } = buildService(
      [
        healthyFetcher('dexscreener', calls),
        flakyFetcher('geckoterminal', calls),
      ],
      new CircuitBreakerService(2, 60_000),
    );
    const snapshot = await service.getSnapshot(INPUT);
    expect(snapshot.status).toBe('ready');
    expect(calls['dexscreener']).toBe(1);
    expect(calls['geckoterminal']).toBe(1);
    expect(snapshot.providerErrors['geckoterminal']).toMatch(/transport boom/);
  });

  it('opens after consecutive transport failures and skips fail-open (card still renders)', async () => {
    const calls: Record<string, number> = {};
    const breaker = new CircuitBreakerService(2, 60_000);
    const { service } = buildService(
      [
        healthyFetcher('dexscreener', calls),
        flakyFetcher('geckoterminal', calls),
      ],
      breaker,
    );
    await service.getSnapshot(INPUT);
    await service.getSnapshot(INPUT);
    expect(breaker.getState(snapshotBreakerKey('geckoterminal'))).toBe('open');
    const snapshot = await service.getSnapshot(INPUT);
    expect(snapshot.status).toBe('ready');
    expect(calls['geckoterminal']).toBe(2);
    expect(snapshot.providerErrors['geckoterminal']).toMatch(/breaker skip/);
    expect(service.breakerStates()['geckoterminal']).toBe('open');
    expect(service.breakerStates()['dexscreener']).toBe('closed');
  });

  it('half-open admits a SINGLE cheapest probe (second half-open fetcher skips)', async () => {
    const calls: Record<string, number> = {};
    const breaker = new CircuitBreakerService(2, 60_000);
    const { service } = buildService(
      [
        healthyFetcher('dexscreener', calls),
        flakyFetcher('geckoterminal', calls),
        flakyFetcher('birdeye', calls),
      ],
      breaker,
    );
    await service.getSnapshot(INPUT);
    await service.getSnapshot(INPUT);
    expect(breaker.getState(snapshotBreakerKey('geckoterminal'))).toBe('open');
    expect(breaker.getState(snapshotBreakerKey('birdeye'))).toBe('open');
    // Expire both cool-offs: each flip returns true exactly once.
    const farFuture = Date.now() + 61_000;
    expect(
      breaker.canExecute(snapshotBreakerKey('geckoterminal'), farFuture),
    ).toBe(true);
    expect(breaker.canExecute(snapshotBreakerKey('birdeye'), farFuture)).toBe(
      true,
    );
    const before = { ...calls };
    await service.getSnapshot(INPUT);
    // Cheapest-first order: geckoterminal probes, birdeye waits.
    expect((calls['geckoterminal'] ?? 0) - (before['geckoterminal'] ?? 0)).toBe(
      1,
    );
    expect(calls['birdeye'] ?? 0).toBe(before['birdeye'] ?? 0);
  });

  it('a successful probe closes the breaker again', async () => {
    const calls: Record<string, number> = {};
    const breaker = new CircuitBreakerService(2, 60_000);
    let fail = true;
    const recovering: QuoteFetcher = {
      name: 'geckoterminal',
      supportsChains: ['solana'],
      fetch: async () => {
        calls['geckoterminal'] = (calls['geckoterminal'] ?? 0) + 1;
        if (fail) {
          throw new Error('transport boom');
        }
        return { priceUsd: 3.5, symbol: 'WIF' };
      },
    };
    const { service } = buildService(
      [healthyFetcher('dexscreener', calls), recovering],
      breaker,
    );
    await service.getSnapshot(INPUT);
    await service.getSnapshot(INPUT);
    expect(breaker.getState(snapshotBreakerKey('geckoterminal'))).toBe('open');
    fail = false;
    expect(
      breaker.canExecute(
        snapshotBreakerKey('geckoterminal'),
        Date.now() + 61_000,
      ),
    ).toBe(true);
    const snapshot = await service.getSnapshot(INPUT);
    expect(snapshot.status).toBe('ready');
    expect(breaker.getState(snapshotBreakerKey('geckoterminal'))).toBe(
      'closed',
    );
    expect(service.breakerStates()['geckoterminal']).toBe('closed');
  });

  it('a failed probe re-opens with a FIXED cool-off (flapping documented, no adaptive backoff)', async () => {
    const calls: Record<string, number> = {};
    const breaker = new CircuitBreakerService(2, 60_000);
    const { service } = buildService(
      [
        healthyFetcher('dexscreener', calls),
        flakyFetcher('geckoterminal', calls),
      ],
      breaker,
    );
    await service.getSnapshot(INPUT);
    await service.getSnapshot(INPUT);
    expect(
      breaker.canExecute(
        snapshotBreakerKey('geckoterminal'),
        Date.now() + 61_000,
      ),
    ).toBe(true);
    await service.getSnapshot(INPUT);
    // The probe threw again: open with a FRESH 60s window, not an
    // adaptive one — partial-outage flapping is rate-limited to one
    // probe per cool-off, documented in AGENTS.
    expect(breaker.getState(snapshotBreakerKey('geckoterminal'))).toBe('open');
    expect(
      breaker.canExecute(snapshotBreakerKey('geckoterminal'), Date.now()),
    ).toBe(false);
  });

  it("'no data' never opens the breaker (honest-empty blind spot is conservative)", async () => {
    const calls: Record<string, number> = {};
    const breaker = new CircuitBreakerService(2, 60_000);
    const { service } = buildService(
      [emptyFetcher('geckoterminal', calls)],
      breaker,
    );
    for (let i = 0; i < 5; i += 1) {
      await service.getSnapshot(INPUT);
    }
    expect(breaker.getState(snapshotBreakerKey('geckoterminal'))).toBe(
      'closed',
    );
    expect(calls['geckoterminal']).toBe(5);
  });

  it('unknown names never touch the breaker (registry parity)', async () => {
    const calls: Record<string, number> = {};
    const breaker = new CircuitBreakerService(1, 60_000);
    const mystery: QuoteFetcher = {
      name: 'mystery',
      supportsChains: ['solana'],
      fetch: async () => {
        calls['mystery'] = (calls['mystery'] ?? 0) + 1;
        throw new Error('transport boom');
      },
    };
    const { service, providers } = buildService(
      [healthyFetcher('dexscreener', calls), mystery],
      breaker,
    );
    await service.getSnapshot(INPUT);
    await service.getSnapshot(INPUT);
    // The service still reports the throw to the registry (the REAL
    // registry ignores unknown names via its descriptor guard — the
    // stub has no guard, so it records); the BREAKER never creates a
    // row for a non-fetcher.
    expect(providers.recordFailure).toHaveBeenCalledWith('mystery');
    expect(breaker.getState(snapshotBreakerKey('mystery'))).toBe('closed');
    expect(service.breakerStates()).not.toHaveProperty('mystery');
  });
});

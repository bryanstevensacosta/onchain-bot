import { CircuitBreakerService } from 'shared/infrastructure/rate-limiter/application/circuit-breaker.service';
import { snapshotBreakerKey } from 'shared/infrastructure/rate-limiter/domain/snapshot-breaker-key';
import { ProviderHealthChecker } from './application/provider-health-checker.service';
import { ProviderRegistryService } from './provider-registry.service';

/**
 * Failing-first spec (Tramo 3, todo 2): provider health/latency registry.
 *
 * The 13 physical adapters land in todo 4 (C-DATA-01); this registry
 * tracks descriptors + health only, never adapter code.
 */
describe('ProviderRegistryService', () => {
  it('seeds a non-empty provider catalog', () => {
    const registry = new ProviderRegistryService();
    expect(registry.listProviders().length).toBeGreaterThan(0);
  });

  it('reports unknown status before any probe', () => {
    const registry = new ProviderRegistryService();
    const [first] = registry.listProviders();
    expect(registry.getStatus(first.name)?.status).toBe('unknown');
  });

  it('marks a provider up after a success with latency', () => {
    const registry = new ProviderRegistryService();
    const [first] = registry.listProviders();
    registry.recordSuccess(first.name, 120);
    const status = registry.getStatus(first.name);
    expect(status?.status).toBe('up');
    expect(status?.latencyMs).toBe(120);
  });

  it('degrades then downs a provider after repeated failures', () => {
    const registry = new ProviderRegistryService();
    const [first] = registry.listProviders();
    registry.recordFailure(first.name);
    registry.recordFailure(first.name);
    expect(registry.getStatus(first.name)?.status).toBe('degraded');
    for (let i = 0; i < 5; i++) {
      registry.recordFailure(first.name);
    }
    expect(registry.getStatus(first.name)?.status).toBe('down');
  });

  it('returns null for an unknown provider', () => {
    const registry = new ProviderRegistryService();
    expect(registry.getStatus('nope')).toBeNull();
  });
});

/**
 * Breaker relay (dexter plan todo 19b3): `recordFailure` is the ONE
 * failure writer — telemetry tick + relay into the shared
 * `CircuitBreakerService` under `snapshotBreakerKey` (the same key the
 * snapshot gate reads). Specs use threshold 1/2 for speed; production
 * defaults (5 consecutive failures -> 30s cool-off) live in the
 * breaker's own spec.
 */
describe('ProviderRegistryService breaker relay (todo 19b3)', () => {
  it('relays consecutive transport failures and opens the shared circuit', () => {
    const breaker = new CircuitBreakerService(2, 60_000);
    const registry = new ProviderRegistryService(
      new ProviderHealthChecker(),
      breaker,
    );
    expect(breaker.getState(snapshotBreakerKey('geckoterminal'))).toBe(
      'closed',
    );
    registry.recordFailure('geckoterminal', 'transport boom');
    expect(breaker.getState(snapshotBreakerKey('geckoterminal'))).toBe(
      'closed',
    );
    registry.recordFailure('geckoterminal', 'transport boom');
    expect(breaker.getState(snapshotBreakerKey('geckoterminal'))).toBe('open');
    // The telemetry counters still tick (gateway `listStatus`).
    expect(registry.getStatus('geckoterminal')?.errorCount).toBe(2);
  });

  it("counts but NEVER relays 'no data' (conservative blind spot)", () => {
    const breaker = new CircuitBreakerService(1, 60_000);
    const registry = new ProviderRegistryService(
      new ProviderHealthChecker(),
      breaker,
    );
    for (let i = 0; i < 5; i += 1) {
      registry.recordFailure('geckoterminal', 'no data');
    }
    expect(breaker.getState(snapshotBreakerKey('geckoterminal'))).toBe(
      'closed',
    );
    // Telemetry still counts: 5 consecutive errors -> down for the gateway.
    expect(registry.getStatus('geckoterminal')?.status).toBe('down');
    expect(registry.getStatus('geckoterminal')?.errorCount).toBe(5);
  });

  it('treats a missing reason as a transport failure (only the marker is excused)', () => {
    const breaker = new CircuitBreakerService(1, 60_000);
    const registry = new ProviderRegistryService(
      new ProviderHealthChecker(),
      breaker,
    );
    registry.recordFailure('geckoterminal');
    expect(breaker.getState(snapshotBreakerKey('geckoterminal'))).toBe('open');
  });

  it('unknown names keep the descriptor parity skip (no telemetry, no breaker row)', () => {
    const breaker = new CircuitBreakerService(1, 60_000);
    const registry = new ProviderRegistryService(
      new ProviderHealthChecker(),
      breaker,
    );
    registry.recordFailure('mystery', 'transport boom');
    expect(breaker.getState(snapshotBreakerKey('mystery'))).toBe('closed');
    expect(registry.getStatus('mystery')).toBeNull();
  });

  it('without an injected breaker the telemetry path is unchanged (never throws)', () => {
    const registry = new ProviderRegistryService();
    for (let i = 0; i < 7; i += 1) {
      registry.recordFailure('geckoterminal', 'transport boom');
    }
    expect(registry.getStatus('geckoterminal')?.status).toBe('down');
  });
});

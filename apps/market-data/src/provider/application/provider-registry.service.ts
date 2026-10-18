import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import {
  DEFAULT_PROVIDERS,
  type ProviderDescriptor,
  type ProviderKind,
} from '../domain/provider-descriptor';
import type { ProviderStatus } from '../domain/provider-health.vo';
import { CircuitBreakerService } from 'shared/infrastructure/rate-limiter/application/circuit-breaker.service';
import { snapshotBreakerKey } from 'shared/infrastructure/rate-limiter/domain/snapshot-breaker-key';
import { ProviderFailoverPolicy } from './provider-failover.policy';
import { ProviderHealthChecker } from './provider-health-checker.service';

export type {
  ProviderHealth,
  ProviderStatus,
} from '../domain/provider-health.vo';

/**
 * Honest-empty marker written by the snapshot aggregator when a fetcher
 * fulfilled `null` (no market). `recordFailure` counts it in the
 * telemetry but NEVER relays it to the breaker — see the blind-spot
 * note on `recordFailure`.
 */
const NO_DATA_MARKER = 'no data';

/**
 * ProviderRegistryService (Tramo 3, todos 2+4, provider-hex).
 *
 * Health/latency/rate-limit registry over static descriptors. Records
 * rolling latency + consecutive errors; the aggregated status is served
 * by the gateway (P43) — this module exposes no controllers.
 *
 * Failure recording is ONE path (dexter plan todo 19b3): every
 * `recordFailure` ticks the telemetry counters AND relays the transport
 * failure into the shared `CircuitBreakerService` under
 * `snapshotBreakerKey(name)` — the SAME key `AddressSnapshotService`
 * gates its fan-out with. The relay never throws (fail-open: an open
 * circuit only removes the fetcher from the next snapshot with an
 * explicit skip note). The success side stays at the snapshot seam
 * (contribution + idle-success) — a documented asymmetry: idle-success
 * (admitted fetcher ran clean but contributed nothing) has no registry
 * counterpart.
 *
 * Hexagonal home: `src/provider/application/` (was `src/provider/`;
 * re-exported there for compat). Status derivation is composed from
 * `ProviderHealthChecker` (same truth table as before); failover
 * preference order is exposed additively via `listFailoverOrder`.
 */
@Injectable()
export class ProviderRegistryService {
  private readonly descriptors = new Map<string, ProviderDescriptor>();
  private readonly latency = new Map<string, number>();
  private readonly errors = new Map<string, number>();
  private readonly lastCheck = new Map<string, string>();
  private readonly logger = new Logger(ProviderRegistryService.name);

  public constructor(
    private readonly checker: ProviderHealthChecker = new ProviderHealthChecker(),
    // Breaker relay (dexter plan todo 19b3): the registry is the ONE
    // failure writer. `@Optional` + `@Inject` are both mandatory — the
    // union type would otherwise emit `Object` metadata and Nest would
    // resolve null even when the (global) RateLimiterModule registered
    // CircuitBreakerService. Null in hand-built specs -> telemetry-only,
    // zero behavior change.
    @Optional()
    @Inject(CircuitBreakerService)
    private readonly breaker: CircuitBreakerService | null = null,
  ) {
    for (const descriptor of DEFAULT_PROVIDERS) {
      this.descriptors.set(descriptor.name, descriptor);
    }
  }

  public listProviders(): ReadonlyArray<ProviderDescriptor> {
    return [...this.descriptors.values()];
  }

  public listStatus(): ReadonlyArray<ProviderStatus> {
    return this.listProviders().map((descriptor) =>
      this.toStatus(descriptor.name),
    );
  }

  public getStatus(name: string): ProviderStatus | null {
    if (!this.descriptors.has(name)) {
      return null;
    }
    return this.toStatus(name);
  }

  public listFailoverOrder(kind?: ProviderKind): ReadonlyArray<string> {
    return ProviderFailoverPolicy.order(this.listStatus(), kind);
  }

  public recordSuccess(name: string, latencyMs: number): void {
    if (!this.descriptors.has(name)) {
      return;
    }
    this.latency.set(name, latencyMs);
    this.errors.set(name, 0);
    this.lastCheck.set(name, new Date().toISOString());
  }

  /**
   * Failure recording — ONE path (dexter plan todo 19b3): unknown names
   * keep the pre-existing descriptor parity skip (no telemetry, no
   * breaker row); known names tick the telemetry counters AND relay the
   * transport failure to the shared breaker (threshold/cool-off are
   * `CircuitBreakerService`'s own defaults: 5 consecutive failures ->
   * 30s cool-off, memory store, reset-on-deploy accepted).
   *
   * `'no data'` is the conservative blind spot (documented, not
   * hidden): an exhausted 19b2 retry collapses to the SAME marker as an
   * honest empty, so the breaker cannot tell a 429-storm from
   * no-market without a new taxonomy — inventing one here would churn
   * the merge contract. A missing reason (`undefined`) is treated as a
   * transport failure (only the exact marker is excused).
   */
  public recordFailure(name: string, reason?: string): void {
    if (!this.descriptors.has(name)) {
      return;
    }
    this.errors.set(name, (this.errors.get(name) ?? 0) + 1);
    this.lastCheck.set(name, new Date().toISOString());
    if (reason === NO_DATA_MARKER) {
      return;
    }
    const key = snapshotBreakerKey(name);
    this.breaker?.recordFailure(key);
    if (
      this.breaker !== null &&
      this.breaker !== undefined &&
      this.breaker.getState(key) === 'open'
    ) {
      this.logger.warn(
        `breaker open: ${name} (5 consecutive transport failures — 30s cool-off, skips fail-open; resets on deploy)`,
      );
    }
  }

  private toStatus(name: string): ProviderStatus {
    const descriptor = this.descriptors.get(name);
    if (descriptor === undefined) {
      throw new Error(`Unknown provider: ${name}`);
    }
    return this.checker.toStatus({
      descriptor,
      errorCount: this.errors.get(name) ?? 0,
      latencyMs: this.latency.get(name) ?? null,
      lastCheckAt: this.lastCheck.get(name) ?? null,
    });
  }
}

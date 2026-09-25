import { Injectable } from '@nestjs/common';
import {
  DEFAULT_PROVIDERS,
  type ProviderDescriptor,
  type ProviderKind,
} from '../domain/provider-descriptor';
import type { ProviderStatus } from '../domain/provider-health.vo';
import { ProviderFailoverPolicy } from './provider-failover.policy';
import { ProviderHealthChecker } from './provider-health-checker.service';

export type { ProviderHealth, ProviderStatus } from '../domain/provider-health.vo';

/**
 * ProviderRegistryService (Tramo 3, todos 2+4, provider-hex).
 *
 * Health/latency/rate-limit registry over static descriptors. Records
 * rolling latency + consecutive errors; the aggregated status is served
 * by the gateway (P43) — this module exposes no controllers.
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

  public constructor(
    private readonly checker: ProviderHealthChecker = new ProviderHealthChecker(),
  ) {
    for (const descriptor of DEFAULT_PROVIDERS) {
      this.descriptors.set(descriptor.name, descriptor);
    }
  }

  public listProviders(): ReadonlyArray<ProviderDescriptor> {
    return [...this.descriptors.values()];
  }

  public listStatus(): ReadonlyArray<ProviderStatus> {
    return this.listProviders().map((descriptor) => this.toStatus(descriptor.name));
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

  public recordFailure(name: string): void {
    if (!this.descriptors.has(name)) {
      return;
    }
    this.errors.set(name, (this.errors.get(name) ?? 0) + 1);
    this.lastCheck.set(name, new Date().toISOString());
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

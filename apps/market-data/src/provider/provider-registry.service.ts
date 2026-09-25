import { Injectable } from '@nestjs/common';
import { DEFAULT_PROVIDERS, ProviderDescriptor } from './provider-descriptor';

export type ProviderHealth = 'up' | 'degraded' | 'down' | 'unknown';

export interface ProviderStatus {
  readonly name: string;
  readonly kind: string;
  readonly status: ProviderHealth;
  readonly latencyMs: number | null;
  readonly errorCount: number;
  readonly lastCheckAt: string | null;
}

/**
 * ProviderRegistryService (Tramo 3, todo 2).
 *
 * Health/latency/rate-limit registry over static descriptors. Records
 * rolling latency + consecutive errors; the aggregated status is served
 * by the gateway (P43) — this module exposes no controllers.
 */
@Injectable()
export class ProviderRegistryService {
  private readonly descriptors = new Map<string, ProviderDescriptor>();
  private readonly latency = new Map<string, number>();
  private readonly errors = new Map<string, number>();
  private readonly lastCheck = new Map<string, string>();

  public constructor() {
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
    const errorCount = this.errors.get(name) ?? 0;
    const latencyMs = this.latency.get(name) ?? null;
    const status: ProviderHealth =
      errorCount >= 5 ? 'down' : errorCount >= 2 ? 'degraded' : latencyMs === null ? 'unknown' : 'up';
    return {
      name,
      kind: descriptor.kind,
      status,
      latencyMs,
      errorCount,
      lastCheckAt: this.lastCheck.get(name) ?? null,
    };
  }
}

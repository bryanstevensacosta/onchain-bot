import { Injectable } from '@nestjs/common';
import type {
  ProviderHealth,
  ProviderHealthSnapshot,
  ProviderStatus,
} from '../domain/provider-health.vo';

/**
 * ProviderHealthChecker (Tramo 3, provider-hex).
 *
 * Pure status derivation extracted verbatim from
 * `ProviderRegistryService.toStatus` (same truth table, zero behavior
 * change): 5+ consecutive errors -> down, 2+ -> degraded, no latency
 * sample yet -> unknown, otherwise up. Injectable so the registry
 * composes it; also `new`-able directly (specs do both).
 */
@Injectable()
export class ProviderHealthChecker {
  public toStatus(snapshot: ProviderHealthSnapshot): ProviderStatus {
    const status: ProviderHealth =
      snapshot.errorCount >= 5
        ? 'down'
        : snapshot.errorCount >= 2
          ? 'degraded'
          : snapshot.latencyMs === null
            ? 'unknown'
            : 'up';
    return {
      name: snapshot.descriptor.name,
      kind: snapshot.descriptor.kind,
      status,
      latencyMs: snapshot.latencyMs,
      errorCount: snapshot.errorCount,
      lastCheckAt: snapshot.lastCheckAt,
    };
  }
}

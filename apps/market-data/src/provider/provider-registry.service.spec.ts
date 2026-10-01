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

import { Test } from '@nestjs/testing';
import { CircuitBreakerService } from 'shared/infrastructure/rate-limiter/application/circuit-breaker.service';
import { snapshotBreakerKey } from 'shared/infrastructure/rate-limiter/domain/snapshot-breaker-key';
import { RateLimiterModule } from 'shared/infrastructure/rate-limiter/rate-limiter.module';
import { ProviderRegistryService } from './application/provider-registry.service';
import { ProviderModule } from './provider.module';

describe('ProviderModule', () => {
  it('boots as a stub (health/latency registry lands in todo 2)', async () => {
    const module = await Test.createTestingModule({
      imports: [ProviderModule],
    }).compile();
    expect(module.get(ProviderModule)).toBeDefined();
  });

  it('wires the global breaker into the registry (19b3 DI relay)', async () => {
    const module = await Test.createTestingModule({
      imports: [RateLimiterModule, ProviderModule],
    }).compile();
    const registry = module.get(ProviderRegistryService);
    const breaker = module.get(CircuitBreakerService);
    // Defaults: 5 consecutive failures -> open (30s cool-off). The
    // state read goes through the module-resolved instance, so a green
    // assertion proves registry and module share ONE breaker.
    for (let i = 0; i < 5; i += 1) {
      registry.recordFailure('geckoterminal', 'transport boom');
    }
    expect(breaker.getState(snapshotBreakerKey('geckoterminal'))).toBe('open');
  });
});

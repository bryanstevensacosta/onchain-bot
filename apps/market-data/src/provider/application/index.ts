/**
 * Application barrel (Tramo 3, provider-hex).
 *
 * Registry + health-checker + failover policy. Depends inward on
 * `../domain/` only; infrastructure and gateway consume this.
 */
export { ProviderHealthChecker } from './provider-health-checker.service';
export { ProviderFailoverPolicy } from './provider-failover.policy';
export { ProviderRegistryService } from './provider-registry.service';
export type { ProviderHealth, ProviderStatus } from '../domain/provider-health.vo';

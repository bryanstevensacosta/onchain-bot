/**
 * Provider domain barrel (Tramo 3, provider-hex).
 *
 * Ports + descriptors + health value objects. No adapter code, no Nest
 * wiring — application and infrastructure layers depend inward on this.
 */
export { DataProviderPort } from './data-provider.port';
export type { ProviderDescriptor, ProviderKind } from './provider-descriptor';
export { DEFAULT_PROVIDERS } from './provider-descriptor';
export type {
  ProviderHealth,
  ProviderHealthSnapshot,
  ProviderStatus,
} from './provider-health.vo';

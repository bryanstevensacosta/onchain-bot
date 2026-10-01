import { Logger } from '@nestjs/common';
import {
  DEFAULT_PROVIDER_RATE_LIMIT_CONFIG,
  type ProviderRateLimitConfig,
} from './provider-limiter-config';

/**
 * Abstract base class for every data provider in the system.
 *
 * All provider services (Birdeye, Helius, Alchemy, etc.) extend this class
 * so they share a common type that can be injected, wrapped, or composed
 * across any Bounded Context.
 *
 * Subclasses MUST set `name` and `logger`. The optional `onModuleInit()`
 * hook is called by NestJS after DI is resolved; override it to validate
 * API keys or verify connectivity at boot.
 */
export abstract class DataProviderPort {
  /** Human-readable provider identifier (e.g. 'birdeye', 'helius'). */
  public abstract readonly name: string;

  /** Provider-scoped logger instance. */
  protected abstract readonly logger: Logger;

  /**
   * Optional lifecycle hook — called by NestJS once all dependencies are
   * resolved. Override to validate credentials or pre-warm connections.
   */
  public async onModuleInit(): Promise<void> {
    // no-op by default
  }

  /**
   * Full limiter contract for this adapter (Tramo 3, todo 16, P48-bis).
   *
   * The default fits the free-tier request budgets; adapters with
   * heavier or cheaper endpoints override it (ccxt: generous CEX
   * quota with a heavier OHLCV cost). The registry descriptors carry
   * the same numbers as data — this seam is the per-adapter voice.
   */
  public getRateLimitConfig(): ProviderRateLimitConfig {
    return DEFAULT_PROVIDER_RATE_LIMIT_CONFIG;
  }
}

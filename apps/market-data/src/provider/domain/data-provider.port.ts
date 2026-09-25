import { Logger } from '@nestjs/common';

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
}

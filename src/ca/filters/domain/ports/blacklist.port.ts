/**
 * Outbound port: check if a `(chain, address)` is blacklisted
 * (known scam, known rug, or manually flagged).
 *
 * Implemented by adapters backed by:
 * - Hard-coded lists
 * - External reputation APIs (GoPlus, Chainabuse)
 * - User-managed flag tables
 */
export abstract class BlacklistPort {
  public abstract isBlacklisted(
    chain: string,
    address: string,
  ): Promise<{
    readonly blacklisted: boolean;
    readonly reason: string | null;
  }>;
}

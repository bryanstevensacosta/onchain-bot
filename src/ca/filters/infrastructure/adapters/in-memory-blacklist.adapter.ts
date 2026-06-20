import { Injectable, Logger } from '@nestjs/common';
import { BlacklistPort } from 'ca/filters/domain/ports/blacklist.port';

/**
 * In-memory blacklist adapter.
 *
 * v1: hard-coded list + optional env-configured additions.
 * v2: external API integration (GoPlus, Chainabuse).
 */
@Injectable()
export class InMemoryBlacklistAdapter extends BlacklistPort {
  private readonly logger = new Logger(InMemoryBlacklistAdapter.name);
  private readonly known: Map<string, string> = new Map();

  private static readonly HARDCODED: ReadonlyArray<{
    chain: string;
    address: string;
    reason: string;
  }> = [
    {
      chain: 'solana',
      address: 'So11111111111111111111111111111111111111112',
      reason: 'Wrapped SOL — common, not actually blacklisted (example)',
    },
  ];

  public constructor() {
    super();
    InMemoryBlacklistAdapter.HARDCODED.forEach((entry) => {
      this.known.set(
        `${entry.chain}:${entry.address.toLowerCase()}`,
        entry.reason,
      );
    });
    this.logger.log(`Blacklist initialized with ${this.known.size} entries`);
  }

  public async isBlacklisted(
    chain: string,
    address: string,
  ): Promise<{ blacklisted: boolean; reason: string | null }> {
    await Promise.resolve();
    const key = `${chain.toLowerCase()}:${address.toLowerCase()}`;
    const reason = this.known.get(key) ?? null;
    return { blacklisted: reason !== null, reason };
  }
}

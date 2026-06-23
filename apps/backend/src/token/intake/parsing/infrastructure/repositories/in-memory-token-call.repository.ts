import { Injectable } from '@nestjs/common';
import { TokenCall } from 'token/intake/parsing/domain/entities/token-call.entity';
import { TokenCallRepository } from 'token/intake/parsing/application/ports/token-call.repository';

/**
 * In-memory TokenCall repository. Bounded capacity (FIFO eviction).
 * Replace with TypeORM/Prisma adapter for production.
 */
@Injectable()
export class InMemoryTokenCallRepository extends TokenCallRepository {
  private static readonly MAX_ENTRIES = 1000;
  private readonly store = new Map<string, TokenCall>();

  public async save(call: TokenCall): Promise<void> {
    await Promise.resolve();
    this.store.set(call.id, call);
    while (this.store.size > InMemoryTokenCallRepository.MAX_ENTRIES) {
      const oldest: string | undefined = this.store.keys().next().value as
        | string
        | undefined;
      if (oldest === undefined) break;
      this.store.delete(oldest);
    }
  }

  public async findByChannelAndMessage(
    kolId: string,
    messageId: number,
  ): Promise<TokenCall | null> {
    await Promise.resolve();
    return this.store.get(`${kolId}:${messageId}`) ?? null;
  }

  public async findRecent(limit: number): Promise<ReadonlyArray<TokenCall>> {
    await Promise.resolve();
    return Array.from(this.store.values()).slice(-limit).reverse();
  }
}

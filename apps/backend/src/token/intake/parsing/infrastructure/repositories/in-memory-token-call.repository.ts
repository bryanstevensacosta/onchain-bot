/**
 * @deprecated Moved to apps/kol-calls/src/parsing/ (Tramo 1, todo 6 + P18 companion).
 * Parsing 1:1 now lives in kol-calls: ParseFromCandidatesUseCase → ParsedCall
 * (preserves mentions, NO collapse-to-one). This file stays wired for dual-run;
 * it will be removed in todo 16 (cutover + cleanup). Do not extend it — add parsing
 * logic in apps/kol-calls/src/parsing/ instead.
 *
 * New location: apps/kol-calls/src/parsing/
 * Reason: extracting KOL pipeline from backend monolith to dedicated app
 * Breaking change: Yes (removal in todo 16)
 * Rollback: re-enable backend path (KOL_PIPELINE_ENABLED=true)
 */
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

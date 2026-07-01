import { Injectable } from '@nestjs/common';
import { ChainId } from 'chain/identity/chain-id.vo';
import { PublishedCall, PublishedCallRepository } from 'telegram/shared';
import type {
  FinalizePayload,
  ReservePayload,
  TryReserveResult,
} from 'telegram/shared/application/ports/published-call.repository';

@Injectable()
export class InMemoryPublishedCallRepository implements PublishedCallRepository {
  private readonly store = new Map<string, PublishedCall>();
  private static readonly MAX_ENTRIES = 500;

  public async save(call: PublishedCall): Promise<void> {
    if (this.store.size >= InMemoryPublishedCallRepository.MAX_ENTRIES) {
      const oldestKey = this.store.keys().next().value as string | undefined;
      if (oldestKey) this.store.delete(oldestKey);
    }
    this.store.set(call.id, call);
  }

  public async findByChainAndAddress(
    chain: ChainId,
    address: string,
  ): Promise<PublishedCall | null> {
    const normalizedAddress = chain.isSolana ? address : address.toLowerCase();
    const key = `${chain.value}:${normalizedAddress}`;
    return this.store.get(key) ?? null;
  }

  public async findRecent(
    limit: number,
  ): Promise<ReadonlyArray<PublishedCall>> {
    return Array.from(this.store.values())
      .sort((a, b) => {
        const aT = (a.publishedAt ?? a.reservedAt).getTime();
        const bT = (b.publishedAt ?? b.reservedAt).getTime();
        return bT - aT;
      })
      .slice(0, limit);
  }

  public async findPublished(
    limit: number,
  ): Promise<ReadonlyArray<PublishedCall>> {
    return Array.from(this.store.values())
      .filter((c) => c.isPublished)
      .sort((a, b) => {
        const aT = (a.publishedAt ?? a.reservedAt).getTime();
        const bT = (b.publishedAt ?? b.reservedAt).getTime();
        return bT - aT;
      })
      .slice(0, limit);
  }

  public async findFailed(
    limit: number,
  ): Promise<ReadonlyArray<PublishedCall>> {
    return Array.from(this.store.values())
      .filter((c) => c.isFailed)
      .sort((a, b) => {
        const aT = (a.publishedAt ?? a.reservedAt).getTime();
        const bT = (b.publishedAt ?? b.reservedAt).getTime();
        return bT - aT;
      })
      .slice(0, limit);
  }

  public async countPublished(): Promise<number> {
    return Array.from(this.store.values()).filter((c) => c.isPublished).length;
  }

  /**
   * Mirrors the TypeORM repository's behavior on the in-process map.
   *
   * - If no entry exists for `id`, build a fresh RESERVED aggregate via
   *   `PublishedCall.reserve()` and store it. Returns `{ reserved: true }`.
   * - If an entry already exists, return `{ reserved: false, existing }`
   *   with the current entry. The caller MUST skip the Telegram send.
   *
   * Note: the JS event loop guarantees the check-then-set inside this
   * function runs atomically, so concurrent test invocations on a
   * shared in-memory repo converge just like concurrent SQL writers
   * with the unique constraint.
   */
  public async tryReserve(payload: ReservePayload): Promise<TryReserveResult> {
    const normalizedAddress = payload.chain.isSolana
      ? payload.address
      : payload.address.toLowerCase();
    const id = `${payload.chain.value}:${normalizedAddress}`;

    const existing = this.store.get(id);
    if (existing) {
      return { reserved: false, existing, id };
    }

    const reserved = PublishedCall.reserve({
      chain: payload.chain,
      address: payload.address,
      ticker: payload.ticker,
      score: payload.score,
      tier: payload.tier,
      classification: payload.classification,
      message: payload.message,
      targetChannels: payload.targetChannels,
      mcAtCall: payload.mcAtCall,
      correlationId: payload.correlationId,
    });
    this.store.set(id, reserved);
    return { reserved: true, existing: null, id };
  }

  /**
   * In-place mutation of the stored aggregate via the entity's
   * `markPublished` / `markFailed` lifecycle methods. The map's
   * reference stays the same — callers that already hold a reference
   * see the updated state.
   *
   * If the stored entry is not in RESERVED status (already finalized),
   * finalize is a no-op so retries are safe.
   */
  public async finalize(
    id: string,
    payload: FinalizePayload,
  ): Promise<void> {
    const existing = this.store.get(id);
    if (!existing || !existing.isReserved) {
      return;
    }
    if (
      payload.status === 'PUBLISHED' &&
      payload.telegramMessageId !== null &&
      payload.telegramMessageId !== undefined
    ) {
      existing.markPublished(payload.telegramMessageId);
    } else {
      existing.markFailed(payload.failedReason ?? 'unknown');
    }
  }

  /**
   * Best-effort failure marker. Idempotent.
   */
  public async markFailed(id: string, reason: string): Promise<void> {
    const existing = this.store.get(id);
    if (!existing || !existing.isReserved) {
      return;
    }
    existing.markFailed(reason);
  }
}
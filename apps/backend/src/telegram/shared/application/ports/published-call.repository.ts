import { ChainId } from 'chain/identity/chain-id.vo';
import { PublishedCall } from '../../domain/entities/published-call.entity';

export interface ReservePayload {
  readonly chain: ChainId;
  readonly address: string;
  readonly ticker: string | null;
  readonly score: number;
  readonly tier: string;
  readonly classification: string;
  readonly message: string;
  readonly targetChannels: ReadonlyArray<string>;
  readonly mcAtCall: number | null;
  readonly correlationId: string;
}

export interface TryReserveResult {
  readonly reserved: boolean;
  readonly existing: PublishedCall | null;
  readonly id: string;
}

export interface FinalizePayload {
  readonly telegramMessageId: number | null;
  readonly status: 'PUBLISHED' | 'FAILED';
  readonly failedReason?: string;
}

export abstract class PublishedCallRepository {
  public abstract save(call: PublishedCall): Promise<void>;
  public abstract findByChainAndAddress(
    chain: ChainId,
    address: string,
  ): Promise<PublishedCall | null>;
  public abstract findRecent(
    limit: number,
  ): Promise<ReadonlyArray<PublishedCall>>;
  public abstract findPublished(
    limit: number,
  ): Promise<ReadonlyArray<PublishedCall>>;
  public abstract findFailed(
    limit: number,
  ): Promise<ReadonlyArray<PublishedCall>>;
  public abstract countPublished(): Promise<number>;
  public abstract tryReserve(
    payload: ReservePayload,
  ): Promise<TryReserveResult>;
  public abstract finalize(id: string, payload: FinalizePayload): Promise<void>;
  public abstract markFailed(id: string, reason: string): Promise<void>;

  /**
   * Return RESERVED rows whose `reservedAt` is older than `olderThanMs`
   * milliseconds, ordered oldest-first and capped at `limit`.
   *
   * Used by the reconciler to finalize rows that got stuck between the
   * Telegram `sendMessage` call and the `finalize()` UPDATE (e.g. process
   * kill, network drop, finalize throwing). The use case decides whether
   * to mark each as PUBLISHED (when the Telegram id is already known)
   * or FAILED (when sendMessage never returned).
   */
  public abstract findStuckReservations(
    olderThanMs: number,
    limit: number,
  ): Promise<ReadonlyArray<PublishedCall>>;
}

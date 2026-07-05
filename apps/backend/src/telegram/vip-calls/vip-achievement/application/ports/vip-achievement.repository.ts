/**
 * Persistence-agnostic record shape for a milestone notification. Mirrors the
 * domain entity fields (minus behavioural methods) so the application layer can
 * pass it across the port without dragging the domain class into the
 * implementation detail of the persistence adapter.
 */
export interface VipAchievementRecord {
  id?: string;
  callId: string;
  threshold: number;
  notifiedAt: Date;
  telegramMessageId?: number | null;
}

/**
 * Outbound port for the `vip-achievement` sub-BC's persistence needs.
 *
 * Implemented by:
 *   - `InMemoryVipAchievementRepository` (when DATABASE_ENABLED=false)
 *   - `TypeormVipAchievementRepository` (when DATABASE_ENABLED=true)
 *
 * The unique constraint on `(callId, threshold)` is enforced at the persistence
 * layer (both in-memory and Postgres). The application layer relies on this
 * constraint to provide race-free dedup: `save()` returns `null` when the row
 * already exists, and the caller MUST treat `null` as "already notified —
 * skip the side effects".
 */
export abstract class VipAchievementRepository {
  /** Returns every record for the given callId, ordered by insertion. */
  public abstract findByCall(callId: string): Promise<VipAchievementRecord[]>;

  /** Returns the set of thresholds already notified for the given callId. */
  public abstract findThresholdsForCall(callId: string): Promise<number[]>;

  /** Convenience predicate for callers that only need to know existence. */
  public abstract existsByCallAndThreshold(
    callId: string,
    threshold: number,
  ): Promise<boolean>;

  /**
   * Atomically attempt to persist a new record.
   *
   * Returns the persisted record (with id filled in) on success.
   * Returns `null` when the unique constraint `(callId, threshold)` is
   * violated — i.e. the milestone has already been recorded by a concurrent
   * invocation. Callers MUST handle the `null` case as "skip".
   */
  public abstract save(
    record: VipAchievementRecord,
  ): Promise<VipAchievementRecord | null>;

  /** Count of records for a call — used for diagnostics and dashboards. */
  public abstract countByCall(callId: string): Promise<number>;

  /**
   * Stamp the Telegram-side `message_id` onto the matching record after a
   * successful send. No-ops with a warn-log when the row is missing (the
   * caller is responsible for sequencing save → send → update).
   */
  public abstract updateTelegramMessageId(
    callId: string,
    threshold: number,
    messageId: number,
  ): Promise<void>;
}

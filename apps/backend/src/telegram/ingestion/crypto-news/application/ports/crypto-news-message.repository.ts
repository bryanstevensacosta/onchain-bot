import { CryptoNewsMessage } from '../../domain/crypto-news-message.stub';

/**
 * @deprecated DEAD CODE - Backend no longer persists crypto-news (ingestion-service owns tables)
 *
 * Repository port for crypto-news messages.
 *
 * Post db-separation (2026-09-08) + event handler deletion (crypto-news-entity-cleanup spec):
 * - Backend uses DTOs only (no entity dependencies)
 * - `CryptoNewsMessageIngestedEvent` is NOT emitted (event handler deleted)
 * - Kept ONLY as DI shim to prevent module wiring breakage
 * - Sole implementation: `InMemoryCryptoNewsMessageRepository` (empty store, always returns null)
 *
 * DO NOT USE. Query ingestion-service HTTP API instead:
 *   GET {INGESTION_SERVICE_URL}/api/crypto-news/messages
 */
export abstract class CryptoNewsMessageRepository {
  public abstract save(message: CryptoNewsMessage): Promise<void>;
  public abstract findById(id: string): Promise<CryptoNewsMessage | null>;
  /**
   * Find recent messages, optionally filtered to those ingested at or
   * after `since`.
   *
   * Boundary contract: read = `ingestedAt >= since` (inclusive lower
   * bound). The media-retention cleanup cron (Todo 3) uses the
   * complementary strict `parent.ingested_at < since` predicate on the
   * join to the media table, so no row is both visible and eligible
   * for deletion at the same instant.
   */
  public abstract findRecent(
    limit: number,
    since?: Date,
  ): Promise<ReadonlyArray<CryptoNewsMessage>>;
  /**
   * Find recent messages for a specific channel, optionally filtered
   * to those ingested at or after `since`. See {@link findRecent} for
   * the boundary contract (`ingestedAt >= since`).
   */
  public abstract findByChannelId(
    channelId: string,
    limit: number,
    since?: Date,
  ): Promise<ReadonlyArray<CryptoNewsMessage>>;
  /**
   * Look up a single message by its Telegram-side (channelId, messageId).
   * Returns `null` when no row matches. Used by the crypto-news-publisher
   * BC (Wave 3) to fetch the full message — including `content`, `media[]`,
   * `linkPreviewUrl`, `groupedId` — for keyword matching. The
   * `CryptoNewsMessageIngestedEvent` deliberately does NOT carry `content`
   * (fix-1 Bot Dev ToS §4.3), so consumers must go through this lookup.
   */
  public abstract findByChannelAndMessageId(
    channelId: string,
    messageId: number,
  ): Promise<CryptoNewsMessage | null>;
  /**
   * Find all messages in the same Telegram album/media group. Returns all
   * messages that share the same `groupedId` AND the same `channelId`.
   * Used by the publisher enqueue use case to merge album photos into a
   * single queue entry with multiple `imagePaths` so the publisher can
   * dispatch them as a `sendMediaGroup` (album) instead of separate
   * `sendPhoto` calls.
   *
   * Returns an empty array when no grouped siblings exist.
   */
  public abstract findByChannelAndGroupedId(
    channelId: string,
    groupedId: string,
  ): Promise<ReadonlyArray<CryptoNewsMessage>>;
}

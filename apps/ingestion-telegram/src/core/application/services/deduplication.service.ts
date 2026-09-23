import { Injectable, Logger } from '@nestjs/common';

/**
 * Message deduplication service
 *
 * Per Invariant 3: Prevents duplicate messages (same channelId + messageId) from being broadcast
 * Per Invariant 6: Uses LastSeenManager for cursor tracking
 *
 * Deduplication strategy:
 * - In-memory seen-cache ONLY (Strategy 2). Exact re-delivery of an already
 *   routed messageId is rejected; everything else is accepted.
 * - The `highestSeen` cursor parameter is informational only (logging /
 *   back-compat for the polling minId). It MUST NOT reject: album parts with
 *   lower IDs routinely arrive after a higher-ID sibling advanced the cursor,
 *   and rejecting them silently dropped caption parts (data loss).
 * - Durable idempotency lives in the DB `findByChannelAndMessageId` check in
 *   `persistFeedMessage` (MessagePersistenceCoordinator), which survives
 *   restarts when the in-memory cache is cold.
 *
 * @injectable NestJS service
 */
@Injectable()
export class DeduplicationService {
  private readonly logger = new Logger(DeduplicationService.name);

  /**
   * In-memory seen messages cache for fast lookup within session
   * Structure: Map<channelId, Set<messageId>>
   *
   * This provides O(1) duplicate detection for messages arriving
   * out-of-order or during initial backfill operations.
   */
  private readonly seenMessages = new Map<string, Set<number>>();

  /**
   * Maximum cache size per channel before pruning oldest entries
   * Prevents unbounded memory growth on long-running service
   */
  private readonly MAX_CACHE_PER_CHANNEL = 10000;

  /**
   * Check if a message is a duplicate
   *
   * Per Invariant 3: Deduplication at source before broadcast
   *
   * @param channelId - Telegram channel identifier
   * @param messageId - Telegram message identifier
   * @param highestSeen - Highest messageId seen for this channel (from
   *   LastSeenManager). INFORMATIONAL ONLY — kept for logging/back-compat,
   *   never rejects. Durable idempotency is the DB `findByChannelAndMessageId`
   *   check in `persistFeedMessage`.
   * @returns true if message is a duplicate and should be skipped
   */
  isDuplicate(
    channelId: string,
    messageId: number,
    highestSeen: number,
  ): boolean {
    // Cursor is informational only (polling minId / logging) — it MUST NOT
    // reject. Out-of-order album parts (lower IDs arriving after a higher-ID
    // sibling advanced the cursor) are legitimate and must route + persist;
    // the DB findByChannelAndMessageId check in persistFeedMessage is the
    // durable idempotency gate.
    if (messageId <= highestSeen) {
      this.logger.debug(
        `Out-of-order arrival ${channelId}:${messageId} below cursor ${highestSeen} — accepting (cursor is informational only)`,
      );
    }

    // Strategy 2 (the ONLY rejecting gate): Check in-memory cache for exact
    // re-delivery (realtime+polling double-delivery, retries).
    const channelCache = this.seenMessages.get(channelId);
    if (channelCache?.has(messageId)) {
      this.logger.warn(
        `Skipping duplicate message ${channelId}:${messageId} (in-memory cache hit)`,
      );
      return true;
    }

    // Not a duplicate - mark as seen and return false
    this.markAsSeen(channelId, messageId);
    return false;
  }

  /**
   * Mark a message as seen in the in-memory cache
   *
   * @param channelId - Telegram channel identifier
   * @param messageId - Telegram message identifier
   */
  private markAsSeen(channelId: string, messageId: number): void {
    let channelCache = this.seenMessages.get(channelId);

    if (!channelCache) {
      channelCache = new Set<number>();
      this.seenMessages.set(channelId, channelCache);
    }

    channelCache.add(messageId);

    // Prune cache if it exceeds max size
    if (channelCache.size > this.MAX_CACHE_PER_CHANNEL) {
      this.pruneCache(channelId, channelCache);
    }
  }

  /**
   * Prune oldest entries from channel cache to prevent unbounded growth
   *
   * Keeps the 50% newest entries (by messageId, which is monotonically increasing)
   *
   * @param channelId - Channel to prune
   * @param cache - Set of messageIds to prune
   */
  private pruneCache(channelId: string, cache: Set<number>): void {
    const sorted = Array.from(cache).sort((a, b) => a - b);
    const keepCount = Math.floor(this.MAX_CACHE_PER_CHANNEL * 0.5);
    const toKeep = sorted.slice(-keepCount);

    cache.clear();
    toKeep.forEach((id) => cache.add(id));

    this.logger.log(
      `Pruned dedup cache for ${channelId}: kept ${toKeep.length}/${sorted.length} entries`,
    );
  }

  /**
   * Clear all cached seen messages for a channel
   *
   * Useful when a channel is unsubscribed or on service restart
   *
   * @param channelId - Channel to clear
   */
  clearChannel(channelId: string): void {
    const deleted = this.seenMessages.delete(channelId);
    if (deleted) {
      this.logger.log(`Cleared dedup cache for channel: ${channelId}`);
    }
  }

  /**
   * Get cache statistics for monitoring
   *
   * @returns Object with cache size per channel and total memory usage estimate
   */
  getStats(): {
    channels: number;
    totalMessages: number;
    cachesByChannel: Record<string, number>;
  } {
    const cachesByChannel: Record<string, number> = {};
    let totalMessages = 0;

    for (const [channelId, cache] of this.seenMessages) {
      const size = cache.size;
      cachesByChannel[channelId] = size;
      totalMessages += size;
    }

    return {
      channels: this.seenMessages.size,
      totalMessages,
      cachesByChannel,
    };
  }

  /**
   * Clear all caches (for testing or service shutdown)
   */
  clearAll(): void {
    this.seenMessages.clear();
    this.logger.log('Cleared all dedup caches');
  }
}

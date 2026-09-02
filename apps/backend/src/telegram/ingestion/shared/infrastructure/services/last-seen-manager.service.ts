import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from 'shared/common/cache/redis.service';

/**
 * @deprecated This service is deprecated and will be removed in a future version.
 *
 * **Reason for deprecation:**
 * Message cursor tracking (last-seen message IDs) has been centralized into the ingestion
 * service to ensure consistent deduplication across all backend environments. With distributed
 * MTProto clients, each environment maintained separate cursors, potentially causing duplicate
 * processing or message loss during restarts.
 *
 * **Migration path:**
 * - **New location:** `apps/ingestion-service/src/telegram/shared/infrastructure/services/last-seen-manager.service.ts`
 * - **Backend impact:** Backend clients consuming SSE streams no longer need cursor management.
 *   The ingestion service handles deduplication at source, ensuring each message is broadcast
 *   exactly once to all connected clients.
 * - **Redis keys:** The centralized service continues using the same Redis key format
 *   `ingestion:lastSeen:{channelId}` for state persistence across restarts.
 *
 * **What moved to ingestion service:**
 * - Per-channel message ID cursor tracking
 * - Redis-backed persistence to survive service restarts (Architectural Invariant 6)
 * - Deduplication logic (same channelId + messageId filtering per Architectural Invariant 3)
 *
 * **Specification:** See `.kiro/specs/centralized-ingestion-service/requirements.md`
 * Architectural Invariant 6 for state persistence requirements and section 3.4 for
 * deduplication flow design.
 *
 * @see {@link apps/ingestion-service} Centralized cursor management eliminates duplicate processing
 */
@Injectable()
export class LastSeenManager {
  private lastSeenMessageId = new Map<string, number>();
  private readonly logger = new Logger(LastSeenManager.name);

  constructor(private readonly redis: RedisService) {}

  get(peerId: string): number {
    return this.lastSeenMessageId.get(peerId) ?? -1;
  }

  set(peerId: string, id: number): void {
    this.lastSeenMessageId.set(peerId, id);
  }

  size(): number {
    return this.lastSeenMessageId.size;
  }

  async load(channelIds: string[]): Promise<void> {
    for (const peerId of channelIds) {
      const key = `ingestion:lastSeen:${this.normalizePeerId(peerId)}`;
      try {
        const cached = await this.redis.get(key);
        if (cached) {
          const parsed = parseInt(cached, 10);
          if (!Number.isNaN(parsed) && parsed > 0) {
            this.lastSeenMessageId.set(peerId, parsed);
          }
        }
      } catch (err) {
        this.logger.warn(
          `Failed to load lastSeen from Redis for ${peerId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  async persist(peerId: string, messageId: number): Promise<void> {
    if (!this.redis?.isEnabled()) return;
    const key = `ingestion:lastSeen:${this.normalizePeerId(peerId)}`;
    try {
      await this.redis.set(key, messageId.toString());
    } catch (err) {
      this.logger.warn(
        `Redis set failed (key=${key}): ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private normalizePeerId(peerId: string): string {
    let normalized = peerId.startsWith('@') ? peerId.slice(1) : peerId;
    if (normalized.startsWith('-100')) normalized = normalized.slice(4);
    return normalized;
  }
}

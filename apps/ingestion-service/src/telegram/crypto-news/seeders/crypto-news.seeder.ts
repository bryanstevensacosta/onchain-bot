import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TelegramListenerPort } from '../../shared/ports/telegram-listener.port';
import {
  CRYPTO_NEWS_SEED,
  type SeedCryptoNewsChannel,
} from '../seeds/crypto-news.seed';

/**
 * @deprecated DEPRECATED: Use BackendChannelProviderService instead
 *
 * This seeder is kept for backward compatibility only and will be removed in a future version.
 * The new DB-driven approach fetches active crypto-news sources from the backend via HTTP:
 * - GET /api/crypto-news/sources/active/ids
 *
 * Migration path:
 * 1. Add sources via backend API: POST /api/crypto-news/sources
 * 2. Verify sources appear in backend DB with isActive=true and lifecycleStatus='ACTIVE'
 * 3. ingestion-service automatically picks them up via BackendChannelProviderService
 * 4. This seeder is no longer invoked by TelegramModule
 *
 * ---
 *
 * OLD BEHAVIOR (deprecated):
 *
 * Idempotently registers the static seed list of Telegram crypto-news
 * channels on application bootstrap.
 *
 * Adapted from backend's CryptoNewsSeeder for the centralized ingestion service.
 * Simplified to only track channel metadata for joining/monitoring — does NOT
 * persist CryptoNewsSource aggregates (that remains in backend).
 *
 * - Disabled when `INGESTION_TELEGRAM_NEWS_SEED_ENABLED` is false.
 * - If env-supplied channels are configured, they take precedence over
 *   the in-code seed file; otherwise the in-code list is used.
 * - Joins channels and resolves metadata without backend database operations.
 */
@Injectable()
export class CryptoNewsSeeder {
  private readonly logger = new Logger(CryptoNewsSeeder.name);
  private needsManualJoin = 0;
  private readonly registeredChannels = new Set<string>();

  constructor(
    private readonly config: ConfigService,
    @Inject(TelegramListenerPort)
    private readonly listener: TelegramListenerPort,
  ) {}

  public async seed(): Promise<{
    added: number;
    skipped: number;
    failed: number;
  }> {
    throw new Error(
      '❌ CryptoNewsSeeder has been REMOVED and replaced by DB-driven architecture.\n' +
        '   All crypto-news sources are now loaded from the backend database.\n' +
        '   Add sources via backend API: POST /api/crypto-news/sources\n' +
        '   This seeder should never be invoked. If you see this error, check TelegramModule initialization.',
    );
  }

  /**
   * Returns the list of successfully registered channel IDs.
   */
  public getRegisteredChannels(): string[] {
    return Array.from(this.registeredChannels);
  }

  private parseEnvChannels(): SeedCryptoNewsChannel[] {
    const envValue = this.config.get<string>('INGESTION_TELEGRAM_SEED_NEWS');
    if (!envValue || envValue.trim().length === 0) {
      return [];
    }

    const channels: SeedCryptoNewsChannel[] = [];
    const entries = envValue.split(',').map((s) => s.trim());

    for (const entry of entries) {
      if (entry.length === 0) continue;

      // Format: "channelId|handle|title" or just "channelId"
      const parts = entry.split('|').map((s) => s.trim());
      if (parts.length === 1) {
        channels.push({ channelId: parts[0] });
      } else if (parts.length >= 2) {
        channels.push({
          channelId: parts[0],
          handle: parts[1] || undefined,
          title: parts[2] || undefined,
        });
      }
    }

    return channels;
  }

  private async resolveTitleAndHandle(
    channelId: string,
    seedTitle?: string,
    seedHandle?: string,
  ): Promise<{ title: string; handle: string | null }> {
    // If seed provides title, use it directly
    if (seedTitle && seedTitle.trim().length > 0) {
      return { title: seedTitle.trim(), handle: seedHandle?.trim() || null };
    }

    // Attempt to resolve via MTProto
    try {
      const meta = await this.listener.resolveChannelMetadata(channelId);
      return { title: meta.title, handle: meta.handle };
    } catch (err) {
      // Failed to resolve — try joining the channel
      const joinResult = await this.listener
        .joinChannel(channelId)
        .catch(() => null);

      if (joinResult?.joined) {
        // Join successful — retry metadata
        try {
          const meta = await this.listener.resolveChannelMetadata(channelId);
          return { title: meta.title, handle: meta.handle };
        } catch {
          // Still failed after join
        }
      }

      // Log reason for join failure
      const reason =
        joinResult?.error ?? (err instanceof Error ? err.message : 'Unknown');

      if (
        reason.includes('PeerUser') ||
        reason.includes('USER_NOT_PARTICIPANT')
      ) {
        this.needsManualJoin += 1;
      } else {
        this.logger.warn(
          `Could not resolve or join channel ${channelId}: ${reason}` +
            (reason.includes('private')
              ? '. This channel requires an invite link.'
              : ''),
        );
      }

      // Return placeholder
      return { title: `Telegram channel ${channelId}`, handle: null };
    }
  }
}

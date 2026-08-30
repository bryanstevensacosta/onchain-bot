import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { TelegramListenerPort } from '../../shared/ports/telegram-listener.port';
import {
  CRYPTO_NEWS_SEED,
  type SeedCryptoNewsChannel,
} from '../seeds/crypto-news.seed';

/**
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
    private readonly listener: TelegramListenerPort,
  ) {}

  public async seed(): Promise<{
    added: number;
    skipped: number;
    failed: number;
  }> {
    const enabled = this.config.get<boolean>(
      'INGESTION_TELEGRAM_NEWS_SEED_ENABLED',
      false,
    );
    if (!enabled) {
      this.logger.debug('News seed disabled; skipping registration.');
      return { added: 0, skipped: 0, failed: 0 };
    }

    // Parse env-supplied channels if present
    const envChannels = this.parseEnvChannels();
    const channels = envChannels.length > 0 ? envChannels : CRYPTO_NEWS_SEED;

    if (channels.length === 0) {
      this.logger.debug('News seed list is empty; nothing to register.');
      return { added: 0, skipped: 0, failed: 0 };
    }

    let added = 0;
    let skipped = 0;
    let failed = 0;

    for (const seed of channels) {
      try {
        // Validate channelId format
        if (!seed.channelId || !/^-?\d+$/.test(seed.channelId)) {
          failed += 1;
          this.logger.error(
            `Skipping invalid seed channelId: ${seed.channelId}`,
          );
          continue;
        }

        // Skip if already registered
        if (this.registeredChannels.has(seed.channelId)) {
          skipped += 1;
          continue;
        }

        const { title, handle } = await this.resolveTitleAndHandle(
          seed.channelId,
          seed.title,
          seed.handle,
        );

        // Mark as registered for this session
        this.registeredChannels.add(seed.channelId);
        added += 1;
        this.logger.debug(
          `Registered crypto-news channel ${seed.channelId} (${handle || 'no handle'}, "${title}")`,
        );
      } catch (err) {
        failed += 1;
        this.logger.error(
          `Skipping invalid crypto-news seed ${seed.channelId}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    const summary = `Telegram crypto-news seed complete: added=${added} skipped=${skipped} failed=${failed} total=${channels.length}`;
    this.logger.log(summary);
    if (this.needsManualJoin > 0) {
      this.logger.log(
        `${this.needsManualJoin} crypto-news channel(s) need manual join.`,
      );
    }

    return { added, skipped, failed };
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

import { Injectable, Logger } from '@nestjs/common';
import { TelegramListenerPort } from 'telegram/ingestion/shared/domain/ports/telegram-listener.port';

/**
 * Resolves the human-readable title and handle of a Telegram channel
 * for crypto-news registration when the caller did not supply a
 * seed override. Extracted from `CryptoNewsSeeder.resolveMetadata()`
 * so the same logic can back both the bootstrap seeder and inbound
 * HTTP controllers (e.g. an "Add Source" endpoint that only accepts a
 * channel id).
 *
 * Resolution priority (assuming the caller has already handled any
 * seed override):
 *   1. MTProto metadata via `TelegramListenerPort.resolveChannelMetadata`.
 *   2. Retry once after `joinChannel(channelId)` succeeds.
 *   3. Fallback: `{ title: 'Telegram channel <id>', handle: null }`.
 *
 * `needsManualJoin` is returned as a flag (rather than tracked
 * internally as state) so the caller can aggregate counts (e.g. for
 * log messages) without the resolver holding any side-channel state.
 */
@Injectable()
export class CryptoNewsMetadataResolver {
  private readonly logger = new Logger(CryptoNewsMetadataResolver.name);

  public constructor(private readonly listener: TelegramListenerPort) {}

  public async resolve(channelId: string): Promise<{
    title: string;
    handle: string | null;
    needsManualJoin: boolean;
  }> {
    try {
      const meta = await this.listener.resolveChannelMetadata(channelId);
      return {
        title: meta.title,
        handle: meta.handle,
        needsManualJoin: false,
      };
    } catch (err) {
      // Try to join and retry once.
      const joinResult = await this.listener
        .joinChannel(channelId)
        .catch(() => null);
      if (joinResult?.joined) {
        const meta = await this.listener.resolveChannelMetadata(channelId);
        return {
          title: meta.title,
          handle: meta.handle,
          needsManualJoin: false,
        };
      }
      const reason =
        joinResult?.error ?? (err instanceof Error ? err.message : 'Unknown');
      if (
        reason.includes('PeerUser') ||
        reason.includes('USER_NOT_PARTICIPANT')
      ) {
        return {
          title: `Telegram channel ${channelId}`,
          handle: null,
          needsManualJoin: true,
        };
      }
      this.logger.warn(
        `Could not resolve or join crypto-news channel ${channelId}: ${reason}`,
      );
      return {
        title: `Telegram channel ${channelId}`,
        handle: null,
        needsManualJoin: false,
      };
    }
  }
}

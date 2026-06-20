import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TelegramClient, Api } from 'telegram';
import { FloodWaitError } from 'telegram/errors';
import { TelegramPublisherPort } from 'discovery/publishing/telegram/domain/ports/telegram-publisher.port';
import { MtprotoSenderClient } from 'discovery/publishing/telegram/infrastructure/senders/mtproto-sender.client';

interface AppConfigShape {
  readonly telegram: {
    readonly mtprotoApiId: number;
    readonly mtprotoApiHash: string;
    readonly mtprotoSession: string;
  };
}

/**
 * Real Telegram MTProto sendMessage adapter.
 *
 * Uses the same MTProto session as the ingestion BC. Sends messages
 * via the TelegramClient's sendMessage API.
 *
 * Behavior:
 * - Returns `{ ok: true, messageId }` on success.
 * - Returns `{ ok: false, error }` on FloodWait (after retries).
 * - Returns `{ ok: false, error }` on transport error.
 *
 * Message splitting: Telegram limits single messages to 4096 chars;
 * if `text` exceeds that, it's split and sent as multiple messages.
 *
 * The `getClient()` hook is `protected` so tests can substitute a fake
 * TelegramClient without needing real MTProto credentials.
 */
@Injectable()
export class MtprotoPublishingAdapter extends TelegramPublisherPort {
  private readonly logger = new Logger(MtprotoPublishingAdapter.name);
  private static readonly MAX_LENGTH = 4096;
  private static readonly FLOOD_WAIT_MAX_RETRIES = 2;
  private static readonly FLOOD_WAIT_BASE_DELAY_MS = 5000;

  protected readonly senderClient: MtprotoSenderClient;

  public constructor(configService: ConfigService) {
    super();
    this.senderClient = new MtprotoSenderClient(configService);
    void this.validateConfig(configService);
  }

  /**
   * Hook for tests. Production callers never invoke this directly.
   */
  protected async getClient(): Promise<TelegramClient> {
    return this.senderClient.getClient();
  }

  /**
   * Hook for tests. Production callers never invoke this directly.
   */
  protected async resolvePeer(chatId: string): Promise<Api.TypeEntityLike> {
    return this.senderClient.resolvePeer(chatId);
  }

  private validateConfig(configService: ConfigService): void {
    const cfg = configService.get<AppConfigShape>('app');
    const telegram = cfg?.telegram;
    if (
      !telegram?.mtprotoSession ||
      !telegram?.mtprotoApiId ||
      !telegram?.mtprotoApiHash
    ) {
      this.logger.warn(
        'MTProto credentials missing — MtprotoPublishingAdapter.sendMessage will fail. ' +
          'Set TELEGRAM_MTPROTO_API_ID, TELEGRAM_MTPROTO_API_HASH, TELEGRAM_MTPROTO_SESSION env vars.',
      );
    }
  }

  public async sendMessage(
    chatId: string,
    text: string,
  ): Promise<{
    readonly ok: boolean;
    readonly messageId: number | null;
    readonly error: string | null;
  }> {
    try {
      if (text.length === 0) {
        return { ok: false, messageId: null, error: 'empty message' };
      }
      const chunks = this.splitMessage(text);
      const client = await this.getClient();
      const peer = await this.resolvePeer(chatId);

      let lastMessageId: number | null = null;
      for (const chunk of chunks) {
        const messageId = await this.sendWithRetry(client, peer, chunk);
        if (messageId === null) {
          return {
            ok: false,
            messageId: null,
            error: 'send failed (see logs)',
          };
        }
        lastMessageId = messageId;
      }
      return { ok: true, messageId: lastMessageId, error: null };
    } catch (err) {
      const message = (err as Error).message;
      this.logger.error(`sendMessage failed for ${chatId}: ${message}`);
      return { ok: false, messageId: null, error: message };
    }
  }

  private splitMessage(text: string): string[] {
    if (text.length <= MtprotoPublishingAdapter.MAX_LENGTH) return [text];
    const chunks: string[] = [];
    for (let i = 0; i < text.length; i += MtprotoPublishingAdapter.MAX_LENGTH) {
      chunks.push(text.slice(i, i + MtprotoPublishingAdapter.MAX_LENGTH));
    }
    return chunks;
  }

  private async sendWithRetry(
    client: TelegramClient,
    peer: Api.TypeEntityLike,
    text: string,
  ): Promise<number | null> {
    let attempt = 0;
    while (attempt <= MtprotoPublishingAdapter.FLOOD_WAIT_MAX_RETRIES) {
      try {
        const sent = await client.sendMessage(peer, { message: text });
        return sent.id;
      } catch (err) {
        if (err instanceof FloodWaitError) {
          const waitMs = (err as { seconds: number }).seconds * 1000;
          this.logger.warn(`FloodWait ${waitMs}ms on attempt ${attempt + 1}`);
          if (attempt >= MtprotoPublishingAdapter.FLOOD_WAIT_MAX_RETRIES) {
            return null;
          }
          await new Promise((r) =>
            setTimeout(
              r,
              waitMs + MtprotoPublishingAdapter.FLOOD_WAIT_BASE_DELAY_MS,
            ),
          );
          attempt++;
          continue;
        }
        throw err;
      }
    }
    return null;
  }
}

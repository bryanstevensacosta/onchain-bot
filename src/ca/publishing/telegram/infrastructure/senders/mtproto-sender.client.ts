import { ConfigService } from '@nestjs/config';
import { TelegramClient, Api } from 'telegram';
import { StringSession } from 'telegram/sessions';

/**
 * Lazily-initialized shared Telegram client used by the publishing BC
 * for sending messages.
 *
 * Created with the same credentials as the ingestion MTProto adapter
 * (TELEGRAM_MTPROTO_API_ID / API_HASH / SESSION).
 *
 * Send operations are inherently async with possible FloodWait errors;
 * the caller (MtprotoPublishingAdapter) handles retry logic.
 */
export class MtprotoSenderClient {
  private client: TelegramClient | null = null;

  public constructor(private readonly configService: ConfigService) {}

  public async getClient(): Promise<TelegramClient> {
    if (this.client) return this.client;
    const cfg = this.configService.get<{
      telegram: {
        mtprotoApiId: number;
        mtprotoApiHash: string;
        mtprotoSession: string;
      };
    }>('app');
    const session = cfg?.telegram?.mtprotoSession ?? '';
    const apiId = cfg?.telegram?.mtprotoApiId ?? 0;
    const apiHash = cfg?.telegram?.mtprotoApiHash ?? '';
    if (!session || !apiId || !apiHash) {
      throw new Error(
        'MTProto credentials missing — set TELEGRAM_MTPROTO_* env vars',
      );
    }
    const stringSession = new StringSession(session);
    this.client = new TelegramClient(stringSession, apiId, apiHash, {
      connectionRetries: 3,
    });
    await this.client.connect();
    return this.client;
  }

  public async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.disconnect();
      this.client = null;
    }
  }

  public async resolvePeer(channelId: string): Promise<Api.TypeEntityLike> {
    const client = await this.getClient();
    return await client.getEntity(channelId);
  }
}

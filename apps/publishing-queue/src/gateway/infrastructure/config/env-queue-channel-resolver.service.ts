import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QueueChannelResolverPort } from '@/gateway/application/ports/queue-channel-resolver.port';

/**
 * Env-only `QueueChannelResolverPort` (R-b1, thin impl — no DB, no
 * decision logic). Empty string resolves to null so callers fall
 * through to their own legacy env fallback.
 */
@Injectable()
export class EnvQueueChannelResolver extends QueueChannelResolverPort {
  public constructor(private readonly config: ConfigService) {
    super();
  }

  public async resolveChannel(contentType: string): Promise<string | null> {
    const key =
      contentType === 'threads'
        ? 'THREADS_OUTPUT_CHANNEL'
        : 'CRYPTO_NEWS_OUTPUT_CHANNEL';
    const raw = (this.config.get<string>(key, '') ?? '').trim();
    return raw.length > 0 ? raw : null;
  }
}

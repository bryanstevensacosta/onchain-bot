import { Injectable } from '@nestjs/common';
import type { ContentType } from 'shared/value-objects/content-type.vo';
import { CryptoNewsBotApiAdapter } from '../../infrastructure/bot-api/crypto-news-bot-api.adapter';
import { ThreadsBotApiAdapter } from '../../infrastructure/bot-api/threads-bot-api.adapter';
import type { TelegramPublisherPort } from '../../domain/ports/telegram-publisher.port';

/**
 * Routes outbound Telegram sends by `contentType` (queue path) or
 * scheduling target (ads path): `crypto-news`/`telegram` -> the
 * crypto bot, `threads` -> the threads bot.
 *
 * Unknown types throw (fail-closed): silently posting feed rows to
 * the wrong bot is worse than a loud error. This app routes feed
 * content types only (P10).
 */
@Injectable()
export class TelegramPublisherRouter {
  public constructor(
    private readonly crypto: CryptoNewsBotApiAdapter,
    private readonly threads: ThreadsBotApiAdapter,
  ) {}

  public forContentType(contentType: string): TelegramPublisherPort {
    if (contentType === 'crypto-news') {
      return this.crypto;
    }
    if (contentType === 'threads') {
      return this.threads;
    }
    throw new Error(
      `Unsupported content type for Telegram publish: ${contentType}`,
    );
  }

  public assertContentType(raw: string): asserts raw is ContentType {
    this.forContentType(raw);
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { TelegramPublisherPort } from 'ca/publishing/telegram/domain/ports/telegram-publisher.port';

/**
 * v1 mock publisher — logs the message instead of sending.
 *
 * Always succeeds unless `forceFailure` is true (configurable for tests).
 * Replace with TelegramMtprotoClientAdapter (real MTProto send) in v2.
 */
@Injectable()
export class MockTelegramPublisherAdapter extends TelegramPublisherPort {
  private readonly logger = new Logger(MockTelegramPublisherAdapter.name);
  private static readonly MAX_LENGTH = 4096;

  public async sendMessage(
    chatId: string,
    text: string,
  ): Promise<{
    readonly ok: boolean;
    readonly messageId: number | null;
    readonly error: string | null;
  }> {
    await Promise.resolve();

    if (text.length > MockTelegramPublisherAdapter.MAX_LENGTH) {
      return {
        ok: false,
        messageId: null,
        error: `Message exceeds ${MockTelegramPublisherAdapter.MAX_LENGTH} chars`,
      };
    }

    this.logger.log(`[MOCK SEND] → ${chatId}\n${text}`);
    return { ok: true, messageId: Date.now(), error: null };
  }
}

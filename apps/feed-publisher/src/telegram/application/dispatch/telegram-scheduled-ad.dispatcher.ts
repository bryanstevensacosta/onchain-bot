import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ScheduledAdDispatcherPort,
  type ScheduledAdDispatchResult,
} from '../../../scheduling/domain/ports/scheduled-ad-dispatcher.port';
import type { ScheduledAd } from '../../../scheduling/domain/scheduled-ad.entity';
import type { SchedulingTarget } from '../../../scheduling/domain/scheduling-target';
import type { TelegramInlineKeyboard } from '../../domain/ports/message-format.types';
import { TelegramPublisherRouter } from '../services/telegram-publisher-router.service';

/**
 * LIVE `ScheduledAdDispatcherPort` binding (Tramo 2, todo 7 — replaces
 * the in-memory recorder; the recorder remains as a test double only).
 *
 * Scheduling path: route by target (`telegram` -> crypto bot,
 * `threads` -> threads bot) -> send the ad body via `sendMessage`
 * with the ad buttons mapped to one inline-keyboard row each.
 *
 * Never throws: failures return `{ ok: false }` so
 * `PublishScheduledAdUseCase` books them (3 consecutive -> disable).
 * Missing channel/token errors carry `not configured` + the token env
 * name, which the use-case treats as not-configured: no failure
 * bookkeeping, the post stays enabled.
 *
 * Deliberate v1 limit: ad MEDIA (library `imageMediaId`/`videoMediaId`
 * /album) is not resolved here — those ids need the scheduling media
 * storage port, which lives behind `SchedulingModule` (importing it
 * would cycle the module graph). Text posts publish today; media
 * resolution is a follow-up once the storage port is shared.
 */
@Injectable()
export class TelegramScheduledAdDispatcher extends ScheduledAdDispatcherPort {
  public constructor(
    private readonly router: TelegramPublisherRouter,
    private readonly config: ConfigService,
  ) {
    super();
  }

  public async publish(
    ad: ScheduledAd,
    target: SchedulingTarget,
  ): Promise<ScheduledAdDispatchResult> {
    let adapter;
    try {
      adapter = this.router.forSchedulingTarget(target);
    } catch (err) {
      return {
        ok: false,
        messageId: null,
        error: (err as Error).message,
      };
    }
    const chatId = this.resolveChannel(target);
    if (!chatId) {
      const tokenName =
        target === 'threads' ? 'THREADS_BOT_TOKEN' : 'CRYPTO_NEWS_BOT_TOKEN';
      const channelName =
        target === 'threads'
          ? 'THREADS_OUTPUT_CHANNEL'
          : 'CRYPTO_NEWS_OUTPUT_CHANNEL';
      return {
        ok: false,
        messageId: null,
        error:
          `TelegramScheduledAdDispatcher: missing targetChannel/${channelName} ` +
          `for ${tokenName} (not configured)`,
      };
    }
    const buttons = ad.buttons ?? [];
    const replyMarkup: TelegramInlineKeyboard | undefined =
      buttons.length > 0
        ? buttons.map((button) => [{ text: button.text, url: button.url }])
        : undefined;
    const result = await adapter.sendMessage(
      chatId,
      ad.body,
      undefined,
      replyMarkup ? { replyMarkup } : undefined,
    );
    return { ok: result.ok, messageId: result.messageId, error: result.error };
  }

  private resolveChannel(target: SchedulingTarget): string {
    const envName =
      target === 'threads'
        ? 'THREADS_OUTPUT_CHANNEL'
        : 'CRYPTO_NEWS_OUTPUT_CHANNEL';
    return (this.config.get<string>(envName, '') ?? '').trim();
  }
}

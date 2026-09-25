import { Injectable, Logger } from '@nestjs/common';
import {
  TelegramPublisherPort,
  type SendMessageInput,
  type SendResult,
} from '../../domain/ports/telegram-publisher.port';

/**
 * Multi-bot Bot API publisher (first C-SHARED-01 move, Tramo 1 todo 11).
 *
 * MOVED from `apps/backend/src/telegram/vip-calls/shared/infrastructure/senders/bot-api-telegram-publisher.adapter.ts`
 * (read-only reference — backend untouched in this todo): same wire shape
 * (`sendMessage`/`sendPhoto`, Markdown, 4096-char chunks, 1024-char
 * captions, 1 msg/min throttle) with ONE divergence — the bot token arrives
 * PER CALL from the DB catalog (`SendMessageInput.botToken`, P23) instead
 * of being bound from env at construction. Throttling is tracked per token
 * so N template bots send independently. Uses global `fetch` (no axios in
 * this app — same as `HttpTelegramAdminVerifierAdapter`).
 */
@Injectable()
export class MultiBotPublisherAdapter extends TelegramPublisherPort {
  private readonly logger = new Logger(MultiBotPublisherAdapter.name);
  private static readonly MAX_LENGTH = 4096;
  private static readonly CAPTION_MAX_LENGTH = 1024;
  private static readonly API_BASE = 'https://api.telegram.org/bot';
  private static readonly RATE_LIMIT_MS = 60_000;
  private static readonly TIMEOUT_MS = 10_000;

  private readonly lastSentAt = new Map<string, number>();

  public async sendMessage(input: SendMessageInput): Promise<SendResult> {
    if (!input.text || input.text.length === 0) {
      return { ok: false, messageId: null, error: 'empty message' };
    }
    if (!input.botToken?.trim()) {
      return {
        ok: false,
        messageId: null,
        error: 'missing bot token (dashboard-only, no post attempted)',
      };
    }
    await this.throttle(input.botToken);
    try {
      if (input.imageUrl) {
        return await this.sendWithPhoto(
          input.botToken,
          input.chatId,
          input.text,
          input.imageUrl,
        );
      }
      const chunks = this.splitMessage(input.text);
      let lastMessageId: number | null = null;
      for (const chunk of chunks) {
        const result = await this.sendChunk(
          input.botToken,
          input.chatId,
          chunk,
        );
        if (!result.ok) return result;
        lastMessageId = result.messageId;
      }
      return { ok: true, messageId: lastMessageId, error: null };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error';
      this.logger.error(`sendMessage failed for ${input.chatId}: ${message}`);
      return { ok: false, messageId: null, error: message };
    }
  }

  private async throttle(botToken: string): Promise<void> {
    const last = this.lastSentAt.get(botToken) ?? 0;
    const elapsed = Date.now() - last;
    if (elapsed < MultiBotPublisherAdapter.RATE_LIMIT_MS) {
      await new Promise((resolve) =>
        setTimeout(resolve, MultiBotPublisherAdapter.RATE_LIMIT_MS - elapsed),
      );
    }
    this.lastSentAt.set(botToken, Date.now());
  }

  private async sendWithPhoto(
    botToken: string,
    chatId: string,
    text: string,
    imageUrl: string,
  ): Promise<SendResult> {
    const caption =
      text.length <= MultiBotPublisherAdapter.CAPTION_MAX_LENGTH
        ? text
        : text.slice(0, MultiBotPublisherAdapter.CAPTION_MAX_LENGTH - 1) + '…';
    const photoResult = await this.sendPhotoChunk(
      botToken,
      chatId,
      imageUrl,
      caption,
    );
    if (!photoResult.ok) return photoResult;
    let lastMessageId = photoResult.messageId;
    if (text.length > MultiBotPublisherAdapter.CAPTION_MAX_LENGTH) {
      const remaining = text.slice(
        MultiBotPublisherAdapter.CAPTION_MAX_LENGTH - 1,
      );
      for (const chunk of this.splitMessage(remaining)) {
        const result = await this.sendChunk(botToken, chatId, chunk);
        if (!result.ok) return result;
        lastMessageId = result.messageId;
      }
    }
    return { ok: true, messageId: lastMessageId, error: null };
  }

  private splitMessage(text: string): string[] {
    if (text.length <= MultiBotPublisherAdapter.MAX_LENGTH) return [text];
    const chunks: string[] = [];
    for (let i = 0; i < text.length; i += MultiBotPublisherAdapter.MAX_LENGTH) {
      chunks.push(text.slice(i, i + MultiBotPublisherAdapter.MAX_LENGTH));
    }
    return chunks;
  }

  private async sendChunk(
    botToken: string,
    chatId: string,
    text: string,
  ): Promise<SendResult> {
    const json = await this.api(botToken, 'sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: 'Markdown',
      disable_web_page_preview: false,
    });
    if (json && json.ok === true) {
      const result = json.result as { message_id?: number } | undefined;
      return { ok: true, messageId: result?.message_id ?? null, error: null };
    }
    const description =
      (json?.description as string | undefined) ?? 'unknown error';
    this.logger.error(`Telegram API error: ${description}`);
    return { ok: false, messageId: null, error: description };
  }

  private async sendPhotoChunk(
    botToken: string,
    chatId: string,
    imageUrl: string,
    caption: string,
  ): Promise<SendResult> {
    const json = await this.api(botToken, 'sendPhoto', {
      chat_id: chatId,
      photo: imageUrl,
      caption,
      parse_mode: 'Markdown',
    });
    if (json && json.ok === true) {
      const result = json.result as { message_id?: number } | undefined;
      return { ok: true, messageId: result?.message_id ?? null, error: null };
    }
    const description =
      (json?.description as string | undefined) ?? 'unknown error';
    this.logger.error(`Telegram sendPhoto API error: ${description}`);
    return { ok: false, messageId: null, error: description };
  }

  private async api(
    botToken: string,
    method: string,
    body: Record<string, unknown>,
  ): Promise<{ ok?: boolean; result?: unknown; description?: string } | null> {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      MultiBotPublisherAdapter.TIMEOUT_MS,
    );
    try {
      const res = await fetch(
        `${MultiBotPublisherAdapter.API_BASE}${botToken}/${method}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal,
        },
      );
      if (!res.ok) return null;
      return (await res.json()) as {
        ok?: boolean;
        result?: unknown;
        description?: string;
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

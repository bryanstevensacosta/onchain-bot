import type { TelegramInlineKeyboard } from './message-format.types';

/**
 * Result of one Bot API send call.
 *
 * Mirrors the backend `SendResult` (read-only move, Tramo 2 todo 7):
 * callers treat every send method uniformly. `messageId` is the
 * Telegram `message_id` of the PRIMARY post (continuation chunks
 * thread under it as replies).
 */
export interface TelegramSendResult {
  readonly ok: boolean;
  readonly messageId: number | null;
  readonly error: string | null;
}

/**
 * Optional per-call publishing knobs (same shape as the backend port).
 */
export interface TelegramPublishOptions {
  readonly parseMode?: 'Markdown' | 'HTML';
  readonly supportsStreaming?: boolean;
  readonly replyMarkup?: TelegramInlineKeyboard;
}

/**
 * Outbound port: send a Telegram message — text, photo, video, or album.
 *
 * Implemented by the crypto + threads Bot API adapters (C2, second
 * C-SHARED-01 move). P10: only feed content types route here — the
 * sibling extraction service owns its own publisher.
 */
export abstract class TelegramPublisherPort {
  public abstract sendMessage(
    chatId: string,
    text: string,
    imageUrl?: string,
    options?: TelegramPublishOptions,
  ): Promise<TelegramSendResult>;

  public abstract sendPhoto(
    chatId: string,
    text: string,
    imagePath: string,
    options?: TelegramPublishOptions,
  ): Promise<TelegramSendResult>;

  public abstract sendMediaGroup(
    chatId: string,
    text: string,
    imagePaths: string[],
    options?: TelegramPublishOptions,
  ): Promise<TelegramSendResult>;

  public abstract sendVideo(
    chatId: string,
    text: string,
    videoPath: string,
    options?: TelegramPublishOptions,
  ): Promise<TelegramSendResult>;

  public abstract getChat(
    chatId: string,
  ): Promise<{ ok: boolean; error?: string }>;
}

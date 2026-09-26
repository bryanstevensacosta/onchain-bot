export interface SendMessageInput {
  /** Plaintext bot token — resolved per call from the DB catalog (P23). */
  readonly botToken: string;
  readonly chatId: string;
  readonly text: string;
  readonly imageUrl?: string;
}

export interface SendResult {
  readonly ok: boolean;
  readonly messageId: number | null;
  readonly error: string | null;
}

/**
 * Multi-bot Bot API sender (first C-SHARED-01 move, Tramo 1 todo 11).
 *
 * MOVED from `apps/backend/src/telegram/shared/domain/ports/telegram-publisher.port.ts`
 * + `apps/backend/src/telegram/vip-calls/shared/infrastructure/senders/bot-api-telegram-publisher.adapter.ts`
 * (read-only reference — backend untouched in this todo): the backend
 * adapter binds ONE env token (`VIP_CALLS_BOT_TOKEN`) at construction;
 * this port takes the token PER CALL so one adapter serves every template
 * bot from the `telegram_bots` catalog. There is NO env token here (P23).
 */
export abstract class TelegramPublisherPort {
  public abstract sendMessage(input: SendMessageInput): Promise<SendResult>;
}

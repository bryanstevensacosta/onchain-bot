/**
 * Minimal inline-keyboard shape for Bot API `reply_markup`.
 *
 * Same wire shape as the backend `TelegramInlineKeyboard`: rows of
 * `{ text, url }` buttons rendered as
 * `{ inline_keyboard: rows }`.
 */
export interface TelegramInlineKeyboardButton {
  readonly text: string;
  readonly url: string;
}

export type TelegramInlineKeyboardRow =
  ReadonlyArray<TelegramInlineKeyboardButton>;

export type TelegramInlineKeyboard = ReadonlyArray<TelegramInlineKeyboardRow>;

export interface ApprovedCallInput {
  readonly chain: string;
  readonly address: string;
  readonly ticker: string | null;
  readonly name: string | null;
  readonly score: number;
  readonly classification: string;
  readonly marketCapUsd: number | null;
  readonly liquidityUsd: number | null;
  readonly holders: number | null;
  readonly sourceCount: number;
  readonly mentionCount: number;
  readonly chart: string | null;
  readonly imageUrls: ReadonlyArray<string>;
}

export interface TelegramInlineKeyboardButton {
  readonly text: string;
  readonly url: string;
}

export type TelegramInlineKeyboardRow = ReadonlyArray<TelegramInlineKeyboardButton>;

export type TelegramInlineKeyboard = ReadonlyArray<TelegramInlineKeyboardRow>;

export abstract class MessageFormatterPort {
  public abstract format(input: ApprovedCallInput): string;
  public abstract formatKeyboard(input: ApprovedCallInput): TelegramInlineKeyboard | null;
}

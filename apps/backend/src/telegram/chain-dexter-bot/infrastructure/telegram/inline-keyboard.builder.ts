import { Injectable } from '@nestjs/common';
import { TradeButton, TradeButtonRegistry } from './trade-button-registry';

export interface InlineKeyboardButton {
  text: string;
  url?: string;
  callback_data?: string;
}

export interface InlineKeyboardMarkup {
  inline_keyboard: InlineKeyboardButton[][];
}

const REFRESH_CALLBACK_PREFIX = 'refresh:';
const TB_TOGGLE_CALLBACK_PREFIX = 'tb:toggle:';

@Injectable()
export class InlineKeyboardBuilder {
  private static readonly MAX_ROWS = 8;

  public constructor(private readonly registry: TradeButtonRegistry) {}

  public buildScanKeyboard(
    scanId: string,
    tradeButtons: ReadonlyArray<TradeButton>,
    maxPerRow = 3,
  ): InlineKeyboardMarkup {
    if (tradeButtons.length === 0) {
      return { inline_keyboard: [this.buildRefreshButton(scanId)] };
    }

    const rows: InlineKeyboardButton[][] = [];
    const clamped = Math.max(1, Math.min(maxPerRow, 4));

    for (
      let i = 0;
      i < tradeButtons.length &&
      rows.length < InlineKeyboardBuilder.MAX_ROWS - 1;
      i += clamped
    ) {
      const slice = tradeButtons.slice(i, i + clamped);
      rows.push(slice.map((b) => ({ text: b.label, url: '#' })));
    }

    rows.push(this.buildRefreshButton(scanId));
    return { inline_keyboard: rows };
  }

  public buildRefreshButton(scanId: string): InlineKeyboardButton[] {
    return [
      {
        text: '🔄 Refresh',
        callback_data: `${REFRESH_CALLBACK_PREFIX}${scanId}`,
      },
    ];
  }

  public buildTradeButtonsConfigKeyboard(
    enabledCodes: ReadonlyArray<string>,
  ): InlineKeyboardMarkup {
    const allCodes = this.registry.getAllCodes();
    const enabled = new Set(enabledCodes);
    const rows: InlineKeyboardButton[][] = [];

    for (const code of allCodes) {
      if (rows.length >= InlineKeyboardBuilder.MAX_ROWS) break;
      const isOn = enabled.has(code);
      const label = `${isOn ? '✅' : '⬜'} ${code}`;
      rows.push([
        { text: label, callback_data: `${TB_TOGGLE_CALLBACK_PREFIX}${code}` },
      ]);
    }

    return { inline_keyboard: rows };
  }

  public buildUsageKeyboard(): InlineKeyboardMarkup {
    return {
      inline_keyboard: [
        [{ text: '📚 Docs', url: 'https://github.com/your-org/onchain-bot' }],
      ],
    };
  }
}

import { Injectable } from '@nestjs/common';
import type { CommandContext, CommandHandler } from '../command-handler';
import { TelegramBotClient } from '../../../infrastructure/telegram/bot-client';
import { TokenScanPipeline } from '../token-scan.pipeline';

const VALID_TIMEFRAMES = new Set(['1m', '5m', '15m', '1h', '4h', '1d', '1w']);

@Injectable()
export class CTokenChartHandler implements CommandHandler {
  public readonly name = 'c';

  public constructor(
    private readonly pipeline: TokenScanPipeline,
    private readonly bot: TelegramBotClient,
  ) {}

  public async handle(args: string[], context: CommandContext): Promise<void> {
    const arg = args[0]?.trim();
    if (!arg) {
      await this.bot.sendMessage(context.chatId, 'Uso: /c <token> [timeframe]');
      return;
    }

    const tf = args[1]?.trim() ?? '5m';
    if (!VALID_TIMEFRAMES.has(tf)) {
      await this.bot.sendMessage(
        context.chatId,
        `⚠️ Timeframe inválido: ${tf}\n\nUsa uno de: 1m, 5m, 15m, 1h, 4h, 1d, 1w`,
      );
      return;
    }

    const token = await this.pipeline.resolve(arg);
    if (!token) {
      await this.bot.sendMessage(
        context.chatId,
        `❌ No se pudo resolver: ${arg}`,
      );
      return;
    }

    let chartUrl: string;
    if (token.poolAddress) {
      chartUrl = `https://www.geckoterminal.com/${token.chain}/pools/${token.poolAddress}?tf=${tf}`;
    } else {
      chartUrl = `https://dexscreener.com/${token.chain}/${token.address}`;
    }

    const text = `💊 *${token.symbol}* | ${token.name}\n\n📈 Chart (${tf}): ${chartUrl}`;
    await this.bot.sendMessage(context.chatId, text, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[{ text: '📈 Open Chart', url: chartUrl }]],
      },
    });
  }
}

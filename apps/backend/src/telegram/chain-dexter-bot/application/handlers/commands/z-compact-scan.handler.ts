import { Injectable } from '@nestjs/common';
import type { CommandContext, CommandHandler } from '../command-handler';
import { MessageFormatterAdapter } from '../../../infrastructure/telegram/message-formatter.adapter';
import { TelegramBotClient } from '../../../infrastructure/telegram/bot-client';
import { TokenScanPipeline } from '../token-scan.pipeline';
import { ResolvedToken } from '../resolved-token';

function toFormatterInput(token: ResolvedToken) {
  return {
    symbol: token.symbol,
    name: token.name,
    chain: token.chain,
    address: token.address,
    priceUsd: token.priceUsd,
    priceChange24h: token.priceChange24h,
    marketCapUsd: token.marketCapUsd,
    fdvUsd: token.fdvUsd,
    liquidityUsd: token.liquidityUsd,
    liquidityLockedPercent: token.lockedLiquidityPercent,
    liquidityBurnedPercent: token.burnedPercent,
    volume24hUsd: token.volume24hUsd,
    athUsd: null,
    athPercentChange: null,
    athDaysAgo: null,
    holders: token.holders,
    top10HolderPercent: token.top10HolderPercent,
    top20HolderPercent: token.top20HolderPercent,
  };
}

@Injectable()
export class ZCompactScanHandler implements CommandHandler {
  public readonly name = 'z';

  public constructor(
    private readonly pipeline: TokenScanPipeline,
    private readonly formatter: MessageFormatterAdapter,
    private readonly bot: TelegramBotClient,
  ) {}

  public async handle(args: string[], context: CommandContext): Promise<void> {
    const arg = args[0]?.trim();
    if (!arg) {
      await this.bot.sendMessage(context.chatId, 'Uso: /z <token-o-CA>');
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

    const formatted = this.formatter.formatTokenScan(toFormatterInput(token), {
      compact: true,
    });
    await this.bot.sendMessage(context.chatId, formatted.text, {
      parse_mode: 'Markdown',
    });
  }
}

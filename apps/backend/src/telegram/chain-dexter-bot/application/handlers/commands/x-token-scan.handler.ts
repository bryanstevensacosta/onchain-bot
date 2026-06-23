import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { CommandContext, CommandHandler } from '../command-handler';
import { InlineKeyboardBuilder } from '../../../infrastructure/telegram/inline-keyboard.builder';
import { MessageFormatterAdapter } from '../../../infrastructure/telegram/message-formatter.adapter';
import { TelegramBotClient } from '../../../infrastructure/telegram/bot-client';
import { TradeButtonRegistry } from '../../../infrastructure/telegram/trade-button-registry';
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
export class XTokenScanHandler implements CommandHandler {
  public readonly name = 'x';

  public constructor(
    private readonly pipeline: TokenScanPipeline,
    private readonly formatter: MessageFormatterAdapter,
    private readonly registry: TradeButtonRegistry,
    private readonly keyboards: InlineKeyboardBuilder,
    private readonly bot: TelegramBotClient,
  ) {}

  public async handle(args: string[], context: CommandContext): Promise<void> {
    const arg = args[0]?.trim();
    if (!arg) {
      await this.bot.sendMessage(context.chatId, 'Uso: /x <token-o-CA>');
      return;
    }

    const token = await this.pipeline.resolve(arg);
    if (!token) {
      await this.bot.sendMessage(
        context.chatId,
        `❌ No se pudo resolver el token: \`${arg}\`\n\nVerifica que sea un CA válido (Solana, EVM, etc.) o intenta con /help.`,
        { parse_mode: 'Markdown' },
      );
      return;
    }

    const formatted = this.formatter.formatTokenScan(toFormatterInput(token), {
      compact: false,
    });
    const enabledCodes = context.settings.enabledTradeButtons ?? [
      'DEX',
      'PHO',
      'TRO',
    ];
    const limit = context.settings.tradeButtonsLimit ?? 3;
    const buttons = this.registry.getButtonsForChain(
      token.chain,
      enabledCodes as Parameters<TradeButtonRegistry['getButtonsForChain']>[1],
    );
    const scanId = randomUUID();
    const markup = this.keyboards.buildScanKeyboard(scanId, buttons, limit);

    await this.bot.sendMessage(context.chatId, formatted.text, {
      parse_mode: 'Markdown',
      reply_markup: markup,
    });
  }
}

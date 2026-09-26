import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type {
  CommandContext,
  CommandHandler,
} from '../../domain/ports/command-handler.port';
import { InlineKeyboardBuilder } from '../../../telegram/infrastructure/keyboard/inline-keyboard.builder';
import { MessageFormatterAdapter } from '../../../scan/infrastructure/formatter/message-formatter';
import { TelegramBotClient } from '../../../telegram/infrastructure/telegram/bot-client';
import { TradeButtonRegistry } from '../../../telegram/infrastructure/keyboard/trade-button-registry';
import { TokenScanPipeline } from '../../../scan/application/pipeline/token-scan.pipeline';
import type {
  ResolvedToken,
  ScanPipeline,
} from '../../../scan/domain/ports/scan-pipeline.port';

function toFormatterInput(token: ResolvedToken) {
  return {
    ...token,
    liquidityLockedPercent: token.lockedLiquidityPercent,
    liquidityBurnedPercent: token.burnedPercent,
    athUsd: null,
    athPercentChange: null,
    athDaysAgo: null,
  };
}

/**
 * Shared full-scan sender: resolves via market-data HTTP and answers
 * the lookup with the formatted card + trade buttons. Used by /ca and /x.
 * Market-data down → explicit message, never a silent partial card.
 */
export async function sendFullScan(
  args: string[],
  context: CommandContext,
  command: string,
  pipeline: ScanPipeline,
  formatter: MessageFormatterAdapter,
  registry: TradeButtonRegistry,
  keyboards: InlineKeyboardBuilder,
  bot: TelegramBotClient,
): Promise<void> {
  const arg = args[0]?.trim();
  if (!arg) {
    await bot.sendMessage(context.chatId, `Uso: /${command} <contrato>`);
    return;
  }

  const token = await pipeline.resolve(arg);
  if (!token) {
    await bot.sendMessage(
      context.chatId,
      `❌ No se pudo resolver el token: \`${arg}\`\n\nVerifica que sea un contrato válido (Solana, EVM, etc.) o que market-data esté disponible.`,
      { parse_mode: 'Markdown' },
    );
    return;
  }

  const formatted = formatter.formatTokenScan(toFormatterInput(token), {
    compact: false,
  });
  const enabledCodes = context.settings.enabledTradeButtons ?? [
    'DEX',
    'PHO',
    'TRO',
  ];
  const limit = context.settings.tradeButtonsLimit ?? 3;
  const buttons = registry.getButtonsForChain(
    token.chain,
    enabledCodes as Parameters<TradeButtonRegistry['getButtonsForChain']>[1],
  );
  const scanId = randomUUID();
  const markup = keyboards.buildScanKeyboard(scanId, buttons, limit);

  await bot.sendMessage(context.chatId, formatted.text, {
    parse_mode: 'Markdown',
    reply_markup: markup,
  });
}

/**
 * /ca — NEW in dexter-onchain-bot (Tramo 3, todo 9, P13).
 * Full token card for an explicit contract argument.
 */
@Injectable()
export class CaScanHandler implements CommandHandler {
  public readonly name = 'ca';

  public constructor(
    private readonly pipeline: TokenScanPipeline,
    private readonly formatter: MessageFormatterAdapter,
    private readonly registry: TradeButtonRegistry,
    private readonly keyboards: InlineKeyboardBuilder,
    private readonly bot: TelegramBotClient,
  ) {}

  public async handle(args: string[], context: CommandContext): Promise<void> {
    await sendFullScan(
      args,
      context,
      'ca',
      this.pipeline,
      this.formatter,
      this.registry,
      this.keyboards,
      this.bot,
    );
  }
}

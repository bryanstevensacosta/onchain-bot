import { Injectable } from '@nestjs/common';
import type {
  CommandContext,
  CommandHandler,
} from '@/commands/domain/ports/command-handler.port';
import { InlineKeyboardBuilder } from '@/telegram/infrastructure/keyboard/inline-keyboard.builder';
import { MessageFormatterAdapter } from '@/scan/infrastructure/formatter/message-formatter';
import { TelegramBotClient } from '@/telegram/infrastructure/telegram/bot-client';
import { TradeButtonRegistry } from '@/telegram/infrastructure/keyboard/trade-button-registry';
import { TokenScanPipeline } from '@/scan/application/pipeline/token-scan.pipeline';
import type { ScanPipeline } from '@/scan/domain/ports/scan-pipeline.port';

/**
 * Shared full-scan sender: resolves via market-data HTTP ONLY and
 * answers the lookup with the dexter own scan-card template
 * (MarkdownV2) sent EXCLUSIVELY via the gateway-bound bot.
 * Market-data down → explicit message, never a silent partial card.
 * Trade buttons travel as inline links inside the card (the gateway
 * send shape carries no reply_markup — keyboards stay direct-only
 * and are intentionally not sent here).
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
  void registry;
  void keyboards;
  const arg = args[0]?.trim();
  if (!arg) {
    await bot.sendMessage(context.chatId, `Uso: /${command} <contrato>`);
    return;
  }

  const token = await pipeline.resolve(arg);
  if (!token) {
    await bot.sendMessage(
      context.chatId,
      `❌ No se pudo resolver el token: ${formatter.escapeMarkdownV2(arg)}\n\nVerifica que sea un contrato válido \\(Solana, EVM, etc\\.\\) o que market\\-data esté disponible\\.`,
      { parse_mode: 'MarkdownV2' },
    );
    return;
  }

  const card = formatter.formatScanCard(token);
  await bot.sendMessage(context.chatId, card.text, {
    parse_mode: card.parseMode,
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

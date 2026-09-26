import { Injectable } from '@nestjs/common';
import type { CommandContext } from './command-handler';
import { InlineKeyboardBuilder } from './inline-keyboard.builder';
import { MessageFormatterAdapter } from './message-formatter';
import { TelegramBotClient } from './bot-client';
import { TradeButtonRegistry } from './trade-button-registry';
import { TokenScanPipeline } from './token-scan.pipeline';
import { extractForwardCandidates } from './forward-extractor';
import { sendFullScan } from './commands/ca.handler';

/**
 * Bare-address + forward fallback (Tramo 3, todo 9, P13 — NEW).
 *
 * Handles every non-slash message: extracts forward/casual-text
 * candidates (wallet/token/exchange via forward-extractor, kind resolved
 * later via market-data — never guessed here) and scans the first
 * contract found. Text without contracts gets a helpful reply, never a
 * silent drop. Lookup-only: scans answer the sender, never a channel.
 */
@Injectable()
export class BareAddressHandler {
  public constructor(
    private readonly pipeline: TokenScanPipeline,
    private readonly formatter: MessageFormatterAdapter,
    private readonly registry: TradeButtonRegistry,
    private readonly keyboards: InlineKeyboardBuilder,
    private readonly bot: TelegramBotClient,
  ) {}

  public async handleText(
    text: string,
    context: CommandContext,
  ): Promise<void> {
    const candidates = extractForwardCandidates(text);
    if (candidates.addresses.length === 0) {
      await this.bot.sendMessage(
        context.chatId,
        '🔍 No veo ningún contrato en ese mensaje.\n\nPega un contrato (Solana o EVM) o usa /ca <contrato>.',
      );
      return;
    }
    const first = candidates.addresses[0];
    await sendFullScan(
      [first],
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

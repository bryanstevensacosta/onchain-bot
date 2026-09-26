import { Injectable } from '@nestjs/common';
import type { CommandContext } from '../../domain/ports/command-handler.port';
import { InlineKeyboardBuilder } from '../../../telegram/infrastructure/keyboard/inline-keyboard.builder';
import { MessageFormatterAdapter } from '../../../scan/infrastructure/formatter/message-formatter';
import { TelegramBotClient } from '../../../telegram/infrastructure/telegram/bot-client';
import { TradeButtonRegistry } from '../../../telegram/infrastructure/keyboard/trade-button-registry';
import { TokenScanPipeline } from '../../../scan/application/pipeline/token-scan.pipeline';
import { extractForwardCandidates } from '../../../scan/domain/extractor/forward-extractor';
import { sendFullScan } from './ca.handler';

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

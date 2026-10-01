import { Inject, Injectable, Optional } from '@nestjs/common';
import type { CommandContext } from '@/commands/domain/ports/command-handler.port';
import { InlineKeyboardBuilder } from '@/gateway/infrastructure/keyboard/inline-keyboard.builder';
import { MessageFormatterAdapter } from '@/scan/infrastructure/formatter/message-formatter';
import { TelegramBotClient } from '@/gateway/infrastructure/telegram/bot-client';
import { TradeButtonRegistry } from '@/gateway/infrastructure/keyboard/trade-button-registry';
import { TokenScanPipeline } from '@/scan/application/pipeline/token-scan.pipeline';
import { extractForwardCandidates } from '@/scan/domain/extractor/forward-extractor';
import { sendFullScan } from './ca.handler';
import {
  MESSAGE_TEMPLATE_REPOSITORY,
  type MessageTemplateRepository,
} from '@/templates/domain/ports/message-template.repository';
import { TemplateRendererService } from '@/placeholders/application/template-renderer.service';

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
    @Inject(MESSAGE_TEMPLATE_REPOSITORY)
    @Optional()
    private readonly templates?: MessageTemplateRepository | null,
    @Inject(TemplateRendererService)
    @Optional()
    private readonly renderer?: TemplateRendererService | null,
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
      this.templates ?? null,
      this.renderer ?? null,
      ['bare', 'ca'],
    );
  }
}

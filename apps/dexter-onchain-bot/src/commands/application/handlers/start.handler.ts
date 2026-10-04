import { Inject, Injectable, Optional } from '@nestjs/common';
import type {
  CommandHandler,
  CommandContext,
} from '@/commands/domain/ports/command-handler.port';
import { InlineKeyboardBuilder } from '@/gateway/infrastructure/keyboard/inline-keyboard.builder';
import { MessageFormatterAdapter } from '@/scan/infrastructure/formatter/message-formatter';
import { TelegramBotClient } from '@/gateway/infrastructure/telegram/bot-client';
import { TradeButtonRegistry } from '@/gateway/infrastructure/keyboard/trade-button-registry';
import { TokenScanPipeline } from '@/scan/application/pipeline/token-scan.pipeline';
import { extractAddresses } from '@/scan/domain/detector/address-detector';
import { sendFullScan } from './ca.handler';
import {
  MESSAGE_TEMPLATE_REPOSITORY,
  type MessageTemplateRepository,
} from '@/templates/domain/ports/message-template.repository';
import { TemplateRendererService } from '@/placeholders/application/template-renderer.service';

const LEGACY_START_TEXT = `👋 Dexter lookup bot — on-chain token info, nothing else\\.
Soy solo lookup: respondo fichas, nunca publico en canales\\.

Uso:
• /ca \\<contrato\\> — ficha completa (precio, MC, liquidez, holders) \\+ botones
• /x \\<contrato\\> — escaneo completo
• /z \\<contrato\\> — escaneo compacto
• /c \\<contrato\\> \\[tf\\] — enlace al chart
• Pega un contrato sin slash y lo escaneo directo
• Reenvíame cualquier mensaje con un contrato y extraigo el primero
• /tb y /settings — botones de trading y config del chat

Datos vía market-data HTTP\\. Si está caído te lo digo — sin fichas parciales\\.`;

/**
 * /start — REWRITTEN for dexter-onchain-bot (Tramo 3, todo 9, P13).
 *
 * Lookup-only info + usage: what the bot answers, the commands, and the
 * bare-address / forward shortcuts. Never promises channel publishing,
 * scoring, or tracking (those live in kol-system / feed-publisher).
 *
 * Todo 11 deep-link: `/start <payload>` (from
 * `https://t.me/<bot>?start=<address>`) runs the payload through the
 * shared `address-detector`; an address found resolves via the SAME
 * `sendFullScan` as `/ca` (full card via the ACTIVE `ca` template —
 * `start` is not a template command, so the lookup is `['ca']`;
 * no scan code is duplicated here). No/invalid payload answers the
 * legacy text byte-identical.
 */
@Injectable()
export class StartCommandHandler implements CommandHandler {
  public readonly name = 'start';

  public constructor(
    private readonly bot: TelegramBotClient,
    private readonly pipeline: TokenScanPipeline,
    private readonly formatter: MessageFormatterAdapter,
    private readonly registry: TradeButtonRegistry,
    private readonly keyboards: InlineKeyboardBuilder,
    @Inject(MESSAGE_TEMPLATE_REPOSITORY)
    @Optional()
    private readonly templates?: MessageTemplateRepository | null,
    @Inject(TemplateRendererService)
    @Optional()
    private readonly renderer?: TemplateRendererService | null,
  ) {}

  public async handle(args: string[], context: CommandContext): Promise<void> {
    const payload = args.join(' ').trim();
    const found = payload ? extractAddresses(payload)[0] : undefined;
    if (found) {
      await sendFullScan(
        [found],
        context,
        'ca',
        this.pipeline,
        this.formatter,
        this.registry,
        this.keyboards,
        this.bot,
        this.templates ?? null,
        this.renderer ?? null,
        ['ca'],
      );
      return;
    }
    await this.bot.sendMessage(context.chatId, LEGACY_START_TEXT, {
      parse_mode: 'MarkdownV2',
    });
  }
}

@Injectable()
export class HelpCommandHandler implements CommandHandler {
  public readonly name = 'help';

  public constructor(private readonly bot: TelegramBotClient) {}

  public async handle(_args: string[], context: CommandContext): Promise<void> {
    await this.bot.sendMessage(
      context.chatId,
      `📚 Dexter lookup — solo consultas, sin publicaciones\\.

• /ca \\<contrato\\> — ficha completa
• /x \\<contrato\\> — escaneo completo
• /z \\<contrato\\> — escaneo compacto
• /c \\<contrato\\> \\[tf\\] — chart link
• /tb — botones de trading • /settings — config del chat
• O pega un contrato pelado (sin slash) o reenvía un mensaje con uno\\.`,
      { parse_mode: 'MarkdownV2' },
    );
  }
}

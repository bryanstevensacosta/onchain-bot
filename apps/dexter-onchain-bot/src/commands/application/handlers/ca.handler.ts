import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type {
  CommandContext,
  CommandHandler,
} from '@/commands/domain/ports/command-handler.port';
import { InlineKeyboardBuilder } from '@/gateway/infrastructure/keyboard/inline-keyboard.builder';
import { MessageFormatterAdapter } from '@/scan/infrastructure/formatter/message-formatter';
import { TelegramBotClient } from '@/gateway/infrastructure/telegram/bot-client';
import { TradeButtonRegistry } from '@/gateway/infrastructure/keyboard/trade-button-registry';
import { TokenScanPipeline } from '@/scan/application/pipeline/token-scan.pipeline';
import type { ScanPipeline } from '@/scan/domain/ports/scan-pipeline.port';
import {
  MESSAGE_TEMPLATE_REPOSITORY,
  type MessageTemplateRepository,
} from '@/templates/domain/ports/message-template.repository';
import {
  TemplateRendererService,
  type TemplateValues,
} from '@/placeholders/application/template-renderer.service';
import type { TemplateCommand } from '@/placeholders/domain/placeholder-registry';

const sendFullScanLogger = new Logger('sendFullScan');

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
  templates?: MessageTemplateRepository | null,
  renderer?: TemplateRendererService | null,
  templateCommands?: readonly TemplateCommand[],
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

  // todo 10 (dexter-message-templates): active-template render with
  // built-in fallback. The lookup chain defaults to the handler's own
  // command (ca/x never cross-render); bare passes ['bare', 'ca'].
  // The renderer is wired resolver-less until todo 13 binds
  // DISPLAY_RESOLVER, so {{chainDisplay}} renders "" meanwhile
  // (accepted interim — handlers render with whatever the wired
  // renderer resolves). No timeframe for these commands.
  const lookup: readonly TemplateCommand[] = templateCommands ?? [
    command as TemplateCommand,
  ];
  if (templates && renderer) {
    let active: Awaited<
      ReturnType<MessageTemplateRepository['findActiveByCommand']>
    > = null;
    try {
      for (const cmd of lookup) {
        active = await templates.findActiveByCommand(cmd);
        if (active) break;
      }
    } catch (err) {
      sendFullScanLogger.warn(
        `Template lookup failed (${lookup.join('→')}): ${err instanceof Error ? err.message : 'unknown'} — falling back to built-in card`,
      );
      active = null;
    }
    if (active) {
      try {
        const values: TemplateValues = { ...token };
        const rendered = renderer.render(
          active.bodyMarkdown,
          values,
          active.command,
        );
        await bot.sendMessage(context.chatId, rendered.text, {
          parse_mode: 'MarkdownV2',
        });
      } catch (err) {
        const detail = err instanceof Error ? err.message : 'unknown';
        sendFullScanLogger.error(
          `Template render failed (${active.command}/${active.name}): ${detail}`,
        );
        await bot.sendMessage(
          context.chatId,
          `⚠️ La plantilla activa de /${active.command} (${active.name}) tiene un error y no se pudo generar la tarjeta. Detalle: ${detail}. Avisá a un administrador para corregirla.`,
        );
      }
      return;
    }
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
    @Inject(MESSAGE_TEMPLATE_REPOSITORY)
    @Optional()
    private readonly templates?: MessageTemplateRepository | null,
    @Inject(TemplateRendererService)
    @Optional()
    private readonly renderer?: TemplateRendererService | null,
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
      this.templates ?? null,
      this.renderer ?? null,
      ['ca'],
    );
  }
}

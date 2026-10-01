import { Inject, Injectable } from '@nestjs/common';
import type {
  CommandContext,
  CommandHandler,
} from '@/commands/domain/ports/command-handler.port';
import { MessageFormatterAdapter } from '@/scan/infrastructure/formatter/message-formatter';
import { TelegramBotClient } from '@/gateway/infrastructure/telegram/bot-client';
import { TokenScanPipeline } from '@/scan/application/pipeline/token-scan.pipeline';
import type { ResolvedToken } from '@/scan/domain/ports/scan-pipeline.port';
import { TemplateRendererService } from '@/placeholders/application/template-renderer.service';
import {
  MESSAGE_TEMPLATE_REPOSITORY,
  type MessageTemplateRepository,
} from '@/templates/domain/ports/message-template.repository';

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
 * /z — compact scan (inherited from backend chain-dexter-bot
 * `z-compact-scan.handler.ts`, re-pointed at market-data HTTP).
 *
 * Template-first (todo 11, dexter-message-templates): the active `z`
 * template (`z/compact-v1` seed) renders MarkdownV2 via
 * `TemplateRendererService`. With no active template the built-in
 * `formatTokenScan({ compact: true })` answers instead — that fallback
 * is legacy Markdown (kept, documented). `{{chainDisplay}}` resolves
 * to `""` until todo 13 binds `DISPLAY_RESOLVER` (resolver-less
 * interim, same as todo 10). Usage/unresolvable strings stay
 * hardcoded (v1 closed enum: no templates for errors).
 */
@Injectable()
export class ZCompactScanHandler implements CommandHandler {
  public readonly name = 'z';

  public constructor(
    private readonly pipeline: TokenScanPipeline,
    private readonly formatter: MessageFormatterAdapter,
    private readonly bot: TelegramBotClient,
    @Inject(MESSAGE_TEMPLATE_REPOSITORY)
    private readonly templates: MessageTemplateRepository,
    private readonly renderer: TemplateRendererService,
  ) {}

  public async handle(args: string[], context: CommandContext): Promise<void> {
    const arg = args[0]?.trim();
    if (!arg) {
      await this.bot.sendMessage(context.chatId, 'Uso: /z <contrato>');
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

    const active = await this.templates.findActiveByCommand('z');
    if (active) {
      let text: string;
      try {
        text = this.renderer.render(active.bodyMarkdown, token, 'z').text;
      } catch (error) {
        await this.bot.sendMessage(
          context.chatId,
          `❌ Error al renderizar la plantilla activa (z/${active.name}): ${(error as Error).message}`,
        );
        return;
      }
      await this.bot.sendMessage(context.chatId, text, {
        parse_mode: 'MarkdownV2',
      });
      return;
    }

    // No active `z` template: built-in compact card (legacy Markdown).
    const formatted = this.formatter.formatTokenScan(toFormatterInput(token), {
      compact: true,
    });
    await this.bot.sendMessage(context.chatId, formatted.text, {
      parse_mode: 'Markdown',
    });
  }
}

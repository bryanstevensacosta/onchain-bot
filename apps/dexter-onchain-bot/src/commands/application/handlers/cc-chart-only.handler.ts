import { Inject, Injectable } from '@nestjs/common';
import type {
  CommandContext,
  CommandHandler,
} from '@/commands/domain/ports/command-handler.port';
import { TelegramBotClient } from '@/telegram/infrastructure/telegram/bot-client';
import { TokenScanPipeline } from '@/scan/application/pipeline/token-scan.pipeline';
import { VALID_TIMEFRAMES } from './c-token-chart.handler';
import { TemplateRendererService } from '@/placeholders/application/template-renderer.service';
import {
  MESSAGE_TEMPLATE_REPOSITORY,
  type MessageTemplateRepository,
} from '@/templates/domain/ports/message-template.repository';

/**
 * /cc — chart-only link (inherited from backend chain-dexter-bot
 * `cc-chart-only.handler.ts`, re-pointed at market-data HTTP).
 *
 * Template-first (todo 11, dexter-message-templates): `{{timeframe}}`
 * is validated against `VALID_TIMEFRAMES` (single source: imported
 * from the `c` handler, never redefined here) BEFORE resolve/render;
 * the active `cc` template (`cc/chart-only-v1` seed) renders MarkdownV2
 * with `{ ...token, timeframe }` (`{{timeframe}}` is optional at
 * render — a body without it renders fine). `{{chainDisplay}}`
 * resolves to `""` until todo 13 binds `DISPLAY_RESOLVER`
 * (resolver-less interim, same as todo 10). Usage/timeframe-invalid/
 * unresolvable strings stay hardcoded (v1 closed enum).
 */
@Injectable()
export class CcChartOnlyHandler implements CommandHandler {
  public readonly name = 'cc';

  public constructor(
    private readonly pipeline: TokenScanPipeline,
    private readonly bot: TelegramBotClient,
    @Inject(MESSAGE_TEMPLATE_REPOSITORY)
    private readonly templates: MessageTemplateRepository,
    private readonly renderer: TemplateRendererService,
  ) {}

  public async handle(args: string[], context: CommandContext): Promise<void> {
    const arg = args[0]?.trim();
    if (!arg) {
      await this.bot.sendMessage(
        context.chatId,
        'Uso: /cc <contrato> [timeframe]',
      );
      return;
    }

    const tf = args[1]?.trim() ?? '5m';
    if (!VALID_TIMEFRAMES.has(tf)) {
      await this.bot.sendMessage(
        context.chatId,
        `⚠️ Timeframe inválido: ${tf}\n\nUsa uno de: 1m, 5m, 15m, 1h, 4h, 1d, 1w`,
      );
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

    const active = await this.templates.findActiveByCommand('cc');
    if (active) {
      let text: string;
      try {
        text = this.renderer.render(
          active.bodyMarkdown,
          { ...token, timeframe: tf },
          'cc',
        ).text;
      } catch (error) {
        await this.bot.sendMessage(
          context.chatId,
          `❌ Error al renderizar la plantilla activa (cc/${active.name}): ${(error as Error).message}`,
        );
        return;
      }
      // gateway SendDto sin reply_markup: link en texto
      await this.bot.sendMessage(context.chatId, text, {
        parse_mode: 'MarkdownV2',
      });
      return;
    }

    // No active `cc` template: built-in link-only card (legacy Markdown,
    // keyboards abandoned — see gateway SendDto note above).
    const chartUrl = `https://dexscreener.com/${token.chain}/${token.address}`;

    const text = `💊 *${token.symbol}* (${token.chain})\n\n📈 Chart: ${chartUrl}`;
    // gateway SendDto sin reply_markup: link en texto
    await this.bot.sendMessage(context.chatId, text, {
      parse_mode: 'Markdown',
    });
  }
}

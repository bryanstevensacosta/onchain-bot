import { Injectable } from '@nestjs/common';
import type { CommandContext, CommandHandler } from '../command-handler';
import { MessageFormatterAdapter } from '../message-formatter';
import { TelegramBotClient } from '../bot-client';
import { TokenScanPipeline } from '../token-scan.pipeline';
import type { ResolvedToken } from '../token-scan.pipeline';

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
 */
@Injectable()
export class ZCompactScanHandler implements CommandHandler {
  public readonly name = 'z';

  public constructor(
    private readonly pipeline: TokenScanPipeline,
    private readonly formatter: MessageFormatterAdapter,
    private readonly bot: TelegramBotClient,
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

    const formatted = this.formatter.formatTokenScan(toFormatterInput(token), {
      compact: true,
    });
    await this.bot.sendMessage(context.chatId, formatted.text, {
      parse_mode: 'Markdown',
    });
  }
}

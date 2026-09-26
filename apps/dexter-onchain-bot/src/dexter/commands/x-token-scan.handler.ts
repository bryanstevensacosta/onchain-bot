import { Injectable } from '@nestjs/common';
import type { CommandContext, CommandHandler } from '../command-handler';
import { InlineKeyboardBuilder } from '../inline-keyboard.builder';
import { MessageFormatterAdapter } from '../message-formatter';
import { TelegramBotClient } from '../bot-client';
import { TradeButtonRegistry } from '../trade-button-registry';
import { TokenScanPipeline } from '../token-scan.pipeline';
import { sendFullScan } from './ca.handler';

/**
 * /x — full scan (inherited from backend chain-dexter-bot
 * `x-token-scan.handler.ts`, re-pointed at market-data HTTP).
 */
@Injectable()
export class XTokenScanHandler implements CommandHandler {
  public readonly name = 'x';

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
      'x',
      this.pipeline,
      this.formatter,
      this.registry,
      this.keyboards,
      this.bot,
    );
  }
}

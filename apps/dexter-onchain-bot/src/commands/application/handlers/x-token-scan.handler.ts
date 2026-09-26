import { Injectable } from '@nestjs/common';
import type {
  CommandContext,
  CommandHandler,
} from '../../domain/ports/command-handler.port';
import { InlineKeyboardBuilder } from '../../../telegram/infrastructure/keyboard/inline-keyboard.builder';
import { MessageFormatterAdapter } from '../../../scan/infrastructure/formatter/message-formatter';
import { TelegramBotClient } from '../../../telegram/infrastructure/telegram/bot-client';
import { TradeButtonRegistry } from '../../../telegram/infrastructure/keyboard/trade-button-registry';
import { TokenScanPipeline } from '../../../scan/application/pipeline/token-scan.pipeline';
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

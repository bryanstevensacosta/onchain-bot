import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ChainDetectionModule } from 'chain/detection/chain-detection.module';
import { ChainExplorerModule } from 'chain/explorer/chain-explorer.module';
import { ChainDexterBotAdapter } from './infrastructure/telegram/chain-dexter-bot.adapter';
import { MessageFormatterAdapter } from './infrastructure/telegram/message-formatter.adapter';
import { TelegramBotClient } from './infrastructure/telegram/bot-client';
import { TradeButtonRegistry } from './infrastructure/telegram/trade-button-registry';
import { InlineKeyboardBuilder } from './infrastructure/telegram/inline-keyboard.builder';
import { ChainDexterBotConfigService } from './bot.config';
import { TokenScanService } from './application/token-scan.service';
import { ChainDexterController } from './api/http/chain-dexter.controller';

@Module({
  imports: [HttpModule, ChainDetectionModule, ChainExplorerModule],
  controllers: [ChainDexterController],
  providers: [
    ChainDexterBotConfigService,
    TelegramBotClient,
    TradeButtonRegistry,
    InlineKeyboardBuilder,
    MessageFormatterAdapter,
    TokenScanService,
    ChainDexterBotAdapter,
  ],
  exports: [
    ChainDexterBotConfigService,
    TelegramBotClient,
    TradeButtonRegistry,
    InlineKeyboardBuilder,
    MessageFormatterAdapter,
    TokenScanService,
    ChainDexterBotAdapter,
  ],
})
export class ChainDexterBotModule {}

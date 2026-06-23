import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ChainDetectionModule } from 'chain/detection/chain-detection.module';
import { ChainExplorerModule } from 'chain/explorer/chain-explorer.module';
import { ChainDexterBotAdapter } from './infrastructure/telegram/chain-dexter-bot.adapter';
import { MessageFormatterAdapter } from './infrastructure/telegram/message-formatter.adapter';
import { TokenScanService } from './application/token-scan.service';
import { ChainDexterController } from './api/http/chain-dexter.controller';

@Module({
  imports: [HttpModule, ChainDetectionModule, ChainExplorerModule],
  controllers: [ChainDexterController],
  providers: [TokenScanService, ChainDexterBotAdapter, MessageFormatterAdapter],
  exports: [TokenScanService, ChainDexterBotAdapter],
})
export class ChainDexterBotModule {}

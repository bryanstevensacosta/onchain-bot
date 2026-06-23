import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { isDatabaseEnabled } from 'shared/common/persistence/database.module';
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
import { ChatGroupEntity } from './domain/chat-group.entity';
import { ChatSettingsEntity } from './domain/chat-settings.entity';
import { CHAT_GROUP_REPOSITORY } from './application/ports/chat-group.repository';
import type { ChatGroupRepository } from './application/ports/chat-group.repository';
import { CHAT_SETTINGS_REPOSITORY } from './application/ports/chat-settings.repository';
import type { ChatSettingsRepository } from './application/ports/chat-settings.repository';
import { InMemoryChatGroupRepository } from './infrastructure/repositories/in-memory-chat-group.repository';
import { InMemoryChatSettingsRepository } from './infrastructure/repositories/in-memory-chat-settings.repository';
import { TypeOrmChatGroupRepository } from './infrastructure/persistence/typeorm-chat-group.repository';
import { TypeOrmChatSettingsRepository } from './infrastructure/persistence/typeorm-chat-settings.repository';
import { ChatSettingsService } from './application/handlers/chat-settings.service';
import type { AppConfig } from 'shared/common/config/app.config';

@Module({
  imports: [
    HttpModule,
    ChainDetectionModule,
    ChainExplorerModule,
    ...(isDatabaseEnabled()
      ? [TypeOrmModule.forFeature([ChatGroupEntity, ChatSettingsEntity])]
      : []),
  ],
  controllers: [ChainDexterController],
  providers: [
    ChainDexterBotConfigService,
    TelegramBotClient,
    TradeButtonRegistry,
    InlineKeyboardBuilder,
    MessageFormatterAdapter,
    TokenScanService,
    ChainDexterBotAdapter,
    ChatSettingsService,
    InMemoryChatGroupRepository,
    InMemoryChatSettingsRepository,
    ...(isDatabaseEnabled()
      ? [TypeOrmChatGroupRepository, TypeOrmChatSettingsRepository]
      : []),
    {
      provide: CHAT_GROUP_REPOSITORY,
      inject: [
        ConfigService,
        InMemoryChatGroupRepository,
        ...(isDatabaseEnabled() ? [TypeOrmChatGroupRepository] : []),
      ],
      useFactory: (
        config: ConfigService,
        inMemory: InMemoryChatGroupRepository,
        typeorm?: TypeOrmChatGroupRepository,
      ): ChatGroupRepository => {
        const enabled =
          config.get<AppConfig>('app')?.database?.enabled === true;
        return enabled && typeorm ? typeorm : inMemory;
      },
    },
    {
      provide: CHAT_SETTINGS_REPOSITORY,
      inject: [
        ConfigService,
        InMemoryChatSettingsRepository,
        ...(isDatabaseEnabled() ? [TypeOrmChatSettingsRepository] : []),
      ],
      useFactory: (
        config: ConfigService,
        inMemory: InMemoryChatSettingsRepository,
        typeorm?: TypeOrmChatSettingsRepository,
      ): ChatSettingsRepository => {
        const enabled =
          config.get<AppConfig>('app')?.database?.enabled === true;
        return enabled && typeorm ? typeorm : inMemory;
      },
    },
  ],
  exports: [
    ChainDexterBotConfigService,
    TelegramBotClient,
    TradeButtonRegistry,
    InlineKeyboardBuilder,
    MessageFormatterAdapter,
    TokenScanService,
    ChainDexterBotAdapter,
    ChatSettingsService,
    CHAT_GROUP_REPOSITORY,
    CHAT_SETTINGS_REPOSITORY,
  ],
})
export class ChainDexterBotModule {}

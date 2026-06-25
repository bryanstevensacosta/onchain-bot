import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { isDatabaseEnabled } from 'shared/common/persistence/database.module';
import { ChainRegistryModule } from 'chain/registry/chain-registry.module';
import {
  PublishedCallRepository,
  PublishingEventPublisher,
  MessageFormatterPort,
  TelegramPublisherPort,
} from 'telegram/shared';
import { VipCallsBotApiPublisherAdapter } from './infrastructure/senders/bot-api-telegram-publisher.adapter';
import { VipCallsMessageFormatterAdapter } from './infrastructure/formatters/vip-message-formatter.adapter';
import { InMemoryPublishedCallRepository } from './infrastructure/repositories/in-memory-published-call.repository';
import { InProcessPublishingEventPublisher } from 'telegram/shared';
import { VipCallsPublishUseCase } from './application/handlers/vip-calls-publish.use-case';
import { VipCallsListPublishedUseCase } from './application/handlers/vip-calls-list-published.use-case';
import { VipCallsController } from './api/http/vip-calls.controller';
import { MilestoneReachedHandler } from './infrastructure/event-bus/milestone-reached.handler';
import { SettingsModule } from 'settings/settings.module';

@Module({
  imports: [HttpModule, ChainRegistryModule, SettingsModule],
  controllers: [VipCallsController],
  providers: [
    VipCallsPublishUseCase,
    VipCallsListPublishedUseCase,
    VipCallsBotApiPublisherAdapter,
    VipCallsMessageFormatterAdapter,
    MilestoneReachedHandler,
    InMemoryPublishedCallRepository,
    {
      provide: PublishedCallRepository,
      useExisting: InMemoryPublishedCallRepository,
    },
    {
      provide: PublishingEventPublisher,
      useClass: InProcessPublishingEventPublisher,
    },
    {
      provide: MessageFormatterPort,
      useClass: VipCallsMessageFormatterAdapter,
    },
    {
      provide: TelegramPublisherPort,
      useClass: VipCallsBotApiPublisherAdapter,
    },
  ],
  exports: [PublishedCallRepository, PublishingEventPublisher],
})
export class VipCallsModule {}

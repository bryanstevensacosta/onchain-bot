import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MessageFormatterPort } from 'discovery/publishing/telegram/domain/ports/message-formatter.port';
import { OutputChannelResolverPort } from 'discovery/publishing/telegram/domain/ports/output-channel-resolver.port';
import { TelegramPublisherPort } from 'discovery/publishing/telegram/domain/ports/telegram-publisher.port';
import { PublishedCallRepository } from 'discovery/publishing/telegram/application/ports/published-call.repository';
import { PublishingEventPublisher } from 'discovery/publishing/telegram/application/ports/publishing-event.publisher';
import { PublishApprovedCallUseCase } from 'discovery/publishing/telegram/application/handlers/publish-approved-call.use-case';
import { GetPublishedCallUseCase } from 'discovery/publishing/telegram/application/handlers/get-published-call.use-case';
import { ListPublishedCallsUseCase } from 'discovery/publishing/telegram/application/handlers/list-published-calls.use-case';
import { DefaultMessageFormatterAdapter } from 'discovery/publishing/telegram/infrastructure/formatters/default-message-formatter.adapter';
import { DefaultOutputChannelResolverAdapter } from 'discovery/publishing/telegram/infrastructure/channels/default-output-channel-resolver.adapter';
import { MockTelegramPublisherAdapter } from 'discovery/publishing/telegram/infrastructure/senders/mock-telegram-publisher.adapter';
import { MtprotoPublishingAdapter } from 'discovery/publishing/telegram/infrastructure/senders/mtproto-publishing.adapter';
import { InMemoryPublishedCallRepository } from 'discovery/publishing/telegram/infrastructure/repositories/in-memory-published-call.repository';
import { InProcessPublishingEventPublisher } from 'discovery/publishing/telegram/infrastructure/messaging/in-process-publishing-event.publisher';
import { FiltersApprovedHandler } from 'discovery/publishing/telegram/infrastructure/event-bus/filters-approved.handler';
import { PublishingController } from 'discovery/publishing/telegram/api/http/publishing.controller';
import { MESSAGE_FORMATTER } from 'discovery/publishing/telegram/publishing.tokens';

interface AppConfigShape {
  readonly publishing?: {
    readonly telegram?: {
      readonly useRealMtproto?: boolean;
    };
  };
}

/**
 * Publisher factory — picks mock vs real MTProto based on config.
 *
 * Default: mock (safe for tests + dev without Telegram session).
 * Set `PUBLISHING_TELEGRAM_USE_REAL_MTPROTO=true` to use real MTProto
 * (requires TELEGRAM_MTPROTO_API_ID/HASH/SESSION env vars).
 */
const publisherFactory = {
  useMtproto: (cfg: ConfigService): boolean => {
    const v =
      cfg.get<AppConfigShape>('app')?.publishing?.telegram?.useRealMtproto;
    return v === true;
  },
};

/**
 * Telegram Publishing BC module — closes the CA Discovery pipeline.
 *
 * Consumes: `filters.token.approved` events
 * Emits:    `publishing.telegram.published` or `publishing.telegram.failed`
 *
 * v1 default: mock sender (logs only).
 * v2: set `PUBLISHING_TELEGRAM_USE_REAL_MTPROTO=true` to switch to MtprotoPublishingAdapter.
 */
@Module({
  controllers: [PublishingController],
  providers: [
    PublishApprovedCallUseCase,
    GetPublishedCallUseCase,
    ListPublishedCallsUseCase,
    FiltersApprovedHandler,
    DefaultMessageFormatterAdapter,
    DefaultOutputChannelResolverAdapter,
    MockTelegramPublisherAdapter,
    MtprotoPublishingAdapter,
    {
      provide: MESSAGE_FORMATTER,
      useExisting: DefaultMessageFormatterAdapter,
    },
    { provide: MessageFormatterPort, useClass: DefaultMessageFormatterAdapter },
    {
      provide: OutputChannelResolverPort,
      useClass: DefaultOutputChannelResolverAdapter,
    },
    {
      provide: TelegramPublisherPort,
      useFactory: (
        cfg: ConfigService,
        mock: MockTelegramPublisherAdapter,
        mtproto: MtprotoPublishingAdapter,
      ): TelegramPublisherPort => {
        return publisherFactory.useMtproto(cfg) ? mtproto : mock;
      },
      inject: [
        ConfigService,
        MockTelegramPublisherAdapter,
        MtprotoPublishingAdapter,
      ],
    },
    {
      provide: PublishedCallRepository,
      useClass: InMemoryPublishedCallRepository,
    },
    {
      provide: PublishingEventPublisher,
      useClass: InProcessPublishingEventPublisher,
    },
  ],
  exports: [PublishedCallRepository, PublishingEventPublisher],
})
export class TelegramPublishingModule {}

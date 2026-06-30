import { Module } from '@nestjs/common';
import { VipCallsBotApiPublisherAdapter } from './infrastructure/senders/bot-api-telegram-publisher.adapter';
import { TelegramPublisherPort } from 'telegram/shared/domain/ports/telegram-publisher.port';

@Module({
  providers: [
    VipCallsBotApiPublisherAdapter,
    {
      provide: TelegramPublisherPort,
      useExisting: VipCallsBotApiPublisherAdapter,
    },
  ],
  exports: [TelegramPublisherPort, VipCallsBotApiPublisherAdapter],
})
export class VipCallsSharedModule {}
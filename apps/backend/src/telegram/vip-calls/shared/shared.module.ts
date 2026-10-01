/**
 * @deprecated Tramo 1 cutover (task-16, staging): KOL-bot sending moved to
 * apps/kol-calls-publisher/src/telegram (MultiBotPublisherAdapter, token
 * per call from DB catalog). Refactor target: delete at central FINAL
 * REVIEW (C4-bis.3). Rollback: backend path stays wired.
 */
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

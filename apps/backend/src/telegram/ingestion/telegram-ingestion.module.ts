import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TelegramListenerPort } from 'telegram/ingestion/domain/ports/telegram-listener.port';
import { TelegramMtprotoListenerAdapter } from 'telegram/ingestion/api/mtproto/telegram-mtproto-listener.adapter';
import { IngestionSafetyConfig } from 'telegram/ingestion/infrastructure/config/ingestion-safety.config';
import { SleepWindowService } from 'telegram/ingestion/infrastructure/services/sleep-window.service';
import { FloodWaitCounterService } from 'telegram/ingestion/infrastructure/services/flood-wait-counter.service';
import { FloodWaitHandlerService } from 'telegram/ingestion/infrastructure/services/flood-wait-handler.service';
import { IngestionConfigController } from 'telegram/ingestion/api/http/ingestion-config.controller';
import { IngestionHealthController } from 'telegram/ingestion/api/http/ingestion-health.controller';

@Global()
@Module({
  imports: [ConfigModule],
  controllers: [IngestionConfigController, IngestionHealthController],
  providers: [
    { provide: TelegramListenerPort, useClass: TelegramMtprotoListenerAdapter },
    IngestionSafetyConfig,
    SleepWindowService,
    FloodWaitCounterService,
    FloodWaitHandlerService,
  ],
  exports: [TelegramListenerPort, IngestionSafetyConfig],
})
export class TelegramIngestionModule {}

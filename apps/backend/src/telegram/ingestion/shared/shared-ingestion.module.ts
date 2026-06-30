import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TelegramListenerPort } from 'telegram/ingestion/shared/domain/ports/telegram-listener.port';
import { TelegramMtprotoListenerAdapter } from 'telegram/ingestion/shared/api/mtproto/telegram-mtproto-listener.adapter';
import { IngestionSafetyConfig } from 'telegram/ingestion/shared/infrastructure/config/ingestion-safety.config';
import { SleepWindowService } from 'telegram/ingestion/shared/infrastructure/services/sleep-window.service';
import { FloodWaitCounterService } from 'telegram/ingestion/shared/infrastructure/services/flood-wait-counter.service';
import { FloodWaitHandlerService } from 'telegram/ingestion/shared/infrastructure/services/flood-wait-handler.service';
import { IngestionConfigController } from 'telegram/ingestion/shared/api/http/ingestion-config.controller';
import { IngestionHealthController } from 'telegram/ingestion/shared/api/http/ingestion-health.controller';
import { IdentityModule } from 'kol/identity/identity.module';

@Global()
@Module({
  imports: [ConfigModule, IdentityModule],
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
export class SharedIngestionModule {}

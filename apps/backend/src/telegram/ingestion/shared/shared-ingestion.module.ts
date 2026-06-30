import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { isDatabaseEnabled } from 'shared/common/persistence/database.module';
import { TelegramListenerPort } from 'telegram/ingestion/shared/domain/ports/telegram-listener.port';
import { TelegramMtprotoListenerAdapter } from 'telegram/ingestion/shared/api/mtproto/telegram-mtproto-listener.adapter';
import { IngestionSafetyConfig } from 'telegram/ingestion/shared/infrastructure/config/ingestion-safety.config';
import { SleepWindowService } from 'telegram/ingestion/shared/infrastructure/services/sleep-window.service';
import { FloodWaitCounterService } from 'telegram/ingestion/shared/infrastructure/services/flood-wait-counter.service';
import { FloodWaitHandlerService } from 'telegram/ingestion/shared/infrastructure/services/flood-wait-handler.service';
import { IngestionConfigController } from 'telegram/ingestion/shared/api/http/ingestion-config.controller';
import { IngestionHealthController } from 'telegram/ingestion/shared/api/http/ingestion-health.controller';
import { IngestionCoordinator } from 'telegram/ingestion/shared/application/ingestion-coordinator.service';
import { IdentityModule } from 'kol/identity/identity.module';
import { KolIngestionModule } from 'telegram/ingestion/kol/kol-ingestion.module';
import { CryptoNewsIngestionModule } from 'telegram/ingestion/crypto-news/crypto-news-ingestion.module';
import type { AppConfig } from 'shared/common/config/app.config';

@Global()
@Module({
  imports: [
    ConfigModule,
    IdentityModule,
    KolIngestionModule,
    CryptoNewsIngestionModule,
  ],
  controllers: [IngestionConfigController, IngestionHealthController],
  providers: [
    { provide: TelegramListenerPort, useClass: TelegramMtprotoListenerAdapter },
    IngestionSafetyConfig,
    SleepWindowService,
    FloodWaitCounterService,
    FloodWaitHandlerService,
    IngestionCoordinator,
  ],
  exports: [TelegramListenerPort, IngestionSafetyConfig],
})
export class SharedIngestionModule {}

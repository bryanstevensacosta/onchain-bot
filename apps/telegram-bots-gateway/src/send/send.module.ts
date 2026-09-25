import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { VaultModule } from '../vault/vault.module';
import { SendController } from './api/http/send.controller';
import { SendService } from './application/send.service';
import { PerBotRateLimiterService } from './application/per-bot-rate-limiter.service';
import { InMemoryIdempotencyStore } from './application/idempotency.store';
import { SendAccountingService } from './application/send-accounting.service';
import { BotApiClient } from './infrastructure/bot-api-client';

@Module({
  imports: [VaultModule, AuthModule],
  controllers: [SendController],
  providers: [
    SendService,
    PerBotRateLimiterService,
    BotApiClient,
    InMemoryIdempotencyStore,
    SendAccountingService,
    {
      provide: 'TELEGRAM_API_BASE',
      useFactory: (config: ConfigService) =>
        config.get<string>(
          'app.telegramApiBase',
          'https://api.telegram.org',
        ) ?? 'https://api.telegram.org',
      inject: [ConfigService],
    },
  ],
  exports: [SendService],
})
export class SendModule {}

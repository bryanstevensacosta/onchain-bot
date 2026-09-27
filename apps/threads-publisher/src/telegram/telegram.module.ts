import { Module } from '@nestjs/common';
import { ThreadsApiPublisherAdapter } from 'threads/infrastructure/threads-api-publisher.adapter';
import { ThreadsApiPublisherPort } from 'threads/ports/threads-api-publisher.port';
import { GatewaySendClient } from './gateway-send-client';
import { DualThreadsPublisher } from './dual-threads-publisher';
import { TelegramHealthIndicator } from './health/telegram-health.indicator';

/**
 * Telegram/gateway transport (P42-style): vault ids only, never tokens.
 * THREADS_PUBLISH_MODE=direct|dual|gateway (default dual).
 */
@Module({
  providers: [
    ThreadsApiPublisherAdapter,
    GatewaySendClient,
    TelegramHealthIndicator,
    {
      provide: ThreadsApiPublisherPort,
      useClass: DualThreadsPublisher,
    },
  ],
  exports: [ThreadsApiPublisherPort, GatewaySendClient, TelegramHealthIndicator],
})
export class TelegramModule {}

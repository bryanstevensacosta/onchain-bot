import { Module } from '@nestjs/common';
import { FeedIngestionClientPort } from './domain/ports/ingestion-client.port';
import { IngestionHttpClientAdapter } from './infrastructure/http/ingestion-http-client.adapter';
import { ProcessFeedMessageHandler } from './application/handlers/process-feed-message.handler';
import { FeedIngestionClient } from './application/services/feed-ingestion-client.service';
import { IngestionHealthIndicator } from './health/ingestion-health.indicator';

/**
 * IngestionModule - feed feed ingestion (Tramo 2, todo 2).
 *
 * Read-only client over the ingestion-telegram feed API scoped to
 * crypto-news sources (`?type=crypto-news`): realtime SSE with
 * client-side filtering on `data.messageType` plus reconnect catch-up
 * by cursor (no periodic polling). Backoff 1s -> 30s. Sends `x-api-key`
 * (INGESTION_TELEGRAM_API_KEY) on SSE + feed reads from day one (P30).
 */
@Module({
  providers: [
    ProcessFeedMessageHandler,
    FeedIngestionClient,
    IngestionHealthIndicator,
    {
      provide: FeedIngestionClientPort,
      useClass: IngestionHttpClientAdapter,
    },
  ],
  exports: [
    FeedIngestionClientPort,
    FeedIngestionClient,
    IngestionHealthIndicator,
  ],
})
export class IngestionModule {}

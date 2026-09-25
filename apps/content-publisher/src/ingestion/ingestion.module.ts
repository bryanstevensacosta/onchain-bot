import { Module } from '@nestjs/common';
import { CryptoNewsIngestionClientPort } from './domain/ports/ingestion-client.port';
import { IngestionHttpClientAdapter } from './infrastructure/http/ingestion-http-client.adapter';
import { ProcessCryptoNewsMessageHandler } from './application/handlers/process-crypto-news-message.handler';
import { CryptoNewsIngestionClient } from './application/services/crypto-news-ingestion-client.service';
import { IngestionHealthIndicator } from './health/ingestion-health.indicator';

/**
 * IngestionModule - crypto-news feed ingestion (Tramo 2, todo 2).
 *
 * Read-only client over the ingestion-telegram feed API scoped to
 * crypto-news sources (`?type=crypto-news`): realtime SSE with
 * client-side filtering on `data.messageType` plus reconnect catch-up
 * by cursor (no periodic polling). Backoff 1s -> 30s. Sends `x-api-key`
 * (INGESTION_TELEGRAM_API_KEY) on SSE + feed reads from day one (P30).
 */
@Module({
  providers: [
    ProcessCryptoNewsMessageHandler,
    CryptoNewsIngestionClient,
    IngestionHealthIndicator,
    {
      provide: CryptoNewsIngestionClientPort,
      useClass: IngestionHttpClientAdapter,
    },
  ],
  exports: [
    CryptoNewsIngestionClientPort,
    CryptoNewsIngestionClient,
    IngestionHealthIndicator,
  ],
})
export class IngestionModule {}

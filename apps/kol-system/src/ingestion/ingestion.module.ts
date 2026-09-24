import { Module } from '@nestjs/common';
import { KolIngestionClientPort } from './domain/ports/ingestion-client.port';
import { IngestionHttpClientAdapter } from './infrastructure/http/ingestion-http-client.adapter';
import { ProcessKolMessageHandler } from './application/handlers/process-kol-message.handler';
import { KolIngestionClientService } from './application/services/kol-ingestion-client.service';

/**
 * IngestionModule - KOL feed ingestion for kol-system (Tramo 1, todo 4).
 *
 * Read-only client over the ingestion-telegram feed API scoped to KOL
 * sources (`?type=kol`): realtime SSE with client-side filtering on
 * `data.messageType` plus a 1-minute polling fallback. Backoff 1s -> 30s.
 */
@Module({
  providers: [
    ProcessKolMessageHandler,
    KolIngestionClientService,
    {
      provide: KolIngestionClientPort,
      useClass: IngestionHttpClientAdapter,
    },
  ],
  exports: [KolIngestionClientPort, KolIngestionClientService],
})
export class IngestionModule {}

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { StreamService } from './application/services/stream.service';
import { SSEStreamController } from './api/http/sse-stream.controller';
import { streamConfig } from './stream.config';

/**
 * StreamModule provides Server-Sent Events (SSE) infrastructure
 *
 * Per Requirement 2.1: Exposes SSE streaming endpoint for backend clients
 * Per Requirement 2.5: Implements heartbeat to prevent proxy timeouts
 *
 * Per-env-ingestion item 4: the multi-backend layer is deleted
 * (BackendRegistryService, SSEBroadcastService, BackfillBufferService,
 * DisconnectionTracker, BackendCircuitBreakerService, backend registration
 * controller, legacy unauthenticated stream controller, stream status
 * controller). The single unauthenticated SSE stream
 * (GET /api/ingestion/stream, per-env — no backendId gate, no backfill) plus
 * StreamService fan-out is the única vía.
 *
 * Exports:
 * - StreamService: For broadcasting messages to all SSE clients
 *
 * Controllers:
 * - SSEStreamController: GET /api/ingestion/stream (open SSE stream)
 *
 * @module StreamModule
 */
@Module({
  imports: [
    // Stream timing knobs (SSE_HEARTBEAT_INTERVAL_MS + reconnect delays)
    ConfigModule.forFeature(streamConfig),
    // ScheduleModule required for the heartbeat job registration
    ScheduleModule.forRoot(),
  ],
  providers: [StreamService],
  controllers: [SSEStreamController],
  exports: [StreamService],
})
export class StreamModule {}

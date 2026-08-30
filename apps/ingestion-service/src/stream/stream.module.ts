import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { StreamService } from './application/services/stream.service';
import { DisconnectionTracker } from './application/services/disconnection-tracker.service';
import { StreamController } from './api/http/stream.controller';

/**
 * StreamModule provides Server-Sent Events (SSE) infrastructure
 *
 * Per Requirement 2.1: Exposes SSE streaming endpoint for backend clients
 * Per Requirement 2.5: Implements heartbeat to prevent proxy timeouts
 * Per GAP 3: Tracks disconnection windows for observability
 *
 * Exports:
 * - StreamService: For broadcasting messages to all SSE clients
 * - DisconnectionTracker: For monitoring client connection health
 *
 * Controllers:
 * - StreamController: GET /api/ingestion/stream (SSE endpoint)
 * - StreamController: GET /api/ingestion/stream/status (metrics)
 *
 * @module StreamModule
 */
@Module({
  imports: [
    // ScheduleModule required for @Cron heartbeat decorator
    ScheduleModule.forRoot(),
  ],
  providers: [StreamService, DisconnectionTracker],
  controllers: [StreamController],
  exports: [StreamService, DisconnectionTracker],
})
export class StreamModule {}

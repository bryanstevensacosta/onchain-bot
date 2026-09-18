import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StreamService } from './application/services/stream.service';
import { DisconnectionTracker } from './application/services/disconnection-tracker.service';
import { SSEBroadcastService } from './application/services/sse-broadcast.service';
import { BackfillBufferService } from './infrastructure/backfill-buffer.service';
import { StreamController } from './api/http/stream.controller';
import { SSEStreamController } from './api/http/sse-stream.controller';
import { BackendRegistrationController } from './api/http/backend-registration.controller';
import { StreamStatusController } from './api/http/stream-status.controller';
import { BackfillMessageEntity } from './infrastructure/persistence/typeorm/backfill-message.entity';
import { MetricsModule } from '../metrics/metrics.module';

/**
 * StreamModule provides Server-Sent Events (SSE) infrastructure
 *
 * Per Requirement 2.1: Exposes SSE streaming endpoint for backend clients
 * Per Requirement 2.5: Implements heartbeat to prevent proxy timeouts
 * Per GAP 3: Tracks disconnection windows for observability
 * Per Requirement 1.1: Exposes backend registration endpoint
 * Per Requirement 4.1: SSEBroadcastService for multi-backend message distribution
 * Per Requirement 7.1: BackfillBufferService for 72-hour message retention
 * Per Requirement 7.2: Database persistence for restart recovery
 * Per Requirement 8.1: StreamStatusController for operational metrics
 *
 * Exports:
 * - StreamService: For broadcasting messages to all SSE clients (legacy)
 * - DisconnectionTracker: For monitoring client connection health
 * - SSEBroadcastService: For multi-backend broadcast with circuit breaker
 * - BackfillBufferService: For backfill buffer management with DB persistence
 *
 * Controllers:
 * - StreamController: GET /api/ingestion/stream (legacy SSE endpoint, no authentication)
 * - SSEStreamController: GET /api/ingestion/stream (authenticated with backendId validation + backfill)
 * - StreamStatusController: GET /api/ingestion/stream/status (operational status)
 * - BackendRegistrationController: POST /api/ingestion/backends/register
 *
 * Note: BackendChannelProviderService is injected from SharedModule (@Global)
 *
 * @module StreamModule
 */
@Module({
  imports: [
    // ScheduleModule required for @Cron heartbeat decorator
    ScheduleModule.forRoot(),
    // TypeORM for backfill message persistence
    TypeOrmModule.forFeature([BackfillMessageEntity]),
    // MetricsModule required for SSEBroadcastService Prometheus integration
    MetricsModule,
  ],
  providers: [
    StreamService,
    DisconnectionTracker,
    SSEBroadcastService,
    BackfillBufferService,
  ],
  controllers: [
    StreamController,
    SSEStreamController,
    BackendRegistrationController,
    StreamStatusController,
  ],
  exports: [
    StreamService,
    DisconnectionTracker,
    SSEBroadcastService,
    BackfillBufferService,
  ],
})
export class StreamModule {}

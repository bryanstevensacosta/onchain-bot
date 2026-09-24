import { Module } from '@nestjs/common';
import { HealthController } from './api/http/health.controller';
import { StreamModule } from 'stream/stream.module';
import { TelegramClientManager } from 'core/infrastructure/services/telegram-client-manager.service';
import { FloodWaitCounterService } from 'core/infrastructure/services/flood-wait-counter.service';

/**
 * Legacy string-token aliases (gap 2).
 *
 * HealthController now injects the real classes directly. These aliases keep
 * any remaining `@Inject('TelegramClientManager')` / `@Inject('FloodWaitCounter')`
 * consumers resolving to the SAME global singletons (SharedModule is @Global)
 * instead of the old null stubs — no code path reads fake-healthy anymore.
 */
const TelegramClientManagerAlias = {
  provide: 'TelegramClientManager',
  useExisting: TelegramClientManager,
};

const FloodWaitCounterAlias = {
  provide: 'FloodWaitCounter',
  useExisting: FloodWaitCounterService,
};

/**
 * HealthModule provides health check and monitoring endpoints
 *
 * Per Requirement 5.1, 5.2: Health endpoints for monitoring
 * Per Requirement 5.3: Channel metadata endpoint
 *
 * Controllers:
 * - HealthController: GET /api/health, /api/health/ready, /api/health/live
 *
 * Wiring (gap 2): TelegramClientManager, FloodWaitCounterService and
 * TelegramFeedSourceRepository resolve from the @Global SharedModule — real
 * singletons, no null stubs. HealthController marks degraded with a
 * warnings[] reason whenever a dependency is missing or a probe throws.
 *
 * MetricsService is intentionally NOT provided here (gap 4): nobody feeds
 * it, so its gauges would only ever read 0. See HealthController header.
 *
 * @module HealthModule
 */
@Module({
  imports: [StreamModule], // For SSE client count metrics
  controllers: [HealthController],
  providers: [TelegramClientManagerAlias, FloodWaitCounterAlias],
})
export class HealthModule {}

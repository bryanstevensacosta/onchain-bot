import { Module } from '@nestjs/common';
import { HealthController } from './api/http/health.controller';
import { StreamModule } from 'stream/stream.module';

/**
 * Stub implementations for optional dependencies
 * These will be replaced with actual implementations when MTProto is wired
 */
const TelegramClientManagerStub = {
  provide: 'TelegramClientManager',
  useValue: null, // HealthController handles null case with fallback values
};

const FloodWaitCounterStub = {
  provide: 'FloodWaitCounter',
  useValue: null, // HealthController handles null case gracefully
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
 * Note: TelegramClientManager and FloodWaitCounter are stub providers.
 * They will be replaced with actual implementations when the MTProto layer
 * is integrated into the ingestion service.
 *
 * @module HealthModule
 */
@Module({
  imports: [StreamModule], // For SSE client count metrics
  controllers: [HealthController],
  providers: [TelegramClientManagerStub, FloodWaitCounterStub],
})
export class HealthModule {}

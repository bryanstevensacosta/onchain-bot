import { Module } from '@nestjs/common';
import { HealthController } from './api/http/health.controller';
import { StreamModule } from 'stream/stream.module';

/**
 * HealthModule provides health check and monitoring endpoints
 *
 * Per Requirement 5.1, 5.2: Health endpoints for monitoring
 * Per Requirement 5.3: Channel metadata endpoint
 *
 * Controllers:
 * - HealthController: GET /api/health, /api/health/ready, /api/health/live
 *
 * @module HealthModule
 */
@Module({
  imports: [StreamModule], // For SSE client count metrics
  controllers: [HealthController],
})
export class HealthModule {}

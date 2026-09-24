import { Module } from '@nestjs/common';
import { HealthController } from './api/http/health.controller';

/**
 * HealthModule - exposes GET /api/health (static skeleton shape).
 */
@Module({
  controllers: [HealthController],
})
export class HealthModule {}

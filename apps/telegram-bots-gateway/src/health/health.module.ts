import { Module } from '@nestjs/common';
import { HealthController } from './api/http/health.controller';

@Module({
  controllers: [HealthController],
})
export class HealthModule {}

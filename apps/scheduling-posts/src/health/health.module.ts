import { Module } from '@nestjs/common';
import { SchedulingModule } from 'scheduling/scheduling.module';
import { ScheduledPostsModule } from 'scheduled-posts/scheduled-posts.module';
import { TelegramModule } from 'telegram/telegram.module';
import { HealthController } from './api/http/health.controller';

/**
 * Composite health imports the feature modules so their P21
 * indicators resolve in scope (all @Optional in the controller —
 * health never crashes when a module is absent).
 */
@Module({
  imports: [SchedulingModule, ScheduledPostsModule, TelegramModule],
  controllers: [HealthController],
})
export class HealthModule {}

import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { FeedThreadsController } from './api/http/feed-threads.controller';
import { FeedThreadsHealthIndicator } from './health/feed-threads-health.indicator';

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [FeedThreadsController],
  providers: [FeedThreadsHealthIndicator],
  exports: [FeedThreadsHealthIndicator],
})
export class FeedThreadsModule {}

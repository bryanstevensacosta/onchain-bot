import { Module } from '@nestjs/common';
import { HealthController } from './api/http/health.controller';
import { ThreadsModule } from 'threads/threads.module';
import { FeedThreadsModule } from 'feed-threads/feed-threads.module';
import { TelegramModule } from 'telegram/telegram.module';

@Module({
  imports: [ThreadsModule, FeedThreadsModule, TelegramModule],
  controllers: [HealthController],
})
export class HealthModule {}

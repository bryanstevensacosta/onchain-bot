import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { isDatabaseEnabled } from 'shared/common/persistence/database.module';
import {
  MessageFormatterPort,
  TelegramPublisherPort,
} from 'telegram/shared';
import { VipCallsBotApiPublisherAdapter } from '../shared/infrastructure/senders/bot-api-telegram-publisher.adapter';
import { VipCallsMessageFormatterAdapter } from '../vip-channel/infrastructure/formatters/vip-message-formatter.adapter';
import { VipAchievementRepository } from './application/ports/vip-achievement.repository';
import { VipAchievementEntity } from './infrastructure/persistence/typeorm/entities/vip-achievement.entity';
import { TypeormVipAchievementRepository } from './infrastructure/persistence/typeorm/repositories/typeorm-vip-achievement.repository';
import { InMemoryVipAchievementRepository } from './infrastructure/repositories/in-memory-vip-achievement.repository';
import { InProcessVipAchievementEventPublisher } from './infrastructure/messaging/in-process-vip-achievement-event.publisher';
import { AchievementReachedHandler } from './infrastructure/event-bus/achievement-reached.handler';

/**
 * NestJS module for the `vip-achievement` sub-BC under `telegram/vip-calls/`.
 *
 * Wires:
 *   - the persistence port (`VipAchievementRepository`) with a TypeORM adapter
 *     when `DATABASE_ENABLED=true`, otherwise the in-memory adapter,
 *   - the `MessageFormatterPort` and `TelegramPublisherPort` bindings (shared
 *     with vip-channel so milestone messages go through the same Bot API
 *     publisher + Markdown formatter),
 *   - the in-process event publisher used by future emitters inside this BC,
 *   - the `AchievementReachedHandler` that listens for
 *     `CallAchievementReachedEvent` and posts the milestone message to the
 *     VIP channel.
 *
 * The handler is intentionally wired HERE rather than in `vip-channel.module`
 * — milestone notifications belong to the BC that owns the
 * `vip_notified_achievements` table. Wave 4 of the refactor removes the
 * handler registration from `vip-channel.module`.
 */
@Module({
  imports: [
    HttpModule,
    TypeOrmModule.forFeature([VipAchievementEntity]),
  ],
  controllers: [],
  providers: [
    InMemoryVipAchievementRepository,
    ...(isDatabaseEnabled() ? [TypeormVipAchievementRepository] : []),
    {
      provide: VipAchievementRepository,
      inject: [
        ...(isDatabaseEnabled()
          ? [TypeormVipAchievementRepository]
          : [InMemoryVipAchievementRepository]),
      ],
      useFactory: (
        repo: VipAchievementRepository,
      ): VipAchievementRepository => repo,
    },
    InProcessVipAchievementEventPublisher,
    AchievementReachedHandler,
    VipCallsBotApiPublisherAdapter,
    VipCallsMessageFormatterAdapter,
    {
      provide: MessageFormatterPort,
      useClass: VipCallsMessageFormatterAdapter,
    },
    {
      provide: TelegramPublisherPort,
      useClass: VipCallsBotApiPublisherAdapter,
    },
  ],
  exports: [
    VipAchievementRepository,
    MessageFormatterPort,
    TelegramPublisherPort,
  ],
})
export class VipAchievementModule {}
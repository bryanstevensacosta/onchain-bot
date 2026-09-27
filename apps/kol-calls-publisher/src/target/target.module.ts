import { Global, Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TelegramModule } from '../telegram/telegram.module';
import { TargetDispatcherPort } from './application/ports/target-dispatcher.port';
import { TargetDispatcherService } from './application/services/target-dispatcher.service';
import { ThreadsPublisherHttpClient } from './infrastructure/threads/threads-publisher-http-client';
import { TargetHealthIndicator } from './health/target-health.indicator';

/**
 * TargetModule (threads-publisher plan Fase 2 todo 10, P38-bis).
 *
 * The canonical delivery surface for kol-calls publishing:
 * `target = bot telegram via gateway OR publisher threads`
 * (per-binding choice). `TargetDispatcherService` (bound to
 * `TargetDispatcherPort`) routes `telegram` bindings through the
 * telegram-bots-gateway (vault id only) and `threads` bindings to
 * `apps/threads-publisher` over HTTP. Templates reference targets
 * via `PublishingTemplate.targetBindings()`; the telegram leg stays
 * on the deprecated `TelegramModule` dual path until
 * threads-publisher todo 11 removes it.
 *
 * `TelegramModule` is imported (cycle-safe, no forwardRef needed —
 * it already depends on Templates/Approval, not on target) ONLY for
 * the gateway sender + vault-id mapping — callers import the legacy
 * ports through `src/target/telegram-ports.ts`, never directly.
 */
@Global()
@Module({
  imports: [ConfigModule, forwardRef(() => TelegramModule)],
  providers: [
    TargetDispatcherService,
    ThreadsPublisherHttpClient,
    TargetHealthIndicator,
    {
      provide: TargetDispatcherPort,
      useClass: TargetDispatcherService,
    },
  ],
  exports: [
    TargetDispatcherPort,
    TargetDispatcherService,
    ThreadsPublisherHttpClient,
    TargetHealthIndicator,
  ],
})
export class TargetModule {}

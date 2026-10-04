import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TargetDispatcherPort } from './application/ports/target-dispatcher.port';
import { TargetDispatcherService } from './application/services/target-dispatcher.service';
import { ThreadsPublisherHttpClient } from './infrastructure/threads/threads-publisher-http-client';
import { TargetHealthIndicator } from './health/target-health.indicator';
import { BotsGatewaySenderPort } from '../telegram/domain/ports/bots-gateway-sender.port';
import { GatewaySendClient } from '../telegram/infrastructure/gateway/gateway-send-client.service';
import { GatewayBotMappingService } from '../telegram/infrastructure/gateway/gateway-bot-mapping.service';

/**
 * TargetModule (threads-publisher plan Fase 2 todo 10, P38-bis).
 *
 * The canonical delivery surface for feed publishing: `target = bot
 * telegram via gateway OR publisher threads` (per-binding choice).
 * `TargetDispatcherService` (bound to `TargetDispatcherPort`) routes
 * `telegram` bindings through the telegram-bots-gateway (vault id
 * only) and `threads` bindings to `apps/threads-publisher` over HTTP.
 * Per-binding pacing (P38 delay + daily cap per link) lives on the
 * binding; sessions/templates operate those links live.
 *
 * Migration status: `src/telegram/` + `src/threads/` are deprecated
 * (dual-leg only, removed at threads-publisher todo 11). New callers
 * import ONLY from `src/target/`; the migrated callers are
 * sessions (planner + explicit publish), queue (drain dispatcher)
 * and template bot bindings. The gateway sender + vault-id
 * mapping are provided here directly (no `TelegramModule` import) —
 * no direct adapter imports.
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    TargetDispatcherService,
    ThreadsPublisherHttpClient,
    TargetHealthIndicator,
    GatewaySendClient,
    GatewayBotMappingService,
    {
      provide: TargetDispatcherPort,
      useClass: TargetDispatcherService,
    },
    {
      provide: BotsGatewaySenderPort,
      useClass: GatewaySendClient,
    },
  ],
  exports: [
    TargetDispatcherPort,
    TargetDispatcherService,
    ThreadsPublisherHttpClient,
    TargetHealthIndicator,
    BotsGatewaySenderPort,
    GatewayBotMappingService,
  ],
})
export class TargetModule {}

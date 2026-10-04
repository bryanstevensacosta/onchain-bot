import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SchedulingGatewaySenderPort } from './domain/ports/scheduling-gateway-sender.port';
import { GatewayHmacSigner } from './infrastructure/gateway/gateway-hmac-signer.service';
import { GatewaySendClient } from './infrastructure/gateway/gateway-send-client.service';
import { GatewayBotMappingService } from './infrastructure/gateway/gateway-bot-mapping.service';
import { DualSendParityService } from './application/services/dual-send-parity.service';
import { SchedulingGatewayDispatcher } from './application/dispatch/scheduling-gateway.dispatcher';
import { TelegramHealthIndicator } from './health/telegram-health.indicator';
import { TelegramParityController } from './api/http/telegram-parity.controller';

/**
 * TelegramModule (todos 1-2, P42).
 *
 * Gateway-ONLY transport: HMAC signer + send client (vault `botId`,
 * never a token) + local→vault bot mapping + outcome parity ledger +
 * the LIVE `ScheduledAdDispatcherPort` binding (via
 * `SchedulingGatewayDispatcher`, provided here so `SchedulingModule`
 * stays cycle-free) + parity reads + P21 health hook. There are no
 * Bot API adapters in this app — do not add any.
 */
@Module({
  imports: [ConfigModule],
  controllers: [TelegramParityController],
  providers: [
    GatewayHmacSigner,
    GatewaySendClient,
    GatewayBotMappingService,
    DualSendParityService,
    SchedulingGatewayDispatcher,
    TelegramHealthIndicator,
    {
      provide: SchedulingGatewaySenderPort,
      useClass: GatewaySendClient,
    },
  ],
  exports: [
    SchedulingGatewaySenderPort,
    SchedulingGatewayDispatcher,
    GatewayBotMappingService,
    DualSendParityService,
    TelegramHealthIndicator,
  ],
})
export class TelegramModule {}

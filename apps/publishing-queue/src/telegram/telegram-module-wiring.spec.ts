import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { TelegramModule } from './telegram.module';
import { SchedulingGatewaySenderPort } from './domain/ports/scheduling-gateway-sender.port';
import { GatewaySendClient } from './infrastructure/gateway/gateway-send-client.service';
import { GatewayHmacSigner } from './infrastructure/gateway/gateway-hmac-signer.service';
import { GatewayBotMappingService } from './infrastructure/gateway/gateway-bot-mapping.service';
import { DualSendParityService } from './application/services/dual-send-parity.service';
import { SchedulingGatewayDispatcher } from './application/dispatch/scheduling-gateway.dispatcher';
import { TelegramHealthIndicator } from './health/telegram-health.indicator';
import { TelegramParityController } from './api/http/telegram-parity.controller';

describe('TelegramModule', () => {
  it('wires the gateway-only graph: sender + mapping + parity + dispatcher (todos 1-2)', async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        TelegramModule,
      ],
    }).compile();
    expect(module.get(TelegramModule)).toBeDefined();
    expect(module.get(SchedulingGatewaySenderPort)).toBeInstanceOf(
      GatewaySendClient,
    );
    expect(module.get(GatewayHmacSigner)).toBeDefined();
    expect(module.get(GatewaySendClient)).toBeDefined();
    expect(module.get(GatewayBotMappingService)).toBeDefined();
    expect(module.get(DualSendParityService)).toBeDefined();
    expect(module.get(SchedulingGatewayDispatcher)).toBeDefined();
    expect(module.get(TelegramHealthIndicator)).toBeDefined();
    expect(module.get(TelegramParityController)).toBeDefined();
    const health = await module.get(TelegramHealthIndicator).check();
    expect(health).toEqual({ component: 'telegram', status: 'up' });
    await module.close();
  });
});

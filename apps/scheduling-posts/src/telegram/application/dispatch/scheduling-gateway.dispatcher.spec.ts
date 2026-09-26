import type { ConfigService } from '@nestjs/config';
import { SchedulingGatewayDispatcher } from './scheduling-gateway.dispatcher';
import { GatewaySendClient } from '../../infrastructure/gateway/gateway-send-client.service';
import { GatewayBotMappingService } from '../../infrastructure/gateway/gateway-bot-mapping.service';
import { DualSendParityService } from '../services/dual-send-parity.service';
import type { SchedulingGatewaySenderPort } from '../../domain/ports/scheduling-gateway-sender.port';
import { ScheduledAd } from 'scheduling/domain/scheduled-ad.entity';

function makeConfig(env: Record<string, string> = {}): ConfigService {
  return {
    get: (path: string, fallback = ''): unknown => env[path] ?? fallback,
  } as unknown as ConfigService;
}

function makeSender(
  result: { ok: boolean; messageId: number | null; error?: string },
): { sender: jest.Mocked<SchedulingGatewaySenderPort> } {
  const sender = {
    sendViaGateway: jest.fn().mockImplementation(() =>
      Promise.resolve({
        ok: result.ok,
        messageId: result.messageId,
        error: result.ok ? null : (result.error ?? 'gateway boom'),
      }),
    ),
  } as unknown as jest.Mocked<SchedulingGatewaySenderPort>;
  return { sender };
}

function ad(body = 'ad body'): ScheduledAd {
  return ScheduledAd.create({
    name: 'ad',
    body,
    format: 'text',
    buttons: [],
  });
}

describe('SchedulingGatewayDispatcher', () => {
  it('publishes text ads via the gateway and records parity (0 divergences)', async () => {
    const { sender } = makeSender({ ok: true, messageId: 777 });
    const parity = new DualSendParityService();
    const dispatcher = new SchedulingGatewayDispatcher(
      makeConfig({ CRYPTO_NEWS_OUTPUT_CHANNEL: '@news' }),
      sender,
      parity,
      new GatewayBotMappingService(),
    );
    const out = await dispatcher.publish(ad(), 'telegram');
    expect(out).toMatchObject({ ok: true, messageId: 777 });
    expect(parity.snapshot()).toMatchObject({ total: 1, diverged: 0 });
  });

  it('holds button ads enabled: incompatible shape skips parity, never a direct leg', async () => {
    const { sender } = makeSender({ ok: true, messageId: 1 });
    const parity = new DualSendParityService();
    const dispatcher = new SchedulingGatewayDispatcher(
      makeConfig({ CRYPTO_NEWS_OUTPUT_CHANNEL: '@news' }),
      sender,
      parity,
      new GatewayBotMappingService(),
    );
    const withButtons = ScheduledAd.create({
      name: 'ad',
      body: 'body',
      format: 'text',
      buttons: [{ text: 'b', url: 'https://example.com' }],
    });
    const out = await dispatcher.publish(withButtons, 'telegram');
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/not configured/);
    expect(parity.snapshot()).toMatchObject({ total: 1, diverged: 0 });
    expect(parity.snapshot().records[0].reasons.join(' ')).toMatch(/skipped/);
  });

  it('returns not-configured without sending when the channel is missing', async () => {
    const gateway = new GatewaySendClient();
    const sendSpy = jest.spyOn(gateway, 'sendViaGateway');
    const dispatcher = new SchedulingGatewayDispatcher(
      makeConfig({}),
      gateway,
      new DualSendParityService(),
      new GatewayBotMappingService(),
    );
    const out = await dispatcher.publish(ad(), 'telegram');
    expect(out).toMatchObject({ ok: false, messageId: null });
    expect(out.error).toMatch(/not configured/);
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it('publishes contract posts with the vault bot id and client_msg_id', async () => {
    const { sender } = makeSender({ ok: true, messageId: 42 });
    const mapping = new GatewayBotMappingService();
    mapping.register('bot_X', 'vault-9');
    const parity = new DualSendParityService();
    const dispatcher = new SchedulingGatewayDispatcher(
      makeConfig({}),
      sender,
      parity,
      mapping,
    );
    const out = await dispatcher.publishScheduledPost({
      postId: 'sp_01',
      botId: 'bot_X',
      chatId: '-100123',
      text: 'GM',
      clientMsgId: 'sp_01',
    });
    expect(out).toMatchObject({ ok: true, messageId: 42 });
    expect(sender.sendViaGateway).toHaveBeenCalledWith(
      expect.objectContaining({
        botId: 'vault-9',
        chatId: '-100123',
        kind: 'message',
        clientMsgId: 'sp_01',
      }),
    );
    expect(parity.snapshot()).toMatchObject({ total: 1, diverged: 0 });
  });
});

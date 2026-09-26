import { GatewaySessionPublisher } from './gateway-session-publisher.adapter';
import type { SessionPublishPlan } from '../../application/ports/session-publisher.port';

function makeGateway(result: { ok: boolean }): {
  gateway: {
    sendViaGateway: jest.Mock;
  };
  plans: SessionPublishPlan[];
} {
  const plans: SessionPublishPlan[] = [];
  const gateway = {
    sendViaGateway: jest
      .fn()
      .mockImplementation(
        (input: { botId: string; chatId: string; text: string }) => {
          plans.push({
            sessionId: 's1',
            target: 'telegram',
            botId: input.botId,
            chatId: input.chatId,
            mode: 'raw',
            content: input.text,
          });
          return Promise.resolve(
            result.ok
              ? { ok: true, messageId: 777, error: null }
              : { ok: false, messageId: null, error: 'gateway boom' },
          );
        },
      ),
  };
  return { gateway, plans };
}

describe('GatewaySessionPublisher', () => {
  it('resolves the vault id before sending (sessions keep working)', async () => {
    const { gateway } = makeGateway({ ok: true });
    const mapping = {
      resolveGatewayId: jest.fn().mockReturnValue('vault-bot-9'),
    };
    const publisher = new GatewaySessionPublisher(
      gateway as unknown as import('../../../telegram/domain/ports/bots-gateway-sender.port').BotsGatewaySenderPort,
      mapping as unknown as import('../../../telegram/infrastructure/gateway/gateway-bot-mapping.service').GatewayBotMappingService,
    );
    await publisher.publish({
      sessionId: 's1',
      target: 'telegram',
      botId: 'local-bot-9',
      chatId: '@c',
      mode: 'raw',
      content: 'hello session',
    });
    expect(mapping.resolveGatewayId).toHaveBeenCalledWith('local-bot-9');
    expect(gateway.sendViaGateway).toHaveBeenCalledWith(
      expect.objectContaining({
        botId: 'vault-bot-9',
        chatId: '@c',
        kind: 'message',
        text: 'hello session',
      }),
    );
  });

  it('fail-closes gateway errors with a throw (audited upstream)', async () => {
    const { gateway } = makeGateway({ ok: false });
    const publisher = new GatewaySessionPublisher(
      gateway as unknown as import('../../../telegram/domain/ports/bots-gateway-sender.port').BotsGatewaySenderPort,
    );
    await expect(
      publisher.publish({
        sessionId: 's1',
        target: 'telegram',
        botId: 'local-bot-9',
        chatId: '@c',
        mode: 'raw',
        content: 'hello session',
      }),
    ).rejects.toThrow('gateway boom');
  });

  it('fail-closes when the gateway client is unwired', async () => {
    const publisher = new GatewaySessionPublisher();
    await expect(
      publisher.publish({
        sessionId: 's1',
        target: 'telegram',
        botId: 'b',
        chatId: '@c',
        mode: 'raw',
        content: 'hi',
      }),
    ).rejects.toThrow('unwired');
  });
});

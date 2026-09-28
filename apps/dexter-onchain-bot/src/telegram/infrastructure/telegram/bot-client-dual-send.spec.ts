import { TelegramBotClient } from './bot-client';
import { GatewayBotMappingService } from '../gateway/gateway-bot-mapping.service';
import { DualSendParityService } from '@/telegram/application/services/dual-send-parity.service';

function makeClient(opts: {
  botVaultId?: string;
  gatewayOk?: boolean;
  mapDexter?: string;
}) {
  const post = jest.fn();
  const httpService = { post };
  const botConfig = {
    get: () => ({
      botToken: 'DIRECT-TOK',
      sendMode: 'gateway',
      botVaultId: opts.botVaultId ?? 'vault-9',
    }),
  };
  const gateway = {
    sendViaGateway: jest
      .fn()
      .mockImplementation(async () =>
        opts.gatewayOk === false
          ? { ok: false, messageId: null, error: 'Unauthorized' }
          : { ok: true, messageId: 77, error: null },
      ),
  };
  const mapping = new GatewayBotMappingService();
  if (opts.mapDexter) mapping.register('dexter', opts.mapDexter);
  const parity = new DualSendParityService();
  const client = new TelegramBotClient(
    {} as never,
    httpService as never,
    botConfig as never,
    gateway as never,
    mapping,
    parity,
  );
  return { client, post, gateway, parity };
}

describe('TelegramBotClient gateway-only (exclusive gateway)', () => {
  it('sendMessage goes only through the gateway vault id (token never travels)', async () => {
    const { client, post, gateway } = makeClient({});
    const out = await client.sendMessage(42, 'SCAN $SOL');
    expect(out).toEqual({ ok: true, messageId: 77, error: null });
    expect(post).not.toHaveBeenCalled();
    expect(gateway.sendViaGateway).toHaveBeenCalledTimes(1);
    const leg = gateway.sendViaGateway.mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(leg.botId).toBe('vault-9');
    expect(leg.chatId).toBe('42');
    expect(JSON.stringify(leg)).not.toContain('DIRECT-TOK');
  });

  it('prefers the mapped vault id over the configured one', async () => {
    const { client, gateway } = makeClient({ mapDexter: 'vault-mapped' });
    await client.sendMessage(42, 'SCAN');
    const leg = gateway.sendViaGateway.mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(leg.botId).toBe('vault-mapped');
  });

  it('fails closed without a vault id', async () => {
    const { client, post, gateway } = makeClient({ botVaultId: '' });
    const out = await client.sendMessage(42, 'SCAN');
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/vault/);
    expect(post).not.toHaveBeenCalled();
    expect(gateway.sendViaGateway).not.toHaveBeenCalled();
  });

  it('drops keyboard shapes and sends text-only via gateway', async () => {
    const { client, post, gateway } = makeClient({});
    const out = await client.sendMessage(42, 'CARD', {
      reply_markup: { inline_keyboard: [] },
    });
    expect(out.ok).toBe(true);
    expect(post).not.toHaveBeenCalled();
    expect(gateway.sendViaGateway).toHaveBeenCalledTimes(1);
  });
});

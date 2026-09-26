import { of } from 'rxjs';
import { ConflictException } from '@nestjs/common';
import { TelegramBotClient } from './bot-client';
import { GatewayBotMappingService } from '../gateway/gateway-bot-mapping.service';
import { DualSendParityService } from '../../application/services/dual-send-parity.service';

function makeClient(opts: {
  sendMode: 'direct' | 'dual' | 'gateway';
  botVaultId?: string;
  directOk?: boolean;
  gatewayOk?: boolean;
  mapDexter?: string;
}) {
  const post = jest.fn().mockImplementation(() =>
    of({
      data:
        opts.directOk === false
          ? { ok: false, description: 'Unauthorized' }
          : { ok: true, result: { message_id: 11 } },
    }),
  );
  const httpService = { post };
  const botConfig = {
    get: () => ({
      botToken: 'DIRECT-TOK',
      sendMode: opts.sendMode,
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

describe('TelegramBotClient dual-send (dexter gateway todo 6)', () => {
  it('dual returns the direct leg and records parity', async () => {
    const { client, post, gateway, parity } = makeClient({ sendMode: 'dual' });
    const out = await client.sendMessage(42, 'SCAN $SOL');
    expect(out).toEqual({ ok: true, messageId: 11, error: null });
    expect(post).toHaveBeenCalledTimes(1);
    expect(gateway.sendViaGateway).toHaveBeenCalledTimes(1);
    const leg = gateway.sendViaGateway.mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(leg.botId).toBe('vault-9');
    expect(leg.chatId).toBe('42');
    expect(JSON.stringify(leg)).not.toContain('DIRECT-TOK');
    expect(parity.snapshot()).toMatchObject({ total: 1, diverged: 0 });
    expect(() => parity.assertNoDivergence()).not.toThrow();
  });

  it('dual prefers the mapped vault id over the configured one', async () => {
    const { client, gateway } = makeClient({
      sendMode: 'dual',
      mapDexter: 'vault-mapped',
    });
    await client.sendMessage(42, 'SCAN');
    const leg = gateway.sendViaGateway.mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(leg.botId).toBe('vault-mapped');
  });

  it('dual skips the gateway leg for keyboard shapes (direct-only)', async () => {
    const { client, gateway, parity } = makeClient({ sendMode: 'dual' });
    const out = await client.sendMessage(42, 'CARD', {
      reply_markup: { inline_keyboard: [] },
    });
    expect(out).toEqual({ ok: true, messageId: 11, error: null });
    expect(gateway.sendViaGateway).not.toHaveBeenCalled();
    expect(parity.snapshot()).toMatchObject({ total: 1, diverged: 0 });
  });

  it('dual records divergence when legs disagree', async () => {
    const { client, parity } = makeClient({
      sendMode: 'dual',
      gatewayOk: false,
    });
    const out = await client.sendMessage(42, 'SCAN');
    expect(out.ok).toBe(true);
    expect(parity.snapshot()).toMatchObject({ total: 1, diverged: 1 });
    expect(() => parity.assertNoDivergence()).toThrow(ConflictException);
  });

  it('gateway mode never touches the direct token', async () => {
    const { client, post, gateway } = makeClient({ sendMode: 'gateway' });
    const out = await client.sendMessage(42, 'SCAN $SOL');
    expect(out).toEqual({ ok: true, messageId: 77, error: null });
    expect(post).not.toHaveBeenCalled();
    expect(gateway.sendViaGateway).toHaveBeenCalledTimes(1);
  });

  it('gateway mode fails closed without a vault id', async () => {
    const { client, post, gateway } = makeClient({
      sendMode: 'gateway',
      botVaultId: '',
    });
    const out = await client.sendMessage(42, 'SCAN');
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/vault/);
    expect(post).not.toHaveBeenCalled();
    expect(gateway.sendViaGateway).not.toHaveBeenCalled();
  });

  it('gateway mode fails closed for keyboard shapes', async () => {
    const { client, post } = makeClient({ sendMode: 'gateway' });
    const out = await client.sendMessage(42, 'CARD', {
      reply_markup: { inline_keyboard: [] },
    });
    expect(out.ok).toBe(false);
    expect(post).not.toHaveBeenCalled();
  });

  it('direct mode keeps the legacy single-leg path', async () => {
    const { client, post, gateway, parity } = makeClient({
      sendMode: 'direct',
    });
    const out = await client.sendMessage(42, 'SCAN');
    expect(out).toEqual({ ok: true, messageId: 11, error: null });
    expect(post).toHaveBeenCalledTimes(1);
    expect(gateway.sendViaGateway).not.toHaveBeenCalled();
    expect(parity.snapshot().total).toBe(0);
  });
});

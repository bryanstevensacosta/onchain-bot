import { CallParsedHandler } from 'token/normalization/infrastructure/event-bus/call-parsed.handler';
import { CallParsedEvent } from 'token/intake/parsing/domain/events/call-parsed.event';

describe('CallParsedHandler', () => {
  const FIXED_DATE = new Date('2026-01-01T00:00:00Z');
  const EVM = '0xabcdef0123456789abcdef0123456789abcdef01';

  it('calls normalize.execute with reconstructed input', async () => {
    const execute = jest.fn().mockResolvedValue(null);
    const handler = new CallParsedHandler({ execute });

    const event = new CallParsedEvent({
      kolId: 'chan-A',
      messageId: 7,
      occurredAt: FIXED_DATE,
      contractAddress: EVM,
      contractChainHint: 'evm',
      ticker: 'WIF',
      name: 'dogwifhat',
      marketCapUsd: 180_000,
      liquidityUsd: 45_000,
      fdvUsd: null,
      holders: 1230,
      chart: 'https://dexscreener.com/x',
      confidence: 0.9,
    });

    await handler.handle(event);

    expect(execute).toHaveBeenCalledTimes(1);
    const calls = execute.mock.calls as Array<[unknown]>;
    const arg = calls[0][0] as Record<string, unknown>;
    expect(arg.chainHint).toBe('evm');
    expect(arg.addressRaw).toBe(EVM);
    expect(arg.ticker).toBe('WIF');
    expect(arg.name).toBe('dogwifhat');
    expect(arg.kolId).toBe('chan-A');
    expect(arg.messageId).toBe(7);
    expect(arg.occurredAt).toBe(FIXED_DATE);
  });

  it('absorbs errors thrown by the use case', async () => {
    const execute = jest.fn().mockRejectedValue(new Error('boom'));
    const handler = new CallParsedHandler({ execute });

    const event = new CallParsedEvent({
      kolId: 'chan-A',
      messageId: 7,
      occurredAt: FIXED_DATE,
      contractAddress: EVM,
      contractChainHint: 'evm',
      ticker: null,
      name: null,
      marketCapUsd: null,
      liquidityUsd: null,
      fdvUsd: null,
      holders: null,
      chart: null,
      confidence: 0.5,
    });

    await expect(handler.handle(event)).resolves.toBeUndefined();
  });
});

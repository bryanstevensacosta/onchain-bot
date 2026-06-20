import { CallNormalizedHandler } from 'ca/chain-detection/infrastructure/event-bus/call-normalized.handler';
import { CallNormalizedEvent } from 'ca/normalization/domain/events/call-normalized.event';

describe('CallNormalizedHandler', () => {
  const FIXED_DATE = new Date('2026-01-01T00:00:00Z');
  const EVM = '0xabcdef0123456789abcdef0123456789abcdef01';

  it('skips when chain is already evm', async () => {
    const execute = jest.fn().mockResolvedValue(undefined);
    const handler = new CallNormalizedHandler({ execute } as never);

    const event = new CallNormalizedEvent({
      chain: 'evm',
      address: EVM,
      ticker: null,
      name: null,
      chart: null,
      marketCapUsd: null,
      liquidityUsd: null,
      fdvUsd: null,
      holders: null,
      sourceCount: 1,
      mentionCount: 1,
      firstSeenAt: FIXED_DATE,
      lastSeenAt: FIXED_DATE,
      confidence: 0.8,
    });

    await handler.handle(event);

    expect(execute).not.toHaveBeenCalled();
  });

  it('skips when chain is already solana', async () => {
    const execute = jest.fn().mockResolvedValue(undefined);
    const handler = new CallNormalizedHandler({ execute } as never);

    const event = new CallNormalizedEvent({
      chain: 'solana',
      address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      ticker: null,
      name: null,
      chart: null,
      marketCapUsd: null,
      liquidityUsd: null,
      fdvUsd: null,
      holders: null,
      sourceCount: 1,
      mentionCount: 1,
      firstSeenAt: FIXED_DATE,
      lastSeenAt: FIXED_DATE,
      confidence: 0.8,
    });

    await handler.handle(event);

    expect(execute).not.toHaveBeenCalled();
  });

  it('calls detect when chain is unsupported (e.g., sui)', async () => {
    const execute = jest.fn().mockResolvedValue(undefined);
    const handler = new CallNormalizedHandler({ execute } as never);

    const event = new CallNormalizedEvent({
      chain: 'sui',
      address: '0xnope',
      ticker: null,
      name: null,
      chart: null,
      marketCapUsd: null,
      liquidityUsd: null,
      fdvUsd: null,
      holders: null,
      sourceCount: 1,
      mentionCount: 1,
      firstSeenAt: FIXED_DATE,
      lastSeenAt: FIXED_DATE,
      confidence: 0.5,
    });

    await handler.handle(event);

    expect(execute).toHaveBeenCalledWith({ address: '0xnope' });
  });

  it('absorbs errors from the use case', async () => {
    const execute = jest.fn().mockRejectedValue(new Error('boom'));
    const handler = new CallNormalizedHandler({ execute } as never);

    const event = new CallNormalizedEvent({
      chain: 'sui',
      address: '0xnope',
      ticker: null,
      name: null,
      chart: null,
      marketCapUsd: null,
      liquidityUsd: null,
      fdvUsd: null,
      holders: null,
      sourceCount: 1,
      mentionCount: 1,
      firstSeenAt: FIXED_DATE,
      lastSeenAt: FIXED_DATE,
      confidence: 0.5,
    });

    await expect(handler.handle(event)).resolves.toBeUndefined();
  });
});

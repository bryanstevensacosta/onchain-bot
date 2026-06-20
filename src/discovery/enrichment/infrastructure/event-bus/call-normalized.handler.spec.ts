import { CallNormalizedHandler } from 'discovery/enrichment/infrastructure/event-bus/call-normalized.handler';
import { CallNormalizedEvent } from 'discovery/normalization/domain/events/call-normalized.event';

describe('CallNormalizedHandler', () => {
  const FIXED_DATE = new Date('2026-01-01T00:00:00Z');
  const EVM = '0xabcdef0123456789abcdef0123456789abcdef01';

  it('calls enrich for evm tokens', async () => {
    const execute = jest.fn().mockResolvedValue({ snapshot: {}, errors: [] });
    const handler = new CallNormalizedHandler({ execute } as never);

    const event = new CallNormalizedEvent({
      chain: 'evm',
      address: EVM,
      ticker: 'WIF',
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

    expect(execute).toHaveBeenCalledWith({ chain: 'evm', address: EVM });
  });

  it('calls enrich for solana tokens', async () => {
    const execute = jest.fn().mockResolvedValue({ snapshot: {}, errors: [] });
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

    expect(execute).toHaveBeenCalledWith({
      chain: 'solana',
      address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    });
  });

  it('skips for unsupported chains (e.g. sui)', async () => {
    const execute = jest.fn().mockResolvedValue({ snapshot: {}, errors: [] });
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

    expect(execute).not.toHaveBeenCalled();
  });

  it('absorbs errors thrown by the use case', async () => {
    const execute = jest.fn().mockRejectedValue(new Error('boom'));
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
      confidence: 0.5,
    });

    await expect(handler.handle(event)).resolves.toBeUndefined();
  });
});

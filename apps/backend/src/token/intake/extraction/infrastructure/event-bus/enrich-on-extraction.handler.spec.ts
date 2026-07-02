import { EnrichOnExtractionHandler } from './enrich-on-extraction.handler';
import { CandidatesExtractedEvent } from 'token/intake/extraction/domain/events/candidates-extracted.event';

describe('EnrichOnExtractionHandler', () => {
  const FIXED_DATE = new Date('2026-01-01T00:00:00Z');

  it('calls enrichToken.execute for each candidate contract address', async () => {
    const execute = jest.fn().mockResolvedValue({ snapshot: {}, errors: [] });
    const handler = new EnrichOnExtractionHandler({ execute } as never);

    const event = new CandidatesExtractedEvent({
      kolId: '12345',
      messageId: 67890,
      occurredAt: FIXED_DATE,
      contractAddresses: [
        {
          value: '0xabcdef0123456789abcdef0123456789abcdef01',
          chainHint: 'evm',
        },
        {
          value: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          chainHint: 'solana',
        },
      ],
      tickers: ['WIF'],
      urls: [],
    });

    await handler.handle(event);

    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute).toHaveBeenCalledWith({
      chain: 'evm',
      address: '0xabcdef0123456789abcdef0123456789abcdef01',
    });
    expect(execute).toHaveBeenCalledWith({
      chain: 'solana',
      address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    });
  });

  it('does NOT call enrichToken when there are no contract addresses', async () => {
    const execute = jest.fn().mockResolvedValue({ snapshot: {}, errors: [] });
    const handler = new EnrichOnExtractionHandler({ execute } as never);

    const event = new CandidatesExtractedEvent({
      kolId: '12345',
      messageId: 67890,
      occurredAt: FIXED_DATE,
      contractAddresses: [],
      tickers: [],
      urls: [],
    });

    await handler.handle(event);

    expect(execute).not.toHaveBeenCalled();
  });

  it('does NOT crash when one enrichment fails', async () => {
    const execute = jest
      .fn()
      .mockResolvedValueOnce({ snapshot: {}, errors: [] })
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ snapshot: {}, errors: [] });
    const handler = new EnrichOnExtractionHandler({ execute } as never);

    const event = new CandidatesExtractedEvent({
      kolId: '12345',
      messageId: 67890,
      occurredAt: FIXED_DATE,
      contractAddresses: [
        {
          value: '0x1111111111111111111111111111111111111111',
          chainHint: 'evm',
        },
        {
          value: '0x2222222222222222222222222222222222222222',
          chainHint: 'evm',
        },
        {
          value: '0x3333333333333333333333333333333333333333',
          chainHint: 'evm',
        },
      ],
      tickers: [],
      urls: [],
    });

    // Should NOT throw
    await expect(handler.handle(event)).resolves.toBeUndefined();

    // All three should still be called (Promise.allSettled)
    expect(execute).toHaveBeenCalledTimes(3);
  });

  it('absorbs errors thrown by the use case without crashing the pipeline', async () => {
    const execute = jest.fn().mockRejectedValue(new Error('boom'));
    const handler = new EnrichOnExtractionHandler({ execute } as never);

    const event = new CandidatesExtractedEvent({
      kolId: '12345',
      messageId: 67890,
      occurredAt: FIXED_DATE,
      contractAddresses: [
        {
          value: '0xabcdef0123456789abcdef0123456789abcdef01',
          chainHint: 'evm',
        },
      ],
      tickers: [],
      urls: [],
    });

    // Should NOT throw
    await expect(handler.handle(event)).resolves.toBeUndefined();
  });
});

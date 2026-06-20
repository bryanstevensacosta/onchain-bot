import { CandidatesExtractedHandler } from 'ca/parsing/infrastructure/event-bus/candidates-extracted.handler';
import { CandidatesExtractedEvent } from 'ca/extraction/domain/events/candidates-extracted.event';
import { ContractAddress } from 'ca/extraction/domain/value-objects/contract-address.vo';

describe('CandidatesExtractedHandler', () => {
  const FIXED_DATE = new Date('2026-01-01T00:00:00Z');
  const EVM = '0xabcdef0123456789abcdef0123456789abcdef01';
  const SOLANA = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

  it('calls use case with reconstructed ContractAddress VOs', async () => {
    const execute = jest.fn().mockResolvedValue(undefined);
    const handler = new CandidatesExtractedHandler({ execute } as never);

    const event = new CandidatesExtractedEvent({
      channelId: 'chan-1',
      messageId: 7,
      occurredAt: FIXED_DATE,
      rawText: 'PEPE 0xabc...',
      contractAddresses: [
        { value: EVM, chainHint: 'evm' },
        { value: SOLANA, chainHint: 'solana' },
      ],
      tickers: ['PEPE'],
      urls: [],
    });

    await handler.handle(event);

    expect(execute).toHaveBeenCalledTimes(1);
    const calls = execute.mock.calls as Array<[unknown]>;
    const arg = calls[0][0] as {
      channelId: string;
      messageId: number;
      rawText: string;
      contractAddresses: ContractAddress[];
    };
    expect(arg.channelId).toBe('chan-1');
    expect(arg.messageId).toBe(7);
    expect(arg.rawText).toBe('PEPE 0xabc...');
    expect(arg.contractAddresses).toHaveLength(2);
    expect(arg.contractAddresses[0]).toBeInstanceOf(ContractAddress);
    expect(arg.contractAddresses[0].chainHint.value).toBe('evm');
    expect(arg.contractAddresses[1].chainHint.value).toBe('solana');
  });

  it('skips events with no contract addresses', async () => {
    const execute = jest.fn().mockResolvedValue(undefined);
    const handler = new CandidatesExtractedHandler({ execute } as never);

    const event = new CandidatesExtractedEvent({
      channelId: 'chan-1',
      messageId: 7,
      occurredAt: FIXED_DATE,
      rawText: 'no CA here',
      contractAddresses: [],
      tickers: ['PEPE'],
      urls: [],
    });

    await handler.handle(event);

    expect(execute).not.toHaveBeenCalled();
  });

  it('absorbs NO_CONTRACT_ADDRESS errors silently', async () => {
    const execute = jest.fn().mockRejectedValue(
      Object.assign(new Error('no contract'), {
        code: 'NO_CONTRACT_ADDRESS',
      }),
    );
    const handler = new CandidatesExtractedHandler({ execute } as never);

    const event = new CandidatesExtractedEvent({
      channelId: 'chan-1',
      messageId: 7,
      occurredAt: FIXED_DATE,
      rawText: 'text',
      contractAddresses: [{ value: EVM, chainHint: 'evm' }],
      tickers: [],
      urls: [],
    });

    await expect(handler.handle(event)).resolves.toBeUndefined();
  });

  it('logs (does not throw) on unexpected errors', async () => {
    const execute = jest.fn().mockRejectedValue(new Error('boom'));
    const handler = new CandidatesExtractedHandler({ execute } as never);

    const event = new CandidatesExtractedEvent({
      channelId: 'chan-1',
      messageId: 7,
      occurredAt: FIXED_DATE,
      rawText: 'text',
      contractAddresses: [{ value: EVM, chainHint: 'evm' }],
      tickers: [],
      urls: [],
    });

    await expect(handler.handle(event)).resolves.toBeUndefined();
  });
});

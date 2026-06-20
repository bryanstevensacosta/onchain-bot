import { TokenScoredHandler } from 'discovery/filters/infrastructure/event-bus/token-scored.handler';
import { TokenScoredEvent } from 'discovery/scoring/domain/events/token-scored.event';

describe('TokenScoredHandler', () => {
  const FIXED_DATE = new Date('2026-01-01T00:00:00Z');
  const EVM = '0xabcdef0123456789abcdef0123456789abcdef01';

  it('calls apply.execute with reconstructed input', async () => {
    const execute = jest.fn().mockResolvedValue({});
    const handler = new TokenScoredHandler({ execute } as never);

    const event = new TokenScoredEvent({
      chain: 'ethereum',
      address: EVM,
      score: 75,
      tier: 'DECENT',
      classification: 'TOKEN',
      sourceCount: 2,
      mentionCount: 3,
      avgChannelReputation: 0.85,
      breakdown: [{ factor: 'LIQUIDITY_HIGH', delta: 20, note: 'x' }],
      scoredAt: FIXED_DATE,
    });

    await handler.handle(event);

    expect(execute).toHaveBeenCalledTimes(1);
    const calls = execute.mock.calls as Array<[unknown]>;
    const arg = calls[0][0] as Record<string, unknown>;
    expect(arg.chain).toBe('ethereum');
    expect(arg.address).toBe(EVM);
    expect(arg.score).toBe(75);
    expect(arg.classification).toBe('TOKEN');
  });

  it('absorbs errors thrown by the use case', async () => {
    const execute = jest.fn().mockRejectedValue(new Error('boom'));
    const handler = new TokenScoredHandler({ execute } as never);

    const event = new TokenScoredEvent({
      chain: 'ethereum',
      address: EVM,
      score: 30,
      tier: 'AVOID',
      classification: 'SCAM',
      sourceCount: 1,
      mentionCount: 1,
      avgChannelReputation: 0.5,
      breakdown: [],
      scoredAt: FIXED_DATE,
    });

    await expect(handler.handle(event)).resolves.toBeUndefined();
  });
});

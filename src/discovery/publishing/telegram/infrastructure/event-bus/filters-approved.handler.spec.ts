import { FiltersApprovedHandler } from 'discovery/publishing/telegram/infrastructure/event-bus/filters-approved.handler';
import { TokenFilteredEvent } from 'discovery/filters/domain/events/token-filtered.event';

describe('FiltersApprovedHandler', () => {
  const FIXED_DATE = new Date('2026-01-01T00:00:00Z');
  const EVM = '0xabcdef0123456789abcdef0123456789abcdef01';

  it('calls publish.execute with reconstructed input', async () => {
    const execute = jest.fn().mockResolvedValue({});
    const handler = new FiltersApprovedHandler({ execute } as never);

    const event = new TokenFilteredEvent({
      chain: 'ethereum',
      address: EVM,
      score: 75,
      classification: 'TOKEN',
      decidedAt: FIXED_DATE,
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
    const handler = new FiltersApprovedHandler({ execute } as never);

    const event = new TokenFilteredEvent({
      chain: 'ethereum',
      address: EVM,
      score: 75,
      classification: 'TOKEN',
      decidedAt: FIXED_DATE,
    });

    await expect(handler.handle(event)).resolves.toBeUndefined();
  });
});

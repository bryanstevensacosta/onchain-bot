import { TokenClassifiedHandler } from 'ca/scoring/infrastructure/event-bus/token-classified.handler';
import { TokenClassifiedEvent } from 'ca/classification/domain/events/token-classified.event';

describe('TokenClassifiedHandler', () => {
  const FIXED_DATE = new Date('2026-01-01T00:00:00Z');
  const EVM = '0xabcdef0123456789abcdef0123456789abcdef01';

  it('calls score with reconstructed input', async () => {
    const execute = jest.fn().mockResolvedValue(undefined);
    const handler = new TokenClassifiedHandler({ execute } as never);

    const event = new TokenClassifiedEvent({
      chain: 'ethereum',
      address: EVM,
      classification: 'TOKEN',
      confidence: 0.85,
      signals: [{ type: 'LOW_LIQUIDITY', severity: 'HIGH', description: 'x' }],
      riskWeight: 20,
      snapshotCompleteness: 0.8,
      classifiedAt: FIXED_DATE,
    });

    await handler.handle(event);

    expect(execute).toHaveBeenCalledTimes(1);
    const calls = execute.mock.calls as Array<[unknown]>;
    const arg = calls[0][0] as Record<string, unknown>;
    expect(arg.chain).toBe('ethereum');
    expect(arg.address).toBe(EVM);
    expect(arg.classification).toBe('TOKEN');
    expect(arg.signals).toHaveLength(1);
  });

  it('absorbs errors thrown by the use case', async () => {
    const execute = jest.fn().mockRejectedValue(new Error('boom'));
    const handler = new TokenClassifiedHandler({ execute } as never);

    const event = new TokenClassifiedEvent({
      chain: 'ethereum',
      address: EVM,
      classification: 'TOKEN',
      confidence: 0.5,
      signals: [],
      riskWeight: 0,
      snapshotCompleteness: 0.5,
      classifiedAt: FIXED_DATE,
    });

    await expect(handler.handle(event)).resolves.toBeUndefined();
  });
});

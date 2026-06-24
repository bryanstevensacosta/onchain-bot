import { TokenEnrichedHandler } from 'token/classification/infrastructure/event-bus/token-enriched.handler';
import { TokenEnrichedEvent } from 'chain/explorer/domain/events/token-enriched.event';

const FIXED_DATE = new Date('2026-01-01T00:00:00Z');
const EVM = '0xabcdef0123456789abcdef0123456789abcdef01';

function buildEvent(
  overrides: Partial<{
    name: string | null;
  }> = {},
): TokenEnrichedEvent {
  return new TokenEnrichedEvent({
    chain: 'ethereum',
    address: EVM,
    priceUsd: 0.0001,
    liquidityUsd: 50_000,
    volume24hUsd: 12_000,
    marketCapUsd: 100_000,
    fdvUsd: 1_000_000,
    priceChange24h: 5,
    holders: 1000,
    top10HolderPercent: 30,
    totalSupply: null,
    insidersPercent: null,
    bundlersPercent: null,
    devPercent: null,
    bondingPercent: null,
    factory: null,
    name: 'name' in overrides ? overrides.name : 'Pepe',
    imageUrls: [],
    lockedLiquidityPercent: null,
    burnedPercent: null,
    primaryPair: { address: 'p1', dexId: 'uniswap', quoteToken: 'USDC' },
    pairCount: 3,
    sources: ['dexscreener', 'geckoterminal'],
    completeness: 1,
    enrichedAt: FIXED_DATE,
  });
}

describe('TokenEnrichedHandler', () => {
  it('forwards event payload fields to classify.execute', async () => {
    const execute = jest.fn().mockResolvedValue({});
    const handler = new TokenEnrichedHandler({ execute } as never);

    await handler.handle(buildEvent());

    expect(execute).toHaveBeenCalledTimes(1);
    const arg = execute.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.chain).toBe('ethereum');
    expect(arg.address).toBe(EVM);
    expect(arg.hasPairs).toBe(true);
    expect(arg.pairCount).toBe(3);
    expect(arg.liquidityUsd).toBe(50_000);
    expect(arg.marketCapUsd).toBe(100_000);
    expect(arg.holders).toBe(1000);
    expect(arg.completeness).toBe(1);
  });

  it('sets hasName=true when event payload.name is non-empty', async () => {
    const execute = jest.fn().mockResolvedValue({});
    const handler = new TokenEnrichedHandler({ execute } as never);

    await handler.handle(buildEvent({ name: "Wendy's Mascot" }));

    const arg = execute.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.hasName).toBe(true);
  });

  it('sets hasName=false when event payload.name is null', async () => {
    const execute = jest.fn().mockResolvedValue({});
    const handler = new TokenEnrichedHandler({ execute } as never);

    await handler.handle(buildEvent({ name: null }));

    const arg = execute.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.hasName).toBe(false);
  });

  it('sets hasName=false when event payload.name is empty/whitespace', async () => {
    const execute = jest.fn().mockResolvedValue({});
    const handler = new TokenEnrichedHandler({ execute } as never);

    await handler.handle(buildEvent({ name: '   ' }));

    const arg = execute.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.hasName).toBe(false);
  });

  it('absorbs errors thrown by the use case', async () => {
    const execute = jest.fn().mockRejectedValue(new Error('boom'));
    const handler = new TokenEnrichedHandler({ execute } as never);

    const event = buildEvent({ name: null });

    await expect(handler.handle(event)).resolves.toBeUndefined();
  });
});

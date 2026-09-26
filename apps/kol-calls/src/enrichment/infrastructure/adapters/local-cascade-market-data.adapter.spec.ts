import {
  MarketData,
  MarketDataPort,
  emptyMarketData,
} from '../../domain/ports/market-data.port';
import { LocalCascadeMarketDataAdapter } from './local-cascade-market-data.adapter';

function data(partial: Partial<MarketData>): MarketData {
  return { ...emptyMarketData(), ...partial };
}

class StubPort extends MarketDataPort {
  public readonly name: string;
  public calls = 0;
  public constructor(
    name: string,
    private readonly behavior: MarketData | null | Error,
  ) {
    super();
    this.name = name;
  }
  public async fetch(): Promise<MarketData | null> {
    this.calls += 1;
    if (this.behavior instanceof Error) {
      throw this.behavior;
    }
    return this.behavior;
  }
}

describe('LocalCascadeMarketDataAdapter (default leaf, Tramo 1)', () => {
  it('no inner providers -> null without network (C-DATA-01: nothing moved)', async () => {
    const adapter = new LocalCascadeMarketDataAdapter([]);

    await expect(
      adapter.fetch('evm', `0x${'a'.repeat(40)}`),
    ).resolves.toBeNull();
  });

  it('provider down -> null + next in cascade', async () => {
    const down = new StubPort('down', new Error('boom'));
    const next = new StubPort('next', data({ priceUsd: 7 }));
    const adapter = new LocalCascadeMarketDataAdapter([down, next]);

    const result = await adapter.fetch('evm', `0x${'a'.repeat(40)}`);

    expect(next.calls).toBe(1);
    expect(result?.priceUsd).toBe(7);
  });

  it('first non-null wins, later providers untouched', async () => {
    const first = new StubPort('first', data({ priceUsd: 1 }));
    const second = new StubPort('second', data({ priceUsd: 2 }));
    const adapter = new LocalCascadeMarketDataAdapter([first, second]);

    const result = await adapter.fetch('evm', `0x${'a'.repeat(40)}`);

    expect(result?.priceUsd).toBe(1);
    expect(second.calls).toBe(0);
  });

  it('all null -> null (silent-null fallback)', async () => {
    const adapter = new LocalCascadeMarketDataAdapter([
      new StubPort('a', null),
      new StubPort('b', null),
    ]);

    await expect(
      adapter.fetch('evm', `0x${'a'.repeat(40)}`),
    ).resolves.toBeNull();
  });
});

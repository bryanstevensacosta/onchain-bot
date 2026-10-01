import { HeuristicParserAdapter } from './heuristic-parser.adapter';

describe('HeuristicParserAdapter', () => {
  const adapter = new HeuristicParserAdapter();

  it('prefers the explicit $TICKER over the labeled one', async () => {
    const fields = await adapter.parse({
      rawText: 'ape $BONK ticker: WIF',
    });
    expect(fields.ticker).toBe('BONK');
  });

  it('falls back to the labeled ticker', async () => {
    const fields = await adapter.parse({ rawText: 'ticker: WIF, gem' });
    expect(fields.ticker).toBe('WIF');
  });

  it('extracts the labeled name', async () => {
    const fields = await adapter.parse({ rawText: 'Name: Bonk Inu | mc $1M' });
    expect(fields.name).toBe('Bonk Inu');
  });

  it('extracts the first chart-host URL', async () => {
    const fields = await adapter.parse({
      rawText: 'see https://x.com/a and https://dexscreener.com/solana/abc',
    });
    expect(fields.chart).toBe('https://dexscreener.com/solana/abc');
  });

  it('yields nulls for unparseable text, never a throw', async () => {
    const fields = await adapter.parse({ rawText: 'gm frens' });
    expect(fields).toEqual({ ticker: null, name: null, chart: null });
  });
});

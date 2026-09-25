import { RegexExtractorAdapter } from './regex-extractor.adapter';

const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const WSOL = 'So11111111111111111111111111111111111111112';
const JUP = 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN';

const inputOf = (text: string) => ({
  kolId: 'kol-1',
  messageId: 1,
  occurredAt: new Date('2026-09-24T12:00:00.000Z'),
  text,
});

describe('RegexExtractorAdapter', () => {
  it('extracts EVM contracts lowercased, one entry per occurrence (no Map-dedupe)', async () => {
    const adapter = new RegexExtractorAdapter();
    const out = await adapter.extract(inputOf(`ape ${USDC} then ${USDC}`));

    expect(out.contractAddresses).toHaveLength(2);
    expect(out.contractAddresses[0].value).toBe(USDC.toLowerCase());
    expect(out.contractAddresses[1].value).toBe(USDC.toLowerCase());
  });

  it('extracts mixed EVM + Solana mentions in one message', async () => {
    const adapter = new RegexExtractorAdapter();
    const out = await adapter.extract(
      inputOf(`${USDC} ${WETH} sol plays ${WSOL} ${JUP}`),
    );

    expect(out.contractAddresses).toHaveLength(4);
    const hints = out.contractAddresses.map((c) => c.chainHint.value);
    expect(hints).toEqual(['evm', 'evm', 'solana', 'solana']);
  });

  it('rejects malformed addresses without throwing', async () => {
    const adapter = new RegexExtractorAdapter();
    const out = await adapter.extract(
      inputOf('bad 0x1234 and 0xZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ'),
    );

    expect(out.contractAddresses).toHaveLength(0);
  });

  it('extracts tickers with blocklist filtering, urls with trailing-punctuation strip', async () => {
    const adapter = new RegexExtractorAdapter();
    const out = await adapter.extract(
      inputOf('$PEPE BUY now https://dexscreener.com/solana/abc, t.me/alpha_x'),
    );

    expect(out.tickers.map((t) => t.value)).toContain('PEPE');
    expect(out.tickers.map((t) => t.value)).not.toContain('BUY');
    expect(out.urls.map((u) => u.value)).toContain(
      'https://dexscreener.com/solana/abc',
    );
    expect(out.urls.map((u) => u.scheme)).toContain('telegram');
  });

  it('empty text yields empty candidates', async () => {
    const adapter = new RegexExtractorAdapter();
    const out = await adapter.extract(inputOf(''));

    expect(out.contractAddresses).toHaveLength(0);
    expect(out.tickers).toHaveLength(0);
    expect(out.urls).toHaveLength(0);
  });
});

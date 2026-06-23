import { HeuristicParserAdapter } from 'token/intake/parsing/infrastructure/adapters/heuristic-parser.adapter';

describe('HeuristicParserAdapter', () => {
  let parser: HeuristicParserAdapter;
  const parse = (text: string) => parser.parse({ rawText: text });

  beforeEach(() => {
    parser = new HeuristicParserAdapter();
  });

  describe('Ticker extraction', () => {
    it('extracts $TICKER prefix', async () => {
      const { ticker } = await parse('🚀 $WIF pumping!');
      expect(ticker).toBe('WIF');
    });

    it('extracts Ticker: XYZ label', async () => {
      const { ticker } = await parse('Ticker: PEPE');
      expect(ticker).toBe('PEPE');
    });

    it('extracts Symbol: label', async () => {
      const { ticker } = await parse('Symbol = BONK');
      expect(ticker).toBe('BONK');
    });

    it('returns null when no ticker pattern matches', async () => {
      const { ticker } = await parse('random text without ticker');
      expect(ticker).toBeNull();
    });
  });

  describe('Name extraction', () => {
    it('extracts Name: label', async () => {
      const { name } = await parse('Name: dogwifhat | CA: 0xabc...');
      expect(name).toBe('dogwifhat');
    });

    it('extracts Token Name: label', async () => {
      const { name } = await parse('Token Name: PepeCoin');
      expect(name).toBe('PepeCoin');
    });

    it('returns null when no name label exists', async () => {
      const { name } = await parse('CA: 0xabc...');
      expect(name).toBeNull();
    });
  });

  describe('Market Cap extraction', () => {
    it('parses MC: $180K', async () => {
      const { metrics } = await parse('MC: $180K');
      expect(metrics.marketCapUsd).toBe(180_000);
    });

    it('parses MC: 1.2M', async () => {
      const { metrics } = await parse('MC: 1.2M');
      expect(metrics.marketCapUsd).toBe(1_200_000);
    });

    it('parses Market Cap: $2.5B', async () => {
      const { metrics } = await parse('Market Cap: $2.5B');
      expect(metrics.marketCapUsd).toBe(2_500_000_000);
    });

    it('parses mcap abbreviation', async () => {
      const { metrics } = await parse('mcap 500k usd');
      expect(metrics.marketCapUsd).toBe(500_000);
    });

    it('parses comma-separated values', async () => {
      const { metrics } = await parse('MC: $180,000');
      expect(metrics.marketCapUsd).toBe(180_000);
    });

    it('returns null when no MC pattern matches', async () => {
      const { metrics } = await parse('CA: 0xabc...');
      expect(metrics.marketCapUsd).toBeNull();
    });
  });

  describe('Liquidity extraction', () => {
    it('parses LP: $45K', async () => {
      const { metrics } = await parse('LP: $45K');
      expect(metrics.liquidityUsd).toBe(45_000);
    });

    it('parses Liq: 100k', async () => {
      const { metrics } = await parse('Liq: 100k');
      expect(metrics.liquidityUsd).toBe(100_000);
    });

    it('parses Liquidity: $1.2M', async () => {
      const { metrics } = await parse('Liquidity: $1.2M');
      expect(metrics.liquidityUsd).toBe(1_200_000);
    });

    it('does not confuse MC with LP', async () => {
      const { metrics } = await parse('MC: $180K | LP: $45K');
      expect(metrics.marketCapUsd).toBe(180_000);
      expect(metrics.liquidityUsd).toBe(45_000);
    });
  });

  describe('FDV extraction', () => {
    it('parses FDV: $2.5M', async () => {
      const { metrics } = await parse('FDV: $2.5M');
      expect(metrics.fdvUsd).toBe(2_500_000);
    });

    it('returns null when no FDV', async () => {
      const { metrics } = await parse('MC: $180K');
      expect(metrics.fdvUsd).toBeNull();
    });
  });

  describe('Holders extraction', () => {
    it('parses Holders: 1,230', async () => {
      const { metrics } = await parse('Holders: 1,230');
      expect(metrics.holders).toBe(1230);
    });

    it('parses H: 1.2k', async () => {
      const { metrics } = await parse('H: 1.2k');
      expect(metrics.holders).toBe(1200);
    });

    it('parses HODLERS: 500', async () => {
      const { metrics } = await parse('HODLERS: 500');
      expect(metrics.holders).toBe(500);
    });
  });

  describe('Chart URL extraction', () => {
    it('extracts dexscreener URL', async () => {
      const { chart } = await parse(
        'chart: https://dexscreener.com/solana/abc',
      );
      expect(chart).toBe('https://dexscreener.com/solana/abc');
    });

    it('extracts geckoterminal URL', async () => {
      const { chart } = await parse(
        'https://www.geckoterminal.com/eth/pairs/xyz',
      );
      expect(chart).toBe('https://www.geckoterminal.com/eth/pairs/xyz');
    });

    it('extracts dexscreener among multiple URLs', async () => {
      const { chart } = await parse(
        't.me/spydefi https://x.com/post https://dexscreener.com/solana/abc',
      );
      expect(chart).toBe('https://dexscreener.com/solana/abc');
    });

    it('returns null when no chart URL is present', async () => {
      const { chart } = await parse('https://t.me/somegroup');
      expect(chart).toBeNull();
    });
  });

  describe('Realistic Telegram alpha message', () => {
    it('parses all fields from a complete alpha call', async () => {
      const text = `🚀 ALPHA: $WIF

Name: dogwifhat
MC: $180K
LP: $45K
FDV: $1.8M
Holders: 1,230
CA: 0xabcdef0123456789abcdef0123456789abcdef01
Chart: https://dexscreener.com/solana/abc
TG: t.me/SpyDefi`;

      const result = await parser.parse({ rawText: text });

      expect(result.ticker).toBe('WIF');
      expect(result.name).toBe('dogwifhat');
      expect(result.metrics.marketCapUsd).toBe(180_000);
      expect(result.metrics.liquidityUsd).toBe(45_000);
      expect(result.metrics.fdvUsd).toBe(1_800_000);
      expect(result.metrics.holders).toBe(1230);
      expect(result.chart).toBe('https://dexscreener.com/solana/abc');
    });

    it('returns nulls for messages with no parseable fields', async () => {
      const result = await parser.parse({
        rawText: 'just chatting about crypto',
      });
      expect(result.ticker).toBeNull();
      expect(result.name).toBeNull();
      expect(result.metrics.marketCapUsd).toBeNull();
      expect(result.chart).toBeNull();
    });

    it('handles empty text gracefully', async () => {
      const result = await parser.parse({ rawText: '' });
      expect(result.ticker).toBeNull();
      expect(result.metrics.marketCapUsd).toBeNull();
    });
  });
});

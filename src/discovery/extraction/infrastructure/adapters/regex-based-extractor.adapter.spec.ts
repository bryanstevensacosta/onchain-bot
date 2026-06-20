import { RegexBasedExtractorAdapter } from 'discovery/extraction/infrastructure/adapters/regex-based-extractor.adapter';

describe('RegexBasedExtractorAdapter', () => {
  let adapter: RegexBasedExtractorAdapter;
  const FIXED_DATE = new Date('2026-01-01T00:00:00Z');

  const buildInput = (text: string) => ({
    channelId: '123',
    messageId: 1,
    occurredAt: FIXED_DATE,
    text,
  });

  beforeEach(() => {
    adapter = new RegexBasedExtractorAdapter();
  });

  describe('EVM addresses', () => {
    it('extracts a valid lowercase EVM address', async () => {
      const { contractAddresses } = await adapter.extract(
        buildInput('CA: 0xabcdef0123456789abcdef0123456789abcdef01'),
      );
      expect(contractAddresses).toHaveLength(1);
      expect(contractAddresses[0].value).toBe(
        '0xabcdef0123456789abcdef0123456789abcdef01',
      );
      expect(contractAddresses[0].chainHint.value).toBe('evm');
    });

    it('normalizes mixed case to lowercase', async () => {
      const { contractAddresses } = await adapter.extract(
        buildInput('0xAbCdEf0123456789aBcDeF0123456789AbCdEf01'),
      );
      expect(contractAddresses[0].value).toBe(
        '0xabcdef0123456789abcdef0123456789abcdef01',
      );
    });

    it('rejects too-short addresses', async () => {
      const { contractAddresses } = await adapter.extract(buildInput('0xabc'));
      expect(contractAddresses).toHaveLength(0);
    });

    it('rejects non-hex characters', async () => {
      const { contractAddresses } = await adapter.extract(
        buildInput('0xZZZZZ0123456789abcdef0123456789abcdef01'),
      );
      expect(contractAddresses).toHaveLength(0);
    });

    it('does not match EVM-like substrings inside longer strings', async () => {
      const { contractAddresses } = await adapter.extract(
        buildInput('prefix0xabcdef0123456789abcdef0123456789abcdef01suffix'),
      );
      expect(contractAddresses).toHaveLength(0);
    });

    it('deduplicates identical addresses', async () => {
      const { contractAddresses } = await adapter.extract(
        buildInput(
          '0xabcdef0123456789abcdef0123456789abcdef01 and 0xABCDEF0123456789ABCDEF0123456789ABCDEF01',
        ),
      );
      expect(contractAddresses).toHaveLength(1);
    });

    it('extracts multiple distinct EVM addresses', async () => {
      const { contractAddresses } = await adapter.extract(
        buildInput(
          'First: 0x1111111111111111111111111111111111111111 Second: 0x2222222222222222222222222222222222222222',
        ),
      );
      expect(contractAddresses).toHaveLength(2);
    });
  });

  describe('Solana addresses', () => {
    // USDC on Solana mainnet
    const USDC_SOL = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

    it('extracts a valid 32-byte Base58 address', async () => {
      const { contractAddresses } = await adapter.extract(
        buildInput(`CA: ${USDC_SOL}`),
      );
      expect(contractAddresses).toHaveLength(1);
      expect(contractAddresses[0].value).toBe(USDC_SOL);
      expect(contractAddresses[0].chainHint.value).toBe('solana');
    });

    it('extracts USDC + WIF together', async () => {
      const WIF = 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm'; // dogwifhat
      const { contractAddresses } = await adapter.extract(
        buildInput(`USDC: ${USDC_SOL} and WIF: ${WIF}`),
      );
      expect(contractAddresses).toHaveLength(2);
    });

    it('rejects Base58 strings that decode to non-32-byte length', async () => {
      // "abc" is short Base58 but decodes to fewer than 32 bytes
      const { contractAddresses } = await adapter.extract(
        buildInput('short abc xyz'),
      );
      expect(contractAddresses).toHaveLength(0);
    });
  });

  describe('Tickers', () => {
    it('extracts simple uppercase ticker', async () => {
      const { tickers } = await adapter.extract(buildInput('PEPE to the moon'));
      expect(tickers.map((t) => t.value)).toContain('PEPE');
    });

    it('strips leading $ prefix', async () => {
      const { tickers } = await adapter.extract(
        buildInput('$WIF launching now'),
      );
      expect(tickers.map((t) => t.value)).toContain('WIF');
      expect(tickers.find((t) => t.value === 'WIF')).toBeDefined();
    });

    it('filters common English words', async () => {
      const { tickers } = await adapter.extract(
        buildInput('BUY PEPE SELL THE NEW ATH'),
      );
      expect(tickers.map((t) => t.value)).toEqual(['PEPE']);
    });

    it('filters crypto meta terms', async () => {
      const { tickers } = await adapter.extract(
        buildInput('Check ATH MC FDV LP holders'),
      );
      // All blocklisted
      expect(tickers).toHaveLength(0);
    });

    it('deduplicates case-insensitively', async () => {
      const { tickers } = await adapter.extract(buildInput('$pepe $PEPE Pepe'));
      expect(tickers.filter((t) => t.value === 'PEPE')).toHaveLength(1);
    });

    it('does not extract lowercase tokens', async () => {
      const { tickers } = await adapter.extract(buildInput('pepe on solana'));
      expect(tickers.find((t) => t.value === 'PEPE')).toBeUndefined();
    });
  });

  describe('URLs', () => {
    it('extracts https URLs', async () => {
      const { urls } = await adapter.extract(
        buildInput('chart: https://dexscreener.com/solana/abc'),
      );
      expect(urls).toHaveLength(1);
      expect(urls[0].value).toBe('https://dexscreener.com/solana/abc');
      expect(urls[0].scheme).toBe('https');
    });

    it('extracts http URLs', async () => {
      const { urls } = await adapter.extract(
        buildInput('site: http://example.com'),
      );
      expect(urls).toHaveLength(1);
      expect(urls[0].scheme).toBe('http');
    });

    it('extracts t.me deep links as telegram scheme', async () => {
      const { urls } = await adapter.extract(
        buildInput('join t.me/SpyDefi now'),
      );
      expect(urls).toHaveLength(1);
      expect(urls[0].scheme).toBe('telegram');
      expect(urls[0].value).toBe('t.me/SpyDefi');
    });

    it('strips trailing punctuation', async () => {
      const { urls } = await adapter.extract(
        buildInput('https://example.com/path.'),
      );
      expect(urls[0].value).toBe('https://example.com/path');
    });

    it('deduplicates identical URLs', async () => {
      const { urls } = await adapter.extract(
        buildInput('https://x.com and https://x.com again'),
      );
      expect(urls).toHaveLength(1);
    });
  });

  describe('Realistic Telegram alpha message', () => {
    it('extracts CA + ticker + URL from a single message', async () => {
      const USDC_SOL = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
      const text = `🚀 ALPHA: $WIF is pumping!

Contract: ${USDC_SOL}
Chart: https://dexscreener.com/solana/EPjFWdd5
TG: t.me/WIFalpha

BUY NOW before ATH`;

      const result = await adapter.extract(buildInput(text));

      expect(result.contractAddresses.map((c) => c.value)).toContain(USDC_SOL);
      expect(result.tickers.map((t) => t.value)).toContain('WIF');
      expect(result.urls.map((u) => u.scheme)).toEqual(
        expect.arrayContaining(['https', 'telegram']),
      );
    });

    it('handles empty text gracefully', async () => {
      const result = await adapter.extract(buildInput(''));
      expect(result.contractAddresses).toEqual([]);
      expect(result.tickers).toEqual([]);
      expect(result.urls).toEqual([]);
    });
  });
});

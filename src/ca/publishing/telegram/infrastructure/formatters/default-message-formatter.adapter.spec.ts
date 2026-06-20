import { DefaultMessageFormatterAdapter } from 'ca/publishing/telegram/infrastructure/formatters/default-message-formatter.adapter';

const EVM = '0xd8da6bf26964af9d7eed9e03e53415d37aa96045';

describe('DefaultMessageFormatterAdapter', () => {
  let formatter: DefaultMessageFormatterAdapter;

  beforeEach(() => {
    formatter = new DefaultMessageFormatterAdapter();
  });

  it('formats a complete alpha call', () => {
    const msg = formatter.format({
      chain: 'ethereum',
      address: EVM,
      ticker: 'WIF',
      name: 'dogwifhat',
      score: 92,
      classification: 'TOKEN',
      marketCapUsd: 180_000,
      liquidityUsd: 45_000,
      holders: 1230,
      sourceCount: 3,
      mentionCount: 6,
      chart: 'https://dexscreener.com/solana/abc',
    });

    expect(msg).toContain('ALPHA: $WIF');
    expect(msg).toContain('Ethereum');
    expect(msg).toContain('dogwifhat');
    expect(msg).toContain('$180.00K');
    expect(msg).toContain('$45.00K');
    expect(msg).toContain('1,230');
    expect(msg).toContain(EVM);
    expect(msg).toContain('https://dexscreener.com/solana/abc');
    expect(msg).toContain('Score: 92/100');
    expect(msg).toContain('TOKEN');
  });

  it('uses 3 fire emojis for STRONG (>=80)', () => {
    const msg = formatter.format({
      chain: 'ethereum',
      address: EVM,
      ticker: 'WIF',
      name: null,
      score: 92,
      classification: 'TOKEN',
      marketCapUsd: null,
      liquidityUsd: null,
      holders: null,
      sourceCount: 1,
      mentionCount: 1,
      chart: null,
    });
    expect(msg).toContain('🔥🔥🔥');
  });

  it('uses 2 fire emojis for DECENT (>=60)', () => {
    const msg = formatter.format({
      chain: 'ethereum',
      address: EVM,
      ticker: 'X',
      name: null,
      score: 65,
      classification: 'TOKEN',
      marketCapUsd: null,
      liquidityUsd: null,
      holders: null,
      sourceCount: 1,
      mentionCount: 1,
      chart: null,
    });
    expect(msg).toContain('🔥🔥');
    expect(msg).not.toContain('🔥🔥🔥');
  });

  it('omits name line when null', () => {
    const msg = formatter.format({
      chain: 'ethereum',
      address: EVM,
      ticker: null,
      name: null,
      score: 80,
      classification: 'TOKEN',
      marketCapUsd: null,
      liquidityUsd: null,
      holders: null,
      sourceCount: 1,
      mentionCount: 1,
      chart: null,
    });
    expect(msg).toContain('ALPHA DETECTED');
    expect(msg).not.toContain('Name:');
  });

  it('handles Solana chain emoji', () => {
    const msg = formatter.format({
      chain: 'solana',
      address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      ticker: 'USDC',
      name: null,
      score: 80,
      classification: 'TOKEN',
      marketCapUsd: null,
      liquidityUsd: null,
      holders: null,
      sourceCount: 1,
      mentionCount: 1,
      chart: null,
    });
    expect(msg).toContain('◎');
    expect(msg).toContain('Solana');
  });

  it('formats USD with K/M/B suffixes', () => {
    const k = formatter.format({
      chain: 'ethereum',
      address: EVM,
      ticker: null,
      name: null,
      score: 80,
      classification: 'TOKEN',
      marketCapUsd: 5000,
      liquidityUsd: null,
      holders: null,
      sourceCount: 1,
      mentionCount: 1,
      chart: null,
    });
    expect(k).toContain('$5.00K');

    const m = formatter.format({
      chain: 'ethereum',
      address: EVM,
      ticker: null,
      name: null,
      score: 80,
      classification: 'TOKEN',
      marketCapUsd: 2_500_000,
      liquidityUsd: null,
      holders: null,
      sourceCount: 1,
      mentionCount: 1,
      chart: null,
    });
    expect(m).toContain('$2.50M');

    const b = formatter.format({
      chain: 'ethereum',
      address: EVM,
      ticker: null,
      name: null,
      score: 80,
      classification: 'TOKEN',
      marketCapUsd: 3_500_000_000,
      liquidityUsd: null,
      holders: null,
      sourceCount: 1,
      mentionCount: 1,
      chart: null,
    });
    expect(b).toContain('$3.50B');
  });
});

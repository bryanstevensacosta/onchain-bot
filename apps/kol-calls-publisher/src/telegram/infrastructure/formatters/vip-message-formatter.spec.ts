import { VipMessageFormatter } from './vip-message-formatter';

describe('VipMessageFormatter (todo 11, failing-first, moved KOL-bot code)', () => {
  const formatter = new VipMessageFormatter();

  it('formats the publish card with chain emoji + ticker + MC + address', () => {
    const text = formatter.format({
      chain: 'solana',
      address: 'ABC123',
      ticker: 'BONK',
      marketCapUsd: 12_500_000,
      chart: 'https://dexscreener.com/solana/ABC123',
    });
    expect(text).toContain('🟣');
    expect(text).toContain('$SOLANA | $BONK');
    expect(text).toContain('ABC123');
    expect(text).toContain('$12.50M');
    expect(text).toContain('Dexscreener');
  });

  it('falls back to UNKNOWN defensively even though the publisher guards null', () => {
    const text = formatter.format({
      chain: 'base',
      address: '0xabc',
      ticker: '',
    });
    expect(text).toContain('UNKNOWN');
  });
});

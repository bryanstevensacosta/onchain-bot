import { ChainHint } from './chain-hint.vo';
import { NormalizedAddress } from './normalized-address.vo';

describe('ChainHint', () => {
  it('parses known hints case-insensitively', () => {
    expect(ChainHint.fromString('EVM').value).toBe('evm');
    expect(ChainHint.fromString('solana').value).toBe('solana');
    expect(ChainHint.fromString('Unknown').value).toBe('unknown');
  });

  it('rejects unknown hints with VALIDATION', () => {
    expect(() => ChainHint.fromString('bitcoin')).toThrow(
      'Invalid chain hint: bitcoin',
    );
  });

  it('exposes EVM/SOLANA/UNKNOWN singletons', () => {
    expect(ChainHint.EVM.value).toBe('evm');
    expect(ChainHint.SOLANA.value).toBe('solana');
    expect(ChainHint.UNKNOWN.value).toBe('unknown');
  });
});

describe('NormalizedAddress', () => {
  it('accepts EVM and lowercases (0xAbC == 0xabc)', () => {
    const mixed = NormalizedAddress.fromEvm(
      '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    );
    const lower = NormalizedAddress.fromEvm(
      '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
    );
    expect(mixed.value).toBe('0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48');
    expect(mixed.equals(lower)).toBe(true);
    expect(mixed.chainHint.value).toBe('evm');
  });

  it('rejects malformed EVM with INVALID_ADDRESS', () => {
    expect(() => NormalizedAddress.fromEvm('0x1234')).toThrow(
      'Invalid EVM address: 0x1234',
    );
    expect(() =>
      NormalizedAddress.fromEvm('0xZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ'),
    ).toThrow('Invalid EVM address');
  });

  it('accepts a 32-byte Base58 Solana address', () => {
    const addr = NormalizedAddress.fromSolana(
      '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsv',
    );
    expect(addr.chainHint.value).toBe('solana');
    expect(addr.value).toBe('7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsv');
  });

  it('rejects Base58 that does not decode to 32 bytes', () => {
    expect(() => NormalizedAddress.fromSolana('12345')).toThrow(
      'Invalid Solana address: 12345',
    );
    expect(() => NormalizedAddress.fromSolana('not base58 at all!!!')).toThrow(
      'Invalid Solana address',
    );
  });
});

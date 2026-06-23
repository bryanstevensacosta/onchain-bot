import { ChainFamily } from 'chain/identity/chain-family.vo';
import { NormalizedAddress } from 'token/normalization/domain/value-objects/normalized-address.vo';
import { TokenLocator } from 'token/identity/token-locator.vo';
import { DomainError } from 'shared/kernel/domain-error';

describe('ChainFamily', () => {
  it('accepts evm', () => {
    expect(ChainFamily.fromString('evm').value).toBe('evm');
  });

  it('accepts solana', () => {
    expect(ChainFamily.fromString('solana').value).toBe('solana');
  });

  it('lowercases input', () => {
    expect(ChainFamily.fromString('EVM').value).toBe('evm');
  });

  it('throws on unsupported chain', () => {
    expect(() => ChainFamily.fromString('sui')).toThrow(DomainError);
  });

  it('tryFromString returns null for unsupported', () => {
    expect(ChainFamily.tryFromString('sui')).toBeNull();
  });

  it('tryFromString returns ChainFamily for valid', () => {
    expect(ChainFamily.tryFromString('evm')?.value).toBe('evm');
  });
});

describe('NormalizedAddress', () => {
  const EVM = '0xAbCdEf0123456789abcdef0123456789ABCDEF01';
  const EVM_LOWER = '0xabcdef0123456789abcdef0123456789abcdef01';
  const SOLANA = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

  it('normalizes EVM to lowercase', () => {
    expect(NormalizedAddress.fromEvm(EVM).value).toBe(EVM_LOWER);
  });

  it('rejects invalid EVM (too short)', () => {
    expect(() => NormalizedAddress.fromEvm('0xabc')).toThrow(DomainError);
  });

  it('rejects invalid EVM (non-hex)', () => {
    expect(() =>
      NormalizedAddress.fromEvm('0xZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ'),
    ).toThrow(DomainError);
  });

  it('accepts valid Solana', () => {
    expect(NormalizedAddress.fromSolana(SOLANA).value).toBe(SOLANA);
  });

  it('rejects invalid Solana (too short Base58)', () => {
    expect(() => NormalizedAddress.fromSolana('abc')).toThrow(DomainError);
  });

  it('structural equality: mixed-case EVM equals lower-case EVM', () => {
    expect(
      NormalizedAddress.fromEvm(EVM).equals(
        NormalizedAddress.fromEvm(EVM_LOWER),
      ),
    ).toBe(true);
  });

  it('fromChainHint auto-selects factory', () => {
    expect(NormalizedAddress.fromChainHint(EVM, 'evm')?.value).toBe(EVM_LOWER);
    expect(NormalizedAddress.fromChainHint(SOLANA, 'solana')?.value).toBe(
      SOLANA,
    );
  });

  it('fromChainHint returns null for unsupported chain', () => {
    expect(NormalizedAddress.fromChainHint(EVM, 'sui')).toBeNull();
  });

  it('fromChainHint returns null for chain/format mismatch', () => {
    expect(NormalizedAddress.fromChainHint(SOLANA, 'evm')).toBeNull();
    expect(NormalizedAddress.fromChainHint('abc', 'solana')).toBeNull();
  });
});

describe('TokenLocator', () => {
  const EVM = '0xabcdef0123456789abcdef0123456789abcdef01';
  const SOLANA = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

  it('produces chain:address key', () => {
    const id = TokenLocator.create(
      ChainFamily.EVM,
      NormalizedAddress.fromEvm(EVM),
    );
    expect(id.key).toBe(`evm:${EVM}`);
  });

  it('throws on chain mismatch', () => {
    expect(() =>
      TokenLocator.create(ChainFamily.SOLANA, NormalizedAddress.fromEvm(EVM)),
    ).toThrow();
  });

  it('structural equality for same identity', () => {
    const a = TokenLocator.create(
      ChainFamily.EVM,
      NormalizedAddress.fromEvm(EVM),
    );
    const b = TokenLocator.create(
      ChainFamily.EVM,
      NormalizedAddress.fromEvm(EVM.toUpperCase()),
    );
    expect(a.equals(b)).toBe(true);
  });

  it('different identities are not equal', () => {
    const a = TokenLocator.create(
      ChainFamily.EVM,
      NormalizedAddress.fromEvm(EVM),
    );
    const b = TokenLocator.create(
      ChainFamily.SOLANA,
      NormalizedAddress.fromSolana(SOLANA),
    );
    expect(a.equals(b)).toBe(false);
  });
});

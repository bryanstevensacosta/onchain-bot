import { Chain } from 'discovery/normalization/domain/value-objects/chain.vo';
import { NormalizedAddress } from 'discovery/normalization/domain/value-objects/normalized-address.vo';
import { TokenIdentity } from 'discovery/normalization/domain/value-objects/token-identity.vo';
import { DomainError } from 'shared/kernel/domain-error';

describe('Chain', () => {
  it('accepts evm', () => {
    expect(Chain.fromString('evm').value).toBe('evm');
  });

  it('accepts solana', () => {
    expect(Chain.fromString('solana').value).toBe('solana');
  });

  it('lowercases input', () => {
    expect(Chain.fromString('EVM').value).toBe('evm');
  });

  it('throws on unsupported chain', () => {
    expect(() => Chain.fromString('sui')).toThrow(DomainError);
  });

  it('tryFromString returns null for unsupported', () => {
    expect(Chain.tryFromString('sui')).toBeNull();
  });

  it('tryFromString returns Chain for valid', () => {
    expect(Chain.tryFromString('evm')?.value).toBe('evm');
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

describe('TokenIdentity', () => {
  const EVM = '0xabcdef0123456789abcdef0123456789abcdef01';
  const SOLANA = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

  it('produces chain:address key', () => {
    const id = TokenIdentity.create(Chain.EVM, NormalizedAddress.fromEvm(EVM));
    expect(id.key).toBe(`evm:${EVM}`);
  });

  it('throws on chain mismatch', () => {
    expect(() =>
      TokenIdentity.create(Chain.SOLANA, NormalizedAddress.fromEvm(EVM)),
    ).toThrow();
  });

  it('structural equality for same identity', () => {
    const a = TokenIdentity.create(Chain.EVM, NormalizedAddress.fromEvm(EVM));
    const b = TokenIdentity.create(
      Chain.EVM,
      NormalizedAddress.fromEvm(EVM.toUpperCase()),
    );
    expect(a.equals(b)).toBe(true);
  });

  it('different identities are not equal', () => {
    const a = TokenIdentity.create(Chain.EVM, NormalizedAddress.fromEvm(EVM));
    const b = TokenIdentity.create(
      Chain.SOLANA,
      NormalizedAddress.fromSolana(SOLANA),
    );
    expect(a.equals(b)).toBe(false);
  });
});

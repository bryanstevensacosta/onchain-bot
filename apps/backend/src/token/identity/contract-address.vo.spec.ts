import { ContractAddress } from './contract-address.vo';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import { ChainHint } from 'chain/identity/chain-hint.vo';

describe('ContractAddress.fromSolana', () => {
  describe('valid Solana address', () => {
    it('returns a VO with value preserved and chainHint SOLANA', () => {
      // USDC mainnet mint — known valid 32-byte base58 Solana address.
      const valid = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
      const ca = ContractAddress.fromSolana(valid);

      expect(ca.value).toBe(valid);
      expect(ca.chainHint).toBe(ChainHint.SOLANA);
    });
  });

  describe('invalid addresses', () => {
    it("rejects the bug address with DomainError(INVALID_ADDRESS, 'Invalid Solana address: ...')", () => {
      // The user's malformed address from the bug report — 46 chars, does not
      // decode to 32 bytes via bs58.
      const bugAddress = 'ajj2ksddhk3pe7dbhw2bgqvstp8q7plbqrvxjqbjaspv';

      expect(() => ContractAddress.fromSolana(bugAddress)).toThrow(DomainError);
      try {
        ContractAddress.fromSolana(bugAddress);
        fail('expected DomainError to be thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(DomainError);
        const domainErr = err as DomainError;
        expect(domainErr.code).toBe(ErrorCode.INVALID_ADDRESS);
        expect(domainErr.message).toBe(`Invalid Solana address: ${bugAddress}`);
        expect(domainErr.details).toEqual({ raw: bugAddress });
      }
    });

    it("rejects an empty string with DomainError(INVALID_ADDRESS, 'Invalid Solana address: ')", () => {
      const empty = '';

      expect(() => ContractAddress.fromSolana(empty)).toThrow(DomainError);
      try {
        ContractAddress.fromSolana(empty);
        fail('expected DomainError to be thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(DomainError);
        const domainErr = err as DomainError;
        expect(domainErr.code).toBe(ErrorCode.INVALID_ADDRESS);
        expect(domainErr.message).toBe(`Invalid Solana address: ${empty}`);
        expect(domainErr.details).toEqual({ raw: empty });
      }
    });
  });
});

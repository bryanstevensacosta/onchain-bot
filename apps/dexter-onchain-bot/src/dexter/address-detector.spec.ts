import {
  extractAddresses,
  isBareAddress,
  isEvmAddress,
  isSolanaAddress,
} from './address-detector';

const SOL = 'So11111111111111111111111111111111111111112';
const EVM = '0x6B175474E89094C44Da98b954EedeAC495271d0F';

describe('address-detector (bare-address detection, no slash)', () => {
  it('recognizes a Solana base58 address', () => {
    expect(isSolanaAddress(SOL)).toBe(true);
    expect(isBareAddress(SOL)).toBe(true);
  });

  it('recognizes an EVM 0x address', () => {
    expect(isEvmAddress(EVM)).toBe(true);
    expect(isBareAddress(EVM)).toBe(true);
  });

  it('rejects plain words and short strings', () => {
    expect(isBareAddress('hello')).toBe(false);
    expect(isBareAddress('0x123')).toBe(false);
    expect(isBareAddress('')).toBe(false);
    expect(isBareAddress('/x ' + SOL)).toBe(false);
  });

  it('extracts every address from free text in order, deduped', () => {
    const text = `mira este token ${SOL} y tambien ${EVM} repito ${SOL}`;
    expect(extractAddresses(text)).toEqual([SOL, EVM]);
  });

  it('returns empty when no address is present', () => {
    expect(extractAddresses('just some words, no contract here')).toEqual([]);
  });
});

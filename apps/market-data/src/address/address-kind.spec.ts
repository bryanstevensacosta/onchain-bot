import { AddressKind, isAddressKind, normalizeAddressKind } from './address-kind';

describe('address-kind', () => {
  it('accepts the four known kinds', () => {
    expect(isAddressKind('wallet')).toBe(true);
    expect(isAddressKind('token')).toBe(true);
    expect(isAddressKind('program')).toBe(true);
    expect(isAddressKind('exchange')).toBe(true);
  });

  it('normalizes a valid kind unchanged', () => {
    const kind: AddressKind = normalizeAddressKind('token');
    expect(kind).toBe('token');
  });

  it('maps unknown kind to explicit unknown instead of crashing', () => {
    expect(normalizeAddressKind('vault')).toBe('unknown');
    expect(normalizeAddressKind('')).toBe('unknown');
    expect(normalizeAddressKind(undefined)).toBe('unknown');
    expect(normalizeAddressKind('TOKEN')).toBe('unknown');
  });
});

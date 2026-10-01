/**
 * AddressKind (Tramo 3, P45).
 *
 * Universal address discriminator: every on-chain address is exactly one
 * of wallet | token | program | exchange — or explicit `unknown` when
 * the evidence is insufficient. `unknown` is a first-class value (never
 * null, never a crash): format-only detection cannot tell a wallet from
 * a token, so it says `unknown` instead of guessing.
 */
export const ADDRESS_KINDS = [
  'wallet',
  'token',
  'program',
  'exchange',
] as const;

export type KnownAddressKind = (typeof ADDRESS_KINDS)[number];

export type AddressKind = KnownAddressKind | 'unknown';

export function isAddressKind(raw: unknown): raw is KnownAddressKind {
  return (
    typeof raw === 'string' &&
    (ADDRESS_KINDS as ReadonlyArray<string>).includes(raw)
  );
}

export function normalizeAddressKind(raw: unknown): AddressKind {
  return isAddressKind(raw) ? raw : 'unknown';
}

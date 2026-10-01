import type { AddressKind, ProviderHealth } from './types';

const KNOWN_KINDS: ReadonlyArray<string> = [
  'wallet',
  'token',
  'program',
  'exchange',
];

export function normalizeAddressKind(raw: unknown): AddressKind {
  return typeof raw === 'string' &&
    (KNOWN_KINDS as ReadonlyArray<string>).includes(raw)
    ? (raw as AddressKind)
    : 'unknown';
}

export function isKnownAddressKind(
  raw: unknown,
): raw is Exclude<AddressKind, 'unknown'> {
  return (
    typeof raw === 'string' &&
    (KNOWN_KINDS as ReadonlyArray<string>).includes(raw)
  );
}

export function addressKindTone(kind: AddressKind): string {
  switch (kind) {
    case 'token':
      return 'blue';
    case 'wallet':
      return 'green';
    case 'program':
      return 'cyan';
    case 'exchange':
      return 'yellow';
    default:
      return 'gray';
  }
}

export function providerHealthTone(health: ProviderHealth): string {
  switch (health) {
    case 'up':
      return 'green';
    case 'degraded':
      return 'yellow';
    case 'down':
      return 'red';
    default:
      return 'gray';
  }
}

const GECKO_SLUGS: Record<string, string> = {
  ethereum: 'eth',
  solana: 'solana',
  bsc: 'bsc',
  base: 'base',
  arbitrum: 'arbitrum',
  polygon: 'polygon_pos',
};

export function chartUrlFor(
  chain: string,
  address: string,
): { readonly dexscreener: string; readonly geckoterminal: string } {
  const slug = chain.toLowerCase();
  const gecko = GECKO_SLUGS[slug] ?? slug;
  return {
    dexscreener: `https://dexscreener.com/${slug}/${address}`,
    geckoterminal: `https://www.geckoterminal.com/${gecko}/pools/${address}`,
  };
}

export const EVM_CANDIDATE_CHAINS: ReadonlyArray<string> = [
  'ethereum',
  'base',
  'bsc',
  'arbitrum',
  'polygon',
];

const EVM_ADDRESS_FORMAT = /^0x[a-fA-F0-9]{40}$/;
const SOLANA_ADDRESS_FORMAT = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export interface DetectedChain {
  readonly chain: string;
  readonly candidates: ReadonlyArray<string>;
}

export function detectChainForAddress(value: string): DetectedChain | null {
  const trimmed = (value ?? '').trim();
  if (trimmed === '' || trimmed.startsWith('/')) return null;
  if (/\s/.test(trimmed)) return null;
  if (EVM_ADDRESS_FORMAT.test(trimmed)) {
    return { chain: 'ethereum', candidates: EVM_CANDIDATE_CHAINS };
  }
  if (SOLANA_ADDRESS_FORMAT.test(trimmed)) {
    return { chain: 'solana', candidates: ['solana'] };
  }
  return null;
}

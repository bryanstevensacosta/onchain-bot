import { extractAddresses } from './address-detector';

/**
 * Forward / free-text extraction (Tramo 3, todo 9, P13 — NEW).
 *
 * Any incoming text (forwarded messages included) is scanned for:
 * - token contracts (via address-detector),
 * - wallet-looking addresses (same shape — kind is resolved later via
 *   market-data, never guessed here),
 * - exchange / aggregator mentions (informational only).
 *
 * Lookup-only: extraction never publishes, it only feeds the scan path.
 */

const KNOWN_EXCHANGES = [
  'binance',
  'coinbase',
  'kraken',
  'bybit',
  'okx',
  'bitget',
  'jupiter',
  'uniswap',
  'raydium',
  'orca',
  'pancakeswap',
  'dexscreener',
  'geckoterminal',
  'birdeye',
] as const;

export interface ForwardCandidates {
  readonly addresses: string[];
  readonly exchanges: string[];
  readonly hasText: boolean;
}

export function extractForwardCandidates(text: string): ForwardCandidates {
  const hasText = (text ?? '').trim().length > 0;
  if (!hasText) {
    return { addresses: [], exchanges: [], hasText: false };
  }
  const addresses = extractAddresses(text);
  const lowered = text.toLowerCase();
  const exchanges = KNOWN_EXCHANGES.filter((name) => lowered.includes(name));
  return { addresses, exchanges, hasText: true };
}

export const EXCHANGE_ALLOWLIST: ReadonlyArray<string> = KNOWN_EXCHANGES;

import type { Chain } from '@/shared/realtime/events';
import { API_BASE_URL } from '@/shared/config/env';

/**
 * Money rule (dexter plan todos 13/64/65, parity with `formatMoneyText`
 * in dexter's message-formatter): compact B/M/K at 1 decimal with
 * trailing-zero strip (`$2.5M`, `$1.5B`, `$80B`, `$55.7K`); below 1000
 * a nearest WHOLE integer (`$984` ← 983.78, `$11` ← 10.85, `$1` ← 0.94).
 * Rounding carries the mantissa only, never the unit: `999960` →
 * `$1000K` (no roll-up to `$1M`); below 1000 a whole rounding up to
 * `1000` (`999.5`–`999.99…`) renders `$1K`, never a bare unit-less
 * `$1000`. Sign preserved (`-$1.5B`), null/undefined/non-finite → `—`.
 */
export function formatUsd(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000)
    return `${sign}$${trimFixed(abs / 1_000_000_000, 1)}B`;
  if (abs >= 1_000_000) return `${sign}$${trimFixed(abs / 1_000_000, 1)}M`;
  if (abs >= 1_000) return `${sign}$${trimFixed(abs / 1_000, 1)}K`;
  const whole = trimFixed(abs, 0);
  if (whole === '1000') return `${sign}$1K`;
  return `${sign}$${whole}`;
}

/**
 * Adaptive price rule for `priceUsd` (dexter plan todo 66, parity with
 * `formatPriceText`): `<1` renders fixed 8 decimals half-up via
 * `toFixed(8)` with trailing zeros stripped (`$0.00002434`,
 * `$0.00000075`); ultra-dust below 1e-8 collapses to `0` at 8 decimals
 * and falls back to the legacy 3-significant-figure rule
 * (`$0.00000000123`), never `$0` for a non-zero value. `>=1` renders
 * grouped with max 2 decimals (`$164.32`, `$3,457`). Zero renders `$0`;
 * null/undefined/non-finite → `—`.
 */
export function formatPriceUsd(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  if (value === 0) return '$0';
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  if (abs < 1) {
    const fixed8 = trimFixed(abs, 8);
    if (fixed8 === '0') return `${sign}$${significant3Text(abs)}`;
    return `${sign}$${fixed8}`;
  }
  return `${sign}$${abs.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

/**
 * Shared helper (dexter parity): `toFixed(n)` with trailing zeros (and
 * a dangling dot) stripped; `-0` normalizes to `0`.
 */
function trimFixed(value: number, maxDecimals: number): string {
  let text = value.toFixed(maxDecimals);
  if (text.includes('.')) {
    text = text.replace(/0+$/, '').replace(/\.$/, '');
  }
  if (text === '-0') return '0';
  return text;
}

/**
 * Legacy sub-1 price rule (dexter plan todo 45): max 3 significant
 * figures, half-up, exponent form expanded, trailing zeros stripped.
 * Retained only as the <1e-8 dust fallback inside `formatPriceUsd`.
 */
function significant3Text(abs: number): string {
  const sig3 = abs.toPrecision(3);
  const plain = sig3.includes('e') ? expandExponential(sig3) : sig3;
  return plain.includes('.')
    ? plain.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')
    : plain;
}

function expandExponential(raw: string): string {
  const [coeff, expPart] = raw.toLowerCase().split('e');
  const exponent = parseInt(expPart, 10);
  const [intPart, fracPart = ''] = coeff.split('.');
  const digits = `${intPart}${fracPart}`;
  const point = intPart.length + exponent;
  if (point <= 0) return `0.${'0'.repeat(-point)}${digits}`;
  if (point >= digits.length)
    return `${digits}${'0'.repeat(point - digits.length)}`;
  return `${digits.slice(0, point)}.${digits.slice(point)}`;
}

export function formatNumber(value: number | null | undefined): string {
  if (value == null) return '—';
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString();
}

export function formatPercent(value: number | null | undefined): string {
  if (value == null) return '—';
  return `${(value * 100).toFixed(1)}%`;
}

export function formatRelativeTime(
  iso: string | Date | null | undefined,
): string {
  if (!iso) return '—';
  const date = typeof iso === 'string' ? new Date(iso) : iso;
  const diff = (Date.now() - date.getTime()) / 1000;
  if (diff < 0) return 'ahora';
  if (diff < 60) return `hace ${Math.floor(diff)}s`;
  if (diff < 3600) return `hace ${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)}h`;
  return `hace ${Math.floor(diff / 86400)}d`;
}

export function truncateAddress(address: string, head = 4, tail = 4): string {
  if (address.length <= head + tail + 3) return address;
  return `${address.slice(0, head)}…${address.slice(-tail)}`;
}

export function chainLabel(chain: Chain | string): string {
  if (chain === 'solana') return '◎ Solana';
  if (chain === 'evm') return 'EVM';
  return chain;
}

/**
 * Generate a token logo URL via the backend image proxy at
 * `/token/image/:chain/:address`. The proxy handles CDN fallback
 * (DexScreener → Birdeye for Solana), LRU caching, optional WebP
 * re-encoding, and surfaces a deterministic placeholder when no
 * CDN returns a valid image. Routing through the proxy decouples
 * the frontend from CDN URL conventions and case-sensitivity quirks.
 */
export function tokenImageUrl(chain: string, address: string): string {
  return `${API_BASE_URL}/token/image/${chain}/${address}`;
}

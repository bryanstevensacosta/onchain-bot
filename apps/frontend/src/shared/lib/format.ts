import type { Chain } from '@/shared/realtime/events';
import { API_BASE_URL } from '@/shared/config/env';

export function formatUsd(value: number | null | undefined): string {
  if (value == null) return '—';
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}K`;
  if (value < 0.01) return `$${value.toFixed(6)}`;
  return `$${value.toFixed(2)}`;
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

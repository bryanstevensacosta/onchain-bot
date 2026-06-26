import { useState } from 'react';

interface TokenImageProps {
  chain: string;
  address: string;
  imageUrls?: ReadonlyArray<string> | null;
  name?: string | null;
  ticker?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE_CLASS: Record<NonNullable<TokenImageProps['size']>, string> = {
  xs: 'w-5 h-5 text-[10px]',
  sm: 'w-6 h-6 text-xs',
  md: 'w-8 h-8 text-sm',
  lg: 'w-12 h-12 text-base',
};

const PLACEHOLDER_PALETTE = [
  'bg-rose-700',
  'bg-amber-700',
  'bg-emerald-700',
  'bg-sky-700',
  'bg-violet-700',
  'bg-pink-700',
  'bg-teal-700',
  'bg-orange-700',
] as const;

/**
 * Deterministic palette pick from the contract address. Same token → same
 * color across renders / pages, so users can identify tokens by hue.
 */
function paletteFor(address: string): string {
  let h = 0;
  for (let i = 0; i < address.length; i++) {
    h = (h * 31 + address.charCodeAt(i)) >>> 0;
  }
  return PLACEHOLDER_PALETTE[h % PLACEHOLDER_PALETTE.length];
}

function initialFor(
  name: string | null | undefined,
  ticker: string | null | undefined,
  address: string,
): string {
  const source = (ticker ?? name ?? address).trim();
  if (!source) return '?';
  return source[0]!.toUpperCase();
}

/**
 * Fallback URL for tokens that come without `image_urls` (canonical calls,
 * recent decisions, etc.). Uses DexScreener's CDN. If this also fails, the
 * deterministic placeholder renders — no further network calls.
 */
function fallbackUrl(chain: string, address: string): string {
  const slug = chain === 'evm' ? 'ethereum' : chain;
  return `https://dd.dexscreener.com/ds-data/tokens/${slug}/${address}.png`;
}

/**
 * Renders a token logo with graceful degradation.
 *
 * Resolution order:
 * 1. `imageUrls[0]` from the snapshot (snapshot-curated CDNs in priority order)
 * 2. DexScreener fallback URL (computed from chain + address)
 * 3. Deterministic placeholder: first letter of ticker/name + hashed color.
 *    Zero network — always renders, even offline.
 *
 * On any `<img>` error, advances to the next URL. When the list is exhausted,
 * swaps to the placeholder. This avoids the "broken image" icon and the
 * "ghost empty square" placeholder that hides the token identity entirely.
 */
export function TokenImage({
  chain,
  address,
  imageUrls,
  name,
  ticker,
  size = 'sm',
  className = '',
}: TokenImageProps) {
  const urls: ReadonlyArray<string> = [
    ...(imageUrls ?? []),
    ...(imageUrls?.length ? [] : [fallbackUrl(chain, address)]),
  ];

  const [idx, setIdx] = useState(0);
  const currentUrl = urls[idx];

  const handleError = () => {
    setIdx(idx + 1);
  };

  const sizeClass = SIZE_CLASS[size];

  if (!currentUrl) {
    return (
      <div
        className={`${sizeClass} ${paletteFor(address)} rounded-full flex items-center justify-center font-semibold text-white shrink-0 ${className}`}
        aria-label={ticker ?? name ?? address}
      >
        {initialFor(name, ticker, address)}
      </div>
    );
  }

  return (
    <img
      src={currentUrl}
      alt={ticker ?? name ?? address}
      className={`${sizeClass} rounded-full bg-slate-800 object-cover shrink-0 ${className}`}
      onError={handleError}
      loading="lazy"
    />
  );
}
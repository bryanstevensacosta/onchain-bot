import type {
  LaunchpadInfo,
  VenueInfo,
} from '@/scan/domain/ports/scan-pipeline.port';

/**
 * Origin-aware venue display tables (dexter venue-line, plan todo 14).
 * Pure domain data — no Nest, no I/O.
 *
 * Two tables that must never be mixed: `CHAIN_NAMES` keyed by chain
 * slug and `DEX_DISPLAY` keyed by dexscreener `dexId`. In particular
 * `dexId` (`meteoradbc`) is never a `launchpad.id`
 * (`meteora-dbc`) — the launchpad table lives in market-data
 * (`launchpad-table.ts`) and is never consulted here.
 */
export const CHAIN_NAMES: Readonly<Record<string, string>> = {
  solana: 'Solana',
  ethereum: 'Ethereum',
  bnb: 'BNB',
  base: 'Base',
  arbitrum: 'Arbitrum',
  polygon: 'Polygon',
  robinhood: 'Robinhood',
  unichain: 'Unichain',
};

export const DEX_DISPLAY: Readonly<Record<string, string>> = {
  pancakeswap: 'Pancakeswap',
  raydium: 'Raydium',
  orca: 'Orca',
  meteora: 'Meteora',
  pumpswap: 'PumpSwap',
  uniswap: 'Uniswap',
  baseline: 'Baseline',
  fourmeme: 'FourMeme',
};

export function chainNameOf(chain: string | null | undefined): string {
  if (typeof chain !== 'string') return '';
  return CHAIN_NAMES[chain.toLowerCase()] ?? '';
}

function dexDisplayOf(dexId: string): string {
  const known = DEX_DISPLAY[dexId.toLowerCase()];
  if (known) return known;
  return dexId.charAt(0).toUpperCase() + dexId.slice(1);
}

function cleanLabels(labels: ReadonlyArray<string>): string[] {
  return labels
    .map((entry) => entry.trim().toUpperCase())
    .filter((entry) => entry !== '');
}

export function formatDexTech(venue: VenueInfo | null | undefined): string {
  if (!venue || venue.dexId.trim() === '') return '';
  const display = dexDisplayOf(venue.dexId.trim());
  const labels = cleanLabels(venue.labels ?? []);
  return labels.length > 0 ? `${display} ${labels.join(' ')}` : display;
}

export interface VenueTexts {
  readonly origin: string;
  readonly tech: string;
  readonly venue: string;
  readonly venueLine: string;
}

export function resolveVenueTexts(
  launchpad: LaunchpadInfo | null | undefined,
  venue: VenueInfo | null | undefined,
): VenueTexts {
  const origin =
    typeof launchpad?.name === 'string' ? launchpad.name.trim() : '';
  const tech = formatDexTech(venue);
  // Deliberate Conway deviation: when the origin is known, `venue`
  // renders the origin and ignores the DEX display entirely — no
  // "LaunchLab (Raydium)" hybrids. A Conway-type token (origin
  // `Bankr`, best pair on `Clanker V4`) renders `Bankr` where Rick
  // shows `Clanker V4`: Rick only sees the DEX, we know the origin
  // via the detector, so origin wins.
  const venueText = origin !== '' ? origin : tech;
  const venueLine =
    origin !== '' && tech !== '' && origin !== tech
      ? `${origin} via ${tech}`
      : origin !== ''
        ? origin
        : tech;
  return { origin, tech, venue: venueText, venueLine };
}

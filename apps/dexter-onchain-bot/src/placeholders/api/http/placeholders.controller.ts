import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import {
  TEMPLATE_COMMANDS,
  placeholdersFor,
} from '@/placeholders/domain/placeholder-registry';
import type { TemplateCommand } from '@/placeholders/domain/placeholder-registry';

export interface PlaceholderDescriptor {
  readonly key: string;
  readonly type: string;
  readonly nullable: boolean;
  readonly example: string;
  readonly description?: string;
}

/**
 * Static catalog metadata per placeholder key. Pure documentation —
 * the closed vocabulary itself stays in `PLACEHOLDERS_BY_COMMAND`
 * (registry); this table only describes each key for the preview
 * playground. `type` is informational (`money`/`percent` render via
 * the shared formatters with `N/A` on null; `derived` keys are
 * renderer-computed; `url` keys travel raw).
 */
const PLACEHOLDER_META: Record<string, Omit<PlaceholderDescriptor, 'key'>> = {
  symbol: { type: 'string', nullable: false, example: 'SOL' },
  name: { type: 'string', nullable: false, example: 'Solana' },
  chain: { type: 'string', nullable: false, example: 'solana' },
  address: {
    type: 'string',
    nullable: false,
    example: 'So11111111111111111111111111111111111111112',
  },
  priceUsd: { type: 'money', nullable: true, example: '164.32' },
  priceChange24h: { type: 'percent', nullable: true, example: '2.5%' },
  marketCapUsd: { type: 'money', nullable: true, example: '80B' },
  fdvUsd: { type: 'money', nullable: true, example: '95B' },
  liquidityUsd: { type: 'money', nullable: true, example: '12M' },
  lockedLiquidityPercent: {
    type: 'percent',
    nullable: true,
    example: '80%',
  },
  burnedPercent: { type: 'percent', nullable: true, example: '5%' },
  volume24hUsd: { type: 'money', nullable: true, example: '2.5B' },
  holders: { type: 'number', nullable: true, example: '1200000' },
  top10HolderPercent: {
    type: 'percent',
    nullable: true,
    example: '12.5%',
  },
  top20HolderPercent: {
    type: 'percent',
    nullable: true,
    example: '18.8%',
  },
  totalSupply: { type: 'number', nullable: true, example: '600000000' },
  circulatingSupply: {
    type: 'number',
    nullable: true,
    example: '480000000',
  },
  maxSupply: { type: 'number', nullable: true, example: 'N/A' },
  devPctSupply: { type: 'percent', nullable: true, example: '1.3%' },
  devWallets: {
    type: 'array',
    nullable: true,
    example: 'DevW…1111, DevW…2222',
  },
  poolAddress: {
    type: 'string',
    nullable: true,
    example: 'Pool111111111111111111111111111111111111111',
  },
  source: { type: 'string', nullable: false, example: 'market-data-http' },
  chainDisplay: { type: 'derived', nullable: true, example: '🟣' },
  scanLinks: {
    type: 'derived',
    nullable: true,
    example: '[DexScreener](…) | [GeckoTerminal](…)',
  },
  dexscreenerUrl: {
    type: 'url',
    nullable: true,
    example: 'https://dexscreener.com/solana/…',
  },
  geckoterminalUrl: {
    type: 'url',
    nullable: true,
    example: 'https://www.geckoterminal.com/solana/pools/…',
  },
  tradeHint: {
    type: 'derived',
    nullable: false,
    example: '🤖 Use /c <address> <timeframe> for chart',
  },
  devLine: {
    type: 'derived',
    nullable: false,
    example: 'Dev 1.25% (DevW…1111)',
  },
  launchpadText: {
    type: 'derived',
    nullable: true,
    example: 'Pump.fun',
  },
  launchpadTextLink: {
    type: 'derived',
    nullable: true,
    example: '[Pump.fun](https://pump.fun/coin/…)',
  },
  launchpadIcon: { type: 'derived', nullable: true, example: '💊' },
  launchpadIconLink: {
    type: 'derived',
    nullable: true,
    example: '[💊](https://pump.fun/coin/…)',
  },
  chainName: { type: 'derived', nullable: false, example: 'Solana' },
  venue: { type: 'derived', nullable: true, example: 'LaunchLab' },
  venueTech: { type: 'derived', nullable: true, example: 'Raydium' },
  venueLine: {
    type: 'derived',
    nullable: true,
    example: 'LaunchLab via Raydium',
  },
  venueSuffix: {
    type: 'derived',
    nullable: true,
    example: ' @ Flap via Pancakeswap V2',
    description:
      'Same resolution as venueLine, composed as a suffix (" @ X"); empty when no venue. Never leaves a bare ` @ ` behind.',
  },
  venueSuffixShort: { type: 'derived', nullable: true, example: ' @ Pump' },
  fdvAth: { type: 'derived', nullable: true, example: '5.6K' },
  fdvAthAgo: { type: 'derived', nullable: true, example: '9d' },
  alternatives: {
    type: 'derived',
    nullable: true,
    example: 'Also on: bsc, eth',
  },
  liquidityRatio: {
    type: 'derived',
    nullable: true,
    example: 'x3',
    description:
      'FDV÷liquidity multiplier (round); brackets are author-composed. Empty below 1× or unknown.',
  },
  age: {
    type: 'derived',
    nullable: true,
    example: '3d',
    description:
      'Best-pair age (best-liquidity PAIR creation time; proxy — never token deploy age). Empty when unknown.',
  },
  honeypotLine: {
    type: 'derived',
    nullable: true,
    example: 'SIM: OK ⋅ T: 3/5',
    description:
      '🍯 tax/simulation row: value lowers a NEW line (\\n🍯 …); empty when silenced (clean 0/0 or nothing measured).',
  },
  headerIcon: {
    type: 'derived',
    nullable: true,
    example: '🟡',
    description:
      'Launchpad icon-link when a launchpad resolves, else the chain display emoji (empty when neither exists).',
  },
  newTokenIcon: {
    type: 'derived',
    nullable: true,
    example: '🆕',
    description:
      'Title status emoji for best-pair age under 15 minutes; compose before headerIcon ({{newTokenIcon}}{{headerIcon}} → 🆕💊). Empty at/after 15m and when the age is unknown or in the future.',
  },
  curveRow: {
    type: 'derived',
    nullable: true,
    example: '\\n⏳ 45% @ Pump',
    description:
      'Launchpad-layout bonding row lowered as a NEW line: ⏳ + optional progress% + the launchpad display name. The name falls back to bondingCurve.launchpadId when the snapshot launchpad is null (so the launchpadName override still applies). Empty off curve.',
  },
  quoteSuffix: {
    type: 'derived',
    nullable: true,
    example: '/Bitcoin',
    description:
      'Curve quote-symbol suffix for the headline ($SYMBOL/Bitcoin). Empty off curve or without a quote symbol.',
  },
  fdvChangeBracket: {
    type: 'derived',
    nullable: true,
    example: '\\[9.6K/353%\\] ',
    description:
      'Headline [FDV/24h change] bracket with its OWN trailing space. The key owns the MarkdownV2 bracket escaping (\\[…\\]) — a body must NOT add literal brackets. Empty when both values are unknown or on curve (the launchpad layout drops it).',
  },
  usdRow: {
    type: 'derived',
    nullable: true,
    example: '\\n💰 USD: `0.00007707`',
    description:
      '💰 USD line lowered as a NEW line with the price in a MarkdownV2 code span (raw value inside — never compose the span in the body); empty on curve (the launchpad layout has no USD row).',
  },
  liqRow: {
    type: 'derived',
    nullable: true,
    example: '\\n💦 Liq: `394` ⚠️🔒',
    description:
      '💦 Liq line lowered as a NEW line: one-side liquidity in a MarkdownV2 code span (raw value inside) plus the badges outside it; empty on curve (the launchpad layout has no Liq row).',
  },
  market5mRow: {
    type: 'derived',
    nullable: true,
    example: '📈 5M: `159` ⋅ `1.7%` 🅑 `3` Ⓢ `5`',
    description:
      'Rick-style 5-minute row (mirror of market1hRow): 📈/📉 direction, 5m volume, 5m change, buys (🅑) and sells (Ⓢ), every number in its own code span. Empty unless all four 5m values are known.',
  },
  marketRow: {
    type: 'derived',
    nullable: true,
    example: '📈 5M: `159` ⋅ `1.7%` 🅑 `3` Ⓢ `5`',
    description:
      'Layout switch for the window row: market5mRow on a bonding curve, market1hRow off curve (byte-identical to that key).',
  },
  liquidityUsdSide: {
    type: 'derived',
    nullable: true,
    example: '394',
    description:
      'Display-only one-side liquidity (liquidityUsd ÷ 2); N/A when unknown. liquidityUsd keeps meaning total.',
  },
  liquidityFlags: {
    type: 'derived',
    nullable: true,
    example: ' ⚠️🔒',
    description:
      'Liq badges (raw emoji, one leading space when non-empty): ⚠️ low one-side liquidity heuristic + 🔒 locked/burned LP ≥ 50%.',
  },
  honeypotBlock: {
    type: 'derived',
    nullable: true,
    example: '\\n\\n🍯 SIM: OK ⋅ T: 3/5',
    description:
      'Same 🍯 core as honeypotLine, lowered after a BLANK line; empty when silenced.',
  },
  ageSuffix: {
    type: 'derived',
    nullable: true,
    example: ' ⋅ Age: `7d`',
    description:
      'Suffix carrying the pair age; empty when the age is unknown, so no dangling separator is left.',
  },
  nameLink: {
    type: 'derived',
    nullable: true,
    example: '[Koda](https://t.me/DexterBot?start=…)',
    description:
      'Plain name link using botStartUrl; falls back to the plain name without a URL. Reuses the name default (N/A) and unverified suffix. Compose bold as [*{{name}}*]({{botStartUrl}}).',
  },
  market1hRow: {
    type: 'derived',
    nullable: true,
    example: '📈 1H: `159` ⋅ `1.7%` 🅑 `3` Ⓢ `5`',
    description:
      'Rick-style 1-hour row: 📈/📉 direction, 1h volume, 1h change, buys (🅑) and sells (Ⓢ). Every number rides its own MarkdownV2 code span (monospace). Empty unless all four 1h values are known.',
  },
  holderTopRow: {
    type: 'derived',
    nullable: true,
    example: '\\n\\n👥 TH: `4.3`⋅`3.3`⋅`2.8`⋅`2.3`⋅`1.8` [`20%`]',
    description:
      'Holders top-5 row lowered after a BLANK line: per-holder % at 1 decimal (trailing zero kept) each in its own code span, joined by ⋅, then the top-10 total in brackets (also monospaced). Empty on any gap/malformed input (never N/A, never a partial row).',
  },
  timeframe: { type: 'string', nullable: true, example: '5m' },
  botStartUrl: {
    type: 'url',
    nullable: true,
    example: 'https://t.me/DexterBot?start=So1111…',
    description:
      'Raw bot deep-link URL — compose links in bodies as [{{name}}]({{botStartUrl}}) or [o]({{botStartUrl}}).',
  },
};

export interface PlaceholdersView {
  readonly command: TemplateCommand;
  readonly placeholders: PlaceholderDescriptor[];
}

/**
 * Placeholder catalog (`GET /api/dexter/placeholders/:command`).
 *
 * Metadata-only read of the closed registry vocabulary: 61 keys for
 * `ca|x|z|bare`, 62 for `c|cc` (`timeframe` ONLY there). No
 * persistence, no pipeline, no sends. Unknown command → 404.
 *
 * v1 sin auth como /dexter/token — same unauthenticated regime as the
 * existing `/dexter/*` lookup surface; auth arrives in a later phase.
 */
@Controller('api/dexter/placeholders')
export class PlaceholdersController {
  @Get(':command')
  public list(@Param('command') command: string): PlaceholdersView {
    if (!(TEMPLATE_COMMANDS as readonly string[]).includes(command)) {
      throw new NotFoundException({
        error: `Unknown template command: ${command}`,
        valid: [...TEMPLATE_COMMANDS],
      });
    }
    const typed = command as TemplateCommand;
    return {
      command: typed,
      placeholders: placeholdersFor(typed).map((key) => ({
        key,
        ...(PLACEHOLDER_META[key] ?? {
          type: 'string',
          nullable: true,
          example: '',
        }),
      })),
    };
  }
}

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
}

/**
 * Static catalog metadata per placeholder key. Pure documentation —
 * the closed vocabulary itself stays in `PLACEHOLDERS_BY_COMMAND`
 * (registry); this table only describes each key for the preview
 * playground. `type` is informational (`money`/`percent` render via
 * the shared formatters with `N/A` on null; `derived` keys are
 * renderer-computed; `url` keys travel raw).
 */
const PLACEHOLDER_META: Record<
  string,
  Omit<PlaceholderDescriptor, 'key'>
> = {
  symbol: { type: 'string', nullable: false, example: 'SOL' },
  name: { type: 'string', nullable: false, example: 'Solana' },
  chain: { type: 'string', nullable: false, example: 'solana' },
  address: {
    type: 'string',
    nullable: false,
    example: 'So11111111111111111111111111111111111111112',
  },
  priceUsd: { type: 'money', nullable: true, example: '$164.32' },
  priceChange24h: { type: 'percent', nullable: true, example: '2.5%' },
  marketCapUsd: { type: 'money', nullable: true, example: '$80.0B' },
  fdvUsd: { type: 'money', nullable: true, example: '$95.0B' },
  liquidityUsd: { type: 'money', nullable: true, example: '$12.0M' },
  lockedLiquidityPercent: {
    type: 'percent',
    nullable: true,
    example: '80%',
  },
  burnedPercent: { type: 'percent', nullable: true, example: '5%' },
  volume24hUsd: { type: 'money', nullable: true, example: '$2.5B' },
  holders: { type: 'number', nullable: true, example: '1200000' },
  top10HolderPercent: {
    type: 'percent',
    nullable: true,
    example: '12.5%',
  },
  top20HolderPercent: {
    type: 'percent',
    nullable: true,
    example: '18.75%',
  },
  totalSupply: { type: 'number', nullable: true, example: '600000000' },
  circulatingSupply: {
    type: 'number',
    nullable: true,
    example: '480000000',
  },
  maxSupply: { type: 'number', nullable: true, example: 'N/A' },
  devPctSupply: { type: 'percent', nullable: true, example: '1.25%' },
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
  timeframe: { type: 'string', nullable: true, example: '5m' },
};

export interface PlaceholdersView {
  readonly command: TemplateCommand;
  readonly placeholders: PlaceholderDescriptor[];
}

/**
 * Placeholder catalog (`GET /api/dexter/placeholders/:command`).
 *
 * Metadata-only read of the closed registry vocabulary: 28 keys for
 * `ca|x|z|bare`, 29 for `c|cc` (`timeframe` ONLY there). No
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

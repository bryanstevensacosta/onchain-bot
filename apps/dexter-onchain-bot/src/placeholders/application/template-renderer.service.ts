import { Inject, Injectable, Optional } from '@nestjs/common';
import { MessageFormatterAdapter } from '@/scan/infrastructure/formatter/message-formatter';
import type { ResolvedToken } from '@/scan/domain/ports/scan-pipeline.port';
import {
  PLACEHOLDERS_BY_COMMAND,
  placeholdersFor,
} from '../domain/placeholder-registry';
import type { TemplateCommand } from '../domain/placeholder-registry';

export const TEMPLATE_MAX_LENGTH = 4096;

export const TRADE_HINT_TEXT = '🤖 Use /c <address> <timeframe> for chart';

/** DI token for the todo-5 `DisplayMap` resolver (port owned here). */
export const DISPLAY_RESOLVER = Symbol('DISPLAY_RESOLVER');

/**
 * Minimal display-mapping port. Todo 5 provides the TypeORM-backed
 * implementation; the renderer only depends on this interface.
 */
export interface DisplayResolverPort {
  resolve(placeholderKey: string, matchValue: string): string;
}

/** Values accepted by `render`: token snapshot + chart timeframe. */
export type TemplateValues = Partial<ResolvedToken> & {
  readonly timeframe?: string;
};

export interface RenderResult {
  readonly text: string;
  readonly truncated: boolean;
  readonly placeholdersUsed: string[];
}

const PLACEHOLDER_PATTERN = /\{\{(\w+)\}\}/g;

export class UnknownPlaceholder extends Error {
  public readonly code = 'UNKNOWN_PLACEHOLDER';
  public readonly key: string;
  public readonly valid: string[];

  public constructor(key: string, validList: string[]) {
    super(`Unknown placeholder {{${key}}} (valid: [${validList.join(', ')}])`);
    this.name = 'UnknownPlaceholder';
    this.key = key;
    this.valid = [...validList];
  }
}

/** Alias for callers preferring the `*Error` suffix. */
export { UnknownPlaceholder as UnknownPlaceholderError };

export class UnsupportedTemplateSyntax extends Error {
  public readonly code = 'UNSUPPORTED_TEMPLATE_SYNTAX';

  public constructor(fragment: string) {
    super(
      `Unsupported template syntax ${JSON.stringify(fragment)}: ` +
        'no conditionals, loops or filters — use N templates instead',
    );
    this.name = 'UnsupportedTemplateSyntax';
  }
}

/** Alias for callers preferring the `*Error` suffix. */
export { UnsupportedTemplateSyntax as UnsupportedTemplateSyntaxError };

const MONEY_KEYS: readonly string[] = [
  'priceUsd',
  'marketCapUsd',
  'fdvUsd',
  'liquidityUsd',
  'volume24hUsd',
];

const NUMBER_KEYS: readonly string[] = [
  'holders',
  'totalSupply',
  'circulatingSupply',
  'maxSupply',
];

const PERCENT_KEYS: readonly string[] = [
  'priceChange24h',
  'lockedLiquidityPercent',
  'burnedPercent',
  'top10HolderPercent',
  'top20HolderPercent',
  'devPctSupply',
];

const RAW_STRING_KEYS: readonly string[] = [
  'symbol',
  'name',
  'chain',
  'address',
  'poolAddress',
  'source',
];

const shortenWallet = (wallet: string): string =>
  wallet.length > 10 ? `${wallet.slice(0, 4)}…${wallet.slice(-4)}` : wallet;

/**
 * Stateless MarkdownV2 template renderer with closed placeholder
 * semantics. Static body text is author-owned MarkdownV2 (never
 * touched); every substituted VALUE is `escapeV2`-escaped exactly
 * once (numeric formatters run BEFORE escaping, URLs/emoji/links
 * travel raw). Output is capped at 4096 chars via the shared
 * `MessageFormatterAdapter` truncate path.
 */
@Injectable()
export class TemplateRendererService {
  public constructor(
    @Inject(DISPLAY_RESOLVER)
    @Optional()
    private readonly displayResolver?: DisplayResolverPort | null,
  ) {}

  public render(
    body: string,
    values: TemplateValues,
    command: TemplateCommand = 'ca',
  ): RenderResult {
    if (body.includes('{%') || body.includes('{{#')) {
      throw new UnsupportedTemplateSyntax(body.includes('{%') ? '{%' : '{{#');
    }
    const valid: string[] =
      PLACEHOLDERS_BY_COMMAND[command] ?? placeholdersFor(command);
    const used: string[] = [];
    const substituted = body.replace(
      PLACEHOLDER_PATTERN,
      (_match: string, key: string) => {
        if (!valid.includes(key)) {
          throw new UnknownPlaceholder(key, valid);
        }
        used.push(key);
        return this.resolveValue(key, values);
      },
    );
    const cleaned =
      TemplateRendererService.cleanupDanglingSeparators(substituted);
    const capped = MessageFormatterAdapter.enforceLengthText(cleaned);
    return {
      text: capped.text,
      truncated: capped.truncated,
      placeholdersUsed: [...new Set(used)],
    };
  }

  public static cleanupDanglingSeparators(text: string): string {
    return text
      .replace(/[ \t]*[•|][ \t]*(?=\n|$)/g, '')
      .replace(/(^|\n)[ \t]*[•|][ \t]*/g, '$1');
  }

  private resolveValue(key: string, values: TemplateValues): string {
    const esc = (text: string): string =>
      MessageFormatterAdapter.escapeV2Text(text);
    if (MONEY_KEYS.includes(key)) {
      return esc(
        MessageFormatterAdapter.formatMoneyText(
          (values as Record<string, number | null>)[key] ?? null,
        ),
      );
    }
    if (NUMBER_KEYS.includes(key)) {
      return esc(
        MessageFormatterAdapter.formatNumberText(
          (values as Record<string, number | null>)[key] ?? null,
        ),
      );
    }
    if (PERCENT_KEYS.includes(key)) {
      return esc(
        MessageFormatterAdapter.formatPercentText(
          (values as Record<string, number | null>)[key] ?? null,
        ),
      );
    }
    if (RAW_STRING_KEYS.includes(key)) {
      const raw: unknown = (values as Record<string, unknown>)[key];
      if (typeof raw === 'string') {
        if (raw === '') return 'N/A';
        return esc(raw);
      }
      if (typeof raw === 'number' || typeof raw === 'boolean') {
        return esc(String(raw));
      }
      return 'N/A';
    }
    switch (key) {
      case 'devWallets': {
        const wallets = values.devWallets;
        if (wallets === null || wallets === undefined) return 'N/A';
        if (wallets.length === 0) return '';
        return esc(wallets.map((w) => shortenWallet(w.wallet)).join(', '));
      }
      case 'devLine': {
        return MessageFormatterAdapter.formatDevLine(values as ResolvedToken);
      }
      case 'chainDisplay': {
        return (
          this.displayResolver?.resolve('chain', String(values.chain ?? '')) ??
          ''
        );
      }
      case 'launchpadText': {
        return esc(values.launchpad?.name ?? '');
      }
      case 'launchpadTextLink': {
        const launchpad = values.launchpad;
        if (!launchpad) return '';
        return `[${esc(launchpad.name)}](${launchpad.url})`;
      }
      case 'launchpadIcon': {
        const launchpad = values.launchpad;
        if (!launchpad) return '';
        return (
          this.displayResolver?.resolve('launchpad', launchpad.id) ?? ''
        );
      }
      case 'launchpadIconLink': {
        const launchpad = values.launchpad;
        if (!launchpad) return '';
        const emoji =
          this.displayResolver?.resolve('launchpad', launchpad.id) ?? '';
        if (!emoji) {
          return `[${esc(launchpad.name)}](${launchpad.url})`;
        }
        return `[${emoji}](${launchpad.url})`;
      }
      case 'dexscreenerUrl': {
        if (!values.address) return '';
        return MessageFormatterAdapter.buildScanUrl(
          'dexscreener',
          String(values.chain ?? 'unknown'),
          values.address,
        );
      }
      case 'geckoterminalUrl': {
        if (!values.address) return '';
        return MessageFormatterAdapter.buildScanUrl(
          'geckoterminal',
          String(values.chain ?? 'unknown'),
          values.address,
        );
      }
      case 'scanLinks': {
        if (!values.address) return '';
        const chain = String(values.chain ?? 'unknown');
        const dex = MessageFormatterAdapter.buildScanUrl(
          'dexscreener',
          chain,
          values.address,
        );
        const gecko = MessageFormatterAdapter.buildScanUrl(
          'geckoterminal',
          chain,
          values.address,
        );
        return `[DexScreener](${dex}) \\| [GeckoTerminal](${gecko})`;
      }
      case 'tradeHint': {
        return TRADE_HINT_TEXT;
      }
      case 'timeframe': {
        const tf = values.timeframe;
        if (tf === null || tf === undefined || tf === '') return '';
        return esc(String(tf));
      }
      default: {
        return '';
      }
    }
  }
}

/** Contract alias: `TemplateRenderer.render` stays stable for todos 6-11. */
export { TemplateRendererService as TemplateRenderer };

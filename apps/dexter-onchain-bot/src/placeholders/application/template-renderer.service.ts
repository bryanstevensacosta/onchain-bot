import { Inject, Injectable, Optional } from '@nestjs/common';
import { MessageFormatterAdapter } from '@/scan/infrastructure/formatter/message-formatter';
import type {
  BondingCurveInfo,
  HolderConcentrationInfo,
  HoneypotInfo,
  LaunchpadInfo,
  ResolvedToken,
} from '@/scan/domain/ports/scan-pipeline.port';
import { BotIdentityService } from '@/settings/application/bot-identity.service';
import {
  PLACEHOLDERS_BY_COMMAND,
  placeholdersFor,
} from '../domain/placeholder-registry';
import type { TemplateCommand } from '../domain/placeholder-registry';
import { chainNameOf, resolveVenueTexts } from '../domain/venue-display';

export const TEMPLATE_MAX_LENGTH = 4096;

export const TRADE_HINT_TEXT = '🤖 Use /c <address> <timeframe> for chart';

/**
 * `liquidityFlags` ⚠️ threshold (D2, OUR display heuristic — not a
 * security claim): one-side liquidity below this many USD. Rick's
 * exact threshold is undocumented; the owner can retune the constant.
 */
export const LOW_LIQUIDITY_SIDE_USD = 1_000;

/**
 * `newTokenIcon` 🆕 window (Rick docs: pricebot#scan-icons, "token age
 * under 15 minutes"). Strictly BELOW this elapsed time: exactly 15
 * minutes renders silence ("under 15 minutes", not "15 or less").
 */
export const NEW_TOKEN_ICON_MAX_AGE_MS = 15 * 60 * 1000;

/**
 * Coherence ε for `holderTopRow` (plan dexter-rick-compact-card
 * §10.5-§10.7), in PERCENTAGE POINTS. It is the SAME literal pinned
 * in market-data's spec — dexter cannot import from market-data (no
 * shared package), so the two apps keep the constant in sync by
 * contract. The invariant is exact when both sides accumulate over
 * the SAME filtered array in the SAME order; ε absorbs dexter's
 * re-accumulation and display rounding, never serialization (JSON
 * preserves the exact double). Do NOT reuse `COMPUTED_FDV_EPSILON_*`
 * (FDV-scoped, different contract).
 */
const HOLDER_SUM_EPSILON = 1e-9;

/** DI token for the todo-5 `DisplayMap` resolver (port owned here). */
export const DISPLAY_RESOLVER = Symbol('DISPLAY_RESOLVER');

/**
 * Minimal display-mapping port. Todo 5 provides the TypeORM-backed
 * implementation; the renderer only depends on this interface.
 */
export interface DisplayResolverPort {
  resolve(placeholderKey: string, matchValue: string): string;
}

/** DisplayMap dimension for operator-chosen launchpad display names. */
export const LAUNCHPAD_NAME_DISPLAY_KEY = 'launchpadName';

/**
 * Display-only launchpad name: DisplayMap `launchpadName` override wins,
 * detector `name` is the fallback. Whitespace/empty override falls back
 * (never blank); null launchpad renders `""`. Canonical `id` never changes.
 */
export function resolveLaunchpadDisplayName(
  launchpad: LaunchpadInfo | null | undefined,
  resolver?: DisplayResolverPort | null,
): string {
  if (!launchpad) return '';
  const detectorName = typeof launchpad.name === 'string' ? launchpad.name : '';
  const raw =
    typeof launchpad.id === 'string'
      ? (resolver?.resolve(LAUNCHPAD_NAME_DISPLAY_KEY, launchpad.id) ?? '')
      : '';
  const override = typeof raw === 'string' ? raw.trim() : '';
  return override !== '' ? override : detectorName;
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
 * Bot API `start` payload rules: max 64 chars, `[A-Za-z0-9_-]`.
 * EVM (`0x`+40 hex = 42) and Solana (44) addresses fit; anything
 * else degrades the deep-link key to `""` (never silently truncated).
 */
export function isBotStartPayload(value: string): boolean {
  return /^[A-Za-z0-9_-]{1,64}$/.test(value);
}

/**
 * A measured tax side, re-checked at render time: finite number
 * within 0-100 (the normalized PERCENT contract of the 🍯 leg);
 * anything else reads as unknown (`?`), never as `0`.
 */
function honeypotTaxValue(raw: unknown): number | null {
  return typeof raw === 'number' &&
    Number.isFinite(raw) &&
    raw >= 0 &&
    raw <= 100
    ? raw
    : null;
}

/**
 * Tax display for the 🍯 row (plan todo 71; display extension OUR
 * OWN — pinned in the spec name): integers stay integral (`3`, `5`,
 * `0`); otherwise trimmed to at most 2 decimals (`3.99`, `3.8`).
 * A measured non-zero value that would collapse to `0` at 2 decimals
 * steps up to 3 decimals (`0.004`); anything still collapsing below
 * that renders `<0.001` — NEVER `0` for a measured > 0. No `%`, no
 * money formatters (the row carries none).
 */
function formatHoneypotTaxText(value: number): string {
  if (Number.isInteger(value)) return String(value);
  const at2 = Math.round(value * 100) / 100;
  if (at2 > 0) return at2.toFixed(2).replace(/\.?0+$/, '');
  const at3 = Math.round(value * 1000) / 1000;
  if (at3 > 0) return at3.toFixed(3).replace(/\.?0+$/, '');
  return '<0.001';
}

function formatHoneypotTaxSides(
  buy: number | null,
  sell: number | null,
): string {
  const buyText = buy === null ? '?' : formatHoneypotTaxText(buy);
  const sellText = sell === null ? '?' : formatHoneypotTaxText(sell);
  return `T: ${buyText}/${sellText}`;
}

/**
 * Core of the 🍯 row (plan todo 71). Total over (sim, buy, sell);
 * `""` = silence. See the `honeypotLine` case for the pinned matrix
 * (fail beats 0/0; ok/null silence at exact 0/0; both-absent silence
 * only without a fail; `?` on unknown sides; one-sided `?` forms are
 * OUR extension).
 */
function resolveHoneypotLineCore(
  honeypot: HoneypotInfo | null | undefined,
): string {
  if (!honeypot) return '';
  const sim =
    honeypot.sim === 'ok' || honeypot.sim === 'fail' ? honeypot.sim : null;
  const buy = honeypotTaxValue(honeypot.buy);
  const sell = honeypotTaxValue(honeypot.sell);
  if (sim === 'fail') {
    // SIEMPRE fila — a failed simulation is always worth saying.
    return buy === null && sell === null
      ? 'SIM: FAIL'
      : `SIM: FAIL ⋅ ${formatHoneypotTaxSides(buy, sell)}`;
  }
  if (buy === null && sell === null) return '';
  if (buy === 0 && sell === 0) return '';
  const sides = formatHoneypotTaxSides(buy, sell);
  return sim === 'ok' ? `SIM: OK ⋅ ${sides}` : sides;
}

/**
 * Guard for the four 1-hour row values (dexter `{{market1hRow}}`):
 * a finite number or `null` — anything else (absent, string, NaN,
 * Infinity) silences the whole row rather than printing a guess.
 * Local on purpose: the renderer must not trust `TemplateValues`
 * (always `Partial<ResolvedToken>`), whatever the producer sent.
 */
function finiteNumberOrNull(raw: unknown): number | null {
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
}

/**
 * 1-hour transaction counts: finite AND `>= 0` — the same rule the
 * client boundary applies; a negative count is garbage, never a
 * number to format.
 */
function nonNegativeCountOrNull(raw: unknown): number | null {
  return typeof raw === 'number' && Number.isFinite(raw) && raw >= 0
    ? raw
    : null;
}

/**
 * Shape guard for `holderTopRow` (plan dexter-rick-compact-card
 * §10.5-§10.7): a coherent `{ topPercents, top10Percent }` object or
 * `null` (silence). Local on purpose — the renderer must not trust
 * `TemplateValues` (always `Partial<ResolvedToken>`), whatever the
 * producer sent. Rules mirror the market-data client guard EXCEPT
 * the ordering rule: §10.7 pins the non-increasing check at the
 * CLIENT boundary, so the renderer renders whatever coherent list it
 * receives (the pipeline re-validation already returns `null` for an
 * unordered list). `topPercents` an array of 0..5 finite entries in
 * [0,100], `top10Percent` finite within `[-ε, 100+ε]`, and
 * `sum(topPercents) <= top10Percent + ε`. `topPercents: []` is a
 * valid object that renders silence.
 */
function holderConcentrationOrNull(
  raw: unknown,
): HolderConcentrationInfo | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return null;
  }
  const candidate = raw as {
    readonly topPercents?: unknown;
    readonly top10Percent?: unknown;
  };
  const percents = candidate.topPercents;
  const top10 = candidate.top10Percent;
  if (!Array.isArray(percents) || percents.length > 5) return null;
  const clean: number[] = [];
  for (const entry of percents) {
    if (typeof entry !== 'number' || !Number.isFinite(entry)) return null;
    if (entry < 0 || entry > 100) return null;
    clean.push(entry);
  }
  if (typeof top10 !== 'number' || !Number.isFinite(top10)) return null;
  if (top10 < -HOLDER_SUM_EPSILON || top10 > 100 + HOLDER_SUM_EPSILON) {
    return null;
  }
  const sum = clean.reduce((total, entry) => total + entry, 0);
  if (sum > top10 + HOLDER_SUM_EPSILON) return null;
  return { topPercents: clean, top10Percent: top10 };
}

/**
 * Shape guard for the launchpad-layout keys (dexter bonding-curve
 * layout, 2026-10-30): a coherent on-curve `BondingCurveInfo` or
 * `null` (off curve / silence). Local on purpose — the renderer must
 * not trust `TemplateValues` (always `Partial<ResolvedToken>`),
 * whatever the producer sent. Rules mirror the market-data client
 * guard: `onCurve === true`, a non-empty `launchpadId`,
 * `quoteSymbol`/`quoteMint` absent/null or non-empty strings, and
 * `progressPercent` absent/null or finite within [0, 100].
 */
function bondingCurveOrNull(raw: unknown): BondingCurveInfo | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return null;
  }
  const candidate = raw as Record<string, unknown>;
  if (candidate.onCurve !== true) return null;
  if (
    typeof candidate.launchpadId !== 'string' ||
    candidate.launchpadId === ''
  ) {
    return null;
  }
  const optionalString = (value: unknown): string | null | undefined => {
    if (value === null || value === undefined) return null;
    if (typeof value !== 'string' || value === '') return undefined;
    return value;
  };
  const quoteSymbol = optionalString(candidate.quoteSymbol);
  const quoteMint = optionalString(candidate.quoteMint);
  if (quoteSymbol === undefined || quoteMint === undefined) return null;
  const rawProgress = candidate.progressPercent;
  let progressPercent: number | null = null;
  if (rawProgress !== null && rawProgress !== undefined) {
    if (typeof rawProgress !== 'number' || !Number.isFinite(rawProgress)) {
      return null;
    }
    if (rawProgress < 0 || rawProgress > 100) return null;
    progressPercent = rawProgress;
  }
  return {
    onCurve: true,
    launchpadId: candidate.launchpadId,
    quoteSymbol,
    quoteMint,
    progressPercent,
  };
}

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
    @Inject(BotIdentityService)
    @Optional()
    private readonly botIdentity?: BotIdentityService | null,
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

  /**
   * Collapses remnants left behind by values that rendered `""`:
   * the dangling `•`/`|`/`@` families (todo 4) plus EMPTY bracket
   * pairs from author-composed bodies like `[{{liquidityRatio}}]` /
   * `[{{alternatives}}]` / `[{{chainDisplay}}]` (todo 69) — an empty
   * derived value must never leave an ugly `[]` on the card.
   *
   * Bracket rules run trailing → leading → mid-line in that order:
   * `Liq: 7.9K []` and a bare `[]` collapse whole (`''`), `[] SOL`
   * keeps its text (`SOL`), `A [] B` loses only the previous hspace
   * (`A B`). Every rule carries the `(?!\()` guard on `]` so a
   * text-less LINK (`[](...)`, e.g. the documented
   * `[{{name}}]({{botStartUrl}})` bodies) is never touched.
   * Brackets with content (`[x3]`, `[Virtuals](url)`) never match,
   * and neither does escapeV2 output: escaping turns `[`/`]` into
   * `\[`/`\]`, so a backslash always sits between the raw brackets
   * of an escaped value.
   *
   * Todo 71 (owner decision 2026-10-19) extends the same family to
   * the backtick compositions of the v14 body and its surroundings:
   * a bracket whose only content is an EMPTY code span (``[``]``
   * from ``[`{{x}}`]`` with an empty value) collapses exactly like
   * `[]` — same trailing/leading/mid hspace semantics, same
   * `(?!\()` anti-link guard on `[``](url)`; an ORPHAN empty code
   * span (two adjacent backticks from `` `{{x}}` ``, escaped ticks
   * never match — a backslash sits between them) collapses the same
   * way, with lookarounds keeping bracket-adjacent pairs untouched
   * (`[``](url)` survives); and a `⇨` (U+21E8) left dangling at the
   * end of a line after those collapses is removed with its hspace.
   * Non-dangling `⇨` (line start or mid-line, e.g. `A ⇨ B`) and
   * populated spans/brackets (`[x3]`, `` `x` ``, `[texto](url)`)
   * stay byte-intact.
   */
  public static cleanupDanglingSeparators(text: string): string {
    return (
      text
        .replace(/[ \t]*[•|][ \t]*(?=\n|$)/g, '')
        .replace(/(^|\n)[ \t]*[•|][ \t]*/g, '$1')
        .replace(/^[ \t]*[^@\n]*[ \t]@[ \t]*(?=\n|$)/gm, '')
        .replace(/(^|\n)[ \t]*@[ \t]+/g, '$1')
        // Trailing: pair ends the line — consume adjacent hspace too.
        .replace(/[ \t]*\[[ \t]*\](?!\()[ \t]*(?=\n|$)/g, '')
        // Leading: pair starts the line — keep the line text.
        .replace(/(^|\n)[ \t]*\[[ \t]*\](?!\()[ \t]*/g, '$1')
        // Mid-line: pair floats between text — consume only the
        // previous hspace (the one before the brackets).
        .replace(/[ \t]*\[[ \t]*\](?!\()/g, '')
        // Launchpad layout (dexter plan §10.15, body v17): the FDV line
        // composes `\[{{fdvAthAgo}}\]` — STATIC brackets escaped by the
        // body — so an empty age leaves the ESCAPED pair `\[\]`
        // (backslash inside the pair), invisible to the raw `[]` trio
        // above. Same three positions, same hspace semantics and same
        // anti-link guard; a pair WITH content (`\[7d\]`, the ATH age)
        // is author data and never matches.
        .replace(/[ \t]*\\\[[ \t]*\\\](?!\()[ \t]*(?=\n|$)/g, '')
        .replace(/(^|\n)[ \t]*\\\[[ \t]*\\\](?!\()[ \t]*/g, '$1')
        .replace(/[ \t]*\\\[[ \t]*\\\](?!\()/g, '')
        // Todo 71: bracket containing ONLY an empty code span — the
        // ``[`{{x}}`]`` composition with an empty value — same
        // three positions and same anti-link guard as `[]` above.
        .replace(/[ \t]*\[[ \t]*``[ \t]*\](?!\()[ \t]*(?=\n|$)/g, '')
        .replace(/(^|\n)[ \t]*\[[ \t]*``[ \t]*\](?!\()[ \t]*/g, '$1')
        .replace(/[ \t]*\[[ \t]*``[ \t]*\](?!\()/g, '')
        // Todo 71: orphan empty code span (`` `{{x}}` `` with an
        // empty value). Lookarounds keep the pair inside brackets
        // (a blocked `[``](url)` link) byte-intact.
        .replace(/[ \t]*(?<!\[)``(?!\])[ \t]*(?=\n|$)/g, '')
        .replace(/(^|\n)[ \t]*(?<!\[)``(?!\])[ \t]*/g, '$1')
        .replace(/[ \t]*(?<!\[)``(?!\])/g, '')
        // Todo 71: `⇨` left dangling at the end of a line after the
        // collapses above (v14 FDV line) — removed with its hspace.
        // Only the line-END form: a mid-line or line-start `⇨` is
        // author content and stays.
        .replace(/[ \t]*⇨[ \t]*(?=\n|$)/g, '')
    );
  }

  /**
   * Launchpad icon-link resolution, shared by `launchpadIconLink` and
   * the `headerIcon` fallback chain: the `launchpad` DisplayMap emoji
   * as a link when present, the display-name link as fallback, `""`
   * when the token has no launchpad. Both branches are composed raw
   * (they are links, not values) — never escaped twice.
   */
  private resolveLaunchpadIconLink(values: TemplateValues): string {
    const launchpad = values.launchpad;
    if (!launchpad) return '';
    const emoji =
      this.displayResolver?.resolve('launchpad', launchpad.id) ?? '';
    if (!emoji) {
      const display = resolveLaunchpadDisplayName(
        launchpad,
        this.displayResolver,
      );
      return `[${MessageFormatterAdapter.escapeV2Text(display)}](${launchpad.url})`;
    }
    return `[${emoji}](${launchpad.url})`;
  }

  /**
   * Shared window-row renderer for `market1hRow` / `market5mRow`
   * (launchpad layout 2026-10-30 extraction — the 1H bytes MUST stay
   * identical). `label` is the only difference between the two keys
   * (`1H` / `5M`).
   *
   * `icon` is price-led (`📉` only on a strictly negative change).
   * SILENCE (`""`) when ANY of the four is missing/non-finite — no
   * half-empty row, no `N/A`, never a guessed value. Counts
   * additionally require `>= 0`. Every value rides its OWN MarkdownV2
   * code span and the numbers travel RAW inside the span
   * (`codeV2Text`, never `escapeV2Text`: a `\.` inside a code entity
   * prints its backslash), so the row emits ZERO backslashes. No
   * leading/trailing whitespace: templates own separators.
   */
  private renderMarketWindowRow(
    label: '1H' | '5M',
    volumeRaw: unknown,
    changeRaw: unknown,
    buysRaw: unknown,
    sellsRaw: unknown,
  ): string {
    const volume = finiteNumberOrNull(volumeRaw);
    const change = finiteNumberOrNull(changeRaw);
    const buys = nonNegativeCountOrNull(buysRaw);
    const sells = nonNegativeCountOrNull(sellsRaw);
    if (volume === null || change === null || buys === null || sells === null) {
      return '';
    }
    const icon = change < 0 ? '📉' : '📈';
    const code = (text: string): string =>
      MessageFormatterAdapter.codeV2Text(text);
    return (
      `${icon} ${label}: ${code(MessageFormatterAdapter.formatMoneyText(volume))} ⋅ ` +
      `${code(MessageFormatterAdapter.formatPercentText(change))} 🅑 ` +
      `${code(MessageFormatterAdapter.formatNumberText(buys))} Ⓢ ` +
      `${code(MessageFormatterAdapter.formatNumberText(sells))}`
    );
  }

  private resolveValue(key: string, values: TemplateValues): string {
    const esc = (text: string): string =>
      MessageFormatterAdapter.escapeV2Text(text);
    // `priceUsd` rides the adaptive price rule (dust renders full
    // digits, never `$0.00`); every other money key keeps compact K/M/B.
    if (key === 'priceUsd') {
      return esc(
        MessageFormatterAdapter.formatPriceText(
          (values as Record<string, number | null>)[key] ?? null,
        ),
      );
    }
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
      // Provenance disclosure (dexter plan todo 39): a metadata-sourced
      // name is never rendered as verified fact — it carries a mandatory
      // `(unverified)` suffix. `symbol` stays raw (tickers feed cashtags
      // and links); the name carries the badge. Market/absent provenance
      // renders byte-identical to before.
      if (
        key === 'name' &&
        values.identityProvenance === 'metadata' &&
        typeof raw === 'string' &&
        raw !== ''
      ) {
        return esc(`${raw} (unverified)`);
      }
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
        return esc(
          resolveLaunchpadDisplayName(values.launchpad, this.displayResolver),
        );
      }
      case 'launchpadTextLink': {
        const launchpad = values.launchpad;
        if (!launchpad) return '';
        const display = resolveLaunchpadDisplayName(
          launchpad,
          this.displayResolver,
        );
        return `[${esc(display)}](${launchpad.url})`;
      }
      case 'launchpadIcon': {
        const launchpad = values.launchpad;
        if (!launchpad) return '';
        return this.displayResolver?.resolve('launchpad', launchpad.id) ?? '';
      }
      case 'launchpadIconLink': {
        return this.resolveLaunchpadIconLink(values);
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
      case 'botStartUrl': {
        const username = this.botIdentity?.getUsername() ?? '';
        const address =
          typeof values.address === 'string' ? values.address : '';
        if (!username || !isBotStartPayload(address)) return '';
        return `https://t.me/${username}?start=${address}`;
      }
      case 'chainName': {
        return esc(
          chainNameOf(typeof values.chain === 'string' ? values.chain : null),
        );
      }
      case 'venue':
      case 'venueTech':
      case 'venueLine':
      case 'venueSuffix':
      case 'venueSuffixShort': {
        const launchpad = values.launchpad;
        const launchpadForVenue =
          launchpad == null
            ? launchpad
            : {
                ...launchpad,
                name: resolveLaunchpadDisplayName(
                  launchpad,
                  this.displayResolver,
                ),
              };
        const texts = resolveVenueTexts(launchpadForVenue, values.venue);
        if (key === 'venueSuffixShort') {
          // Plan todo 73: the SHORT venue (`texts.venue`: origin when a
          // launchpad origin is known, else the DEX display) composed
          // as a suffix — `" @ X"` when it resolves, `""` (silence)
          // otherwise. Escaped ONCE on the composed string. `venueSuffix`
          // (venueLine-based) is untouched.
          return texts.venue === '' ? '' : esc(` @ ${texts.venue}`);
        }
        if (key === 'venueSuffix') {
          // Plan todo 71 (owner decision 2026-10-19): the venue-line
          // resolution composed as a SUFFIX — `" @ X"` when a venue
          // resolves, `""` (silence) otherwise. Escaped ONCE on the
          // composed string. Kills the empty-line hole of bodies that
          // keep ` @ ` literals around an empty `{{venueLine}}`
          // (the `@` collapse removes the match but leaves the `\n`).
          return texts.venueLine === '' ? '' : esc(` @ ${texts.venueLine}`);
        }
        const text =
          key === 'venue'
            ? texts.venue
            : key === 'venueTech'
              ? texts.tech
              : texts.venueLine;
        return text === '' ? '' : esc(text);
      }
      case 'honeypotLine': {
        // Plan todo 71 — Rick-parity 🍯 row. SUFFIX mechanics
        // (precedent: `venueLine` `""`=silencio + bounded suffix —
        // NOT the todo-62 value-packaging): the value lowers a NEW
        // line (`"\n🍯 " + core`) at the call site; `""` = silence
        // and no line appears at all.
        //
        // TOTAL matrix over (sim, buy, sell) — gated on the RAW
        // normalized values, NEVER round-to-0-and-silence:
        //  - `sim === 'fail'` → ALWAYS a row (minimum `SIM: FAIL`;
        //    with sides `SIM: FAIL ⋅ T: b/s` / `b/?` / `?/s`). The
        //    fail verdict beats the 0/0 silence (SIEMPRE rule).
        //  - `sim === 'ok'` → `SIM: OK ⋅ T: …`; both sides EXACTLY 0
        //    → silence (doc: "no taxes + a working round trip shows
        //    nothing").
        //  - `sim === null` (Fase 1, external source) → `T: …`, NEVER
        //    a `SIM:` claim (the halves are read separately).
        //  - Unknown sides render `?`: `T: b/?` is Rick's own form;
        //    `T: ?/s` (and the one-sided forms under ok/null) are OUR
        //    OWN extension — the doc only defines `?` under
        //    `SIM: FAIL`. Pinned in the spec name too.
        //  - Silence ONLY: (a) both sides EXACTLY 0 (any sim except
        //    fail), or (b) both sides absent with `sim !== 'fail'`
        //    (no source / nothing worth saying).
        const core = resolveHoneypotLineCore(values.honeypot);
        return core === '' ? '' : esc(`\n🍯 ${core}`);
      }
      case 'headerIcon': {
        // D7 (Rick compact card): the launchpad icon-link when a
        // launchpad resolves (`[💊](url)` on Solana pump), else the
        // `chainDisplay` value (BSC → 🟡). Both branches are already
        // composed raw — no extra escaping and no invented icon; when
        // both are `""` the body keeps its leading space (accepted
        // caveat, same class as the old header).
        const iconLink = this.resolveLaunchpadIconLink(values);
        if (iconLink !== '') return iconLink;
        return this.resolveValue('chainDisplay', values);
      }
      case 'liquidityUsdSide': {
        // D4 (Rick compact card): display-only ONE-SIDE liquidity —
        // `liquidityUsd / 2` (exact for a balanced AMM at the
        // marginal price; approximation pinned in the plan). The core
        // `liquidityUsd` invariant (total) is untouched. Absent /
        // non-finite → `N/A`; escaped once like any money value.
        const liq =
          typeof values.liquidityUsd === 'number' &&
          Number.isFinite(values.liquidityUsd)
            ? values.liquidityUsd
            : null;
        if (liq === null) return 'N/A';
        return esc(MessageFormatterAdapter.formatMoneyText(liq / 2));
      }
      case 'liquidityFlags': {
        // D2/D3 (Rick compact card), RAW emoji (never escaped):
        //  - `⚠️` when the one-side liquidity is below
        //    `LOW_LIQUIDITY_SIDE_USD` — OUR display heuristic, not a
        //    security claim.
        //  - `🔒` when `lockedLiquidityPercent + burnedPercent >= 50`
        //    and at least one of them is measured (finite). The lock
        //    reading is token-level and top-N based: a false negative
        //    is possible and a secondary-pool lock can trigger it.
        // Icons are adjacent; ONE leading space only when non-empty
        // (lock-only ` 🔒` must never glue to the previous token).
        const liq =
          typeof values.liquidityUsd === 'number' &&
          Number.isFinite(values.liquidityUsd)
            ? values.liquidityUsd
            : null;
        const side = liq === null ? null : liq / 2;
        const low = side !== null && side < LOW_LIQUIDITY_SIDE_USD;
        const locked =
          typeof values.lockedLiquidityPercent === 'number' &&
          Number.isFinite(values.lockedLiquidityPercent)
            ? values.lockedLiquidityPercent
            : null;
        const burned =
          typeof values.burnedPercent === 'number' &&
          Number.isFinite(values.burnedPercent)
            ? values.burnedPercent
            : null;
        const hasLock = locked !== null || burned !== null;
        const lock = hasLock && (locked ?? 0) + (burned ?? 0) >= 50;
        const flags = `${low ? '⚠️' : ''}${lock ? '🔒' : ''}`;
        return flags === '' ? '' : ` ${flags}`;
      }
      case 'honeypotBlock': {
        // D9 (Rick compact card): SAME 🍯 core as `honeypotLine`,
        // lowered after a BLANK line (`"\n\n🍯 " + core`). `""` =
        // silence so a card without a row keeps its bytes; `honeypotLine`
        // stays byte-identical for existing templates.
        const core = resolveHoneypotLineCore(values.honeypot);
        return core === '' ? '' : esc(`\n\n🍯 ${core}`);
      }
      case 'market1hRow': {
        // Rick 1-hour window row (docs: pricebot#reading-a-token-scan):
        // `📈 1H: 159 ⋅ 1.7% 🅑 3 Ⓢ 5` = 1h volume, 1h price change,
        // 1h buys, 1h sells. Direction icon is price-led: `📉` ONLY on
        // a strictly negative change (zero and positive → `📈`).
        //
        // SILENCE (`""`) when ANY of the four is missing/non-finite —
        // no half-empty row, no `N/A`, never a guessed value. Counts
        // additionally require `>= 0` (same rule as the client).
        // Composition reuses the shared formatters (`formatMoneyText`,
        // `formatPercentText` — it already emits `%`, so none is
        // appended — and `formatNumberText` for the counts); each
        // value rides its OWN MarkdownV2 code span (owner request
        // 2026-10-26: monospaced numbers — `1H: `1.1K` ⋅ `-4.1%``).
        // The static glue (`1H:`, `⋅`, `🅑`, `Ⓢ`) carries no V2
        // specials, so nothing else needs escaping and the values are
        // escaped exactly once INSIDE the span (`codeV2Text`, not
        // `escapeV2Text`: a `\.` inside a code entity would print its
        // backslash). No leading/trailing whitespace: templates own
        // separators. The shared helper (launchpad layout, 2026-10-30)
        // keeps these bytes identical for `market5mRow`.
        return this.renderMarketWindowRow(
          '1H',
          values.volume1hUsd,
          values.priceChange1h,
          values.txns1hBuys,
          values.txns1hSells,
        );
      }
      case 'market5mRow': {
        // Launchpad layout (2026-10-30): exact mirror of `market1hRow`
        // on the 5-MINUTE window — `5M:` replaces `1H:`, same shared
        // helper, same SILENCE matrix (feed the four new 5m fields).
        return this.renderMarketWindowRow(
          '5M',
          values.volume5mUsd,
          values.priceChange5m,
          values.txns5mBuys,
          values.txns5mSells,
        );
      }
      case 'marketRow': {
        // Layout switch (launchpad layout, 2026-10-30): on curve the
        // card uses the 5-minute row, off curve the 1-hour row —
        // byte-identical to the key it delegates to. A body composes
        // `{{marketRow}}` instead of `{{market1hRow}}`; the old key
        // keeps its behavior untouched.
        return this.resolveValue(
          bondingCurveOrNull(values.bondingCurve) === null
            ? 'market1hRow'
            : 'market5mRow',
          values,
        );
      }
      case 'curveRow': {
        // Launchpad layout (2026-10-30; Rick docs: "Tokens still on a
        // launchpad bonding curve use a shorter layout: `⏳ 45% @ Pump`
        // — bonding progress, launchpad"). Lowers a NEW line
        // (`"\n⏳ "`), `""` = silence off curve. Progress is optional
        // (finite 0..100 → shared percent formatter, which already
        // emits `%`; escaped once so a decimal point stays V2-valid).
        //
        // NAME SOURCE (2026-10-30 fix): for this exact mint class the
        // snapshot carries `launchpad: null` (market-data's origin
        // detector answers null on a curve mint), so the launchpad
        // object is reconstructed from `bondingCurve.launchpadId`
        // (guard-guaranteed non-empty) as both `id` and `name`. The
        // `launchpadName` DisplayMap override (`pump-fun` → `Pump`)
        // still wins through the shared resolver; without an override
        // the detector-style slug renders escaped (`pump\.fun`). The
        // `@ name` part is omitted only when the resolver yields
        // empty, and with neither progress nor name the key is
        // silent.
        const curve = bondingCurveOrNull(values.bondingCurve);
        if (curve === null) return '';
        const progressText =
          curve.progressPercent === null
            ? ''
            : esc(
                MessageFormatterAdapter.formatPercentText(
                  curve.progressPercent,
                ),
              );
        const launchpad = values.launchpad ?? {
          id: curve.launchpadId,
          name: curve.launchpadId,
          url: '',
        };
        const name = esc(
          resolveLaunchpadDisplayName(launchpad, this.displayResolver),
        );
        if (progressText === '' && name === '') return '';
        const parts: string[] = [];
        if (progressText !== '') parts.push(progressText);
        if (name !== '') parts.push(`@ ${name}`);
        return `\n⏳ ${parts.join(' ')}`;
      }
      case 'quoteSuffix': {
        // Launchpad layout (2026-10-30): display-only `/Bitcoin` suffix
        // for the headline (`${{symbol}}{{quoteSuffix}}`), escaped
        // once. `""` off curve or without a quote symbol.
        const curve = bondingCurveOrNull(values.bondingCurve);
        if (curve === null || curve.quoteSymbol === null) return '';
        return `/${esc(curve.quoteSymbol)}`;
      }
      case 'fdvChangeBracket': {
        // Launchpad layout (2026-10-30): the `[FDV/24h change] `
        // bracket of the headline. Off curve it uses the SAME
        // `fdvUsd` / `priceChange24h` resolutions (escaped exactly
        // once) so an off-curve card renders what the two keys render
        // today, and owns its trailing separating space (suffix-key
        // precedent: `venueSuffix`). On curve the headline DROPS the
        // bracket → `""`.
        //
        // ESCAPING IS OWNED HERE (adversarial review fix 2026-10-30):
        // raw `[`/`]` are reserved MarkdownV2 characters, so a body
        // MUST NOT add literal brackets around this key — the value
        // emits `\[` + fdv + `/` + change + `\]` itself (precedent:
        // `holderTopRow` owns `\[`/`\]`).
        //
        // SILENCE rule: BOTH sides unknown (absent/null/non-finite) →
        // `""` (never `[N/A/N/A] `); exactly one unknown renders the
        // other side as `N/A` (`\[9\.6K/N/A\] `).
        if (bondingCurveOrNull(values.bondingCurve) !== null) return '';
        const fdvKnown =
          typeof values.fdvUsd === 'number' && Number.isFinite(values.fdvUsd);
        const changeKnown =
          typeof values.priceChange24h === 'number' &&
          Number.isFinite(values.priceChange24h);
        if (!fdvKnown && !changeKnown) return '';
        const fdvText = fdvKnown ? this.resolveValue('fdvUsd', values) : 'N/A';
        const changeText = changeKnown
          ? this.resolveValue('priceChange24h', values)
          : 'N/A';
        return `\\[${fdvText}/${changeText}\\] `;
      }
      case 'usdRow': {
        // Launchpad layout (2026-10-30): the 💰 USD line lowered as a
        // NEW line. On curve the shorter layout has NO USD row → `""`
        // (no label, no newline).
        //
        // MONOSPACE (owner requirement, fix 2026-10-30): the price
        // rides a MarkdownV2 code span — the composed key is the ONLY
        // correct way to do it (a body composing
        // `` `{{priceUsd}}` `` receives an ALREADY escaped value, so
        // the `\.` inside the span prints its backslash). The value is
        // formatted first (adaptive price formatter) and then wrapped
        // by `codeV2Text`, which escapes only `\`/backtick — the row
        // carries ZERO backslashes. Unknown price → `N/A` inside the
        // span (`` `N/A` ``), never a bare label.
        if (bondingCurveOrNull(values.bondingCurve) !== null) return '';
        const price =
          typeof values.priceUsd === 'number' &&
          Number.isFinite(values.priceUsd)
            ? values.priceUsd
            : null;
        return (
          '\n💰 USD: ' +
          MessageFormatterAdapter.codeV2Text(
            MessageFormatterAdapter.formatPriceText(price),
          )
        );
      }
      case 'liqRow': {
        // Launchpad layout (2026-10-30): the 💦 Liq line lowered as a
        // NEW line — one-side liquidity (display-only `liquidityUsd/2`)
        // plus the ⚠️/🔒 badges, which already carry their own leading
        // space. On curve the shorter layout has NO Liq row → `""`.
        //
        // MONOSPACE (fix 2026-10-30): the number rides a code span
        // (same owner rule as `usdRow`); `liquidityFlags` stays OUTSIDE
        // the span byte-identical (raw emoji, leading space, never
        // escaped, `''` or `' ⚠️🔒'`). `codeV2Text` escapes only
        // `\`/backtick, so the row carries ZERO backslashes. Unknown
        // liquidity → `` `N/A` `` inside the span.
        if (bondingCurveOrNull(values.bondingCurve) !== null) return '';
        const side =
          typeof values.liquidityUsd === 'number' &&
          Number.isFinite(values.liquidityUsd)
            ? values.liquidityUsd / 2
            : null;
        return (
          '\n💦 Liq: ' +
          MessageFormatterAdapter.codeV2Text(
            MessageFormatterAdapter.formatMoneyText(side),
          ) +
          this.resolveValue('liquidityFlags', values)
        );
      }
      case 'holderTopRow': {
        // Rick-parity `👥 TH:` row (plan dexter-rick-compact-card
        // §10.5-§10.7; captured layout §10.1b): the per-holder top
        // percentages at 1 decimal (trailing zero KEPT: `2.0`) joined
        // by `⋅`, then ONE space and the integer top-10 bracket:
        // `👥 TH: 4.3⋅3.3⋅2.8⋅2.3⋅1.8 [20%]`.
        //
        // Mechanics mirror `honeypotBlock`: the value lowers a BLANK
        // line (`"\n\n👥 TH: " + payload`), so a silent value leaves
        // no label, no newline and no separator behind (`""`).
        //
        // Bracket in DISPLAYED TENTHS: `Σ round(p*10)` avoids the
        // binary carry (`0.1+0.1+0.1+16.1+3.6` accumulates to
        // `20.000000000000004` — raw `ceil` would print 21 while the
        // row shows 20.0). The `max` keeps the bracket from ever
        // sitting below the printed sum.
        //
        // SILENCE (`""`) on ANY gap: absent/null/malformed, empty
        // `topPercents`, >5 entries, any non-finite/out-of-range
        // value, `sum > top10 + ε`. NEVER `N/A`, never a half row.
        //
        // Monospace (owner request 2026-10-26): each percentage rides
        // its OWN code span joined by `⋅`, and the bracket keeps its
        // V2 escapes OUTSIDE the span (`\[`20%`\]`) — numbers travel
        // raw inside the code entity (`codeV2Text`, never
        // `escapeV2Text`: `4\.3` would print its backslash).
        const concentration = holderConcentrationOrNull(
          values.holderConcentration,
        );
        if (concentration === null || concentration.topPercents.length === 0) {
          return '';
        }
        const displayedTenths = concentration.topPercents.reduce(
          (tenths, percent) => tenths + Math.round(percent * 10),
          0,
        );
        const bracket = Math.max(
          Math.round(concentration.top10Percent),
          Math.ceil(displayedTenths / 10),
        );
        const code = (text: string): string =>
          MessageFormatterAdapter.codeV2Text(text);
        const payload = concentration.topPercents
          .map((percent) => code(percent.toFixed(1)))
          .join('⋅');
        return `\n\n👥 TH: ${payload} \\[${code(`${bracket}%`)}\\]`;
      }
      case 'ageSuffix': {
        // P1-2 (Rick compact card): `" ⋅ Age: `7d`"` when the shared
        // age resolves, `""` otherwise (never a dangling `⋅ Age:`).
        // Static backticks — `age` is already escaped, so escaping the
        // composed string would escape the backticks themselves.
        const age = this.resolveValue('age', values);
        if (age === '') return '';
        return ` ⋅ Age: \`${age}\``;
      }
      case 'nameLink': {
        // D8/P1-3 (Rick compact card): `[Name](botStartUrl)` when the
        // deep-link resolves, plain `Name` otherwise (never
        // `[Name]()`). PLAIN text since the owner correction
        // 2026-10-26: `**Name**` is Discord-style bold, not
        // MarkdownV2 (Telegram bold = single `*`), so the double
        // markers leaked literally into the card. Bold stays
        // composable in a body: `[*{{name}}*]({{botStartUrl}})`.
        // Reuses the `name` resolution exactly (`N/A` default,
        // escaped once, metadata `(unverified)` suffix included) —
        // never a raw `esc(name)` nor a different default.
        const nameText = this.resolveValue('name', values);
        const url = this.resolveValue('botStartUrl', values);
        return url === '' ? nameText : `[${nameText}](${url})`;
      }
      case 'alternatives': {
        const rest = values.alternatives;
        if (!rest || rest.length === 0) return '';
        return esc(`Also on: ${rest.map((entry) => entry.chain).join(', ')}`);
      }
      case 'fdvAth': {
        const ath =
          typeof values.fdvAthUsd === 'number' &&
          Number.isFinite(values.fdvAthUsd)
            ? values.fdvAthUsd
            : null;
        if (ath === null) return '';
        return esc(MessageFormatterAdapter.formatMoneyText(ath));
      }
      case 'fdvAthAgo': {
        const athForAgo =
          typeof values.fdvAthUsd === 'number' &&
          Number.isFinite(values.fdvAthUsd)
            ? values.fdvAthUsd
            : null;
        if (athForAgo === null) return '';
        if (
          typeof values.fdvAthAt !== 'string' ||
          Number.isNaN(Date.parse(values.fdvAthAt))
        ) {
          return '';
        }
        return esc(
          MessageFormatterAdapter.formatCompactAgeText(values.fdvAthAt),
        );
      }
      case 'newTokenIcon': {
        // Rick title status emoji (docs: pricebot#scan-icons,
        // "🆕 - token age under 15 minutes"). A SEPARATE key from
        // `headerIcon` so a body composes `{{newTokenIcon}}{{headerIcon}}`
        // → `🆕💊` (the launchpad icon-link or chain emoji stays
        // byte-identical); the renderer NEVER folds the 🆕 into
        // `headerIcon`.
        //
        // Age source: the SAME best-liquidity PAIR proxy `age` reads
        // (`values.pairCreatedAt`, top-level ISO) — no new wire field,
        // no network. It is NOT token deploy age: a curve → AMM
        // migration can make a mature token read as "new" (documented
        // proxy caveat, same as `age`).
        //
        // SILENCE (`""`) on: not a string, empty, unparseable, a
        // FUTURE timestamp (explicit guard: `age` clamps future to
        // `0m`, which would falsely claim a brand-new pair), and
        // `now - at >= 15 * 60_000` (exactly 15m is silent — "under
        // 15 minutes"). Only `0 <= now - at < 15m` renders `🆕`.
        // Raw emoji, never escaped, no leading/trailing space: the
        // body owns the composition.
        if (
          typeof values.pairCreatedAt !== 'string' ||
          values.pairCreatedAt === '' ||
          Number.isNaN(Date.parse(values.pairCreatedAt))
        ) {
          return '';
        }
        const elapsed = Date.now() - Date.parse(values.pairCreatedAt);
        if (elapsed < 0 || elapsed >= NEW_TOKEN_ICON_MAX_AGE_MS) return '';
        return '🆕';
      }
      case 'age': {
        // Best-pair age proxy (plan todo 63): the snapshot's top-level
        // ISO `pairCreatedAt` — best-liquidity PAIR creation time,
        // never token deploy age (migration under-reports; documented
        // caveat). Absent/empty/unparseable → `""` (cold-start
        // honesty, same rule as `fdvAthAgo`); future timestamps clamp
        // to `0m` inside the shared formatter — never forked here.
        if (
          typeof values.pairCreatedAt !== 'string' ||
          Number.isNaN(Date.parse(values.pairCreatedAt))
        ) {
          return '';
        }
        return esc(
          MessageFormatterAdapter.formatCompactAgeText(values.pairCreatedAt),
        );
      }
      case 'liquidityRatio': {
        // Rick-parity `xN` multiplier (plan todo 62): `N` = round of
        // the SERVED `fdvUsd ÷ liquidityUsd` (includes the todo-61
        // `dexscreener` fallback provenance — the ratio mirrors what
        // the card shows). The value carries NO brackets — bracket
        // composition is template-author-owned (`[{{liquidityRatio}}]`
        // renders `[x3]`; owner rev. 2026-10-17). Absent / non-finite
        // / `<= 0` inputs or `N < 1` render `""` — never `N/A` nor
        // `x0` (the PERPS low-liq sample carries no bracket — `⚠️`
        // markers are out of v1 scope).
        const fdv =
          typeof values.fdvUsd === 'number' && Number.isFinite(values.fdvUsd)
            ? values.fdvUsd
            : null;
        const liq =
          typeof values.liquidityUsd === 'number' &&
          Number.isFinite(values.liquidityUsd)
            ? values.liquidityUsd
            : null;
        if (fdv === null || liq === null || fdv <= 0 || liq <= 0) return '';
        const n = Math.round(fdv / liq);
        if (!Number.isFinite(n) || n < 1) return '';
        return esc(`x${n}`);
      }
      default: {
        return '';
      }
    }
  }
}

/** Contract alias: `TemplateRenderer.render` stays stable for todos 6-11. */
export { TemplateRendererService as TemplateRenderer };

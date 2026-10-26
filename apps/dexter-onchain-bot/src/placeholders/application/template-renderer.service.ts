import { Inject, Injectable, Optional } from '@nestjs/common';
import { MessageFormatterAdapter } from '@/scan/infrastructure/formatter/message-formatter';
import type {
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
        // appended — and `formatNumberText` for the counts) and is
        // escaped EXACTLY ONCE (precedent: `honeypotBlock`/`ageSuffix`).
        // No leading/trailing whitespace: templates own separators.
        const volume = finiteNumberOrNull(values.volume1hUsd);
        const change = finiteNumberOrNull(values.priceChange1h);
        const buys = nonNegativeCountOrNull(values.txns1hBuys);
        const sells = nonNegativeCountOrNull(values.txns1hSells);
        if (
          volume === null ||
          change === null ||
          buys === null ||
          sells === null
        ) {
          return '';
        }
        const icon = change < 0 ? '📉' : '📈';
        return esc(
          `${icon} 1H: ${MessageFormatterAdapter.formatMoneyText(volume)} ⋅ ` +
            `${MessageFormatterAdapter.formatPercentText(change)} 🅑 ` +
            `${MessageFormatterAdapter.formatNumberText(buys)} Ⓢ ` +
            `${MessageFormatterAdapter.formatNumberText(sells)}`,
        );
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

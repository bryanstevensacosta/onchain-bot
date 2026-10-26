/**
 * Placeholder whitelist per template command (todo 4,
 * dexter-message-templates). Pure domain data — no Nest, no I/O.
 *
 * Base keys mirror `ResolvedToken` 1:1; derived keys are computed by
 * `TemplateRenderer` on read; `timeframe` exists ONLY for `c`/`cc`.
 * Todos 6 (API validation), 7 (preview) and 10-11 (handlers) consume
 * `PLACEHOLDERS_BY_COMMAND` as the closed vocabulary.
 */
export type TemplateCommand = 'ca' | 'x' | 'z' | 'c' | 'cc' | 'bare';

/** Alias kept for the plan contract (`Record<Command, string[]>`). */
export type Command = TemplateCommand;

export const TEMPLATE_COMMANDS: readonly TemplateCommand[] = [
  'ca',
  'x',
  'z',
  'c',
  'cc',
  'bare',
];

/** The 22 `ResolvedToken` fields addressable as `{{key}}`. */
export const BASE_TOKEN_PLACEHOLDERS: readonly string[] = [
  'symbol',
  'name',
  'chain',
  'address',
  'priceUsd',
  'priceChange24h',
  'marketCapUsd',
  'fdvUsd',
  'liquidityUsd',
  'lockedLiquidityPercent',
  'burnedPercent',
  'volume24hUsd',
  'holders',
  'top10HolderPercent',
  'top20HolderPercent',
  'totalSupply',
  'circulatingSupply',
  'maxSupply',
  'devPctSupply',
  'devWallets',
  'poolAddress',
  'source',
];

/** Renderer-computed keys (MarkdownV2-safe by construction). */
export const DERIVED_PLACEHOLDERS: readonly string[] = [
  'chainDisplay',
  'scanLinks',
  'dexscreenerUrl',
  'geckoterminalUrl',
  'tradeHint',
  'devLine',
  'launchpadText',
  'launchpadTextLink',
  'launchpadIcon',
  'launchpadIconLink',
  'botStartUrl',
  'chainName',
  'venue',
  'venueTech',
  'venueLine',
  'fdvAth',
  'fdvAthAgo',
  'alternatives',
  // Plan todo 62: `xN` multiplier value (round of fdvUsd÷liquidityUsd;
  // brackets are template-author-composed) — pure renderer
  // computation, never a snapshot/market-data field.
  'liquidityRatio',
  // Plan todo 63: `age` — best-pair age rendered from the snapshot's
  // top-level ISO `pairCreatedAt` (best-liquidity PAIR proxy, never
  // token deploy age; absent/unparseable renders `""`). Pure renderer
  // computation reusing the shared compact-age formatter.
  'age',
  // Plan todo 71 (owner decision 2026-10-19): `venueSuffix` — the
  // venue-line resolution as a SUFFIX (`" @ X"` / `""`), so
  // `{{chainName}} {{chainName}}{{venueSuffix}}` never leaves the
  // empty-line hole of a standalone ` @ {{venueLine}}` collapse
  // (mirror of `venueLine`; `""` = silence).
  'venueSuffix',
  // Plan todo 73: `venueSuffixShort` — the SHORT venue as a suffix
  // (`" @ " + texts.venue`: origin name when a launchpad origin is
  // known, else the DEX display), always escaped once; `""` = silence
  // (`texts.venue === ''`). `venueSuffix` (venueLine-based) stays
  // byte-identical — this is the opt-in `Solana @ Pump` variant.
  'venueSuffixShort',
  // Plan todo 71: `honeypotLine` — Rick-parity 🍯 SIM/T row (suffix
  // mechanics: value = `"\n🍯 " + core`, `""` = silence; never a raw
  // snapshot field — pure renderer computation over the validated
  // `ResolvedToken.honeypot`). One derived key on EVERY command
  // (coupled variants — NOT two sim/taxes placeholders).
  'honeypotLine',
  // Rick compact card (plan dexter-rick-compact-card, 2026-10-22):
  // `headerIcon` — the launchpad icon-link when a launchpad resolves,
  // else the `chainDisplay` value. Keeps the Solana launchpad icon and
  // gains the chain emoji on BSC, with no conditional in the body.
  'headerIcon',
  // D4: `liquidityUsdSide` — display-only one-side liquidity
  // (`liquidityUsd / 2`, money-compact, `N/A` on absent/non-finite).
  // The CORE `liquidityUsd` keeps meaning total — never overridden.
  'liquidityUsdSide',
  // D2/D3: `liquidityFlags` — Rick-parity badges for the Liq row:
  // `⚠️` when the one-side liquidity is below
  // `LOW_LIQUIDITY_SIDE_USD` (display heuristic, not a claim) and
  // `🔒` when `lockedLiquidityPercent + burnedPercent >= 50` (at
  // least one measured). Raw emoji, one leading space when non-empty.
  'liquidityFlags',
  // D9: `honeypotBlock` — the SAME 🍯 core as `honeypotLine` but
  // lowered after a BLANK line (`"\n\n🍯 " + core`); `""` = silence.
  // `honeypotLine` stays byte-identical (existing templates).
  'honeypotBlock',
  // P1-2: `ageSuffix` — ``" ⋅ Age: `7d`"`` when `age` resolves,
  // `""` otherwise (never leaves a dangling `⋅ Age:` behind).
  'ageSuffix',
  // D8/P1-3: `nameLink` — `[Name](botStartUrl)` when a deep-link
  // resolves, `Name` otherwise (never `[Name]()`); reuses the
  // `name` resolution (N/A default + `(unverified)` provenance).
  // PLAIN text (owner correction 2026-10-26): `**Name**` leaked
  // literally because MarkdownV2 bold is single `*`.
  'nameLink',
  // Rick 1-hour window row (Rick parity, 2026-10-26): ONE composed
  // derived key so a card carries the whole row or nothing —
  // `📈 1H: 159 ⋅ 1.7% 🅑 3 Ⓢ 5` (1h volume, 1h change, buys,
  // sells; `📉` only on a negative change). Fed by the four optional
  // snapshot fields `volume1hUsd`/`priceChange1h`/`txns1hBuys`/
  // `txns1hSells`; `""` (silence) when ANY is missing/non-finite —
  // never a half-empty row, never `N/A`.
  'market1hRow',
  // TH holders top-5 row (plan dexter-rick-compact-card §10.7):
  // `holderTopRow` — ONE composed derived key so the card carries the
  // whole holder block or nothing. Value lowers a BLANK line
  // (`"\n\n👥 TH: " + payload`): per-holder percentages at 1 decimal
  // (trailing zero kept) joined by `⋅`, then an integer top-10
  // bracket. `""` = silence on ANY gap (absent/malformed, empty or
  // >5 entries, non-finite/out-of-range values, `sum > top10 + ε`) —
  // never `N/A`, never a half row. The non-increasing ORDER rule is
  // the CLIENT boundary's job (§10.7).
  'holderTopRow',
];

/** Chart timeframe — valid ONLY inside `c`/`cc` bodies. */
export const TIMEFRAME_PLACEHOLDER = 'timeframe';

const CHART_COMMANDS: readonly TemplateCommand[] = ['c', 'cc'];

const buildPlaceholders = (command: TemplateCommand): string[] => {
  const keys = [...BASE_TOKEN_PLACEHOLDERS, ...DERIVED_PLACEHOLDERS];
  if ((CHART_COMMANDS as readonly string[]).includes(command)) {
    keys.push(TIMEFRAME_PLACEHOLDER);
  }
  return keys;
};

export const PLACEHOLDERS_BY_COMMAND: Record<TemplateCommand, string[]> = {
  ca: buildPlaceholders('ca'),
  x: buildPlaceholders('x'),
  z: buildPlaceholders('z'),
  c: buildPlaceholders('c'),
  cc: buildPlaceholders('cc'),
  bare: buildPlaceholders('bare'),
};

export function placeholdersFor(command: TemplateCommand): string[] {
  const known = PLACEHOLDERS_BY_COMMAND[command];
  if (!known) {
    throw new Error(
      `Unknown template command: ${String(command)} (valid: ${TEMPLATE_COMMANDS.join(', ')})`,
    );
  }
  // Catalog contract (plan todo 15): alphabetical by key, locale-free
  // byte/codepoint order (`<`/`>`, NOT `localeCompare` — locale collation
  // varies by Node/ICU version, byte order is deterministic everywhere).
  // Sort level: HERE (registry accessor, lowest point covering all six
  // commands) rather than the controller response build — the controller
  // maps this function, so the catalog inherits the order, and `valid`
  // lists in 400s stay consistent with the catalog (single source of
  // truth; frontend never sorts). Order-freedom finding: no consumer
  // depends on declaration order — `isKnownPlaceholder`/renderer/
  // template validation gate on membership (`.includes`), and
  // `placeholdersUsed` follows body order, not registry order — but the
  // canonical `PLACEHOLDERS_BY_COMMAND` arrays still keep declaration
  // order untouched (sorted COPY only).
  return [...known].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

export function isKnownPlaceholder(
  command: TemplateCommand,
  key: string,
): boolean {
  return placeholdersFor(command).includes(key);
}

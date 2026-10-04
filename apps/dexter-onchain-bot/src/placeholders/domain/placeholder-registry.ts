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
  'botStartAddressLink',
  'chainName',
  'venue',
  'venueTech',
  'venueLine',
  'fdvAth',
  'fdvAthAgo',
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

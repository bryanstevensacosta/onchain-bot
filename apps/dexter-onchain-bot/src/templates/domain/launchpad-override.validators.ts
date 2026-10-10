/**
 * Launchpad-override validators (dexter plan todo 37, manual
 * mint→launchpad safety net).
 *
 * Pure functions — no Nest, no I/O. Mirrors the SHAPE of the sibling
 * `src/templates/domain/display-map.validators.ts` (constants +
 * `validate*` functions throwing a local domain error).
 *
 * CURATED-NOT-INVENTED (null-honest): an override row is explicit
 * operator curation for one mint. `launchpad_id` must already exist
 * in the detector slug table — unknown ids are rejected with 400 +
 * the whitelist, never stored.
 *
 * DETECTOR-SLUG MIRROR (drift rule): `KNOWN_LAUNCHPAD_IDS` +
 * `LAUNCHPAD_CATALOG` below mirror market-data
 * `src/launchpad/domain/launchpad-table.ts`
 * (`SOLANA_LAUNCHPAD_ORDER` 11 rows + `EVM_LAUNCHPAD_ORDER` 11 rows =
 * 22 slugs, same 22 the Wave-1 DisplayMap `launchpad` seeds carry).
 * Dexter must NOT import market-data source (different app, no
 * cross-app source imports) — so the mirror is hand-kept. INTAKE
 * RULE: any intake that adds a slug to the market-data table MUST
 * add it here in the same wave, or override creation for the new
 * slug fails closed (400 + `valid` list) until it does.
 */

export const MAX_NOTE_LENGTH = 280;

export class LaunchpadOverrideValidationError extends Error {
  public readonly code = 'LAUNCHPAD_OVERRIDE_VALIDATION';
  public readonly details?: unknown;

  public constructor(message: string, details?: unknown) {
    super(message);
    this.name = 'LaunchpadOverrideValidationError';
    this.details = details;
  }
}

/** Thrown when a row for the (normalized) mint already exists. */
export class LaunchpadOverrideDuplicateError extends Error {
  public readonly code = 'LAUNCHPAD_OVERRIDE_DUPLICATE';
  public readonly details?: unknown;

  public constructor(message: string, details?: unknown) {
    super(message);
    this.name = 'LaunchpadOverrideDuplicateError';
    this.details = details;
  }
}

const fail = (message: string, details?: unknown): never => {
  throw new LaunchpadOverrideValidationError(message, details);
};

/**
 * Single mint-normalization function (spec-pinned).
 *
 * - EVM (`0x` + 40 hex, any case) → lowercase (checksummed input
 *   collapses to one key, so `0xABC…` and `0xabc…` share the row).
 * - Solana (base58, 32-44 chars) → EXACT (case carries data in
 *   base58 — never lowercased).
 * - Anything else → throws (malformed mint → 400 at the controller,
 *   fail-open skip at the pipeline lookup).
 */
export const normalizeMint = (raw: unknown): string => {
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (/^0x[a-fA-F0-9]{40}$/.test(trimmed)) {
      return trimmed.toLowerCase();
    }
    if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(trimmed)) {
      return trimmed;
    }
  }
  return fail(
    'LaunchpadOverride mint must be 0x + 40 hex (EVM) or base58 32-44 chars (Solana)',
    { mint: raw },
  );
};

/**
 * Fail-open twin of `normalizeMint` for the pipeline read path:
 * malformed input returns `null` (no row can match it — rows are
 * validated at write) instead of throwing into the scan.
 */
export const normalizeMintOrNull = (raw: unknown): string | null => {
  try {
    return normalizeMint(raw);
  } catch {
    return null;
  }
};

const definedFiFallback = (chain: string, address: string): string =>
  `https://defined.fi/token/${chain}/${address}`;

export interface LaunchpadCatalogRow {
  readonly id: string;
  readonly name: string;
  readonly buildUrl: (chain: string, address: string) => string;
}

/**
 * Detector-slug mirror (see the drift rule above). Row data mirrors
 * `SOLANA_LAUNCHPAD_ROWS` / `EVM_LAUNCHPAD_ROWS` verbatim (id, name,
 * URL builder) so an override hit renders the same card fields the
 * detector would have produced for that slug.
 */
export const LAUNCHPAD_CATALOG: Record<string, LaunchpadCatalogRow> = {
  'pump-fun': {
    id: 'pump-fun',
    name: 'Pump.fun',
    buildUrl: (_chain, address) => `https://pump.fun/coin/${address}`,
  },
  'bonk-fun': {
    id: 'bonk-fun',
    name: 'BONK.fun',
    buildUrl: (_chain, address) => `https://www.bonk.fun/token/${address}`,
  },
  stonkfun: {
    id: 'stonkfun',
    name: 'StonkFun',
    buildUrl: (_chain, address) => `https://www.stonkfun.xyz/token/${address}`,
  },
  'raydium-launchlab': {
    id: 'raydium-launchlab',
    name: 'Raydium LaunchLab',
    buildUrl: (_chain, address) =>
      `https://raydium.io/launchpad/token/?mint=${address}`,
  },
  heaven: {
    id: 'heaven',
    name: 'Heaven',
    buildUrl: (chain, address) => definedFiFallback(chain, address),
  },
  boop: {
    id: 'boop',
    name: 'Boop.fun',
    buildUrl: (chain, address) => definedFiFallback(chain, address),
  },
  moonit: {
    id: 'moonit',
    name: 'Moonit',
    buildUrl: (chain, address) => definedFiFallback(chain, address),
  },
  believe: {
    id: 'believe',
    name: 'Believe',
    buildUrl: (chain, address) => definedFiFallback(chain, address),
  },
  'jupiter-studio': {
    id: 'jupiter-studio',
    name: 'Jupiter Studio',
    buildUrl: (chain, address) => definedFiFallback(chain, address),
  },
  'jups-fun': {
    id: 'jups-fun',
    name: 'jups.fun',
    buildUrl: (chain, address) => definedFiFallback(chain, address),
  },
  'meteora-dbc': {
    id: 'meteora-dbc',
    name: 'Meteora DBC',
    buildUrl: (chain, address) => definedFiFallback(chain, address),
  },
  bankr: {
    id: 'bankr',
    name: 'Bankr',
    buildUrl: (chain, address) => definedFiFallback(chain, address),
  },
  clanker: {
    id: 'clanker',
    name: 'Clanker',
    buildUrl: (_chain, address) => `https://clanker.world/clanker/${address}`,
  },
  pons: {
    id: 'pons',
    name: 'Pons',
    buildUrl: (_chain, address) =>
      `https://ponsfamily.com/launchpad/${address}`,
  },
  'four-meme': {
    id: 'four-meme',
    name: 'Four.meme',
    buildUrl: (_chain, address) => `https://four.meme/en/token/${address}`,
  },
  zora: {
    id: 'zora',
    name: 'Zora',
    buildUrl: (chain, address) => `https://zora.co/coin/${chain}:${address}`,
  },
  flaunch: {
    id: 'flaunch',
    name: 'Flaunch',
    buildUrl: (chain, address) =>
      `https://flaunch.gg/${chain}/coins/${address}`,
  },
  openserv: {
    id: 'openserv',
    name: 'OpenServ',
    buildUrl: (chain, address) => definedFiFallback(chain, address),
  },
  mintclub: {
    id: 'mintclub',
    name: 'Mint Club',
    buildUrl: (chain, address) => definedFiFallback(chain, address),
  },
  virtuals: {
    id: 'virtuals',
    name: 'Virtuals Protocol',
    buildUrl: (_chain, address) =>
      `https://app.virtuals.io/prototypes/${address}`,
  },
  pinksale: {
    id: 'pinksale',
    name: 'PinkSale',
    buildUrl: (chain, address) => definedFiFallback(chain, address),
  },
  dxsale: {
    id: 'dxsale',
    name: 'DX App',
    buildUrl: (chain, address) => definedFiFallback(chain, address),
  },
};

/** Every `launchpad_id` an override row may carry (closed union). */
export const KNOWN_LAUNCHPAD_IDS: ReadonlyArray<string> =
  Object.keys(LAUNCHPAD_CATALOG);

export const validateLaunchpadId = (raw: unknown): string => {
  if (typeof raw !== 'string') {
    fail('LaunchpadOverride launchpad_id must be a string', {
      launchpad_id: raw,
    });
  }
  const trimmed = (raw as string).trim();
  if (!KNOWN_LAUNCHPAD_IDS.includes(trimmed)) {
    fail(
      `LaunchpadOverride launchpad_id must be one of: ${KNOWN_LAUNCHPAD_IDS.join(', ')}`,
      { launchpad_id: raw },
    );
  }
  return trimmed;
};

/**
 * Builds the curated `{id, name, url}` for an override hit (pipeline
 * read path). Unknown ids return `null` (fail-open — unreachable via
 * the API, which validates at write, but the pipeline never trusts
 * stored rows blindly).
 */
export const launchpadOverrideInfo = (
  launchpadId: string,
  chain: string,
  address: string,
): { id: string; name: string; url: string } | null => {
  const row = LAUNCHPAD_CATALOG[launchpadId];
  if (!row) return null;
  return { id: row.id, name: row.name, url: row.buildUrl(chain, address) };
};

/**
 * Operator note: optional free text (why this mint is curated).
 * Absent/blank → `null` (never stored as empty string); over the cap
 * → throws. Length counts UTF-16 units (plain prose, no emoji
 * semantics — unlike `validateDisplay`, no grapheme subtlety).
 */
export const validateNote = (raw: unknown): string | null => {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'string') {
    fail('LaunchpadOverride note must be a string', { note: raw });
  }
  const trimmed = (raw as string).trim();
  if (trimmed === '') return null;
  if (trimmed.length > MAX_NOTE_LENGTH) {
    fail(`LaunchpadOverride note exceeds max length ${MAX_NOTE_LENGTH}`, {
      length: trimmed.length,
      max: MAX_NOTE_LENGTH,
    });
  }
  return trimmed;
};
